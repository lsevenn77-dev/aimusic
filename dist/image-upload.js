// Every website image upload passes through this encoder, including profile edits and cover songs.
const optimizedImages=new WeakMap();
const compatibleImages=new WeakMap();
async function decodeUploadImage(file){
 if(typeof createImageBitmap==='function')try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}
 // Mobile browsers may decode a gallery photo through <img> even when ImageBitmap fails.
 const url=URL.createObjectURL(file),image=new Image();
 try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('이미지를 열 수 없습니다. JPG·PNG·WebP 사진을 선택해 주세요.'));image.src=url;});
  return {source:image,width:image.naturalWidth,height:image.naturalHeight,close(){URL.revokeObjectURL(url);}};
 }catch(e){URL.revokeObjectURL(url);throw e;}
}
async function encodeUploadCanvasWebp(canvas){
 // Safari can display WebP but export a PNG from toBlob('image/webp').
 // Reuse the existing on-demand encoder with the already resized pixels.
 const {encodeCrewWebp}=await import('/crew-webp.js');
 return encodeCrewWebp({source:canvas,width:canvas.width,height:canvas.height},{quality:84});
}
async function optimizeUploadImage(file,{allowFallback=false}={}){
 if(!file?.size||!file.type?.startsWith('image/'))return file;
 const cache=allowFallback?compatibleImages:optimizedImages;
 if(cache.has(file))return cache.get(file);
 const pending=(async()=>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG·PNG·WebP 이미지를 선택해 주세요.');
  if(file.size>5*1024*1024)throw new Error('이미지는 5MB 이하로 업로드해 주세요.');
  const bitmap=await decodeUploadImage(file);let canvas;
  try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>64000000)throw new Error('이미지가 너무 큽니다. 가로·세로 크기를 줄여 주세요.');
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const context=canvas.getContext('2d');if(!context)throw new Error('이미지 변환을 시작할 수 없습니다.');context.drawImage(bitmap.source||bitmap,0,0,canvas.width,canvas.height);
   let blob;
   try{blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));}catch{}
   if(!blob?.size||(blob.type!=='image/webp'&&!(allowFallback&&['image/png','image/jpeg'].includes(blob.type)))){
    try{blob=await encodeUploadCanvasWebp(canvas);}catch{}
    if(!blob?.size||blob.type!=='image/webp')throw new Error('사진을 변환하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 업로드해 주세요. 선택한 파일과 입력 내용은 유지됩니다.');
   }
   if(blob.size>5*1024*1024)throw new Error('변환된 이미지가 너무 큽니다. 작은 이미지를 선택해 주세요.');
   const ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[blob.type];
   return new File([blob],(file.name||'image').replace(/\.[^.]+$/,'')+'.'+ext,{type:blob.type,lastModified:file.lastModified});
  }finally{if(canvas)canvas.width=canvas.height=1;bitmap.close();}
 })();cache.set(file,pending);try{return await pending;}catch(e){cache.delete(file);throw e;}
}
