package kr.co.aifect.app

import android.Manifest
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule
import java.nio.ByteOrder
import java.nio.ByteBuffer
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.sin

/** Native libwebrtc transport and Android playback, with synthetic PCM over local ICE only. */
class NativeRtcTest{
 @Test fun listenerReceivesAudiblePcmThenBothPeersExchangeAudio(){
  val ins=InstrumentationRegistry.getInstrumentation();val context=ins.targetContext
  assertTrue(context.packageName.endsWith(".test"));assertTrue(android.os.Build.HARDWARE in listOf("ranchu","goldfish"))
  ins.uiAutomation.grantRuntimePermission(context.packageName,Manifest.permission.RECORD_AUDIO)
  PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions())
  val recordedA=AtomicInteger();val recordedB=AtomicInteger();val heardA=AtomicLong();val heardB=AtomicLong()
  fun module(recorded:AtomicInteger,heard:AtomicLong,frequency:Double):JavaAudioDeviceModule{
   var phase=0L
   return JavaAudioDeviceModule.builder(context).setSampleRate(48000).setUseStereoInput(false).setUseHardwareAcousticEchoCanceler(false).setUseHardwareNoiseSuppressor(false)
    .setAudioBufferCallback{buffer,format,channels,rate,bytes,timestamp->buffer.order(ByteOrder.LITTLE_ENDIAN);repeat(bytes/2){buffer.putShort(it*2,(sin(2*Math.PI*frequency*phase++/rate)*10000).toInt().toShort())};recorded.incrementAndGet();timestamp}
    .setPlaybackSamplesReadyCallback{samples->val b=ByteBuffer.wrap(samples.data).order(ByteOrder.LITTLE_ENDIAN);var energy=0L;while(b.remaining()>=2){val s=b.short.toLong();energy+=s*s};if(energy>100000)heard.incrementAndGet()}.createAudioDeviceModule()
  }
  val admA=module(recordedA,heardA,440.0);val admB=module(recordedB,heardB,660.0)
  val factoryA=PeerConnectionFactory.builder().setAudioDeviceModule(admA).createPeerConnectionFactory();val factoryB=PeerConnectionFactory.builder().setAudioDeviceModule(admB).createPeerConnectionFactory()
  fun create(factory:PeerConnectionFactory)=factory.createPeerConnection(PeerConnection.RTCConfiguration(emptyList()).apply{sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;bundlePolicy=PeerConnection.BundlePolicy.MAXBUNDLE},object:PeerConnection.Observer{
   override fun onSignalingChange(s:PeerConnection.SignalingState){};override fun onIceConnectionChange(s:PeerConnection.IceConnectionState){};override fun onIceConnectionReceivingChange(r:Boolean){};override fun onIceGatheringChange(s:PeerConnection.IceGatheringState){};override fun onIceCandidate(c:IceCandidate){};override fun onIceCandidatesRemoved(c:Array<out IceCandidate>){};override fun onAddStream(s:MediaStream){};override fun onRemoveStream(s:MediaStream){};override fun onDataChannel(c:DataChannel){};override fun onRenegotiationNeeded(){}
   override fun onTrack(t:RtpTransceiver){(t.receiver.track() as? AudioTrack)?.apply{setEnabled(true);setVolume(1.0)}}
  })!!
  val a=create(factoryA);val b=create(factoryB)
  val constraints=MediaConstraints().apply{mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation","false"));mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression","false"));mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl","false"))}
  val sourceA=factoryA.createAudioSource(constraints);val sourceB=factoryB.createAudioSource(constraints);val trackA=factoryA.createAudioTrack("a",sourceA);val trackB=factoryB.createAudioTrack("b",sourceB)
  try{
   a.addTransceiver(trackA,RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY));negotiate(a,b)
   await{heardB.get()>10};assertEquals("Listener must not start capture",0,recordedB.get());assertTrue(recordedA.get()>0)
   b.addTransceiver(trackB,RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY));negotiate(b,a)
   await{heardA.get()>10};assertTrue(recordedB.get()>0)
   val stats=CompletableFuture<RTCStatsReport>();b.getStats{stats.complete(it)};val inbound=stats.get(5,TimeUnit.SECONDS).statsMap.values.filter{it.type=="inbound-rtp"};assertTrue(inbound.any{(it.members["packetsReceived"] as? Number)?.toLong()?:0L>10})
  }finally{a.close();b.close();a.dispose();b.dispose();trackA.dispose();trackB.dispose();sourceA.dispose();sourceB.dispose();factoryA.dispose();factoryB.dispose();admA.release();admB.release()}
 }
 private fun await(test:()->Boolean){val deadline=System.currentTimeMillis()+15000;while(!test()){assertTrue("Timed out waiting for native PCM",System.currentTimeMillis()<deadline);Thread.sleep(40)}}
 private fun offer(pc:PeerConnection,offer:Boolean):SessionDescription{val f=CompletableFuture<SessionDescription>();val observer=object:SdpObserver{override fun onCreateSuccess(s:SessionDescription){f.complete(s)};override fun onCreateFailure(s:String){f.completeExceptionally(IllegalStateException(s))};override fun onSetSuccess(){};override fun onSetFailure(s:String){}};if(offer)pc.createOffer(observer,MediaConstraints())else pc.createAnswer(observer,MediaConstraints());return f.get(10,TimeUnit.SECONDS)}
 private fun set(pc:PeerConnection,local:Boolean,s:SessionDescription){val f=CompletableFuture<Unit>();val observer=object:SdpObserver{override fun onSetSuccess(){f.complete(Unit)};override fun onSetFailure(s:String){f.completeExceptionally(IllegalStateException(s))};override fun onCreateSuccess(s:SessionDescription){};override fun onCreateFailure(s:String){}};if(local)pc.setLocalDescription(observer,s)else pc.setRemoteDescription(observer,s);f.get(10,TimeUnit.SECONDS)}
 private fun negotiate(from:PeerConnection,to:PeerConnection){set(from,true,offer(from,true));await{from.iceGatheringState()==PeerConnection.IceGatheringState.COMPLETE};set(to,false,from.localDescription);set(to,true,offer(to,false));await{to.iceGatheringState()==PeerConnection.IceGatheringState.COMPLETE};set(from,false,to.localDescription);await{from.connectionState()==PeerConnection.PeerConnectionState.CONNECTED&&to.connectionState()==PeerConnection.PeerConnectionState.CONNECTED}}
}
