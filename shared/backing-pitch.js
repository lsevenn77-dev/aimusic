import {SoundTouch} from '@soundtouchjs/core';

// Pull from the decoded MR at the transport position. SoundTouch reads ahead to
// preserve tempo, so changing key never waits for a whole-song conversion.
export class BackingPitch {
 constructor(rate,read){
  this.rate=rate;
  this.read=read;
  this.input=new Float32Array(1024*2);
  this.previousBlock=new Float32Array(256*2);
  this.fadeFrames=Math.round(rate*.012);
 }
 makeVoice(key,position){
  if(!key)return {key,position};
  const engine=new SoundTouch({sampleRate:this.rate,sampleBufferType:'circular'});
  engine.pitchSemitones=key;
  return {key,position,engine};
 }
 pull(voice,out,count){
  if(!voice.engine){
   this.read(voice.position,out,count);
   voice.position+=count;
   return;
  }
  const engine=voice.engine;
  while(engine.outputBuffer.frameCount<count){
   this.read(voice.position,this.input,1024);
   voice.position+=1024;
   engine.inputBuffer.putSamples(this.input,0,1024);
   engine.process();
  }
  engine.outputBuffer.extract(out,0,count);
  engine.outputBuffer.receive(count);
 }
 render(position,key,out,count){
  if(this.voice?.key!==key){
   this.previous=this.voice;
   this.fade=0;
   this.voice=this.makeVoice(key,position);
  }
  this.pull(this.voice,out,count);
  if(!this.previous)return;
  const overlap=Math.min(count,this.fadeFrames-this.fade);
  if(this.previousBlock.length<overlap*2)this.previousBlock=new Float32Array(overlap*2);
  this.pull(this.previous,this.previousBlock,overlap);
  for(let i=0;i<overlap;i++){
   const mix=++this.fade/this.fadeFrames;
   for(let c=0;c<2;c++)out[2*i+c]=this.previousBlock[2*i+c]*(1-mix)+out[2*i+c]*mix;
  }
  if(this.fade===this.fadeFrames)this.previous=null;
 }
}

export function renderBackingKeys(channels,rate,events,progress){
 const length=channels[0].length,output=channels.map(()=>new Float32Array(length));
 const renderer=new BackingPitch(rate,(at,target,n)=>{
  const right=channels[1]||channels[0];
  for(let i=0;i<n;i++){target[2*i]=channels[0][at+i]||0;target[2*i+1]=right[at+i]||0;}
 });
 const block=new Float32Array(256);let event=0,lastPercent=-1;
 for(let at=0;at<length;){
  while(event+1<events.length&&Math.round(events[event+1].at*rate)<=at)event++;
  const next=events[event+1]?Math.round(events[event+1].at*rate):length;
  const count=Math.min(128,next-at,length-at);
  renderer.render(at,events[event].key,block,count);
  for(let c=0;c<output.length;c++)for(let i=0;i<count;i++)output[c][at+i]=block[i*2+c];
  at+=count;
  const percent=Math.floor(at/length*100);
  if(percent!==lastPercent){progress?.(percent);lastPercent=percent;}
 }
 return output;
}
