import {one,rows,run,id,now,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {storeImage} from './images.js';
import {objectResponse} from './storage.js';

export const PROFILE_GALLERY_LIMIT=30;
export async function profileGallery(env,pid){
 return (await rows(env,'SELECT id,image_version,created FROM profile_photos WHERE producer_id=? ORDER BY created DESC,id DESC',pid))
  .map(p=>({...p,url:`/media/profile-gallery/${p.id}?v=${p.image_version}`}));
}
export async function profileGalleryRoute(req,env,path,user){
 const edit=path.match(/^\/api\/producers\/([\w-]+)\/gallery(?:\/([\w-]+))?$/),media=path.match(/^\/media\/profile-gallery\/([\w-]+)$/);
 if(!edit&&!media)return null;
 const photo=(media||edit?.[2])?await one(env,'SELECT * FROM profile_photos WHERE id=?',media?.[1]||edit[2]):null;
 if((media||edit?.[2])&&!photo)fail(404,'사진을 찾을 수 없어요.');
 const pid=edit?.[1]||photo.producer_id;
 const p=await one(env,"SELECT p.id,p.user_id FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!='deleted'",pid);
 if(!p||photo&&photo.producer_id!==pid)fail(404,'프로필을 찾을 수 없어요.');
 assertUnblocked(env,p.user_id);
 if(media){
  if(!['GET','HEAD'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
  // Revalidate visibility and deletion, including on shared devices.
  const response=await objectResponse(req,env,`images/producer/${pid}/gallery/${photo.image_version}`,photo.image_type,false);
  return response;
 }
 if(req.method==='GET'&&!edit[2])return json({photos:await profileGallery(env,pid),can_manage:user?.id===p.user_id,limit:PROFILE_GALLERY_LIMIT});
 requireUser(user);
 if(p.user_id!==user.id)fail(403,'내 프로필의 사진만 관리할 수 있어요.');
 if(req.method==='PUT'&&!edit[2]){
  await rate(env,'profile-gallery:'+user.id,60,3600);
  if((await one(env,'SELECT count(*) n FROM profile_photos WHERE producer_id=?',pid)).n>=PROFILE_GALLERY_LIMIT)fail(409,'사진은 최대 30장까지 올릴 수 있어요.');
  const image=await storeImage(req,env,'producer',pid+'/gallery'),photoId=id();
  try{
   await run(env,'INSERT INTO profile_photos(id,producer_id,image_version,image_type,created) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM profile_photos WHERE producer_id=?)<?',photoId,pid,image.version,image.type,now(),pid,PROFILE_GALLERY_LIMIT);
   if(!await one(env,'SELECT id FROM profile_photos WHERE id=?',photoId))fail(409,'사진은 최대 30장까지 올릴 수 있어요.');
  }catch(e){await env.BUCKET.delete(`images/producer/${pid}/gallery/${image.version}`).catch(()=>{});throw e;}
  return json({ok:true,id:photoId},201);
 }
 if(req.method==='DELETE'&&photo){
  await env.BUCKET.delete(`images/producer/${pid}/gallery/${photo.image_version}`);
  await run(env,'DELETE FROM profile_photos WHERE id=? AND producer_id=?',photo.id,pid);
  return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
