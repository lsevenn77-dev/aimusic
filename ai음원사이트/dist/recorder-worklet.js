// A pulled, mono recorder. Keep output connected through a muted gain so all browsers process inputs.
class AifectRecorder extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(4096);this.length=0;this.time=0;this.running=true;
  this.port.onmessage=e=>{if(e.data==='stop'){this.flush();this.running=false;this.port.postMessage('done');}};
 }
 flush(){if(!this.length)return;const d=this.buffer.slice(0,this.length);let peak=0;for(const v of d)peak=Math.max(peak,Math.abs(v));this.port.postMessage({t:this.time,d,peak},[d.buffer]);this.length=0;}
 process(inputs,outputs){
  const channels=inputs[0],output=outputs[0]?.[0];if(!this.running)return false;
  if(!channels?.length||!channels[0]?.length)return true;
  const frames=channels[0].length;if(this.length+frames>this.buffer.length)this.flush();
  if(!this.length)this.time=currentFrame/sampleRate;
  for(let i=0;i<frames;i++){let value=0;for(const channel of channels)value+=channel[i]||0;value/=channels.length;this.buffer[this.length+i]=value;if(output)output[i]=value;}
  this.length+=frames;if(this.length===this.buffer.length)this.flush();return true;
 }
}
registerProcessor('aifect-recorder',AifectRecorder);
