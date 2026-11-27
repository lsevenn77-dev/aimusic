package kr.co.aifect.app

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import kotlin.math.*

internal fun dubbingWavHeader(samples:Int):ByteArray {
 require(samples>=4800&&samples<=48*48000)
 return ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply{
  put("RIFF".toByteArray());putInt(36+samples*2);put("WAVEfmt ".toByteArray());putInt(16);putShort(1);putShort(1);putInt(48000);putInt(96000);putShort(2);putShort(16);put("data".toByteArray());putInt(samples*2)
 }.array()
}
internal data class DubbingWindow(val cueStart:Double,val start:Double,val end:Double){val duration get()=end-start}
internal fun pendingDubbingLines(roleLines:List<JSONObject>,selected:Int,local:Set<String>):List<JSONObject> =
 roleLines.drop(selected).filter{it.isNull("takeId")&&it.getString("id") !in local}

internal data class DubbingStep(val line:JSONObject,val capture:Boolean)

/** Walk the same server timeline for playback and capture, including the other role's turns. */
internal fun dubbingRunSteps(timeline:List<JSONObject>,startId:String,pending:List<JSONObject>):List<DubbingStep>{
 val recordIds=pending.mapTo(mutableSetOf()){it.getString("id")}
 val first=timeline.indexOfFirst{it.getString("id")==startId}
 val last=timeline.indexOfLast{it.getString("id") in recordIds}
 if(first<0||last<first)return emptyList()
 return timeline.subList(first,last+1).map{DubbingStep(it,it.getString("id") in recordIds)}
}

/** At the end of a silent lead-in we must start the soundtrack before trusting its position. */
internal fun dubbingCountInRemaining(start:Double,positionMs:Long,untilLine:Double,playing:Boolean):Double =
 if(playing) start-positionMs/1000.0 else untilLine.coerceAtLeast(.001)

internal fun dubbingWindow(line:JSONObject):DubbingWindow {
 val start=line.getDouble("start");val end=line.optDouble("recordEnd",line.getDouble("end"))
 require(start.isFinite()&&end.isFinite()&&start>=0&&end-start in .1..48.0){"대사 녹음 시간을 확인해주세요."}
 return DubbingWindow(line.optDouble("cueStart",start).coerceIn(0.0,start),start,end)
}

