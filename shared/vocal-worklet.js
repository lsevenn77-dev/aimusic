import {VocalProcessor} from './vocal-effects.js';
class AifectVocal extends AudioWorkletProcessor {
 constructor(options){
  super();
  const {mix,recording}=options.processorOptions||{};
  this.fx=new VocalProcessor(sampleRate,mix);
  this.bypass=recording&&mix?.preset==='original';
  this.port.onmessage=({data})=>{
   this.bypass=recording&&data.preset==='original';
   this.fx.update(data);
  };
 }
 process(inputs,outputs){
  const input=inputs[0]?.[0],out=outputs[0]?.[0];
  if(!out)return true;
  if(this.bypass){if(input)out.set(input);else out.fill(0);}
  else for(let i=0;i<out.length;i++)out[i]=this.fx.process(input?.[i]||0);
  return true;
 }
}
registerProcessor('aifect-vocal',AifectVocal);
