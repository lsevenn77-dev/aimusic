import {one,rows,run,query,now,id,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {readImage,storeImage} from './images.js';
import {assertUnblocked} from './account-safety.js';

export const CHAT_IMAGE_TTL=14*86400;
export async function chatPeer(env,pid,user){
 requireUser(user);const p=await one(env,'SELECT id,user_id FROM producers WHERE id=?',pid);
 if(!p||p.user_id===user.id)fail(404,'대화 상대를 찾을 수 없어요.');assertUnblocked(env,p.user_id);return p;
}
export async function chatSettings(env,uid,peer){return await one(env,'SELECT muted,cleared_sequence FROM dm_settings WHERE user_id=? AND peer_id=?',uid,peer)||{muted:0,cleared_sequence:0};}
export async function chatSummary(env,user){
 requireUser(user);
 const direct=await one(env,`SELECT count(*) count FROM direct_messages d LEFT JOIN dm_settings s ON s.user_id=d.recipient_id AND s.peer_id=d.sender_id WHERE d.recipient_id=? AND d.read_at=0 AND d.rowid>COALESCE(s.cleared_sequence,0) AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=d.recipient_id AND b.blocked_id=d.sender_id) OR (b.user_id=d.sender_id AND b.blocked_id=d.recipient_id))`,user.id);
 const crew=await one(env,`SELECT c.id,c.name,c.image_version,m.joined_sequence,m.read_sequence,m.muted,(SELECT count(*) FROM crew_messages x WHERE x.crew_id=c.id AND x.rowid>=m.joined_sequence AND x.rowid>m.read_sequence AND x.user_id!=m.user_id AND x.kind!='system' AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=m.user_id AND b.blocked_id=x.user_id) OR (b.blocked_id=m.user_id AND b.user_id=x.user_id))) unread FROM crew_members m JOIN crews c ON c.id=m.crew_id WHERE m.user_id=?`,user.id);
 return {unread:(direct?.count||0)+(crew?.unread||0),direct_unread:direct?.count||0,crew};
}
// Every request denies expired media; physical cleanup also runs on the encoder's
// regular /internal queue calls, and retries failed R2 deletes without losing keys.
let nextCleanup=0;
export function queueChatImageCleanup(env,ctx){
 if(!env.BUCKET||!ctx?.waitUntil||now()<nextCleanup)return;nextCleanup=now()+300;
 ctx.waitUntil(cleanupChatImages(env).catch(()=>{nextCleanup=0;console.error('Chat image cleanup pending');}));
}
export async function cleanupChatImages(env){
 const expired=await rows(env,'SELECT id,object_key FROM chat_images WHERE expires<=? AND deleted=0 ORDER BY expires LIMIT 100',now());
 for(const item of expired){await env.BUCKET.delete(item.object_key);await run(env,'UPDATE chat_images SET deleted=1 WHERE id=?',item.id);}
 return expired.length;
}
export async function chatFeaturesRoute(req,env,path,user){
 const method=req.method;
 const image=path.match(/^\/media\/dm\/([\w-]+)$/);
 if(image){
  requireUser(user);if(!['GET','HEAD'].includes(method))fail(405,'지원하지 않는 요청입니다.');
  const item=await one(env,'SELECT * FROM chat_images WHERE id=? AND (sender_id=? OR recipient_id=?)',image[1],user.id,user.id);
  if(!item)fail(404,'이미지를 찾을 수 없어요.');
  if(item.recipient_id===user.id&&!await one(env,'SELECT 1 FROM direct_messages WHERE image_id=? AND recipient_id=?',item.id,user.id))fail(404,'이미지를 찾을 수 없어요.');assertUnblocked(env,item.sender_id===user.id?item.recipient_id:item.sender_id);
  if(item.deleted||item.expires<=now())fail(410,'보관 기간 14일이 지난 이미지입니다.');
  const object=await env.BUCKET.get(item.object_key);if(!object)fail(410,'이미지 보관 기간이 만료되었어요.');
  return new Response(method==='HEAD'?null:object.body,{headers:{'content-type':'image/webp','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 if(path==='/api/dm/summary'&&method==='GET')return json(await chatSummary(env,user));
 if(path==='/api/dm/read-all'&&method==='POST'){
  requireUser(user);await env.DB.batch([query(env,'UPDATE direct_messages SET read_at=? WHERE recipient_id=? AND read_at=0',now(),user.id),query(env,'UPDATE crew_members SET read_sequence=COALESCE((SELECT max(rowid) FROM crew_messages WHERE crew_id=crew_members.crew_id),0) WHERE user_id=?',user.id)]);return json({ok:true});
 }
 if(path==='/api/dm'&&method==='DELETE'){
  requireUser(user);await env.DB.batch([
   query(env,`INSERT INTO dm_settings(user_id,peer_id,cleared_sequence) SELECT ?,CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END,max(rowid) FROM direct_messages WHERE sender_id=? OR recipient_id=? GROUP BY CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END ON CONFLICT(user_id,peer_id) DO UPDATE SET cleared_sequence=max(dm_settings.cleared_sequence,excluded.cleared_sequence)`,user.id,user.id,user.id,user.id,user.id),
   query(env,'UPDATE direct_messages SET read_at=? WHERE recipient_id=? AND read_at=0',now(),user.id)
  ]);return json({ok:true});
 }
 let m=path.match(/^\/api\/dm\/([\w-]+)(?:\/(settings|images))?$/);
 if(m&&(m[2]||method==='DELETE')){
  const p=await chatPeer(env,m[1],user);
  if(m[2]==='settings'){
   if(method==='GET')return json(await chatSettings(env,user.id,p.user_id));
   if(method!=='PUT')fail(405,'지원하지 않는 요청입니다.');const b=await req.json();if(typeof b.muted!=='boolean')fail(400,'알림 설정을 확인해주세요.');
   await run(env,'INSERT INTO dm_settings(user_id,peer_id,muted) VALUES(?,?,?) ON CONFLICT(user_id,peer_id) DO UPDATE SET muted=excluded.muted',user.id,p.user_id,b.muted?1:0);return json({ok:true,muted:b.muted});
  }
  if(m[2]==='images'){
   if(method!=='PUT')fail(405,'지원하지 않는 요청입니다.');await rate(env,'dm-image:'+user.id,15,60);
   const {data,type}=await readImage(req);if(type!=='image/webp')fail(400,'이미지를 WebP로 변환한 뒤 보내주세요.');
   const iid=id(),key=`chat-images/${iid}.webp`,at=now();
   await env.BUCKET.put(key,data,{httpMetadata:{contentType:'image/webp'}});
   try{await run(env,'INSERT INTO chat_images(id,sender_id,recipient_id,object_key,created,expires) VALUES(?,?,?,?,?,?)',iid,user.id,p.user_id,key,at,at+CHAT_IMAGE_TTL);}catch(e){await env.BUCKET.delete(key);throw e;}
   return json({id:iid,expires:at+CHAT_IMAGE_TTL},201);
  }
  if(method==='DELETE'){
   await env.DB.batch([query(env,`INSERT INTO dm_settings(user_id,peer_id,cleared_sequence) VALUES(?,?,COALESCE((SELECT max(rowid) FROM direct_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)),0)) ON CONFLICT(user_id,peer_id) DO UPDATE SET cleared_sequence=max(dm_settings.cleared_sequence,excluded.cleared_sequence)`,user.id,p.user_id,user.id,p.user_id,p.user_id,user.id),query(env,'UPDATE direct_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at=0',now(),p.user_id,user.id)]);return json({ok:true});
  }
 }
 m=path.match(/^\/api\/crews\/([\w-]+)\/(image|read|settings)$/);
 if(m){
  requireUser(user);const member=await one(env,'SELECT * FROM crew_members WHERE crew_id=? AND user_id=?',m[1],user.id);if(!member)fail(403,'크루 멤버만 이용할 수 있어요.');
  if(m[2]==='settings'){
   if(method==='GET')return json({muted:!!member.muted});
   if(method!=='PUT')fail(405,'지원하지 않는 요청입니다.');const b=await req.json();if(typeof b.muted!=='boolean')fail(400,'알림 설정을 확인해주세요.');
   await run(env,'UPDATE crew_members SET muted=? WHERE crew_id=? AND user_id=?',Number(b.muted),m[1],user.id);return json({muted:b.muted});
  }
  if(m[2]==='read'&&method==='POST'){
   const b=await req.json(),sequence=Number(b.sequence);if(!Number.isSafeInteger(sequence)||sequence<0)fail(400,'대화 위치를 확인해주세요.');
   await run(env,'UPDATE crew_members SET read_sequence=max(read_sequence,min(?,COALESCE((SELECT max(rowid) FROM crew_messages WHERE crew_id=?),0))) WHERE crew_id=? AND user_id=?',sequence,m[1],m[1],user.id);return json({ok:true});
  }
  if(m[2]==='image'&&method==='PUT'){
   if(member.role!=='owner')fail(403,'크루장만 대표 이미지를 변경할 수 있어요.');
   const old=await one(env,'SELECT image_version FROM crews WHERE id=?',m[1]);const {version}=await storeImage(req,env,'crew',m[1]);await run(env,'UPDATE crews SET image_version=? WHERE id=?',version,m[1]);
   if(old?.image_version)await env.BUCKET.delete(`images/crew/${m[1]}/${old.image_version}`);return json({image_version:version});
  }
  fail(405,'지원하지 않는 요청입니다.');
 }
 m=path.match(/^\/media\/crew\/([\w-]+)$/);
 if(m&&['GET','HEAD'].includes(method)){
  const crew=await one(env,'SELECT image_version FROM crews WHERE id=?',m[1]);if(!crew?.image_version)fail(404,'대표 이미지가 없습니다.');
  const object=await env.BUCKET.get(`images/crew/${m[1]}/${crew.image_version}`);if(!object)fail(404,'이미지를 찾을 수 없어요.');
  return new Response(method==='HEAD'?null:object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
 }
 return null;
}
