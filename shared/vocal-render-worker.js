import {renderVocals} from './vocal-effects.js';
self.onmessage=({data})=>{
 try{
  if(!(data.samples instanceof Float32Array)||!Number.isFinite(data.sampleRate)||data.sampleRate<8000||data.sampleRate>96000||data.samples.length>data.sampleRate*600)throw new Error('녹음 데이터를 확인하지 못했어요.');
  const samples=renderVocals(data.samples,data.sampleRate,data.mix);
  self.postMessage({samples},[samples.buffer]);
 }catch(error){self.postMessage({error:error.message||'효과를 준비하지 못했어요.'});}
};
