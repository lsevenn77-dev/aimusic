// A pulled, mono recorder. Keep output connected through a muted gain so all browsers process inputs.
class AifectRecorder extends AudioWorkletProcessor {
 constructor(options){super();this.buffer=new Float32Array(4096);this.length=0;this.time=0;this.running=true;
  this.capture=options?.processorOptions?.capture;
  this.port.onmessage=e=>{if(e.data==='stop')this.finish();};
 }
 finish(){if(!this.running)return;this.flush();this.running=false;this.port.postMessage('done');}
 flush(){if(!this.length)return;const d=this.buffer.slice(0,this.length);let peak=0;for(const v of d)peak=Math.max(peak,Math.abs(v));this.port.postMessage({t:this.time,d,peak},[d.buffer]);this.length=0;}
 process(inputs,outputs){
  const channels=inputs[0],output=outputs[0]?.[0];if(!this.running)return false;
  const frames=channels?.[0]?.length||0;
  const first=this.capture?Math.max(0,this.capture.first-currentFrame):0;
  const last=this.capture?Math.min(frames,this.capture.last-currentFrame):frames;
  if(last>first){
   // Do not stamp a contiguous block across a missing input quantum.
   if(this.length&&(Math.round(this.time*sampleRate)+this.length!==currentFrame+first||this.length+last-first>this.buffer.length))this.flush();
   if(!this.length)this.time=(currentFrame+first)/sampleRate;
   for(let i=first;i<last;i++){
    let value=0;for(const channel of channels)value+=channel[i]||0;value/=channels.length;
    this.buffer[this.length++]=value;if(output)output[i]=value;
   }
   if(this.length===this.buffer.length)this.flush();
  }
  if(this.capture&&currentFrame+(output?.length||128)>=this.capture.last)this.finish();
  return this.running;
 }
}
registerProcessor('aifect-recorder',AifectRecorder);
