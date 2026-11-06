// Local QA only. Real device capture + production processing/ICE + loopback RTP.
// No recording, external SFU, production data or browser API replacement.
let physicalRun=0,physicalRaw,physicalGraph,physicalPeers=[];
const physicalResult=document.querySelector('#physical-result');
function stopPhysicalMic(){physicalRun++;physicalRaw?.getTracks().forEach(t=>t.stop());physicalRaw=null;physicalGraph?.close();physicalGraph=null;physicalPeers.forEach(p=>p.close());physicalPeers=[];}
document.querySelector('#physical-stop').onclick=()=>{stopPhysicalMic();physicalResult.textContent+='\n마이크 장치와 연결 해제 완료';};
document.querySelector('#physical-mic').onclick=async()=>{
 stopPhysicalMic();const serial=physicalRun,client=Object.create(VoiceClientAfter.prototype);
 physicalResult.textContent='실제 마이크 권한 및 장치 연결 대기 중…';
 try{
  const raw=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
  if(serial!==physicalRun){raw.getTracks().forEach(t=>t.stop());return;}physicalRaw=raw;
  const track=raw.getAudioTracks()[0];physicalResult.textContent='실제 입력 장치: '+track.label+' · 상태 '+track.readyState;
  physicalGraph=await VoiceAudio.microphone(raw,'radio',1);
  const send=new RTCPeerConnection(),receive=new RTCPeerConnection();physicalPeers=[send,receive];
  receive.ontrack=e=>{physicalResult.textContent+='\n수신 오디오 트랙: '+e.track.kind;};
  const sender=send.addTransceiver(physicalGraph.stream.getAudioTracks()[0],{direction:'sendonly'}).sender;
  client.stream=raw;client.micSender=sender;
  await send.setLocalDescription(await send.createOffer());await client.ice(send);
  await receive.setRemoteDescription(send.localDescription);await receive.setLocalDescription(await receive.createAnswer());await client.ice(receive);
  await send.setRemoteDescription(receive.localDescription);await Promise.all([client.connected(send),client.connected(receive)]);
  await new Promise(r=>setTimeout(r,1200));if(serial!==physicalRun)return;
  let packets=0,samples=0;for(const s of (await receive.getStats()).values())if(s.type==='inbound-rtp'&&(s.kind==='audio'||s.mediaType==='audio')){packets+=s.packetsReceived||0;samples+=s.totalSamplesReceived||0;}
  if(!packets||!samples)throw Error('실제 오디오 패킷 수신 실패');
  physicalResult.textContent+='\nWebRTC '+send.connectionState+'/'+receive.connectionState+' · '+packets+' packets · '+samples+' samples';
  client.setCaptureEnabled(false);if(track.enabled||sender.track.enabled)throw Error('마이크 OFF 실패');
  physicalResult.textContent+='\n마이크 OFF: 원본·송출 트랙 모두 비활성';
  client.setCaptureEnabled(true);if(!track.enabled||!sender.track.enabled)throw Error('마이크 ON 실패');
  physicalResult.textContent+='\n마이크 ON: 원본·송출 트랙 모두 활성\n실제 마이크 로컬 연결 검사 통과';
 }catch(e){physicalResult.textContent+='\n검사 실패: '+e.name+' · '+e.message;}
 finally{if(serial===physicalRun){stopPhysicalMic();physicalResult.textContent+='\n마이크 장치와 연결 해제 완료';}}
};
addEventListener('pagehide',stopPhysicalMic);
