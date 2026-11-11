package kr.co.aifect.app

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
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
internal fun dubbingWindow(line:JSONObject):DubbingWindow {
 val start=line.getDouble("start");val end=line.optDouble("recordEnd",line.getDouble("end"))
 require(start.isFinite()&&end.isFinite()&&start>=0&&end-start in .1..48.0){"대사 녹음 시간을 확인해주세요."}
 return DubbingWindow(line.optDouble("cueStart",start).coerceIn(0.0,start),start,end)
}

/** Only explicitly saved takes survive leaving the recorder. New takes are session work. */
internal class DubbingDrafts(context:Context,account:String,project:String,sound:String,role:String){
 val directory:File
 private val manifest:File
 val takes=mutableMapOf<String,JSONObject>()
 private val saved=mutableMapOf<String,JSONObject>()
 val hasUnsavedChanges get()=takes.mapValues{it.value.toString()}!=saved.mapValues{it.value.toString()}
 init{
  require(account.isNotBlank());listOf(project,sound,role).forEach{require(Regex("[A-Za-z0-9_-]{1,64}").matches(it))}
  val owner=MessageDigest.getInstance("SHA-256").digest(account.toByteArray()).joinToString(""){"%02x".format(it)}
  directory=File(context.filesDir,"dubbing-drafts/$owner/$project/$sound/$role").apply{mkdirs()};manifest=File(directory,"takes.json")
  runCatching{val data=android.util.AtomicFile(manifest).openRead().bufferedReader().use{JSONObject(it.readText())};data.keys().forEach{k->val take=data.getJSONObject(k);if(file(take).isFile)takes[k]=take}}
  takes.forEach{(k,v)->saved[k]=JSONObject(v.toString())}
  cleanup()
 }
 fun file(take:JSONObject):File {val id=take.getString("id");require(Regex("[A-Za-z0-9_-]{1,64}").matches(id));return File(directory,"$id.wav")}
 fun commit(line:String,take:JSONObject){require(Regex("[A-Za-z0-9_-]{1,64}").matches(line));takes[line]=take;cleanup()}
 fun save(){persist();saved.clear();takes.forEach{(k,v)->saved[k]=JSONObject(v.toString())};cleanup()}
 fun discard(){takes.clear();saved.forEach{(k,v)->takes[k]=JSONObject(v.toString())};cleanup()}
 private fun cleanup(){val keep=(takes.values+saved.values).map{file(it).name}.toSet();directory.listFiles()?.filter{it.extension=="wav"&&it.name !in keep}?.forEach{it.delete()}}
 fun uploaded(line:String,takeId:String){takes[line]?.takeIf{it.optString("id")==takeId}?.put("uploaded",true);save()}
 private fun persist(){val data=JSONObject();takes.forEach{(k,v)->data.put(k,v)};android.util.AtomicFile(manifest).let{atomic->val stream=atomic.startWrite();try{stream.write(data.toString().toByteArray());atomic.finishWrite(stream)}catch(e:Exception){atomic.failWrite(stream);throw e}}}
}

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
internal class NativeDubbingAudio(private val context:Context,private val api:NativeApi){
 val status=MutableStateFlow("");val countdown=MutableStateFlow(0);val level=MutableStateFlow(0f);val elapsed=MutableStateFlow(0.0);val running=MutableStateFlow(false);val capturing=MutableStateFlow(false)
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
 private val background=ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(context,OkHttpDataSource.Factory(api.client)))).build()
 private val preview=ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(context,OkHttpDataSource.Factory(api.client)))).build()
 private var job:Job?=null
 @Volatile private var recorder:AudioRecord?=null
 @Volatile private var stopRequested=false
 private var closed=false
 private var playerError:String?=null
 private var preparedUrl:String?=null
 private var preparedFile:File?=null
 private var backgroundCall:okhttp3.Call?=null
 val previewing=MutableStateFlow(false)
 init{
  background.addListener(object:Player.Listener{override fun onPlayerError(error:androidx.media3.common.PlaybackException){playerError="배경 음향을 불러오지 못했어요. 연결을 확인해주세요."}})
  preview.addListener(object:Player.Listener{override fun onIsPlayingChanged(isPlaying:Boolean){previewing.value=isPlaying}})
 }
 /** Playback position of the listen-only player, for the background sound bar. */
 fun previewPositionMs():Long=if(closed)0 else preview.currentPosition
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
 @SuppressLint("MissingPermission")
 /** [lineStartAt] = wall-clock ms when the line begins (a live dubbing room's shared cue); null counts in from now. */
 fun record(url:String,line:JSONObject,drafts:DubbingDrafts,complete:(JSONObject)->Unit,failure:(String)->Unit,lineStartAt:Long?=null){
  if(running.value)return
  stop();running.value=true;stopRequested=false;elapsed.value=0.0
  job=scope.launch{
   val take=payload("id" to requestIdentity(),"uploaded" to false);val output=drafts.file(take);var accepted=false
   try{
    val window=dubbingWindow(line);val from=dubbingLeadIn(window);status.value="시작 준비";ready(url,(from*1000).toLong())
    val size=max(9600,AudioRecord.getMinBufferSize(48000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT))
    val input=AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION).setAudioFormat(AudioFormat.Builder().setSampleRate(48000).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()).setBufferSizeInBytes(size).build();recorder=input
    check(input.state==AudioRecord.STATE_INITIALIZED){"마이크를 연결하지 못했어요."}
    // 3 · 2 · 1 runs over the sound just before the line, so the effects lead into the take.
    // When the line starts too early for three seconds of sound, the missing part is counted in silence.
    val lead=window.start-from
    val target=lineStartAt?:(System.currentTimeMillis()+(max(DUBBING_COUNT_IN,lead)*1000).toLong());var playing=false
    check(target-System.currentTimeMillis()>-1000){"신호를 늦게 받았어요. 이 대사를 다시 시작해주세요."}
    withTimeout((max(0L,target-System.currentTimeMillis())+15000)){
     while(true){
      playerError?.let{error(it)}
      val untilLine=(target-System.currentTimeMillis())/1000.0
      if(!playing&&untilLine<=lead){if(untilLine<lead-.05)background.seekTo(((window.start-untilLine.coerceAtLeast(0.0))*1000).toLong());background.play();playing=true}
      val remaining=if(playing)window.start-background.currentPosition/1000.0 else untilLine
      if(remaining<=.015)break
      countdown.value=if(remaining<=DUBBING_COUNT_IN)ceil(remaining).toInt().coerceAtLeast(1) else 0
      status.value=if(countdown.value>0)"시작 준비" else "효과음 듣는 중 · 곧 3 · 2 · 1이 시작돼요"
      delay(10)
     }
    }
    countdown.value=0;status.value="녹음 중";capturing.value=true;input.startRecording();check(input.recordingState==AudioRecord.RECORDSTATE_RECORDING){"마이크를 시작하지 못했어요."}
    val maximum=floor(window.duration*48000).toInt();val samples=withContext(Dispatchers.IO){
     RandomAccessFile(output,"rw").use{out->out.setLength(0);out.write(ByteArray(44));val buffer=ShortArray(960);var count=0
      while(isActive&&!stopRequested&&count<maximum){val n=input.read(buffer,0,min(buffer.size,maximum-count));check(n>0){"마이크 입력이 중단됐어요."};val bytes=ByteBuffer.allocate(n*2).order(ByteOrder.LITTLE_ENDIAN);var sum=0.0;repeat(n){bytes.putShort(buffer[it]);sum+=(buffer[it]/32768.0).pow(2)};out.write(bytes.array());count+=n;level.value=(sqrt(sum/n)*5).toFloat().coerceIn(0f,1f);elapsed.value=count/48000.0}
      ensureActive();require(count>=4800){"녹음이 너무 짧아요. 다시 녹음해주세요."};out.seek(0);out.write(dubbingWavHeader(count));count
     }
    }
    playerError?.let{error(it)};take.put("duration",samples/48000.0);drafts.commit(line.getString("id"),take);accepted=true;status.value="녹음 완료 · 임시 저장으로 한 번에 올릴 수 있어요";complete(take)
   }catch(e:Exception){if(e is CancellationException)status.value="녹음이 중단됐어요. 완료한 대사는 그대로 남아 있어요." else{status.value="녹음 실패";failure(e.message?:"녹음을 확인해주세요.")}}
   finally{if(!closed)background.pause();recorder?.run{runCatching{stop()};release()};recorder=null;running.value=false;capturing.value=false;countdown.value=0;level.value=0f;if(!accepted)output.delete()}
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
 fun stop(){job?.cancel();job=null;if(!closed){background.pause();preview.pause()}}
 fun listen(url:String,position:Double=0.0){stop();preview.setMediaItem(MediaItem.fromUri(if(url.startsWith('/'))Endpoint.url(url)else url), (position*1000).toLong());preview.prepare();preview.play();status.value="미리 듣는 중"}
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
 invalidateReads()
 try{client.newCall(Request.Builder().url(Endpoint.url(path)).put(file.asRequestBody("audio/wav".toMediaType())).build()).execute().use{r->
  val result=JSONObject(r.body?.string()?:"{}");if(!r.isSuccessful)throw ApiException(r.code,result.optString("error","녹음을 저장하지 못했어요."));result
 }}finally{invalidateReads()}
}
