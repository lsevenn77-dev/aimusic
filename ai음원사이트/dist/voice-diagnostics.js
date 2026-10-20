// Local, bounded metrics only. No SDP, IP addresses, credentials, or media recordings.
class VoiceDiagnostics {
 constructor(client){this.client=client;this.samples=[];this.events=[];this.previous=new Map();this.timer=setInterval(()=>this.sample(),5000);this.busy=false;}
 record(metric,value){if(Number.isFinite(value)){this.events.push({at:Date.now(),metric,value});this.events=this.events.slice(-1000);}}
 async sample(){
  if(this.busy||this.client.closed)return;this.busy=true;
  try{for(const [direction,pc] of [['send',this.client.publisher],['receive',this.client.receiver]]){
   if(!pc||pc.connectionState==='closed')continue;const stats=await pc.getStats();
   stats.forEach(s=>{
    const row={at:Date.now(),direction,type:s.type};
    if(s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated)row.rttMs=Number.isFinite(s.currentRoundTripTime)?s.currentRoundTripTime*1000:null;
    else if(['inbound-rtp','remote-inbound-rtp'].includes(s.type)&&(s.kind==='audio'||s.mediaType==='audio')){
     row.jitterMs=Number.isFinite(s.jitter)?s.jitter*1000:null;row.audioLevel=s.audioLevel??null;
     if(Number.isFinite(s.roundTripTime))row.rttMs=s.roundTripTime*1000;
     const key=direction+':'+s.id,old=this.previous.get(key);this.previous.set(key,{pc,packetsReceived:s.packetsReceived,packetsLost:s.packetsLost,concealedSamples:s.concealedSamples,totalSamplesReceived:s.totalSamplesReceived});
     if(old?.pc===pc){const received=s.packetsReceived-old.packetsReceived,lost=s.packetsLost-old.packetsLost,total=s.totalSamplesReceived-old.totalSamplesReceived;
      if(received>=0&&lost>=0&&received+lost>0)row.lossPercent=100*lost/(received+lost);
      if(total>0&&s.concealedSamples>=old.concealedSamples)row.concealmentPercent=100*(s.concealedSamples-old.concealedSamples)/total;
     }
    }else return;
    this.samples.push(row);
   });
  }
  const a=this.client.musicAudio,m=this.client.state?.music,t=m?.queue[m.index];
  if(a&&t&&a.readyState>=1){const expected=Math.min(t.duration,m.position+(m.playing?Math.max(0,Date.now()+(this.client.musicClock||0)-m.updated)/1000:0));this.record('musicDriftMs',Math.abs(a.currentTime-expected)*1000);}
  this.samples=this.samples.slice(-6000);const summary=this.summary();const el=document.querySelector('#voice-diagnostics-summary');if(el)el.textContent=JSON.stringify(summary);
  }catch{/* Diagnostics must never affect transport. */}finally{this.busy=false;}
 }
 summary(){const result={};for(const key of ['rttMs','jitterMs','lossPercent','concealmentPercent']){const values=this.samples.map(s=>s[key]).filter(Number.isFinite).sort((a,b)=>a-b);result[key]=VoiceDiagnostics.percentiles(values);}
  for(const key of ['micEnableMs','reconnectMs','musicDriftMs'])result[key]=VoiceDiagnostics.percentiles(this.events.filter(s=>s.metric===key).map(s=>s.value).sort((a,b)=>a-b));return result;
 }
 static percentiles(values){return values.length?{samples:values.length,p50:values[Math.min(values.length-1,Math.floor(values.length*.5))],p95:values[Math.min(values.length-1,Math.floor(values.length*.95))]}:null;}
 download(){const data={capturedAt:new Date().toISOString(),members:this.client.state?.members.length,summary:this.summary(),samples:this.samples,events:this.events,limits:'CPU and end-to-end mouth-to-ear latency are not measured by these browser RTP counters.'};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='aifect-voice-stats.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 stop(){clearInterval(this.timer);this.previous.clear();}
}
