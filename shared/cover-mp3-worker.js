import {Mp3Encoder} from './third-party/lamejs-1.2.7/lamejs.js';
import {CoverMp3Encoder} from './cover-mp3.js';
let encoder;
self.onmessage=({data})=>{
 try{
  if(data.type==='init'){
   if(encoder)throw new Error('변환이 이미 시작됐어요.');
   encoder=new CoverMp3Encoder(Mp3Encoder,data.frames,data.sampleRate);self.postMessage({type:'next'});
  }else if(data.type==='chunk'&&encoder){encoder.push(data.channels);self.postMessage({type:'next'});}
  else if(data.type==='finish'&&encoder){const bytes=encoder.finish();encoder=null;self.postMessage({type:'done',bytes},[bytes.buffer]);}
  else throw new Error('녹음 변환 요청을 확인하지 못했어요.');
 }catch(error){self.postMessage({type:'error',message:error.message||'MP3 변환에 실패했어요.'});}
};
