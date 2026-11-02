import {BackingPitch} from './backing-pitch.js';

class LiveBacking extends AudioWorkletProcessor {
 static get parameterDescriptors(){return [{name:'semitones',defaultValue:0,minValue:-6,maxValue:6,automationRate:'k-rate'}];}
 constructor({processorOptions:{head,at,duration}}){
  super();
  this.start=Math.round(at*sampleRate);
  this.end=this.start+Math.round(duration*sampleRate);
  this.lead=head[0].length;
  const capacity=2**Math.ceil(Math.log2(this.lead*2+1024));
  this.mask=capacity-1;
  this.ring=[new Float32Array(capacity),new Float32Array(capacity)];
  this.ring[0].set(head[0]);this.ring[1].set(head[1]||head[0]);
  this.renderer=new BackingPitch(sampleRate,(position,target,count)=>{
   for(let i=0;i<count;i++){
    const index=(position+i)&this.mask;
    target[i*2]=this.ring[0][index];target[i*2+1]=this.ring[1][index];
   }
  });
  this.block=new Float32Array(256);
 }
 process(inputs,outputs,params){
  if(currentFrame>=this.end)return false;
  const out=outputs[0],frames=out[0].length,skip=Math.max(0,this.start-currentFrame);
  if(skip>=frames)return true;
  const count=Math.min(frames-skip,this.end-currentFrame-skip),position=currentFrame+skip-this.start;
  const [left,right=left]=inputs[1];
  for(let i=0;i<count;i++){
   const j=(position+i+this.lead)&this.mask;
   this.ring[0][j]=left?.[i+skip]||0;this.ring[1][j]=right?.[i+skip]||0;
  }
  if(this.block.length<count*2)this.block=new Float32Array(count*2);
  this.renderer.render(position,Math.round(params.semitones[0]),this.block,count);
  for(let c=0;c<out.length;c++)for(let i=0;i<count;i++)out[c][skip+i]=this.block[2*i+c];
  return true;
 }
}
registerProcessor('aifect-backing',LiveBacking);
