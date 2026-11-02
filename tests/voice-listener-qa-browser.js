// Local fixture only. The real app binds its room UI/receive graph; synthetic
// speakers replace the SFU API. No microphone, real membership or DB writes.
const listenerQa={peers:[],captures:0,taps:new Map(),revision:1};
const realCapture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=()=>{listenerQa.captures++;throw Error('청취 중 마이크 요청 발생');};
const qaMembers=()=>[{id:'owner',name:'로컬 청취자',profile_id:'producer',role:'listener',seat:null,muted:true,locked:false,requested:false},{id:'qa-host',name:'테스트 방장',role:'host',seat:0,muted:false,publishing:true,mediaKey:'host-1'},{id:'qa-guest',name:'테스트 참여자',role:'listener',seat:1,muted:false,publishing:true,mediaKey:'guest-1'}];
const qaState=()=>({generation:'local-listener',revision:listenerQa.revision++,self:'owner',room:{id:'listener-fixture',title:'청취자 자동 대화 검증',background:'navy',max_members:30},members:qaMembers(),chat:[],notices:[],music:{queue:[],index:0,playing:false,position:0,volume:.7,updated:Date.now(),revision:0,repeat:'off'}});
function qaSource(){
 if(listenerQa.source)return;const ctx=listenerQa.source=new AudioContext();void ctx.resume();
 listenerQa.streams=[440,880].map(hz=>{const tone=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();tone.frequency.value=hz;gain.gain.value=.08;tone.connect(gain).connect(dest);tone.start();return dest.stream;});
}
document.addEventListener('click',e=>{if(e.target.closest('a[href="#voice/listener-fixture"]'))qaSource();},true);
voiceRequest=async(path,b)=>{
 if(path==='status')return {enabled:true};
 if(path.split('?')[0]==='public-rooms')return {next_cursor:null,rooms:[{id:'listener-fixture',title:'청취자 자동 대화 검증',host_name:'로컬 합성 오디오 2명',member_count:2,max_members:30,background:'navy'}],crews:[]};
 if(path.endsWith('/join')||path.endsWith('/heartbeat'))return qaState();
 if(path.endsWith('/subscribe')){
  qaSource();const pc=new RTCPeerConnection();listenerQa.peers.push(pc);
  for(const stream of listenerQa.streams)pc.addTransceiver(stream.getAudioTracks()[0],{direction:'sendonly'});
  await pc.setLocalDescription(await pc.createOffer());await VoiceRoomClient.prototype.ice.call({},pc);
  return {sessionDescription:pc.localDescription,negotiation:String(listenerQa.peers.length),tracks:pc.getTransceivers().map((t,i)=>({mid:t.mid,user_id:['qa-host','qa-guest'][i]}))};
 }
 if(path.endsWith('/answer')){await listenerQa.peers[Number(b.negotiation)-1].setRemoteDescription(b.sessionDescription);return {ok:true};}
 if(path.endsWith('/leave'))return {ok:true};
 throw Error('Unexpected local voice request: '+path);
};
VoiceRoomClient.prototype.socket=function(){};
const originalPlaybackGain=VoiceRoomClient.prototype.playbackGain;
VoiceRoomClient.prototype.playbackGain=function(a,v){
 originalPlaybackGain.call(this,a,v);
 if(a.voiceStream&&a.voiceGain&&!listenerQa.taps.has(a)){
  const ctx=this.levelContext,analyser=ctx.createAnalyser(),mute=ctx.createGain();mute.gain.value=0;
  a.voiceGain.disconnect();a.voiceGain.connect(analyser);analyser.connect(mute).connect(ctx.destination);listenerQa.taps.set(a,analyser);
 }
};
listenerQa.timer=setInterval(async()=>{
 const c=voiceController;if(!c?.joined)return;
 let out=document.querySelector('#voice-qa-result');if(!out){out=document.createElement('pre');out.id='voice-qa-result';out.style.cssText='white-space:pre-wrap;font-size:12px;line-height:1.6;margin:12px 0';document.querySelector('.voice-chat-panel').append(out);}
 const rows=[];for(const [id,a] of c.audios){const analyser=listenerQa.taps.get(a),data=new Float32Array(analyser?.fftSize||0);analyser?.getFloatTimeDomainData(data);const rms=data.length?Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length):0;rows.push(id+' 수신 RMS '+rms.toFixed(4));}
 let packets=0;const stats=await c.receiver?.getStats();stats?.forEach(s=>{if(s.type==='inbound-rtp')packets+=s.packetsReceived||0;});
 out.textContent='로컬 합성 WebRTC 검증 (SFU/실기기 별도)\n좌석 없음 · 마이크 요청 '+listenerQa.captures+'회\n입장 후 추가 클릭 없이 '+rows.length+'명 수신\n'+rows.join('\n')+'\nRTP '+packets+' 패킷 · '+(c.levelContext?.state||'none');
},800);
window.addEventListener('pagehide',()=>{clearInterval(listenerQa.timer);for(const pc of listenerQa.peers)pc.close();void listenerQa.source?.close();navigator.mediaDevices.getUserMedia=realCapture;});
