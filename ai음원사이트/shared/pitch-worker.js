import {shiftBacking} from './pitch-shift.js';
import {BackingPitch,renderBackingKeys} from './backing-pitch.js';
let renderer,packet,lastEnd=-1,lastGeneration;
function live(d){
 packet=d;
 if(!renderer||d.generation!==lastGeneration||d.position!==lastEnd){
  renderer=new BackingPitch(d.rate,(at,to,count)=>{const p=packet,j=at-p.start,l=p.inputs[0],r=p.inputs[1]||l;for(let i=0;i<count;i++){to[2*i]=l[j+i]||0;to[2*i+1]=r[j+i]||0;}});
 }
 const pcm=new Float32Array(d.count*2),events=d.events;let event=0;
 for(let n=0;n<d.count;){const at=d.position+n;while(event+1<events.length&&events[event+1].at<=at)event++;const count=Math.min(128,d.count-n,(events[event+1]?.at??Infinity)-at);renderer.render(at,events[event].key,pcm.subarray(n*2,(n+count)*2),count);n+=count;}
 lastEnd=d.position+d.count;lastGeneration=d.generation;
 self.postMessage({pcm,generation:d.generation,activation:d.activation,position:d.position,count:d.count},[pcm.buffer]);packet=null;
}
self.onmessage=({data})=>{
 try{if(data.live){live(data);return;}const report=progress=>self.postMessage({progress});const channels=data.events?.length?renderBackingKeys(data.channels,data.sampleRate,data.events,report):shiftBacking(data.channels,data.sampleRate,data.semitones,report);self.postMessage({channels},channels.map(c=>c.buffer));}
 catch(error){self.postMessage({error:error.message||'반주 키 변환에 실패했습니다.'});}
};
