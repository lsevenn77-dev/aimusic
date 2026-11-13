import {fail,id,json,one,query,rate} from './db.js';
import {requireUser} from './auth.js';
import {readImage,encodeStaticImage} from './images.js';
import {imageDimensions} from './artist-banner-image.js';
import {dubbingVisibleSQL} from './dubbing-access.js';

// Performances inherit the author's current poster. An empty value preserves genre artwork.
export const dubbingPosterSQL=`COALESCE((SELECT '/api/dubbing/projects/' || art.id || '/poster?v=' || art.poster_version
 FROM dubbing_projects art WHERE art.id=COALESCE(p.root_id,p.id) AND art.poster_version!=''), '')`;

export const posterURL=p=>p.poster_version?`/api/dubbing/projects/${p.id}/poster?v=${p.poster_version}`:'';
const objectKey=(p,version)=>`dubbing/${p.owner_id}/${p.id}/posters/${version}.webp`;

function validatePoster(data){
 const {width,height}=imageDimensions(data,'image/webp');
 if(!width||!height||width*height>64_000_000)fail(400,'썸네일 이미지 크기를 확인해주세요.');
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 let still=false,offset=12;
 while(offset+8<=data.length){
  const tag=view.getUint32(offset),size=view.getUint32(offset+4,true);
  if(offset+8+size>data.length)fail(400,'썸네일 파일이 손상되었어요.');
  if(tag===0x414e494d||tag===0x414e4d46)fail(400,'정지 이미지를 선택해주세요.');
  if((tag===0x56503820&&size>=10)||(tag===0x5650384c&&size>=5))still=true;
  offset+=8+size+(size%2);
 }
 if(!still||offset!==data.length)fail(400,'썸네일 파일을 확인해주세요.');
}

export async function projectPoster(req,env,p,user){
 if(p.root_id)fail(404,'원본 대본의 썸네일을 선택해주세요.');
 if(req.method==='GET'||req.method==='HEAD'){
  const version=new URL(req.url).searchParams.get('v');
  if(!p.poster_version||(version&&version!==p.poster_version))fail(404,'등록된 썸네일이 없어요.');
  const key=objectKey(p,p.poster_version);
  const file=req.method==='HEAD'?await env.BUCKET.head(key):await env.BUCKET.get(key);
  if(!file)fail(404,'등록된 썸네일이 없어요.');
  return new Response(req.method==='HEAD'?null:file.body,{headers:{'content-type':'image/webp',
   'content-length':String(file.size),'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 if(req.method!=='PUT')fail(405,'썸네일 업로드 방식을 확인해주세요.');
 requireUser(user);
 if(p.owner_id!==user.id)fail(403,'대본을 올린 사람만 썸네일을 바꿀 수 있어요.');
 if(!env.BUCKET)fail(503,'이미지 저장소를 사용할 수 없어요.');
 await rate(env,'dubbing-poster:'+user.id,60,3600);
 const image=await encodeStaticImage(env,await readImage(req));
 if(image.type!=='image/webp')fail(400,'정지 이미지를 선택해주세요.');
 validatePoster(image.data);
 const version=id(),key=objectKey(p,version);
 await env.BUCKET.put(key,image.data,{httpMetadata:{contentType:'image/webp',cacheControl:'private, no-store'}});
 try{
  const changed=await query(env,`UPDATE dubbing_projects SET poster_version=? WHERE id=? AND owner_id=? AND root_id IS NULL AND poster_version=?
   AND EXISTS(SELECT 1 FROM users u WHERE u.id=dubbing_projects.owner_id AND u.provider!='deleted') AND ${dubbingVisibleSQL('dubbing_projects')} RETURNING id`,version,p.id,user.id,p.poster_version).first();
  if(!changed)fail(409,'작품이 변경되었어요. 새로고침 후 다시 시도해주세요.');
 }catch(error){
  // A lost write response may follow a committed update. Only clean up confirmed unused bytes.
  try{if(!await one(env,'SELECT id FROM dubbing_projects WHERE id=? AND poster_version=?',p.id,version))await env.BUCKET.delete(key);}catch{}
  throw error;
 }
 if(p.poster_version)try{await env.BUCKET.delete(objectKey(p,p.poster_version));}catch{}
 return json({posterUrl:posterURL({...p,poster_version:version})});
}