/** The legacy manifest is the baseline. A completed line replaces only its own journal entry. */
internal class DubbingDrafts(val directory:File){
 constructor(context:Context,account:String,project:String,sound:String,role:String):this(
  draftDirectory(context,account,project,sound,role)
 )
 val takes:MutableMap<String,JSONObject> = java.util.concurrent.ConcurrentHashMap()
 init{
  check(directory.isDirectory||directory.mkdirs()){"기기 저장 공간을 확인해주세요."}
  // Older AtomicFile implementations restore their last complete .bak before reading.
  val backup=File(directory,"takes.json.bak")
  val manifest=if(backup.isFile)backup else File(directory,"takes.json")
  if(manifest.isFile){
   val entries=JSONObject(manifest.readText())
   for(key in entries.keys()){
    val take=entries.getJSONObject(key)
    if(file(take).isFile)takes[key]=take
   }
  }
  directory.listFiles().orEmpty().filter{it.name.startsWith("line-")&&it.extension=="json"}.forEach{entry->
   val take=JSONObject(entry.readText())
   if(file(take).isFile)takes[entry.nameWithoutExtension.removePrefix("line-")]=take
  }
 }
 fun file(take:JSONObject):File {
  val id=take.getString("id")
  require(valid.matches(id))
  return File(directory,"$id.wav")
 }
 @Synchronized fun commit(line:String,take:JSONObject){
  require(valid.matches(line)&&file(take).isFile)
  val destination=File(directory,"line-$line.json")
  val temporary=File.createTempFile("line-",".part",directory)
  try{
   temporary.outputStream().use{out->out.write(take.toString().toByteArray());out.fd.sync()}
   java.nio.file.Files.move(temporary.toPath(),destination.toPath(),java.nio.file.StandardCopyOption.ATOMIC_MOVE,java.nio.file.StandardCopyOption.REPLACE_EXISTING)
  }finally{temporary.delete()}
  val previous=takes.put(line,take)
  if(previous!=null&&previous.optString("id")!=take.getString("id"))file(previous).delete()
 }
 private companion object {
  val valid=Regex("[A-Za-z0-9_-]{1,64}")
  fun draftDirectory(context:Context,account:String,project:String,sound:String,role:String):File{
   require(account.isNotBlank()&&listOf(project,sound,role).all(valid::matches))
   val owner=MessageDigest.getInstance("SHA-256").digest(account.toByteArray()).joinToString(""){"%02x".format(it)}
   return File(context.filesDir,"dubbing-drafts/$owner/$project/$sound/$role")
  }
 }
 @Synchronized fun uploaded(line:String,takeId:String){
  val current=takes[line]?:return
  if(current.optString("id")==takeId&&!current.optBoolean("uploaded"))commit(line,JSONObject(current.toString()).put("uploaded",true))
 }
}

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
internal class NativeDubbingAudio(private val context:Context,private val api:NativeApi){
 val status=MutableStateFlow("");val countdown=MutableStateFlow(0);val level=MutableStateFlow(0f);val elapsed=MutableStateFlow(0.0);val running=MutableStateFlow(false);val capturing=MutableStateFlow(false)
 val progressDuration=MutableStateFlow(0.0)
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
 private val background=ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(context,OkHttpDataSource.Factory(api.client)))).build()
 private val preview=ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(context,OkHttpDataSource.Factory(api.client)))).build()
 private var job:Job?=null
 @Volatile private var recorder:AudioRecord?=null
 @Volatile private var stopRequested=false
 @Volatile var inputGain=1f
 private var closed=false
 private var playerError:String?=null
 private var preparedUrl:String?=null
 private var preparedFile:File?=null
 private var backgroundCall:okhttp3.Call?=null
 private var pendingFinalId:String?=null
 val previewing=MutableStateFlow(false)
 init{
  background.addListener(object:Player.Listener{override fun onPlayerError(error:androidx.media3.common.PlaybackException){playerError="배경 음향을 불러오지 못했어요. 연결을 확인해주세요."}})
  preview.addListener(object:Player.Listener{override fun onIsPlayingChanged(isPlaying:Boolean){previewing.value=isPlaying
   if(isPlaying)pendingFinalId?.let{id->
    pendingFinalId=null
    scope.launch{
     try{api.call("/api/dubbing/projects/$id/plays","POST",payload("requestId" to requestIdentity()))}
     catch(e:CancellationException){throw e}catch(_:Exception){/* Playback remains available with older servers. */}
    }
   }}})
 }
 /** Playback position of the listen-only player, for the background sound bar. */
 fun previewPositionMs():Long=if(closed)0 else preview.currentPosition
 fun previewDurationMs():Long=if(closed)0 else preview.duration.coerceAtLeast(0)
 fun seekPreview(position:Long){if(!closed)preview.seekTo(position)}
 fun togglePreview(url:String,position:Long){
  if(closed)return
  val address=if(url.startsWith('/'))Endpoint.url(url) else url
  if(preview.currentMediaItem?.localConfiguration?.uri?.toString()!=address||preview.playerError!=null){
   listen(url,position/1000.0);return
  }
  if(preview.isPlaying)preview.pause()
  else{if(preview.playbackState==Player.STATE_ENDED)preview.seekTo(0);preview.play()}
 }
 /** One complete download per recorder. Each line only seeks the same local sound. */
 suspend fun prepareBackground(url:String,soundId:String)=withContext(Dispatchers.Main.immediate){
  if(preparedUrl==url&&preparedFile?.isFile==true)return@withContext
  status.value="배경 음향을 준비하고 있어요"
  // The project screen usually fetched this exact sound already; reuse it instead of downloading again.
  val file=withContext(Dispatchers.IO){dubbingBackgroundFile(context,api,url,soundId){backgroundCall=it}}
  currentCoroutineContext().ensureActive();check(!closed)
  playerError=null;background.setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(file)));background.prepare();awaitReady()
  preparedFile=file;preparedUrl=url;status.value="배경 음향 준비 완료"
 }
 private suspend fun awaitReady(){try{withTimeout(20000){while(background.playbackState!=Player.STATE_READY){playerError?.let{error(it)};delay(30)}}}catch(e:TimeoutCancellationException){throw IllegalStateException("배경 음향을 재생할 준비가 지연되고 있어요. 준비 상태를 다시 확인해주세요.",e)}}
 private suspend fun ready(url:String,position:Long){
  check(preparedUrl==url&&preparedFile?.isFile==true){"배경 음향을 먼저 준비해주세요."}
  playerError?.let{error(it)};background.pause();background.seekTo(position);awaitReady()
 }
 private suspend fun followBackground(startMs:Long,endMs:Long,label:String){
  if(endMs<=startMs||background.currentPosition>=endMs)return
  status.value=label
  progressDuration.value=(endMs-startMs)/1000.0
  var lastPosition=background.currentPosition
  var lastAdvance=SystemClock.elapsedRealtime()
  while(true){
   playerError?.let{error(it)}
   val now=background.currentPosition
   elapsed.value=(now-startMs).coerceIn(0,endMs-startMs)/1000.0
   if(now>=endMs)return
   check(background.playbackState!=Player.STATE_ENDED){"배경 음향이 먼저 끝났어요."}
   if(now!=lastPosition){lastPosition=now;lastAdvance=SystemClock.elapsedRealtime()}
   check(SystemClock.elapsedRealtime()-lastAdvance<5000){"배경 음향이 멈췄어요. 이 위치부터 다시 시작해주세요."}
   delay((endMs-now).coerceIn(1L,80L))
  }
 }
 @SuppressLint("MissingPermission")
 /** [lineStartAt] = wall-clock ms when the line begins (a live dubbing room's shared cue); null counts in from now. */
 fun record(url:String,line:JSONObject,drafts:DubbingDrafts,complete:(JSONObject)->Unit,failure:(String)->Unit,lineStartAt:Long?=null){
  recordLines(url,listOf(DubbingStep(line,true)),drafts,{},complete,failure,lineStartAt)
 }
 @SuppressLint("MissingPermission")
 fun recordLines(url:String,steps:List<DubbingStep>,drafts:DubbingDrafts,onStep:(DubbingStep)->Unit,complete:(JSONObject)->Unit,failure:(String)->Unit,lineStartAt:Long?=null){
  if(running.value||steps.isEmpty())return
  val previous=job
  stop();running.value=true;stopRequested=false;elapsed.value=0.0;progressDuration.value=0.0
  job=scope.launch{
   var unfinished:File?=null
   try{
    previous?.join()
    val window=dubbingWindow(steps.first().line);val from=dubbingLeadIn(window);status.value="시작 준비";ready(url,(from*1000).toLong())
    val size=max(9600,AudioRecord.getMinBufferSize(48000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT))
    val input=AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION).setAudioFormat(AudioFormat.Builder().setSampleRate(48000).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()).setBufferSizeInBytes(size).build();recorder=input
    check(input.state==AudioRecord.STATE_INITIALIZED){"마이크를 연결하지 못했어요."}
    // 3 · 2 · 1 runs over the sound just before the line, so the effects lead into the take.
    // When the line starts too early for three seconds of sound, the missing part is counted in silence.
    val lead=window.start-from
    val untilStart=lineStartAt?.let{it-System.currentTimeMillis()}?:(max(DUBBING_COUNT_IN,lead)*1000).toLong()
    val target=SystemClock.elapsedRealtime()+untilStart;var playing=false
    check(untilStart > -1000){"신호를 늦게 받았어요. 이 대사를 다시 시작해주세요."}
    withTimeout(max(0L,untilStart)+5000){
     while(true){
      playerError?.let{error(it)}
      val untilLine=(target-SystemClock.elapsedRealtime())/1000.0
      if(!playing&&untilLine<=lead){if(untilLine<lead-.05)background.seekTo(((window.start-untilLine.coerceAtLeast(0.0))*1000).toLong());background.play();playing=true}
      val remaining=dubbingCountInRemaining(window.start,background.currentPosition,untilLine,playing)
      if(remaining<=0)break
      countdown.value=if(remaining<=DUBBING_COUNT_IN)ceil(remaining).toInt().coerceAtLeast(1) else 0
      status.value=if(countdown.value>0)"시작 준비" else "효과음 듣는 중 · 곧 3 · 2 · 1이 시작돼요"
      // Leave the main looper free between countdown ticks; wake precisely for the soundtrack and line.
      val nextCue=if(playing)remaining else untilLine-lead
      delay(ceil(nextCue*1000).toLong().coerceIn(1L,100L))
     }
    }
    countdown.value=0
    for((index,step) in steps.withIndex()){
     val line=step.line
     val segment=dubbingWindow(line)
     val segmentStartMs=(segment.start*1000).toLong()
     followBackground(background.currentPosition,segmentStartMs,"배경 음향 재생 중 · 다음 대사 대기")
     ensureActive()
     onStep(step);elapsed.value=0.0;progressDuration.value=segment.duration
     if(!step.capture){
      val next=steps.getOrNull(index+1)?.line?.getDouble("start")?:segment.end
      followBackground(segmentStartMs,(next*1000).toLong(),"배경 음향 재생 중 · 다음 내 대사를 기다려요")
      continue
     }
     val take=payload("id" to requestIdentity(),"uploaded" to false)
     val output=drafts.file(take)
     unfinished=output
     status.value="녹음 중";capturing.value=true;input.startRecording();check(input.recordingState==AudioRecord.RECORDSTATE_RECORDING){"마이크를 시작하지 못했어요."}
     val remaining=min(segment.duration,segment.end-background.currentPosition/1000.0)
     val maximum=floor(remaining*48000).toInt().coerceAtLeast(0)
     withContext(Dispatchers.IO){
      val samples=RandomAccessFile(output,"rw").use{out->
       out.write(ByteArray(44))
       val buffer=ShortArray(960)
       val bytes=ByteBuffer.allocate(buffer.size*2).order(ByteOrder.LITTLE_ENDIAN)
       var count=0
       var lastInput=SystemClock.elapsedRealtime()
       while(isActive&&!stopRequested&&count<maximum){
        val n=input.read(buffer,0,min(buffer.size,maximum-count),AudioRecord.READ_NON_BLOCKING)
        if(n==0){
         check(SystemClock.elapsedRealtime()-lastInput<2000){"마이크 입력이 멈췄어요. 다시 녹음해주세요."}
         delay(10);continue
        }
        check(n>0){"마이크 입력이 중단됐어요."}
        lastInput=SystemClock.elapsedRealtime()
        bytes.clear()
        val gain=inputGain
        var energy=0.0
        repeat(n){
         val sample=RecordingGain.scale(buffer[it],gain)
         bytes.putShort(sample)
         energy+=(sample/32768.0).pow(2)
        }
        out.write(bytes.array(),0,n*2)
        count+=n
        level.value=(sqrt(energy/n)*5).toFloat().coerceIn(0f,1f)
        elapsed.value=count/48000.0
       }
       ensureActive()
       input.stop()
       require(count>=4800){"녹음이 너무 짧아요. 다시 녹음해주세요."}
       out.seek(0)
       out.write(dubbingWavHeader(count))
       out.fd.sync()
       count
      }
      take.put("duration",samples/48000.0)
      drafts.commit(line.getString("id"),take)
      unfinished=null
     }
     capturing.value=false;level.value=0f;status.value="다음 대사 대기 중"
     playerError?.let{error(it)}
    ensureActive();complete(take)
    if(stopRequested)break
    }
    status.value="이 기기에 저장했어요"
   }catch(e:TimeoutCancellationException){
    status.value="배경 음향 대기 시간 초과"
    failure("배경 음향이 진행되지 않았어요. 이 위치부터 다시 녹음해주세요.")
   }catch(e:Exception){if(e is CancellationException)status.value="녹음이 중단됐어요. 완료한 대사는 그대로 남아 있어요." else{status.value="녹음 실패";failure(e.message?:"녹음을 확인해주세요.")}}
   finally{if(!closed)background.pause();recorder?.run{runCatching{stop()};release()};recorder=null;running.value=false;capturing.value=false;countdown.value=0;level.value=0f;unfinished?.delete()}
  }
 }
 /** A listener in a live dubbing room hears the same effects under someone else's line. */
 fun playLine(url:String,line:JSONObject,lineStartAt:Long){
  if(running.value)return
  stop()
  job=scope.launch{
   try{
    val window=dubbingWindow(line);val from=dubbingLeadIn(window);ready(url,(from*1000).toLong())
    val startAt=lineStartAt-((window.start-from)*1000).toLong()
    delay((startAt-System.currentTimeMillis()).coerceAtLeast(0))
    val late=(System.currentTimeMillis()-startAt).coerceAtLeast(0)
    if(late>0)background.seekTo((from*1000).toLong()+late)
    background.play()
    while(isActive&&background.currentPosition<(window.end*1000).toLong()){playerError?.let{error(it)};delay(50)}
   }catch(e:Exception){if(e !is CancellationException)status.value=e.message?:"효과음을 재생하지 못했어요."}
   finally{if(!closed)background.pause()}
  }
 }
 fun finishLine(){stopRequested=true;if(!capturing.value)stop()}
 fun stop(){pendingFinalId=null;job?.cancel();job=null;if(!closed){background.pause();preview.pause()}}
 fun listen(url:String,position:Double=0.0,finalProjectId:String?=null){stop();pendingFinalId=finalProjectId;preview.setMediaItem(MediaItem.fromUri(if(url.startsWith('/'))Endpoint.url(url)else url), (position*1000).toLong());preview.prepare();preview.play();status.value="미리 듣는 중"}
 fun close(){if(closed)return;stop();closed=true;backgroundCall?.cancel();scope.cancel();background.release();preview.release();preparedFile=null}
}

