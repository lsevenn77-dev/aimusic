import {canManageArtist} from './artist-fan-access.js';
import {one,rows,run,query,id,now,str,json,fail,rate} from './db.js';
import {hasArtistName} from './artist-identity.js';
import {requireUser} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {storeImage} from './images.js';
import {objectResponse} from './storage.js';
import {validateArtistBanner} from './artist-banner-image.js';

export async function fanpageData(env,aid){
 const settings=await one(env,'SELECT * FROM artist_fan_settings WHERE artist_id=?',aid);
 const producer=await one(env,`SELECT p.id,${producerNameSQL()} name FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=?`,aid);
 const operators=await rows(env,`SELECT p.id,${producerNameSQL()} name FROM artist_fan_operators o JOIN producers p ON p.user_id=o.user_id WHERE o.artist_id=? ORDER BY o.created,p.id`,aid);
 return {settings:settings||{},producer,operators};
}
async function posts(env,aid,user,kind,parent,offset){
 const blocked=env.AIFECT_BLOCKED||[],visible=blocked.length?' AND f.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':'';
 const items=await rows(env,`SELECT f.id,f.user_id,f.kind,f.title,f.body,f.parent_id,f.pinned,f.created,f.edited,f.deleted,
 ${publicNameSQL()} author,p.id producer_id,p.id profile_id,p.image_version image_version,(u.id=auser.user_id) official,EXISTS(SELECT 1 FROM artist_fan_operators op WHERE op.artist_id=f.artist_id AND op.user_id=u.id) operator,
 (SELECT count(*) FROM artist_fan_likes l WHERE l.post_id=f.id) likes,
 EXISTS(SELECT 1 FROM artist_fan_likes l WHERE l.post_id=f.id AND l.user_id=?) liked,
 (SELECT count(*) FROM artist_fan_posts r WHERE r.parent_id=f.id) replies
 FROM artist_fan_posts f JOIN users u ON u.id=f.user_id LEFT JOIN producers p ON p.user_id=u.id
 JOIN artists a ON a.id=f.artist_id JOIN producers auser ON auser.id=a.producer_id
 WHERE f.artist_id=? AND f.kind=? AND f.parent_id IS ?${visible} ORDER BY f.pinned DESC,f.created DESC,f.id DESC LIMIT 21 OFFSET ?`,user?.id||'',aid,kind,parent,...blocked,offset);
 return {items:items.slice(0,20),next:items.length>20?offset+20:null,...(parent?{parent_replies:(await one(env,'SELECT count(*) n FROM artist_fan_posts WHERE parent_id=? AND artist_id=?',parent,aid)).n}:{})};
}
export async function artistFanpageRoute(req,env,path,user){
 const m=path.match(/^\/api\/artists\/([\w-]+)\/fanpage(?:\/(banner|photos|posts|operators)(?:\/([\w-]+)(?:\/(like|report|replies|pin))?)?)?$/),media=path.match(/^\/media\/artist-banner\/([\w-]+)$/);
 if(!m&&!media)return null;
 const aid=m?.[1]||media[1],artist=await one(env,'SELECT a.id,a.name,p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=?',aid);
 if(!artist||!hasArtistName(artist.name))fail(404,'아티스트를 찾을 수 없습니다.');assertUnblocked(env,artist.user_id);
 const owner=user?.id===artist.user_id,manage=await canManageArtist(env,aid,user),part=m?.[2],pid=m?.[3],action=m?.[4],url=new URL(req.url);
 if(media){
  if(!['GET','HEAD'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
  const s=await one(env,'SELECT banner_version,banner_type FROM artist_fan_settings WHERE artist_id=?',aid);
  if(!s?.banner_version)fail(404,'배경이 없습니다.');
  return objectResponse(req,env,`images/artist/${aid}/banner/${s.banner_version}`,s.banner_type,true,{imageVersion:s.banner_version});
 }
 const post=pid?await one(env,'SELECT * FROM artist_fan_posts WHERE id=? AND artist_id=?',pid,aid):null;
 if(pid&&!post)fail(404,'게시물을 찾을 수 없습니다.');if(post)assertUnblocked(env,post.user_id);
 if(req.method==='GET'){
  if(!part)return json({...await fanpageData(env,aid),can_manage:manage,is_owner:owner});
  if(part==='posts'){
   const kind=url.searchParams.get('kind')||'lounge',rawOffset=Number(url.searchParams.get('offset')||0);
   if(!['news','lounge'].includes(kind)||!Number.isSafeInteger(rawOffset)||rawOffset<0||rawOffset>100000)fail(400,'목록 카테고리와 위치를 확인해주세요.');
   const offset=rawOffset;
   if(pid&&action!=='replies')return json({post});
   return json(await posts(env,aid,user,post?.kind||kind,action==='replies'?pid:null,offset));
  }
  fail(405,'지원하지 않는 요청입니다.');
 }
 requireUser(user);
 if(part!=='posts'&&!manage)fail(403,'해당 아티스트의 제작자만 관리할 수 있습니다.');
 if(part==='operators'){
  if(!owner)fail(403,'제작자만 공식 운영자를 승인할 수 있습니다.');
  if(!['PUT','DELETE'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
  const b=await req.json(),target=await one(env,'SELECT p.user_id FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!=?',str(b.producer_id,80),'deleted');
  if(!target||target.user_id===artist.user_id)fail(400,'운영자의 제작자 프로필을 확인해주세요.');assertUnblocked(env,target.user_id);
  await rate(env,'fan-operators:'+user.id,30,3600);
  if(req.method==='PUT')await run(env,'INSERT OR IGNORE INTO artist_fan_operators(artist_id,user_id,approved_by,created) VALUES(?,?,?,?)',aid,target.user_id,user.id,now());
  else await run(env,'DELETE FROM artist_fan_operators WHERE artist_id=? AND user_id=?',aid,target.user_id);
  return json({ok:true});
 }
 if(part==='banner'){
  await rate(env,'artist-banner:'+user.id,20,3600);
  if(req.method==='DELETE'){await run(env,"INSERT INTO artist_fan_settings(artist_id) VALUES(?) ON CONFLICT(artist_id) DO UPDATE SET banner_version='',banner_type=''",aid);return json({ok:true});}
  if(req.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  const image=await storeImage(req,env,'artist',aid+'/banner',validateArtistBanner);
  try{await run(env,'INSERT INTO artist_fan_settings(artist_id,banner_version,banner_type) VALUES(?,?,?) ON CONFLICT(artist_id) DO UPDATE SET banner_version=excluded.banner_version,banner_type=excluded.banner_type',aid,image.version,image.type);}
  catch(e){await env.BUCKET.delete(`images/artist/${aid}/banner/${image.version}`).catch(()=>{});throw e;}
  return json({ok:true});
 }
 if(!part&&req.method==='PUT'){
  const b=await req.json(),focus=k=>{const n=Number(b[k]);if(!Number.isFinite(n)||n<0||n>100)fail(400,'초점은 0~100 범위로 설정해주세요.');return n;};
  await run(env,'INSERT INTO artist_fan_settings(artist_id,introduction,concept,world,focus_x,focus_y,mobile_x,mobile_y) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(artist_id) DO UPDATE SET introduction=excluded.introduction,concept=excluded.concept,world=excluded.world,focus_x=excluded.focus_x,focus_y=excluded.focus_y,mobile_x=excluded.mobile_x,mobile_y=excluded.mobile_y',aid,str(b.introduction||'',4000,false),str(b.concept||'',2000,false),str(b.world||'',4000,false),focus('focus_x'),focus('focus_y'),focus('mobile_x'),focus('mobile_y'));return json({ok:true});
 }
 if(part==='photos'&&req.method==='PUT'){
  const b=await req.json(),all=await rows(env,'SELECT id FROM artist_photos WHERE artist_id=?',aid);
  if(!Array.isArray(b.photos)||b.photos.length!==all.length||new Set(b.photos.map(p=>p.id)).size!==all.length||b.photos.some(p=>!all.some(a=>a.id===p.id)||typeof p.carousel!=='boolean')||b.photos.filter(p=>p.carousel).length>10)fail(400,'전체 사진 순서와 캐러셀 최대 10장을 확인해주세요.');
  if(all.length)await env.DB.batch(b.photos.map((p,i)=>query(env,'INSERT INTO artist_photo_layout(photo_id,position,carousel) VALUES(?,?,?) ON CONFLICT(photo_id) DO UPDATE SET position=excluded.position,carousel=excluded.carousel',p.id,i,p.carousel?1:0)));
  return json({ok:true});
 }
 if(part!=='posts')fail(405,'지원하지 않는 요청입니다.');
 if(action==='like'&&['PUT','DELETE'].includes(req.method)){
  if(post.deleted)fail(409,'삭제된 글입니다.');await rate(env,'fan-like:'+user.id,120,60);
  await run(env,req.method==='PUT'?'INSERT OR IGNORE INTO artist_fan_likes(user_id,post_id) VALUES(?,?)':'DELETE FROM artist_fan_likes WHERE user_id=? AND post_id=?',user.id,pid);return json({ok:true});
 }
 if(action==='report'&&req.method==='POST'){
  if(post.deleted)fail(409,'삭제된 글입니다.');const b=await req.json();await rate(env,'fan-report:'+user.id,10,3600);
  await run(env,'INSERT OR IGNORE INTO artist_fan_reports(id,post_id,user_id,reason,created) VALUES(?,?,?,?,?)',id(),pid,user.id,str(b.reason,500),now());return json({ok:true});
 }
 if(action==='pin'&&req.method==='PUT'){
  if(!manage)fail(403,'제작자·공식 운영자만 고정할 수 있습니다.');if(post.parent_id||post.deleted)fail(400,'답글이나 삭제된 글은 고정할 수 없습니다.');
  const b=await req.json();await run(env,'UPDATE artist_fan_posts SET pinned=? WHERE id=?',b.pinned?1:0,pid);return json({ok:true});
 }
 if(action)fail(405,'지원하지 않는 요청입니다.');
 if(pid){
  if(post.user_id!==user.id)fail(403,'작성자만 수정·삭제할 수 있습니다.');
  if(req.method==='DELETE'){await run(env,"UPDATE artist_fan_posts SET body='',title='',deleted=1,pinned=0 WHERE id=?",pid);return json({ok:true});}
  if(req.method==='PUT'){
   if(post.deleted)fail(409,'삭제된 글입니다.');if(post.kind==='news'&&!manage)fail(403,'공식 소식 작성 권한이 없습니다.');
   const b=await req.json();await run(env,'UPDATE artist_fan_posts SET title=?,body=?,edited=? WHERE id=?',str(b.title||'',160,false),str(b.body,2000),now(),pid);return json({ok:true});
  }
 }else if(req.method==='POST'){
  const b=await req.json(),kind=b.kind==='news'?'news':'lounge',parent=b.parent_id||null,key=str(b.request_id,80),body=str(b.body,2000);
  if(kind==='news'&&!manage)fail(403,'제작자만 공식 소식을 작성할 수 있습니다.');
  const existing=await one(env,'SELECT id FROM artist_fan_posts WHERE artist_id=? AND user_id=? AND request_id=?',aid,user.id,key);if(existing)return json(existing);
  if(parent){const target=await one(env,"SELECT id,user_id FROM artist_fan_posts WHERE id=? AND artist_id=? AND kind=? AND parent_id IS NULL AND deleted=0",parent,aid,kind);if(!target)fail(400,'답글 대상을 확인해주세요.');assertUnblocked(env,target.user_id);}
  await rate(env,'fan-post:'+user.id,5,60);
  if(await one(env,'SELECT id FROM artist_fan_posts WHERE artist_id=? AND user_id=? AND body=? AND created>?',aid,user.id,body,now()-60))fail(409,'같은 내용을 연속으로 등록할 수 없습니다.');
  const postId=id();await run(env,'INSERT INTO artist_fan_posts(id,artist_id,user_id,kind,title,body,parent_id,request_id,created) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(artist_id,user_id,request_id) DO NOTHING',postId,aid,user.id,kind,str(b.title||'',160,false),body,parent,key,now());
  return json(await one(env,'SELECT id FROM artist_fan_posts WHERE artist_id=? AND user_id=? AND request_id=?',aid,user.id,key),201);
 }
 fail(405,'지원하지 않는 요청입니다.');
}
