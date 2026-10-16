import {SoundTouch} from '@soundtouchjs/core';

export function normalizeKey(value){return Math.max(-6,Math.min(6,Math.round(Number(value)||0)));}

// Offline processing runs in a dedicated Worker. Tempo, channel layout and frame count stay fixed.
export function shiftBacking(channels,sampleRate,semitones,onProgress=()=>{}){
 if(!Array.isArray(channels)||channels.length<1||channels.length>2||!channels.every(c=>c instanceof Float32Array&&c.length===channels[0].length)||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>96000||channels[0].length>600*sampleRate)throw new Error('지원하지 않는 반주 형식입니다.');
 const length=channels[0].length,key=normalizeKey(semitones),output=channels.map(()=>new Float32Array(length));
 if(!key||!length){channels.forEach((c,i)=>output[i].set(c));onProgress(100);return output;}
 const engine=new SoundTouch({sampleRate,sampleBufferType:'circular'});engine.pitchSemitones=key;
 const block=4096,padding=Math.round(sampleRate*.25),input=new Float32Array(block*2),result=new Float32Array(block*2);
 let read=0,written=0,lastPercent=-1;
 for(let position=0;position<length+padding+sampleRate*2&&written<length;position+=block){
  for(let i=0;i<block;i++){const n=position+i-padding;input[i*2]=n>=0&&n<length?channels[0][n]:0;input[i*2+1]=n>=0&&n<length?(channels[1]||channels[0])[n]:0;}
  engine.inputBuffer.putSamples(input);engine.process();
  while(engine.outputBuffer.frameCount){
   const count=Math.min(block,engine.outputBuffer.frameCount);engine.outputBuffer.extract(result,0,count);engine.outputBuffer.receive(count);
   for(let i=0;i<count;i++,read++){const n=read-padding;if(n<0||n>=length)continue;for(let c=0;c<output.length;c++)output[c][n]=Math.max(-1,Math.min(1,result[i*2+c]));written=n+1;}
  }
  const percent=Math.min(99,Math.floor(100*written/Math.max(1,length)));if(percent!==lastPercent){lastPercent=percent;onProgress(percent);}
 }
 engine.clear();if(written<length)throw new Error('반주 키 변환을 완료하지 못했습니다.');onProgress(100);return output;
}
