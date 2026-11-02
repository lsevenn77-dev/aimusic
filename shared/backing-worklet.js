// Real-time thread: no SoundTouch allocation, correlation search or waiting.
class LiveBacking extends AudioWorkletProcessor {
 constructor({processorOptions:{at,duration}}){
  super();this.start=Math.round(at*sampleRate);this.end=this.start+Math.round(duration*sampleRate);this.blocks=[];this.fade=Math.round(sampleRate*.024);
  this.port.onmessage=({data})=>{if(data.count>0)this.blocks.push(data);};
 }
 process(inputs,outputs){
  if(currentFrame>=this.end)return false;
  const out=outputs[0],input=inputs[0],at=currentFrame-this.start,blocks=this.blocks;
  for(let i=blocks.length-1;i>=0;i--)if(blocks[i].position+blocks[i].count<=at)blocks.splice(i,1);
  for(let i=0;i<out[0].length;i++){
   const t=at+i;if(t<0||this.start+t>=this.end)continue;
   let next=null,prev=null;
   for(let j=blocks.length-1;j>=0;j--){const b=blocks[j];if(t>=b.position&&t<b.position+b.count){if(!next)next=b;else if(b.generation!==next.generation){prev=b;break;}}}
   let x=next?Math.min(1,(t-next.activation)/this.fade):0;x=x*x*(3-2*x);
   for(let c=0;c<out.length;c++){const dry=(input[c]||input[0])?.[i]||0,v=next?.pcm?next.pcm[(t-next.position)*2+c]:dry,old=prev?.pcm?prev.pcm[(t-prev.position)*2+c]:dry;out[c][i]=x===1?v:old+(v-old)*x;}
  }
  return true;
 }
}
registerProcessor('aifect-backing',LiveBacking);