internal const val DUBBING_COUNT_IN=3.0
/** Where playback starts for a take: three seconds before the line, or earlier when its sound cue starts earlier. */
internal fun dubbingLeadIn(window:DubbingWindow):Double=max(0.0,min(window.cueStart,window.start-DUBBING_COUNT_IN))

/** One cached copy per sound version, shared by the project page and the recorder. */
internal fun dubbingBackgroundFile(context:Context,api:NativeApi,url:String,soundId:String,onCall:(okhttp3.Call?)->Unit={}):File{
 require(Regex("[A-Za-z0-9_-]{1,64}").matches(soundId)){"배경 음향을 확인해주세요."}
 val folder=File(context.cacheDir,"dubbing-background").apply{mkdirs()}
 val name=MessageDigest.getInstance("SHA-256").digest((url+"|"+soundId).toByteArray()).joinToString(""){"%02x".format(it)}.take(32)
 val target=File(folder,"$name.audio")
 synchronized(DubbingBackgroundLock){if(target.isFile&&target.length()>=44){target.setLastModified(System.currentTimeMillis());return target}}
 val partial=File.createTempFile("download-",".part",folder)
 try{
  val call=api.client.newCall(Request.Builder().url(Endpoint.url(url)).build());onCall(call)
  try{call.execute().use{response->
   check(response.isSuccessful){"배경 음향을 내려받지 못했어요. 다시 시도해주세요."}
   val body=response.body?:error("배경 음향이 비어 있어요.");val expected=body.contentLength();val limit=96L*1024*1024
   check(expected<=limit){"배경 음향 파일이 너무 커요."}
   var bytes=0L
   body.byteStream().use{input->partial.outputStream().buffered().use{out->val buffer=ByteArray(65536);while(true){if(call.isCanceled())throw java.io.IOException("배경 음향 다운로드를 멈췄어요.");val n=input.read(buffer);if(n<0)break;bytes+=n;check(bytes<=limit){"배경 음향 파일이 너무 커요."};out.write(buffer,0,n)}}}
   check(bytes>=44&&(expected<0||bytes==expected)){"배경 음향 다운로드가 끝나지 않았어요."}
  }}finally{onCall(null)}
  synchronized(DubbingBackgroundLock){
   if(!(target.isFile&&target.length()>=44)){target.delete();check(partial.renameTo(target)){"배경 음향을 저장하지 못했어요."}}
   // Keep a few recent sounds; older ones are downloaded again if needed.
   folder.listFiles{f->f.extension=="audio"}?.sortedByDescending{it.lastModified()}?.drop(4)?.forEach{it.delete()}
  }
  return target
 }finally{partial.delete()}
}
private object DubbingBackgroundLock

internal suspend fun NativeApi.uploadDubbingTake(path:String,file:File):JSONObject=withContext(Dispatchers.IO){
 require(file.length() in 9644L..(48L*96000+44)){"녹음 파일을 확인해주세요."}
 invalidateReads(homeSnapshot=false)
 try{client.newCall(Request.Builder().url(Endpoint.url(path)).put(file.asRequestBody("audio/wav".toMediaType())).build()).execute().use{r->
  val result=JSONObject(r.body?.string()?:"{}");if(!r.isSuccessful)throw ApiException(r.code,result.optString("error","녹음을 저장하지 못했어요."));result
 }}finally{invalidateReads(homeSnapshot=false)}
}
