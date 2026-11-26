// Only served by preview-voice-transport.mjs, never copied into the app build.
let voiceQaSerial=0,voiceQaContext=null,voiceQaPeers=[],voiceQaAudios=[];
const result=document.querySelector('#result');
function stopVoiceQa(){voiceQaSerial++;for(const pc of voiceQaPeers)pc.close();voiceQaPeers=[];for(const a of voiceQaAudios){a.pause();a.srcObject=null;}voiceQaAudios=[];void voiceQaContext?.close().catch(()=>{});voiceQaContext=null;}
document.querySelector('#stop').onclick=()=>{stopVoiceQa();result.textContent+='\n테스트 연결과 합성 소리를 모두 해제했습니다.';};
async function runVoiceQa(fixed,legacyPlayback=false){
 stopVoiceQa();const serial=voiceQaSerial,started=performance.now();
 const ctx=voiceQaContext=new AudioContext();await ctx.resume();
 const Client=fixed?window.VoiceClientAfter:window.VoiceClientBefore,client=Object.create(Client.prototype);
 result.textContent=(legacyPlayback?'기존 수신 경로':fixed?'수정':'기존')+' 방식 · 실제 WebRTC 연결 준비 중…';
 try{
  for(const [direction,hz] of [['A → B',440],['B → A',880]]){
   if(serial!==voiceQaSerial)return;
   const config={iceServers:[{urls:'stun:192.0.2.1:3478'}],bundlePolicy:'max-bundle'},send=new RTCPeerConnection(config),receive=new RTCPeerConnection(config);voiceQaPeers.push(send,receive);
   const tone=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();tone.frequency.value=hz;gain.gain.value=.08;tone.connect(gain).connect(dest);tone.start();
   let analyser;
   receive.ontrack=e=>{analyser=ctx.createAnalyser();const mute=ctx.createGain();mute.gain.value=0;const a=new Audio();voiceQaAudios.push(a);a.srcObject=new MediaStream([e.track]);client.levelContext=ctx;(legacyPlayback?window.VoiceClientBefore.prototype.playbackGain:client.playbackGain).call(client,a,1);a.voiceGain.disconnect();a.voiceGain.connect(analyser).connect(mute).connect(ctx.destination);void a.play().catch(err=>result.textContent+='\n수신 재생: '+err.name);};
   send.addTransceiver(dest.stream.getAudioTracks()[0],{direction:'sendonly'});await send.setLocalDescription(await send.createOffer());
   result.textContent+='\n'+direction+' · 후보 수집 중';await client.ice(send);if(serial!==voiceQaSerial)return;
   result.textContent+=' · '+Math.round(performance.now()-started)+'ms · gathering='+send.iceGatheringState;
   await receive.setRemoteDescription(send.localDescription);await receive.setLocalDescription(await receive.createAnswer());await client.ice(receive);if(serial!==voiceQaSerial)return;
   await send.setRemoteDescription(receive.localDescription);await Promise.all([client.connected(send),client.connected(receive)]);await new Promise(r=>setTimeout(r,700));if(serial!==voiceQaSerial)return;
   const stats=await receive.getStats();let packets=0,bytes=0,energy=0,decoded=0;stats.forEach(s=>{if(s.type==='inbound-rtp'&&(s.kind==='audio'||s.mediaType==='audio')){packets+=s.packetsReceived||0;bytes+=s.bytesReceived||0;energy+=s.totalAudioEnergy||0;decoded+=s.totalSamplesReceived||0;}});
   const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);
   result.textContent+='\n'+direction+' · 연결 '+send.connectionState+'/'+receive.connectionState+' · 수신 패킷 '+packets+' · '+bytes+' bytes · 입력 RMS '+rms.toFixed(4)+' · 디코딩 '+decoded+' samples · 수신 에너지 '+energy.toFixed(5)+' · context '+ctx.state;
   if(packets<1||rms<.005)throw Error('수신 오디오 검증 실패');
  }
  result.textContent+='\n양방향 합성 오디오 전달 통과 · '+Math.round(performance.now()-started)+'ms';
 }catch(e){if(serial===voiceQaSerial)result.textContent+='\n'+e.message+' · '+Math.round(performance.now()-started)+'ms';}
 finally{if(serial===voiceQaSerial){stopVoiceQa();result.textContent+='\n연결 해제 완료';}}
}
document.querySelector('#before').onclick=()=>void runVoiceQa(false);
document.querySelector('#before-playback').onclick=()=>void runVoiceQa(true,true);
document.querySelector('#after').onclick=()=>void runVoiceQa(true);
window.addEventListener('pagehide',stopVoiceQa);
