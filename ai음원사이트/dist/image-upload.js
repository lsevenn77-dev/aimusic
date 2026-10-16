// Every website image upload passes through this encoder, including profile edits and cover songs.
const optimizedImages=new WeakMap();
const compatibleImages=new WeakMap();
async function decodeUploadImage(file){
 if(typeof createImageBitmap==='function')try{return await createImageBitmap(file);}catch{}
 // Mobile browsers may decode a gallery photo through <img> even when ImageBitmap fails.
 const url=URL.createObjectURL(file),image=new Image();
 try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('이미지를 열 수 없어요. JPG·PNG·WebP 사진을 선택해주세요.'));image.src=url;});
  return {source:image,width:image.naturalWidth,height:image.naturalHeight,close(){URL.revokeObjectURL(url);}};
 }catch(e){URL.revokeObjectURL(url);throw e;}
}
async function optimizeUploadImage(file,{allowFallback=false}={}){
 if(!file?.size||!file.type?.startsWith('image/'))return file;
 const cache=allowFallback?compatibleImages:optimizedImages;
 if(cache.has(file))return cache.get(file);
 const pending=(async()=>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG·PNG·WebP 이미지를 선택해주세요.');
  if(file.size>5*1024*1024)throw new Error('이미지는 5MB 이하로 업로드해주세요.');
  const bitmap=await decodeUploadImage(file);
  try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>64000000)throw new Error('이미지가 너무 커요. 가로·세로 크기를 줄여주세요.');
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const context=canvas.getContext('2d');if(!context)throw new Error('이미지 변환을 시작할 수 없어요.');context.drawImage(bitmap.source||bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));
   if(!blob||(blob.type!=='image/webp'&&!(allowFallback&&['image/png','image/jpeg'].includes(blob.type))))throw new Error('이 브라우저에서 WebP 변환을 지원하지 않아요. 최신 Chrome 또는 Edge에서 다시 시도해주세요.');
   if(blob.size>5*1024*1024)throw new Error('변환된 이미지가 너무 커요. 작은 이미지를 선택해주세요.');
   const ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[blob.type];
   return new File([blob],(file.name||'image').replace(/\.[^.]+$/,'')+'.'+ext,{type:blob.type,lastModified:file.lastModified});
  }finally{bitmap.close();}
 })();cache.set(file,pending);try{return await pending;}catch(e){cache.delete(file);throw e;}
}
