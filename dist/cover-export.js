// Feed small transferable chunks to keep the UI responsive and avoid duplicating
// a full stereo Float32 recording in memory on mobile devices.
function encodeCoverMp3(buffer,{signal,onProgress=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new Error('녹음 파일 변환을 취소했어요.'));return;}
  let worker,timer,position=0,finished=false;
  const close=()=>{clearTimeout(timer);worker?.terminate();signal?.removeEventListener('abort',abort);};
  const fail=message=>{if(finished)return;finished=true;close();reject(new Error(message));};
  const abort=()=>fail('녹음 파일 변환을 취소했어요.');
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>fail('녹음 파일 변환 응답이 늦어요. 다시 시도해주세요.'),60000);};
  try{
   worker=new Worker('/cover-mp3-worker.js?v=1',{type:'module'});
   signal?.addEventListener('abort',abort,{once:true});arm();
   worker.onerror=()=>fail('MP3 변환을 시작하지 못했어요. 녹음은 유지돼요. 다시 시도해주세요.');
   worker.onmessage=({data})=>{
    try{
     if(finished)return;arm();
     if(data.type==='error'){fail(data.message);return;}
     if(data.type==='done'){
      if(!(data.bytes instanceof Uint8Array)||data.bytes.length<100)throw new Error('변환 파일을 확인하지 못했어요.');
      finished=true;close();onProgress(1);resolve(new Blob([data.bytes],{type:'audio/mpeg'}));return;
     }
     if(data.type!=='next')throw new Error('변환 응답을 확인하지 못했어요.');
     onProgress(position/buffer.length);
     if(position>=buffer.length){worker.postMessage({type:'finish'});return;}
     const end=Math.min(buffer.length,position+65536),channels=[0,1].map(c=>buffer.getChannelData(c).slice(position,end));
     position=end;worker.postMessage({type:'chunk',channels},channels.map(c=>c.buffer));
    }catch(error){fail(error.message);}
   };
   worker.postMessage({type:'init',frames:buffer.length,sampleRate:buffer.sampleRate});
  }catch(error){fail(error.message||'MP3 파일을 만들지 못했어요.');}
 });
}
