import {one,rows,run,query,id,now,json,fail,str,rate} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {hasArtistName} from './artist-identity.js';
import {storeArtistImage as storeImage} from './artist-images.js';
import {objectResponse} from './storage.js';
import {publicNameSQL} from './identity.js';

export async function fanArtist(env,aid,user){
 const artist=await one(env,'SELECT a.*,p.user_id,p.id producer_id,p.name producer_name FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=?',aid);
 if(!artist||!hasArtistName(artist.name))fail(404,'아티스트를 찾을 수 없습니다.');
 assertUnblocked(env,artist.user_id);
 return {...artist,can_manage:!!user&&(artist.user_id===user.id||isAdmin(env,user)||!!await one(env,'SELECT 1 FROM artist_operators WHERE artist_id=? AND user_id=?',aid,user.id))};
}
export async function fanSettings(env,aid){
 const s=await one(env,'SELECT * FROM artist_fanpages WHERE artist_id=?',aid);
 return {revision:s?.revision||0,photo_order:JSON.parse(s?.photo_order||'[]'),carousel_ids:JSON.parse(s?.carousel_ids||'[]'),intro:s?.intro||'',style:s?.style||'',world:s?.world||'',banner_url:s?.banner_version?`/media/artist-banner/${aid}?v=${s.banner_version}`:'',desktop_x:s?.desktop_x??50,desktop_y:s?.desktop_y??50,mobile_x:s?.mobile_x??50,mobile_y:s?.mobile_y??50};
}
const positions=['desktop_x','desktop_y','mobile_x','mobile_y'];
export async function fanPosts(env,aid,user,kind='lounge',before=Number.MAX_SAFE_INTEGER){
 const result=await rows(env,`SELECT f.id,f.kind,f.parent_id,f.title,f.body,f.pinned,f.created,f.updated,f.revision,f.user_id,p.id profile_id,${publicNameSQL()} name,(f.kind='news' OR f.user_id=a.user_id OR EXISTS(SELECT 1 FROM artist_operators o WHERE o.artist_id=f.artist_id AND o.user_id=f.user_id)) official,
 (SELECT count(*) FROM artist_fan_likes l WHERE l.post_id=f.id) likes,
 EXISTS(SELECT 1 FROM artist_fan_likes l WHERE l.post_id=f.id AND l.user_id=?) liked,
 EXISTS(SELECT 1 FROM artist_fan_reports r WHERE r.post_id=f.id AND r.user_id=?) reported
 FROM artist_fan_posts f JOIN users u ON u.id=f.user_id LEFT JOIN producers p ON p.user_id=f.user_id JOIN (SELECT a.id,p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id) a ON a.id=f.artist_id
 WHERE f.artist_id=? AND f.kind=? AND f.deleted_at=0 AND f.created<=? ORDER BY f.pinned DESC,f.created DESC,f.id DESC LIMIT 300`,user?.id||'',user?.id||'',aid,kind,before);
 const blocked=new Set(env.AIFECT_BLOCKED||[]);
 return result.filter(p=>!blocked.has(p.user_id)).map(p=>({...p,can_edit:p.user_id===user?.id}));
}
export async function artistFanpageRoute(req,env,path,user){
 const media=path.match(/^\/media\/artist-banner\/([\w-]+)$/),m=path.match(/^\/api\/artists\/([\w-]+)\/(fanpage|banner|posts)(?:\/([\w-]+)(?:\/(like|report|pin))?)?$/);
 if(!m&&!media)return null;
 const aid=media?.[1]||m[1],a=await fanArtist(env,aid,user),method=req.method;
 if(media){
  if(!['GET','HEAD'].includes(method))fail(405,'지원하지 않는 요청입니다.');
  const s=await one(env,'SELECT banner_version,banner_type FROM artist_fanpages WHERE artist_id=?',aid);if(!s?.banner_version)fail(404,'배경이 없습니다.');
  return objectResponse(req,env,`images/artist/${aid}/banner/${s.banner_version}`,s.banner_type,true,{imageVersion:s.banner_version});
 }
 const [, ,area,pid,action]=m;
 if(method==='GET'&&area==='posts'&&!pid){const kind=new URL(req.url).searchParams.get('kind')||'lounge';if(!['lounge','news'].includes(kind))fail(400,'카테고리를 확인해주세요.');return json({posts:await fanPosts(env,aid,user,kind),can_manage:a.can_manage});}
 if(method==='GET'&&area==='fanpage')return json({settings:await fanSettings(env,aid),can_manage:a.can_manage});
 requireUser(user);
 if(area==='banner'||area==='fanpage'){
  if(!a.can_manage)fail(403,'승인된 제작자·운영자만 관리할 수 있습니다.');
  await run(env,'INSERT OR IGNORE INTO artist_fanpages(artist_id) VALUES(?)',aid);
  if(area==='banner'){
   if(!['PUT','DELETE'].includes(method))fail(405,'지원하지 않는 요청입니다.');
   await rate(env,'artist-banner:'+user.id,30,3600);
   const old=await one(env,'SELECT banner_version FROM artist_fanpages WHERE artist_id=?',aid);
   const image=method==='PUT'?await storeImage(req,env,'artist',aid+'/banner'):{version:'',type:''};
   try{await run(env,'UPDATE artist_fanpages SET banner_version=?,banner_type=?,revision=revision+1 WHERE artist_id=?',image.version,image.type,aid);}catch(e){if(image.version)await env.BUCKET.delete(`images/artist/${aid}/banner/${image.version}`).catch(()=>{});throw e;}
   if(old.banner_version)await env.BUCKET.delete(`images/artist/${aid}/banner/${old.banner_version}`).catch(()=>{});
   return json({ok:true,settings:await fanSettings(env,aid)});
  }
  if(method!=='PATCH')fail(405,'지원하지 않는 요청입니다.');
  const b=await req.json(),s=await fanSettings(env,aid),photos=await rows(env,'SELECT id FROM artist_photos WHERE artist_id=?',aid),valid=new Set(photos.map(p=>p.id));
  if(!Number.isInteger(b.revision)||b.revision!==s.revision)fail(409,'다른 곳에서 변경됐어요. 새로고침 후 다시 저장해주세요.');
  const order=b.photo_order??s.photo_order.filter(x=>valid.has(x)),carousel=b.carousel_ids??s.carousel_ids.filter(x=>valid.has(x));
  for(const v of [order,carousel])if(!Array.isArray(v)||new Set(v).size!==v.length||v.some(x=>!valid.has(x)))fail(400,'사진 목록을 확인해주세요.');
  if(carousel.length>10)fail(400,'캐러셀 사진은 최대 10장입니다.');
  const pos=positions.map(k=>b[k]??s[k]);if(pos.some(n=>!Number.isFinite(n)||n<0||n>100))fail(400,'초점 위치는 0~100입니다.');
  const saved=await query(env,'UPDATE artist_fanpages SET photo_order=?,carousel_ids=?,intro=?,style=?,world=?,desktop_x=?,desktop_y=?,mobile_x=?,mobile_y=?,revision=revision+1 WHERE artist_id=? AND revision=? RETURNING revision',JSON.stringify(order),JSON.stringify(carousel),str(b.intro??s.intro,200,false),str(b.style??s.style,4000,false),str(b.world??s.world,8000,false),...pos,aid,b.revision).first();
  if(!saved)fail(409,'설정이 변경됐어요. 다시 불러와주세요.');
  return json({ok:true,settings:await fanSettings(env,aid)});
 }
 if(area!=='posts')fail(405,'지원하지 않는 요청입니다.');
 let p=pid?await one(env,'SELECT * FROM artist_fan_posts WHERE id=? AND artist_id=? AND deleted_at=0',pid,aid):null;
 if(pid&&!p)fail(404,'게시물을 찾을 수 없습니다.');
 if(p)assertUnblocked(env,p.user_id);
 if(action==='like'){
  if(!['PUT','DELETE'].includes(method))fail(405,'지원하지 않는 요청입니다.');
  if(method==='PUT')await run(env,'INSERT OR IGNORE INTO artist_fan_likes(post_id,user_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM artist_fan_posts WHERE id=? AND deleted_at=0)',pid,user.id,pid);
  else await run(env,'DELETE FROM artist_fan_likes WHERE post_id=? AND user_id=?',pid,user.id);
  return json({ok:true});
 }
 if(action==='report'&&method==='POST'){
  const b=await req.json();await rate(env,'artist-report:'+user.id,20,3600);
  await run(env,'INSERT OR IGNORE INTO artist_fan_reports(id,post_id,user_id,reason,body_snapshot,created) VALUES(?,?,?,?,?,?)',id(),pid,user.id,str(b.reason,500),p.body,now());return json({ok:true});
 }
 if(action==='pin'&&method==='PATCH'){
  if(!a.can_manage)fail(403,'공식 운영자만 고정할 수 있습니다.');
  if(p.parent_id)fail(400,'답글은 고정할 수 없습니다.');
  const b=await req.json();if(typeof b.pinned!=='boolean')fail(400,'고정 여부를 확인해주세요.');
  await run(env,'UPDATE artist_fan_posts SET pinned=?,revision=revision+1 WHERE id=?',Number(b.pinned),pid);return json({ok:true});
 }
 if(action)fail(405,'지원하지 않는 요청입니다.');
 if(method==='POST'&&!pid){
  const b=await req.json(),kind=b.kind||'lounge';if(!['news','lounge'].includes(kind))fail(400,'카테고리를 확인해주세요.');
  if(kind==='news'&&!a.can_manage)fail(403,'공식 소식은 운영자만 작성할 수 있습니다.');
  const body=str(b.body,kind==='news'?8000:2000),title=kind==='news'?str(b.title,160):'',request=str(b.request_id,80);
  const duplicate=await one(env,'SELECT id FROM artist_fan_posts WHERE artist_id=? AND user_id=? AND request_id=?',aid,user.id,request);if(duplicate)return json({ok:true,id:duplicate.id});
  await rate(env,'artist-post:'+user.id,6,60);await rate(env,'artist-post-day:'+user.id,100,86400);
  const parent=b.parent_id||null;if(parent&&!await one(env,"SELECT id FROM artist_fan_posts WHERE id=? AND artist_id=? AND kind='lounge' AND parent_id IS NULL AND deleted_at=0",parent,aid))fail(400,'답글 대상을 확인해주세요.');
  if(kind==='news'&&parent)fail(400,'소식에는 답글을 작성할 수 없습니다.');
  const at=now(),postId=id();
  await run(env,'INSERT OR IGNORE INTO artist_fan_posts(id,artist_id,user_id,kind,parent_id,title,body,request_id,created,updated) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM artist_fan_posts WHERE artist_id=? AND user_id=? AND body=? AND created>?)',postId,aid,user.id,kind,parent,title,body,request,at,at,aid,user.id,body,at-60);
  const saved=await one(env,'SELECT id FROM artist_fan_posts WHERE artist_id=? AND user_id=? AND request_id=?',aid,user.id,request);if(!saved)fail(409,'같은 내용은 잠시 후 작성해주세요.');
  return json({ok:true,id:saved.id},201);
 }
 if(p&&['PATCH','DELETE'].includes(method)){
  if(p.user_id!==user.id&&!(method==='DELETE'&&a.can_manage))fail(403,'작성자만 수정·삭제할 수 있습니다.');
  if(p.kind==='news'&&!a.can_manage)fail(403,'공식 소식 관리 권한이 없습니다.');
  if(method==='DELETE')await env.DB.batch([query(env,"UPDATE artist_fan_posts SET body='',title='',deleted_at=?,revision=revision+1 WHERE (id=? OR parent_id=?) AND artist_id=?",now(),pid,pid,aid),query(env,'DELETE FROM artist_fan_likes WHERE post_id=? OR post_id IN(SELECT id FROM artist_fan_posts WHERE parent_id=?)',pid,pid)]);
  else{const b=await req.json();if(!Number.isInteger(b.revision))fail(400,'수정 버전을 확인해주세요.');const saved=await query(env,'UPDATE artist_fan_posts SET body=?,title=?,updated=?,revision=revision+1 WHERE id=? AND revision=? RETURNING id',str(b.body,p.kind==='news'?8000:2000),p.kind==='news'?str(b.title,160):'',now(),pid,b.revision).first();if(!saved)fail(409,'게시물이 변경됐어요. 다시 불러와주세요.');}
  return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
