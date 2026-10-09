import {one,rows,run,id,now,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {hasArtistName} from './artist-identity.js';
import {storeImage} from './images.js';
import {objectResponse} from './storage.js';

export const GALLERY_LIMIT=30;
export async function artistGallery(env,artistId){
 return (await rows(env,'SELECT id,image_version,created FROM artist_photos WHERE artist_id=? ORDER BY created DESC,id DESC',artistId))
  .map(p=>({...p,url:`/media/artist-gallery/${p.id}?v=${p.image_version}`}));
}
export async function artistGalleryRoute(req,env,path,user){
 const edit=path.match(/^\/api\/artists\/([\w-]+)\/gallery(?:\/([\w-]+))?$/);
 const media=path.match(/^\/media\/artist-gallery\/([\w-]+)$/);
 if(!edit&&!media)return null;
 const photo=(media||edit?.[2])?await one(env,'SELECT * FROM artist_photos WHERE id=?',media?.[1]||edit[2]):null;
 if((media||edit?.[2])&&!photo)fail(404,'사진을 찾을 수 없습니다.');
 const aid=edit?.[1]||photo.artist_id;
 const artist=await one(env,'SELECT a.*,p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=?',aid);
 if(!artist||!hasArtistName(artist.name)||photo&&photo.artist_id!==aid)fail(404,'AI 가수를 찾을 수 없습니다.');
 assertUnblocked(env,artist.user_id);
 if(media){
  if(!['GET','HEAD'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
  return objectResponse(req,env,`images/artist/${aid}/gallery/${photo.image_version}`,photo.image_type,true,{imageVersion:photo.image_version});
 }
 if(req.method==='GET'&&!edit[2])return json({photos:await artistGallery(env,aid),can_manage:user?.id===artist.user_id,limit:GALLERY_LIMIT});
 requireUser(user);
 if(artist.user_id!==user.id)fail(403,'이 AI 가수의 제작자만 사진을 관리할 수 있어요.');
 if(req.method==='PUT'&&!edit[2]){
  await rate(env,'artist-gallery:'+user.id,60,3600);
  if((await one(env,'SELECT count(*) n FROM artist_photos WHERE artist_id=?',aid)).n>=GALLERY_LIMIT)fail(409,'사진은 최대 30장까지 등록할 수 있어요.');
  const image=await storeImage(req,env,'artist',aid+'/gallery'),pid=id();
  try{
   await run(env,'INSERT INTO artist_photos(id,artist_id,image_version,image_type,created) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM artist_photos WHERE artist_id=?)<?',pid,aid,image.version,image.type,now(),aid,GALLERY_LIMIT);
   if(!await one(env,'SELECT id FROM artist_photos WHERE id=?',pid))fail(409,'사진은 최대 30장까지 등록할 수 있어요.');
  }catch(e){await env.BUCKET.delete(`images/artist/${aid}/gallery/${image.version}`).catch(()=>{});throw e;}
  return json({ok:true,id:pid},201);
 }
 if(req.method==='DELETE'&&photo){
  // Keep the row available for retry if storage removal fails.
  await env.BUCKET.delete(`images/artist/${aid}/gallery/${photo.image_version}`);
  await run(env,'DELETE FROM artist_photos WHERE id=? AND artist_id=?',photo.id,aid);
  return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
