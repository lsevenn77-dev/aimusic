// Crew portraits use the format the canvas actually produced. Chat attachments have a different contract.
const crewPhotoAccept='image/*,.jpg,.jpeg,.png,.webp,.heic,.heif';
const crewPhotoHelp='JPG · PNG · WebP · HEIC/HEIF / 원본 최대 25MB. 저장 전에는 사진이 바뀌지 않습니다.';

async function decodeCrewPhoto(file,signal){
 if(!file?.size)throw Error('선택한 사진이 비어 있습니다. 사진첩에서 다시 선택해 주세요.');
 if(file.size>25*1024*1024)throw Error('원본 사진이 25MB를 넘습니다. 크기를 줄인 뒤 다시 선택해 주세요.');
 // Gallery providers can omit MIME, or deliver JPEG bytes for a .HEIC filename.
 const b=new Uint8Array(await file.slice(0,256).arrayBuffer());
 const text=(i,n)=>String.fromCharCode(...b.subarray(i,i+n));
 const jpg=b[0]===255&&b[1]===216&&b[2]===255, png=b[0]===137&&text(1,7)==='PNG\r\n\x1a\n', webp=text(0,4)==='RIFF'&&text(8,4)==='WEBP';
 let heif='';
 if(text(4,4)==='ftyp'){
  const end=Math.min(b.length,new DataView(b.buffer).getUint32(0));
  const brands=[text(8,4)];for(let i=16;i+4<=end;i+=4)brands.push(text(i,4));
  if(!brands.some(v=>v==='avif'||v==='avis')){
   if(brands.some(v=>/^(heic|heix|hevc|hevx|heim|heis|hevm|hevs)$/.test(v)))heif='image/heic';
   else if(brands.some(v=>v==='mif1'||v==='msf1'))heif='image/heif';
  }
 }
 if(!jpg&&!png&&!webp&&!heif)throw Error('사진 형식을 확인할 수 없습니다. JPG·PNG·WebP·HEIC/HEIF 원본을 선택해 주세요.');
 const native=file.slice(0,file.size,jpg?'image/jpeg':png?'image/png':webp?'image/webp':heif);
 let image;
 try{image=await decodeUploadImage(native);}
 catch{
  if(!heif)throw Error('사진을 열지 못했습니다. 파일이 손상됐는지 확인하거나 다른 사진을 선택해 주세요.');
  if(signal?.aborted)throw Error('사진 편집을 취소했습니다.');
  let decoder;
  try{decoder=await import('/crew-heif.js');}catch{throw Error('HEIC/HEIF 변환기를 불러오지 못했습니다. 연결을 확인하고 다시 선택해 주세요.');}
  image=await decoder.decodeCrewHeif(file,{signal});
 }
 if(!image.width||!image.height||image.width*image.height>64000000){image.close();throw Error('사진이 6,400만 화소를 넘거나 해상도를 읽을 수 없습니다. 크기를 줄여 주세요.');}
 return image;
}

function bindCrewPhoto(form,{save,error,signal,onStored}){
 const input=form.elements.crew_image,host=form.querySelector('.crew-image-editor'),preview=host.querySelector('.crew-image-saved');
 const initial=preview.innerHTML,status=host.querySelector('[data-crop-status]'),discard=host.querySelector('[data-photo-discard]');
 let file=null,issue='',editing=false,previewURL='',version='';
 function release(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL='';}
 signal.addEventListener('abort',release,{once:true});
 discard.onclick=()=>{
  release();file=null;version=issue='';preview.innerHTML=initial;discard.hidden=true;
  status.textContent=crewPhotoHelp;error.textContent='';
 };
 input.onchange=async()=>{
  const selected=input.files[0];input.value='';
  if(!selected||editing||form._busy)return;
  editing=true;input.disabled=save.disabled=true;discard.hidden=true;
  status.textContent='사진을 열고 있습니다…';error.textContent='';
  try{
   let cropped=await cropPhotoEditor(selected,{host,signal,decodeFile:f=>decodeCrewPhoto(f,signal),accept:crewPhotoAccept});
   if(!signal.aborted&&cropped.type!=='image/webp'){
    status.textContent='자른 사진을 WebP로 저장할 준비를 하고 있습니다…';
    try{
     const {encodeCrewWebp}=await import('/crew-webp.js');
     const bitmap=await decodeUploadImage(cropped);
     try{cropped=await encodeCrewWebp(bitmap);}finally{bitmap.close();}
    }catch{throw Error('자른 사진을 WebP로 변환하지 못했습니다. 연결을 확인한 뒤 사진을 다시 선택해 주세요.');}
   }
   if(signal.aborted)return;
   const next=URL.createObjectURL(cropped);release();previewURL=next;
   const img=new Image();img.alt='저장할 크루 사진';img.src=next;preview.replaceChildren(img);
   file=cropped;version=issue='';status.textContent='사진을 잘랐습니다. 저장을 누르면 크루에 반영됩니다.';
  }catch(e){
   if(signal.aborted)return;
   if(e.name!=='AbortError')issue=e.message||'사진을 편집하지 못했습니다. 다시 선택해 주세요.';
   error.textContent=issue;status.textContent=issue?'다른 사진을 선택하거나 선택을 취소해 주세요.':file?'앞서 자른 사진을 유지합니다.':crewPhotoHelp;
  }finally{editing=false;input.disabled=save.disabled=false;discard.hidden=!!version||(!issue&&!file);}
 };
 return {
  get dirty(){return editing||!!issue||!!file;},
  check(){if(editing)throw Error('사진 편집을 마친 뒤 저장해 주세요.');if(issue)throw Error(issue);},
  async persist(path){
   if(!file)return false;
   if(!version){
    let res;
    try{res=await fetch(path+'/image',{method:'PUT',headers:{'content-type':file.type},body:file,signal});}
    catch{throw Error('사진 전송 결과를 확인하지 못했습니다. 연결을 확인한 뒤 다시 저장해 주세요.');}
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw Object.assign(Error('사진 업로드 실패: '+(data.error||'서버가 파일을 받지 못했습니다. 다시 저장해 주세요.')),{status:res.status});
    if(!data.image_version)throw Error('서버에서 사진 저장 버전을 받지 못했습니다. 다시 저장해 주세요.');
    version=data.image_version;discard.hidden=true;invalidateReads();onStored?.();
   }
   // Retain the receipt on read errors, so Retry verifies the existing write without another PUT.
   try{
    const detail=await api(path,'GET',undefined,{fresh:true,signal});
    if(detail.crew.image_version!==version)throw Error('서버의 현재 사진 버전이 다릅니다. 다른 변경이 있었는지 확인하고 사진을 다시 선택해 주세요.');
    const url='/media/crew/'+encodeURIComponent(detail.crew.id)+'?v='+encodeURIComponent(version);
    const media=await fetch(url,{cache:'no-store',signal});
    if(!media.ok||media.headers.get('x-crew-image-version')!==version)throw Error('저장된 사진을 다시 불러오지 못했습니다.');
    const stored=new Uint8Array(await media.arrayBuffer()),sent=new Uint8Array(await file.arrayBuffer());
    if(stored.length!==sent.length||!sent.every((v,i)=>stored[i]===v))throw Error('다시 받은 사진이 전송한 사진과 다릅니다.');
    const img=new Image();img.src=url;img.alt='현재 크루 사진';preview.replaceChildren(img);
    release();file=null;version='';return true;
   }catch(e){throw Error('사진 업로드 후 확인 실패: '+(e.message||'서버 응답이 없습니다.')+' 다시 저장하면 확인을 재시도합니다.');}
  }
 };
}
