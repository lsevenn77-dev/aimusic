// Every website image upload passes through this encoder, including profile edits and cover songs.
const optimizedImages=new WeakMap();
async function optimizeUploadImage(file){
 if(!file?.size||!file.type?.startsWith('image/'))return file;
 if(optimizedImages.has(file))return optimizedImages.get(file);
 const pending=(async()=>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG·PNG·WebP 이미지를 선택해주세요.');
  if(file.size>5*1024*1024)throw new Error('이미지는 5MB 이하로 업로드해주세요.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('이미지를 열 수 없어요. 다른 이미지를 선택해주세요.');});
  try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>64000000)throw new Error('이미지가 너무 커요. 가로·세로 크기를 줄여주세요.');
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const context=canvas.getContext('2d');if(!context)throw new Error('이미지 변환을 시작할 수 없어요.');context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));
   if(!blob||blob.type!=='image/webp')throw new Error('이 브라우저에서 WebP 변환을 지원하지 않아요. 최신 Chrome 또는 Edge에서 다시 시도해주세요.');
   if(blob.size>5*1024*1024)throw new Error('변환된 이미지가 너무 커요. 작은 이미지를 선택해주세요.');
   return new File([blob],(file.name||'image').replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp',lastModified:file.lastModified});
  }finally{bitmap.close();}
 })();optimizedImages.set(file,pending);try{return await pending;}catch(e){optimizedImages.delete(file);throw e;}
}
