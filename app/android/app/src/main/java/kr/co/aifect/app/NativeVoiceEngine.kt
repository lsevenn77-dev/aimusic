package kr.co.aifect.app

import android.content.Context
import android.media.AudioManager
import android.media.AudioFormat
import android.os.SystemClock
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.datasource.okhttp.OkHttpDataSource
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.*
import org.json.JSONObject
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule
import java.nio.ByteOrder
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.*

internal fun requestIdentity()=UUID.randomUUID().toString()
internal fun voiceReceiveKey(state:JSONObject)=state.optJSONArray("members").objects().filter{it.optString("id")!=state.optString("self")&&it.optBoolean("publishing")}.map{it.optString("id")+":"+it.optString("mediaKey")}.sorted().joinToString("|")
internal fun voiceMusicPosition(m:JSONObject,now:Long):Long {
 val duration=m.optJSONArray("queue")?.optJSONObject(m.optInt("index",-1))?.optDouble("duration",0.0)?:0.0
 return ((m.optDouble("position",0.0)+if(m.optBoolean("playing"))max(0L,now-m.optLong("updated"))/1000.0 else 0.0).coerceIn(0.0,max(0.0,duration))*1000).toLong()
}

/** One native receive transport for every listener, and a separate opt-in microphone. */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
internal class NativeVoiceEngine(private val context:Context,val roomId:String,private val micForeground:(Boolean)->Unit={}) {
 val api=NativeApi(context)
 val state=MutableStateFlow(JSONObject())
 val status=MutableStateFlow("토킹룸에 연결하는 중…")
 val error=MutableStateFlow<String?>(null)
 val micOn=MutableStateFlow(false)
 val level=MutableStateFlow(0f)
 val giftAnimations=kotlinx.coroutines.flow.MutableSharedFlow<JSONObject>(extraBufferCapacity=16,onBufferOverflow=kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST)
 private var giftsInitialized=false
 private val seenGifts=linkedSetOf<String>()
 val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
 private val audio=context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
 private val oldMode=audio.mode
 private val oldSpeaker=audio.isSpeakerphoneOn
 private val micIntent=VoiceMicIntent()
 private var focusGranted=false
 private var callActive=false
 private val focus=android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build()).setWillPauseWhenDucked(true).setOnAudioFocusChangeListener{change->scope.launch{audioFocusChanged(change)}}.build()
 private var socket:WebSocket?=null
 private var socketRetry:Job?=null
 private var closed=false
 val finished=MutableStateFlow(false)
 private val session=NativeSession.cookie(context)
 private var generation=""
 private val joinRequest=requestIdentity()
 private var joining=false
 private var receiveKey:String?=null
 private val receiveLock=Mutex()
 private val micLock=Mutex()
 private var receiveJob:Job?=null
 private var publisher:PeerConnection?=null
 private var receiver:PeerConnection?=null
 private var source:AudioSource?=null
 private var track:AudioTrack?=null
 private var micSequence=0L
 private var musicId=""
 private var clockOffset=0L
 @Volatile var inputGain=1f
 @Volatile var preset="radio"
 @Volatile var reverb=.06f
 @Volatile var voiceVolume=1.0
 var localMusicVolume=1f
 var echoCancellation=true
 var noiseSuppression=true
 private var priorSample=0f
 private var highPass=0f
 private var delayBuffer=FloatArray(2160)
 private var delayAt=0
 private var lastMeter=0L
 private val adm:JavaAudioDeviceModule
 private val factory:PeerConnectionFactory
 private val music=ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(api.client))).build()
 init {
  PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions())
  adm=JavaAudioDeviceModule.builder(context).setAudioSource(android.media.MediaRecorder.AudioSource.VOICE_COMMUNICATION).setSampleRate(48000).setUseStereoInput(false)
   .setUseHardwareAcousticEchoCanceler(true).setUseHardwareNoiseSuppressor(true)
   .setAudioBufferCallback{buffer,format,channels,rate,bytes,timestamp->
    if(format==AudioFormat.ENCODING_PCM_16BIT&&channels==1){
     buffer.order(ByteOrder.LITTLE_ENDIAN);var power=0.0
     val n=min(bytes,buffer.capacity())/2
     if(delayBuffer.size!=max(1,(rate*.045).toInt())){delayBuffer=FloatArray(max(1,(rate*.045).toInt()));delayAt=0}
     val coefficient=exp(-2*PI*85/rate).toFloat()
     for(i in 0 until n){var v=buffer.getShort(i*2)/32768f*inputGain.coerceIn(0f,1f)
      if(preset!="original"){highPass=coefficient*(highPass+v-priorSample);priorSample=v;v=highPass;val a=abs(v);if(a>.18f)v=sign(v)*(.18f+(a-.18f)/2.4f)}
      val echo=delayBuffer[delayAt];delayBuffer[delayAt]=v;delayAt=(delayAt+1)%delayBuffer.size
      v=(v+echo*if(preset=="studio")reverb.coerceIn(0f,.07f)else 0f).coerceIn(-1f,1f)
      power+=v*v;buffer.putShort(i*2,(v*32767).toInt().toShort())
     }
     if(SystemClock.elapsedRealtime()-lastMeter>70){lastMeter=SystemClock.elapsedRealtime();level.value=if(micOn.value)(sqrt(power/max(1,n))*5).toFloat().coerceIn(0f,1f)else 0f}
    };timestamp
   }.createAudioDeviceModule()
  factory=PeerConnectionFactory.builder().setAudioDeviceModule(adm).createPeerConnectionFactory()
  audio.mode=AudioManager.MODE_IN_COMMUNICATION
  focusGranted=audio.requestAudioFocus(focus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  music.setAudioAttributes(androidx.media3.common.AudioAttributes.Builder().setUsage(androidx.media3.common.C.USAGE_VOICE_COMMUNICATION).setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_SPEECH).build(),false)
  audio.isSpeakerphoneOn=!audio.isWiredHeadsetOn&&!audio.isBluetoothScoOn
  music.addListener(object:androidx.media3.common.Player.Listener{
   override fun onPlaybackStateChanged(s:Int){if(s==androidx.media3.common.Player.STATE_ENDED&&isHost())launch{command("music",payload("operation" to "ended","revision" to state.value.optJSONObject("music")?.optLong("revision"),"request_id" to requestIdentity()))}}
  })
 }
 fun isHost()=self()?.optString("role")=="host"
 fun self()=state.value.optJSONArray("members").objects().find{it.optString("id")==state.value.optString("self")}
 fun path(action:String)="/api/voice/rooms/$roomId/$action"
 fun launch(block:suspend ()->Unit){scope.launch{try{block()}catch(e:Exception){if(e is CancellationException)throw e;error.value=e.message?:"연결을 확인해주세요."}}}
 fun join(){if(joining||closed||generation.isNotBlank())return;joining=true;launch{try{
  error.value=null
  val sent=System.currentTimeMillis();val joined=api.call(path("join"),"POST",payload("request_id" to joinRequest))
  if(closed){api.call(path("leave"),"POST",payload("generation" to joined.optString("generation")));return@launch}
  generation=joined.getString("generation");clockOffset=joined.optLong("serverNow",sent)-(sent+System.currentTimeMillis())/2
  accept(joined);connectSocket();status.value="실시간 연결됨 · 청취 중"
  scope.launch{while(isActive){delay(15000);try{command("heartbeat")}catch(e:Exception){if(e is CancellationException)throw e;error.value=e.message;if(e is ApiException&&e.status in listOf(401,403,404,410)){close();break}}}}
 }finally{joining=false}}}
 fun retry(){if(generation.isBlank())join()else launch{receiveKey=null;command("heartbeat")}}
 suspend fun command(action:String,data:JSONObject=JSONObject()):JSONObject=withContext(Dispatchers.Main.immediate){
  if(session!=NativeSession.cookie(context)){close();error("로그인 계정이 변경됐어요. 다시 입장해주세요.")}
  check(!closed&&generation.isNotBlank()){ "방에 다시 입장해주세요." }
  val result=api.call(path(action),"POST",JSONObject(data.toString()).put("generation",generation))
  if(result.has("members"))accept(result)
  result
 }
 private fun accept(next:JSONObject){
  if(closed||next.optString("generation")!=generation||next.optLong("revision")<state.value.optLong("revision",-1))return
  next.optJSONArray("chat").objects().filter{it.optString("kind")=="gift"}.forEach{chat->if(seenGifts.add(chat.optString("id"))&&giftsInitialized)giftAnimations.tryEmit(chat)}
  giftsInitialized=true;while(seenGifts.size>200)seenGifts.remove(seenGifts.first())
  // Socket snapshots contain voice state only; keep the HTTP-validated room artwork.
  val nextRoom=next.optJSONObject("room");val previousRoom=state.value.optJSONObject("room")
  if(nextRoom!=null&&!nextRoom.has("theme")&&nextRoom.optString("host_id")==previousRoom?.optString("host_id"))previousRoom.optJSONObject("theme")?.let{nextRoom.put("theme",it)}
  state.value=next
  val me=self()
  if((me==null||me.isNull("seat")||me.optBoolean("locked"))&&publisher!=null){
   micIntent.interrupt();silenceLocally()
   scope.launch{micLock.withLock{if(self()?.let{!it.isNull("seat")&&!it.optBoolean("locked")}!=true)stopPublisher()}}
  }
  if(me==null||me.isNull("seat")||me.optBoolean("locked")||!me.optBoolean("publishing")&&micOn.value){track?.setEnabled(false);micOn.value=false;level.value=0f}
  if(me?.optBoolean("muted")==true&&!micIntent.pending){micIntent.interrupt();silenceLocally()}
  syncMusic()
  if(voiceReceiveKey(next)!=receiveKey){receiveJob?.cancel();receiveJob=scope.launch{receiveLock.withLock{receive()}}}
 }
 private fun connectSocket(){
  if(closed)return
  socket?.close(1000,"Reconnect")
  val next=api.client.newWebSocket(Request.Builder().url(Endpoint.url(path("socket"))+"?generation=$generation").build(),object:WebSocketListener(){
   override fun onMessage(ws:WebSocket,text:String){
    scope.launch{
     if(ws!==socket||closed)return@launch
     runCatching{JSONObject(text)}.getOrNull()?.let{event->
      when(event.optString("type")){
       "state"->accept(event.getJSONObject("state"))
       "music","gift"->launch{command("heartbeat")}
      }
     }
    }
   }
   override fun onClosed(ws:WebSocket,code:Int,reason:String){scope.launch{if(ws!==socket||closed)return@launch;if(code==4000||code==4001){error.value="다른 곳에서 입장 정보가 변경됐어요.";close()}else retrySocket()}}
   override fun onFailure(ws:WebSocket,t:Throwable,response:Response?){scope.launch{if(ws===socket&&!closed)retrySocket()}}
  });socket=next
 }
 private fun retrySocket(){socketRetry?.cancel();socketRetry=scope.launch{delay(3000);connectSocket()}}
 private fun peer(onFailure:()->Unit):PeerConnection {
  val config=PeerConnection.RTCConfiguration(listOf(PeerConnection.IceServer.builder("stun:stun.cloudflare.com:3478").createIceServer())).apply{bundlePolicy=PeerConnection.BundlePolicy.MAXBUNDLE;sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;iceCandidatePoolSize=1}
  return checkNotNull(factory.createPeerConnection(config,object:PeerConnection.Observer{
   override fun onSignalingChange(s:PeerConnection.SignalingState){}
   override fun onIceConnectionChange(s:PeerConnection.IceConnectionState){}
   override fun onIceConnectionReceivingChange(r:Boolean){}
   override fun onIceGatheringChange(s:PeerConnection.IceGatheringState){}
   override fun onIceCandidate(c:IceCandidate){}
   override fun onIceCandidatesRemoved(c:Array<out IceCandidate>){}
   override fun onAddStream(s:MediaStream){}
   override fun onRemoveStream(s:MediaStream){}
   override fun onDataChannel(c:DataChannel){}
   override fun onRenegotiationNeeded(){}
   override fun onTrack(t:RtpTransceiver){(t.receiver.track() as? AudioTrack)?.let{it.setEnabled(true);it.setVolume(if(focusGranted&&!callActive)voiceVolume else 0.0)}}
   override fun onConnectionChange(s:PeerConnection.PeerConnectionState){if(s==PeerConnection.PeerConnectionState.FAILED)scope.launch{if(!closed)onFailure()}}
  }))
 }
 private suspend fun receive(){
  val key=voiceReceiveKey(state.value);receiveKey=key;receiver?.close();receiver?.dispose();receiver=null
  if(key.isBlank())return
  val pc=peer{receiveKey=null;receiveJob=scope.launch{delay(1000);receiveLock.withLock{receive()}}};receiver=pc
  try{
   val answer=command("subscribe")
   val description=answer.optJSONObject("sessionDescription")?:return
   pc.remote(description);pc.local(pc.description(false));pc.gather()
   command("answer",payload("negotiation" to answer.getString("negotiation"),"sessionDescription" to pc.localDescription.json()))
   pc.connected();status.value="대화 청취 연결됨"
  }catch(e:Exception){receiveKey=null;if(e is CancellationException)throw e;error.value="대화 수신: ${e.message}";scope.launch{delay(4000);if(!closed&&receiver===pc)receiveLock.withLock{receive()}}}
 }
 private fun canTransmit()=!closed&&focusGranted&&!callActive&&self()?.let{!it.isNull("seat")&&!it.optBoolean("locked")}==true
 private fun silenceLocally(){track?.setEnabled(false);micOn.value=false;level.value=0f}
 internal fun audioFocusChanged(change:Int){
  if(closed)return
  when(change){
   AudioManager.AUDIOFOCUS_GAIN->{focusGranted=true;if(!callActive){audio.mode=AudioManager.MODE_IN_COMMUNICATION;setVoiceVolume(voiceVolume.toFloat());syncMusic()};status.value="청취 중 · 마이크는 직접 켜주세요"}
   AudioManager.AUDIOFOCUS_LOSS,AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK->{focusGranted=false;interruptMicrophone("전화 또는 다른 앱의 소리로 마이크를 껐어요.");music.pause();receiver?.receivers?.forEach{(it.track() as? AudioTrack)?.setVolume(0.0)}}
  }
 }
 internal fun phoneCallChanged(active:Boolean){
  if(closed)return
  callActive=active
  if(active){interruptMicrophone("전화가 와서 마이크를 껐어요.");music.pause();receiver?.receivers?.forEach{(it.track() as? AudioTrack)?.setVolume(0.0)}}
  else {focusGranted=audio.requestAudioFocus(focus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED;if(focusGranted){audio.mode=AudioManager.MODE_IN_COMMUNICATION;setVoiceVolume(voiceVolume.toFloat());syncMusic()};status.value="통화 종료 · 마이크는 직접 켜주세요"}
 }

 private fun interruptMicrophone(reason:String){
  val hadIntent=micIntent.wantsOn||micOn.value
  micIntent.interrupt();silenceLocally();status.value=reason
  if(hadIntent&&self()?.optBoolean("publishing")==true)launch{sendMuteState(true)}
 }
 private suspend fun sendMuteState(muted:Boolean):JSONObject=command("self-mute",payload("muted" to muted,"sequence" to ++micSequence))
 suspend fun microphone(enabled:Boolean)=withContext(Dispatchers.Main.immediate){setMicrophone(enabled)}
 private suspend fun setMicrophone(enabled:Boolean){
  error.value=null
  val token=micIntent.request(enabled)
  // Mute before any suspension or transport lock. A second tap/call wins even during first connection.
  if(!enabled){silenceLocally();try{if(self()?.optBoolean("publishing")==true)sendMuteState(true)}finally{micIntent.complete(token)};return}
  try{
   if(!focusGranted&&!callActive)focusGranted=audio.requestAudioFocus(focus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED
   check(canTransmit()){"좌석과 마이크 권한을 확인해주세요. 통화 중에는 마이크를 켤 수 없어요."}
   micForeground(true)
   micLock.withLock{
    if(!micIntent.isCurrent(token)||!micIntent.wantsOn)return@withLock
    if(publisher==null){
     status.value="마이크 연결 중…"
     val pc=peer{interruptMicrophone("마이크 연결이 끊겼어요. 다시 켜주세요.");launch{micLock.withLock{stopPublisher();command("mute")}}};publisher=pc
     source=factory.createAudioSource(MediaConstraints().apply{mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation",echoCancellation.toString()));mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression",noiseSuppression.toString()))})
     track=factory.createAudioTrack("aifect-mic",source).apply{setEnabled(false)}
     val tx=pc.addTransceiver(track,RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY))
     pc.local(pc.description(true));pc.gather()
     val response=command("publish",payload("request_id" to requestIdentity(),"mid" to tx.mid,"sessionDescription" to pc.localDescription.json()))
     pc.remote(response.getJSONObject("sessionDescription"));pc.connected();command("published",payload("muted" to true));micSequence=0
    }
   }
   if(!micIntent.isCurrent(token)||!micIntent.permits(canTransmit()))return
   check(self()?.optBoolean("publishing")==true){"마이크 연결을 다시 확인해주세요."}
   // The already authorized, warm WebRTC sender switches immediately; sequence numbers reconcile UI asynchronously.
   track?.setEnabled(true);micOn.value=true;status.value="마이크 켜짐 · 대화 청취 중"
   withTimeout(5000){sendMuteState(false)}
   if(micIntent.isCurrent(token)){
    micIntent.complete(token)
    if(!canTransmit()||self()?.optBoolean("muted")!=false){micIntent.interrupt();silenceLocally()}
   }
  }catch(e:Exception){
   if(micIntent.isCurrent(token)){micIntent.interrupt();silenceLocally();launch{runCatching{if(self()?.optBoolean("publishing")==true)sendMuteState(true)else micLock.withLock{stopPublisher();command("mute")}}}}
   throw e
  }
 }
 private fun stopPublisher(){micIntent.interrupt();track?.setEnabled(false);publisher?.close();publisher?.dispose();publisher=null;track?.dispose();track=null;source?.dispose();source=null;micOn.value=false;level.value=0f;micForeground(false)}
 fun setSpeaker(value:Boolean){audio.isSpeakerphoneOn=value}
 fun isSpeaker()=audio.isSpeakerphoneOn
 fun setMusicVolume(value:Float){localMusicVolume=value.coerceIn(0f,1f);syncMusic()}
 suspend fun processing(echo:Boolean,noise:Boolean){val resume=micOn.value;echoCancellation=echo;noiseSuppression=noise;if(publisher!=null){micLock.withLock{stopPublisher();command("mute")};if(resume)microphone(true)}}
 fun setVoiceVolume(value:Float){voiceVolume=value.coerceIn(0f,1f).toDouble();receiver?.receivers?.forEach{(it.track() as? AudioTrack)?.setVolume(if(focusGranted&&!callActive)voiceVolume else 0.0)}}
 private fun syncMusic(){val m=state.value.optJSONObject("music")?:return;val current=m.optJSONArray("queue")?.optJSONObject(m.optInt("index",-1));if(current==null){music.pause();musicId="";return}
  val id=current.getString("id");if(id!=musicId){musicId=id;music.setMediaItem(MediaItem.fromUri(Endpoint.url(path("music-stream"))+"?generation=$generation&track_id=$id"));music.prepare()}
  val target=voiceMusicPosition(m,System.currentTimeMillis()+clockOffset);if(abs(music.currentPosition-target)>800)music.seekTo(target)
  music.volume=m.optDouble("volume",.7).toFloat().coerceIn(0f,1f)*localMusicVolume;music.playWhenReady=m.optBoolean("playing")&&focusGranted&&!callActive
 }
 fun close(){if(closed)return;closed=true;val g=generation;scope.launch(NonCancellable){if(g.isNotBlank()&&session==NativeSession.cookie(context))runCatching{withTimeout(8000){api.call(path("leave"),"POST",payload("generation" to g))}}};socket?.close(1000,"Left");scope.cancel();stopPublisher();receiver?.close();receiver?.dispose();receiver=null;music.release();factory.dispose();adm.release();if(focusGranted&&!callActive&&audio.mode==AudioManager.MODE_IN_COMMUNICATION){audio.mode=oldMode;audio.isSpeakerphoneOn=oldSpeaker};audio.abandonAudioFocusRequest(focus);status.value="방에서 나왔어요";finished.value=true}
}
private fun SessionDescription.json()=payload("type" to type.canonicalForm(),"sdp" to description)
private suspend fun PeerConnection.description(offer:Boolean):SessionDescription=suspendCancellableCoroutine{c->val observer=object:SdpObserver{override fun onCreateSuccess(s:SessionDescription){if(c.isActive)c.resume(s)};override fun onCreateFailure(s:String){if(c.isActive)c.resumeWithException(IllegalStateException(s))};override fun onSetSuccess(){};override fun onSetFailure(s:String){}};if(offer)createOffer(observer,MediaConstraints())else createAnswer(observer,MediaConstraints())}
private suspend fun PeerConnection.setDescription(local:Boolean,s:SessionDescription)=suspendCancellableCoroutine<Unit>{c->val observer=object:SdpObserver{override fun onSetSuccess(){if(c.isActive)c.resume(Unit)};override fun onSetFailure(s:String){if(c.isActive)c.resumeWithException(IllegalStateException(s))};override fun onCreateSuccess(s:SessionDescription){};override fun onCreateFailure(s:String){}};if(local)setLocalDescription(observer,s)else setRemoteDescription(observer,s)}
private suspend fun PeerConnection.local(s:SessionDescription)=setDescription(true,s)
private suspend fun PeerConnection.remote(s:JSONObject)=setDescription(false,SessionDescription(SessionDescription.Type.fromCanonicalForm(s.getString("type")),s.getString("sdp")))
private suspend fun PeerConnection.gather(){val start=SystemClock.elapsedRealtime();withTimeout(10000){while(true){val has=localDescription?.description?.contains("a=candidate:")==true;if(has&&(iceGatheringState()==PeerConnection.IceGatheringState.COMPLETE||SystemClock.elapsedRealtime()-start>=1500))return@withTimeout;delay(50)}}}
private suspend fun PeerConnection.connected(){withTimeout(15000){while(connectionState()!=PeerConnection.PeerConnectionState.CONNECTED){check(connectionState() !in listOf(PeerConnection.PeerConnectionState.FAILED,PeerConnection.PeerConnectionState.CLOSED)){"음성 연결에 실패했어요."};delay(50)}}}
