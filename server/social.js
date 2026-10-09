import {assertUnblocked} from './account-safety.js';
import {one,rows,query,run,now,id,str,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicCrewNameSQL as publicNameSQL,memberNameSQL as producerNameSQL} from './identity.js';
import {nicknameBatch} from './nicknames.js';
import {trackList,VISIBLE} from './catalog.js';
import {CREW_LEVELS,CREW_REWARDS,CREW_ROLES,crewLevel} from '../shared/crews.js';
import {chatSettings,chatSummary} from './chat-features.js';
import {giftDay} from '../shared/gifts.js';

const xpSQL="COALESCE((SELECT sum(x.amount) FROM crew_xp x WHERE x.crew_id=c.id),0)";
const crewSelect=`SELECT c.*,${xpSQL} xp,(SELECT count(*) FROM crew_members m WHERE m.crew_id=c.id) members FROM crews c`;
const present=c=>({...c,...crewLevel(c.xp),xp:c.xp});
const requestId=b=>{if(typeof b.request_id!=='string'||!/^[\w-]{16,64}$/.test(b.request_id))fail(400,'전송 요청을 다시 시작해주세요.');return b.request_id;};
async function member(env,crewId,user){requireUser(user);const m=await one(env,'SELECT * FROM crew_members WHERE crew_id=? AND user_id=?',crewId,user.id);if(!m)fail(403,'크루에 가입한 멤버만 이용할 수 있어요.');return m;}
async function syncXp(env,crewId){
 // One published track can reward only one crew, after its author joined. Re-joining never farms XP.
 const tracks=query(env,`INSERT OR IGNORE INTO crew_xp(id,crew_id,user_id,amount,created) SELECT 'track:'||t.id,m.crew_id,t.user_id,?,? FROM tracks t JOIN crew_members m ON m.user_id=t.user_id WHERE m.crew_id=? AND t.created>=m.joined AND ${VISIBLE()}`,CREW_REWARDS.publishedTrack,now(),crewId);
 // A cover's performer receives the gift; original gifts belong to their creator.
 // One gift rewards one crew once, so moving crews cannot re-award it.
 const gifts=query(env,`INSERT OR IGNORE INTO crew_xp(id,crew_id,user_id,amount,created) SELECT 'gift:'||g.id,m.crew_id,p.user_id,g.gold*?,? FROM gifts g JOIN producers p ON p.id=COALESCE(g.singer_profile_id,g.creator_profile_id) JOIN crew_members m ON m.user_id=p.user_id WHERE m.crew_id=? AND g.created>=m.joined`,CREW_REWARDS.receivedGold,now(),crewId);
 await env.DB.batch([tracks,gifts]);
}
function crewNotice(env,cid,userId,body){return query(env,"INSERT INTO crew_messages(id,crew_id,user_id,body,request_id,created,kind) VALUES(?,?,?,?,?,?,'system')",id(),cid,userId,body,'system:'+id(),now());}
async function memberName(env,userId){return (await one(env,`SELECT ${producerNameSQL()} name FROM producers p WHERE p.user_id=?`,userId))?.name||'크루원';}
async function ensureSocialProfile(env,user){
 if(await one(env,'SELECT id FROM producers WHERE user_id=?',user.id))return;
 await nicknameBatch(env,user.id,user.name,[query(env,'INSERT INTO producers(id,user_id,name,bio,created,nickname_confirmed) VALUES(?,?,?,?,?,1) ON CONFLICT(user_id) DO NOTHING',id(),user.id,user.name,'',now())]);
}
async function crewHistory(env,cid,url,membership){
 const before=url.searchParams.get('before'),after=url.searchParams.get('after');
 if((before&&after)||[before,after].some(v=>v!==null&&!/^[1-9]\d{0,14}$/.test(v)))fail(400,'대화 위치를 확인해주세요.');
 const direction=after?'ASC':'DESC',cursor=before||after;
 const [messages,member_roles]=await Promise.all([
 rows(env,`SELECT m.rowid sequence,m.id,m.request_id,m.body,m.created,m.user_id,m.kind,p.id profile_id,${publicNameSQL()} name,COALESCE(cm.role,m.author_role) role FROM crew_messages m JOIN users u ON u.id=m.user_id JOIN crew_members viewer ON viewer.crew_id=m.crew_id AND viewer.user_id=? LEFT JOIN producers p ON p.user_id=m.user_id LEFT JOIN crew_members cm ON cm.crew_id=m.crew_id AND cm.user_id=m.user_id WHERE m.crew_id=? AND m.rowid>=viewer.joined_sequence AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=viewer.user_id AND b.blocked_id=m.user_id) OR (b.blocked_id=viewer.user_id AND b.user_id=m.user_id))${cursor?` AND m.rowid${before?'<':'>'}?`:''} ORDER BY m.rowid ${direction} LIMIT 101`,membership.user_id,cid,...(cursor?[Number(cursor)]:[])),
 rows(env,'SELECT p.id profile_id,m.role FROM crew_members m JOIN producers p ON p.user_id=m.user_id WHERE m.crew_id=?',cid)]);
 const has_more=messages.length>100;messages.length=Math.min(messages.length,100);if(!after)messages.reverse();
 return json({messages,has_more,membership,member_roles,roles:CREW_ROLES});
}
async function crewDetail(env,cid,user){
 await syncXp(env,cid);
 const [c,membership,members,tracks,ban]=await Promise.all([
 one(env,`${crewSelect} WHERE c.id=?`,cid),
 user?one(env,'SELECT role,joined,joined_sequence,muted FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id):null,
 rows(env,`SELECT p.id,p.user_id,${producerNameSQL()} name,p.image_version,m.role FROM crew_members m JOIN producers p ON p.user_id=m.user_id WHERE m.crew_id=? ORDER BY (m.role='owner') DESC,m.joined LIMIT 150`,cid),
 trackList(env,`${VISIBLE()} AND t.user_id IN (SELECT user_id FROM crew_members WHERE crew_id=?)`,[cid],'t.created DESC',60),
 user?one(env,'SELECT 1 FROM crew_bans WHERE crew_id=? AND user_id=?',cid,user.id):null]);
 if(!c)fail(404,'크루를 찾을 수 없어요.');const banned=!!ban;
 return {crew:present(c),membership,members,tracks,banned,rules:{levels:CREW_LEVELS,...CREW_REWARDS},roles:CREW_ROLES};
}
async function peer(env,pid,user){requireUser(user);const p=await one(env,`SELECT p.id,p.user_id,${producerNameSQL()} name,p.image_version FROM producers p WHERE p.id=?`,pid);if(!p)fail(404,'프로필을 찾을 수 없어요.');assertUnblocked(env,p.user_id);if(p.user_id===user.id)fail(400,'다른 이용자에게 메시지를 보내주세요.');return p;}
export async function socialRoute(req,env,path,user){
 if(!path.startsWith('/api/crews')&&!path.startsWith('/api/dm'))return null;
 const method=req.method,url=new URL(req.url);
 if(path==='/api/crews'){
  if(method==='GET'){
   const mine=user?await one(env,'SELECT crew_id FROM crew_members WHERE user_id=?',user.id):null;
   if(mine)await syncXp(env,mine.crew_id);
   const q=(url.searchParams.get('q')||'').slice(0,80);
   const [crews,interests,tracks]=await Promise.all([
    rows(env,`${crewSelect} WHERE c.name LIKE ? OR c.interests LIKE ? ORDER BY (c.id=?) DESC,c.recruiting DESC,c.created DESC LIMIT 100`,'%'+q+'%','%'+q+'%',mine?.crew_id||''),
    user?rows(env,'SELECT t.genre FROM likes l JOIN tracks t ON t.id=l.track_id WHERE l.user_id=? GROUP BY t.genre ORDER BY count(*) DESC LIMIT 5',user.id):[],
    trackList(env,`${VISIBLE()} AND t.user_id IN (SELECT user_id FROM crew_members${mine?' WHERE crew_id=?':''})`,mine?[mine.crew_id]:[],'t.created DESC',30)]);
   const scored=crews.map(c=>({...present(c),match:interests.filter(g=>c.interests.toLowerCase().includes(g.genre.toLowerCase())).length})).sort((a,b)=>(b.id===mine?.crew_id)-(a.id===mine?.crew_id)||b.match-a.match||b.recruiting-a.recruiting);
   return json({crews:scored,tracks,mine:mine?.crew_id||null,rules:{levels:CREW_LEVELS,...CREW_REWARDS}});
  }
  requireUser(user);if(method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  if(await one(env,'SELECT 1 FROM crew_members WHERE user_id=?',user.id))fail(409,'이미 가입한 크루가 있어요.');
  await rate(env,'crew-create:'+user.id,3,86400);const b=await req.json(),cid=id(),name=str(b.name,40),description=str(b.description||'',1000,false),interests=str(b.interests||'',160,false);
  await ensureSocialProfile(env,user);
  try{await env.DB.batch([
   query(env,'INSERT INTO crews(id,owner_id,name,description,interests,recruiting,created) VALUES(?,?,?,?,?,?,?)',cid,user.id,name,description,interests,b.recruiting===false?0:1,now()),
   query(env,"INSERT INTO crew_members(crew_id,user_id,role,joined,joined_sequence) VALUES(?,?,'owner',?,COALESCE((SELECT max(rowid) FROM crew_messages WHERE crew_id=?),0)+1)",cid,user.id,now(),cid),
   crewNotice(env,cid,user.id,(await memberName(env,user.id))+'님이 크루를 만들었습니다.')
  ]);}catch(e){if(/UNIQUE/i.test(e.message))fail(409,'크루 이름 또는 가입 상태를 확인해주세요.');throw e;}
  return json(await crewDetail(env,cid,user),201);
 }
 let m=path.match(/^\/api\/crews\/([\w-]+)\/members\/([\w-]+)$/);
 if(m){
  const cid=m[1],actor=await member(env,cid,user);
  if(actor.role!=='owner')fail(403,'크루장만 직책을 변경하거나 멤버를 강퇴할 수 있어요.');
  const target=await one(env,`SELECT m.*,${producerNameSQL()} name FROM crew_members m JOIN producers p ON p.user_id=m.user_id WHERE m.crew_id=? AND p.id=?`,cid,m[2]);
  if(!target)fail(404,'크루원을 찾을 수 없어요.');
  if(target.role==='owner')fail(400,'크루장 본인의 직책을 변경하거나 강퇴할 수 없어요.');
  if(method==='PATCH'){
   const b=await req.json();if(!['member','deputy','operator','manager'].includes(b.role))fail(400,'직책을 선택해주세요.');
   if(b.role!==target.role)await env.DB.batch([query(env,'UPDATE crew_members SET role=? WHERE crew_id=? AND user_id=?',b.role,cid,target.user_id),crewNotice(env,cid,user.id,`${target.name}님의 직책이 ${CREW_ROLES[b.role]}(으)로 변경되었습니다.`)]);
  }else if(method==='DELETE'){
   await env.DB.batch([query(env,'INSERT OR IGNORE INTO crew_bans(crew_id,user_id,created) VALUES(?,?,?)',cid,target.user_id,now()),query(env,'DELETE FROM crew_members WHERE crew_id=? AND user_id=?',cid,target.user_id),crewNotice(env,cid,user.id,`${target.name}님이 크루에서 내보내졌습니다.`)]);
  }else fail(405,'지원하지 않는 요청입니다.');
  return json(await crewDetail(env,cid,user));
 }
 m=path.match(/^\/api\/crews\/([\w-]+)(?:\/(join|leave|messages))?$/);
 if(m){
  const cid=m[1],action=m[2];
  if(!action&&method==='GET')return json(await crewDetail(env,cid,user));
  if(action==='messages'&&method==='GET')return crewHistory(env,cid,url,await member(env,cid,user));
  const c=await one(env,'SELECT * FROM crews WHERE id=?',cid);if(!c)fail(404,'크루를 찾을 수 없어요.');
  requireUser(user);
  if(action==='join'&&method==='POST'){
   if(await one(env,'SELECT 1 FROM crew_bans WHERE crew_id=? AND user_id=?',cid,user.id))fail(403,'이 크루에 다시 가입할 수 없어요.');
   if(await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id))return json(await crewDetail(env,cid,user));
   await ensureSocialProfile(env,user);
   await syncXp(env,cid);
   const capacity=`CASE ${[...CREW_LEVELS].reverse().map(l=>`WHEN ${xpSQL}>=${l.xp} THEN ${l.capacity}`).join(' ')} END`;
   const joiningName=await memberName(env,user.id);
   try{await env.DB.batch([
    // Capture the next sequence atomically: timestamps alone leak earlier messages in the same second.
    query(env,`INSERT INTO crew_members(crew_id,user_id,role,joined,joined_sequence) SELECT c.id,?,'member',?,COALESCE((SELECT max(rowid) FROM crew_messages WHERE crew_id=c.id),0)+1 FROM crews c WHERE c.id=? AND c.recruiting=1 AND NOT EXISTS(SELECT 1 FROM crew_bans WHERE crew_id=c.id AND user_id=?) AND (SELECT count(*) FROM crew_members WHERE crew_id=c.id)<(${capacity})`,user.id,now(),cid,user.id),
    query(env,"INSERT INTO crew_messages(id,crew_id,user_id,body,request_id,created,kind) SELECT ?,?,?,?,?,?,'system' WHERE changes()>0",id(),cid,user.id,joiningName+'님이 크루에 참여하였습니다.','system:'+id(),now())
   ]);}catch(e){if(/UNIQUE/i.test(e.message)){if(await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id))return json(await crewDetail(env,cid,user));fail(409,'한 번에 하나의 크루에 가입할 수 있어요.');}throw e;}
   if(!await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id))fail(409,'모집이 닫혔거나 정원이 가득 찼어요.');
   return json(await crewDetail(env,cid,user));
  }
  const membership=await member(env,cid,user);
  if(!action&&method==='PATCH'){
   if(membership.role!=='owner')fail(403,'크루장만 소개를 수정할 수 있어요.');
   const b=await req.json();await run(env,'UPDATE crews SET description=?,interests=?,recruiting=? WHERE id=?',str(b.description??c.description,1000,false),str(b.interests??c.interests,160,false),b.recruiting===undefined?c.recruiting:b.recruiting===false?0:1,cid);
   return json(await crewDetail(env,cid,user));
  }
  if(action==='leave'&&method==='POST'){
   // Transfer ownership to the longest-serving member; remove an empty crew, preserving no private chats.
   const next=await one(env,'SELECT user_id FROM crew_members WHERE crew_id=? AND user_id!=? ORDER BY joined,user_id LIMIT 1',cid,user.id);
   const writes=[query(env,'DELETE FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id)];
   if(next)writes.push(crewNotice(env,cid,user.id,(await memberName(env,user.id))+'님이 크루에서 나갔습니다.'));
   if(membership.role==='owner'){
    if(next)writes.push(query(env,'UPDATE crews SET owner_id=? WHERE id=?',next.user_id,cid),query(env,"UPDATE crew_members SET role='owner' WHERE crew_id=? AND user_id=?",cid,next.user_id));
    else writes.push(query(env,'DELETE FROM crews WHERE id=?',cid));
   }
   await env.DB.batch(writes);return json({ok:true});
  }
  if(action==='messages'){
   if(method==='GET')return crewHistory(env,cid,url,membership);
   if(method==='POST'){
    const b=await req.json(),rid=requestId(b),body=str(b.body,2000);await rate(env,'chat:'+user.id,60,60);
    const previous=await one(env,'SELECT rowid sequence,crew_id,body FROM crew_messages WHERE user_id=? AND request_id=?',user.id,rid);
    if(previous&&(previous.crew_id!==cid||previous.body!==body))fail(409,'이미 다른 메시지에 사용된 전송 요청입니다.');
    if(previous&&previous.sequence<membership.joined_sequence)fail(409,'이미 사용된 전송 요청입니다. 새 메시지로 다시 보내주세요.');
    await env.DB.batch([
     query(env,'INSERT OR IGNORE INTO crew_messages(id,crew_id,user_id,body,request_id,created,author_role) SELECT ?,?,?,?,?,?,role FROM crew_members WHERE crew_id=? AND user_id=?',id(),cid,user.id,body,rid,now(),cid,user.id),
     query(env,'INSERT OR IGNORE INTO crew_xp(id,crew_id,user_id,amount,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?)','chat:'+user.id+':'+giftDay(now()),cid,user.id,CREW_REWARDS.dailyChat,now(),cid,user.id)
    ]);
    const message=await one(env,`SELECT m.rowid sequence,m.id,m.request_id,m.body,m.created,m.user_id,m.kind,m.author_role role,p.id profile_id,${publicNameSQL()} name FROM crew_messages m JOIN users u ON u.id=m.user_id JOIN crew_members viewer ON viewer.crew_id=m.crew_id AND viewer.user_id=? LEFT JOIN producers p ON p.user_id=m.user_id WHERE m.user_id=? AND m.request_id=? AND m.rowid>=viewer.joined_sequence`,user.id,user.id,rid);
    if(!message)fail(403,'크루에 가입한 멤버만 전송할 수 있어요.');
    return json({ok:true,message},201);
   }
  }
  fail(405,'지원하지 않는 요청입니다.');
 }
 requireUser(user);
 if(path==='/api/dm'&&method==='GET'){
  const summary=await chatSummary(env,user);return json({...summary,conversations:await rows(env,`WITH mine AS (SELECT rowid sequence,d.*,CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END peer_id FROM direct_messages d WHERE (sender_id=? OR recipient_id=?) AND d.rowid>COALESCE((SELECT cleared_sequence FROM dm_settings WHERE user_id=? AND peer_id=CASE WHEN d.sender_id=? THEN d.recipient_id ELSE d.sender_id END),0)),latest AS (SELECT *,row_number() OVER(PARTITION BY peer_id ORDER BY sequence DESC) position,sum(CASE WHEN recipient_id=? AND read_at=0 THEN 1 ELSE 0 END) OVER(PARTITION BY peer_id) unread FROM mine) SELECT p.id,p.user_id,${producerNameSQL()} name,p.image_version,COALESCE(s.muted,0) muted,d.body last_message,d.created updated,d.unread FROM latest d JOIN producers p ON p.user_id=d.peer_id LEFT JOIN dm_settings s ON s.user_id=? AND s.peer_id=d.peer_id WHERE d.position=1 ORDER BY d.sequence DESC LIMIT 100`,user.id,user.id,user.id,user.id,user.id,user.id,user.id)});
 }
 m=path.match(/^\/api\/dm\/([\w-]+)$/);
 if(m){
  const p=await peer(env,m[1],user),settings=await chatSettings(env,user.id,p.user_id);
  if(method==='GET'){
   const before=url.searchParams.get('before'),after=url.searchParams.get('after'),cursor=before||after;
   if((before&&after)||[before,after].some(v=>v!==null&&!/^[1-9]\d{0,14}$/.test(v)))fail(400,'대화 위치를 확인해주세요.');
   const messages=await rows(env,`SELECT rowid sequence,id,request_id,sender_id,recipient_id,body,created,read_at,image_id,(SELECT expires FROM chat_images WHERE id=direct_messages.image_id) image_expires FROM direct_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND rowid>?${cursor?` AND rowid${before?'<':'>'}?`:''} ORDER BY rowid ${after?'ASC':'DESC'} LIMIT 101`,user.id,p.user_id,p.user_id,user.id,settings.cleared_sequence,...(cursor?[Number(cursor)]:[]));
   const has_more=messages.length>100;messages.length=Math.min(messages.length,100);if(!after)messages.reverse();
   const read_receipt=await one(env,'SELECT rowid sequence,read_at FROM direct_messages WHERE sender_id=? AND recipient_id=? AND read_at>0 ORDER BY rowid DESC LIMIT 1',user.id,p.user_id)||{sequence:0,read_at:0};
   return json({peer:{id:p.id,name:p.name,image_version:p.image_version},settings,messages,has_more,read_receipt});
  }
  if(method==='PATCH'){await run(env,'UPDATE direct_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at=0',now(),p.user_id,user.id);return json({ok:true});}
  if(method==='POST'){
   if(!await one(env,'SELECT id FROM producers WHERE user_id=?',user.id))fail(409,'보관함에서 닉네임을 먼저 저장해주세요.');
   const b=await req.json(),rid=requestId(b),imageId=b.image_id||null,body=imageId?'사진':str(b.body,2000);
   if(imageId&&(typeof imageId!=='string'||!/^[-\w]{1,80}$/.test(imageId)))fail(400,'이미지 정보를 확인해주세요.');
   if(imageId&&!await one(env,'SELECT id FROM chat_images WHERE id=? AND sender_id=? AND recipient_id=? AND expires>? AND deleted=0',imageId,user.id,p.user_id,now()))fail(400,'다시 이미지를 선택해주세요.');
   await rate(env,'dm:'+user.id,30,60);
   const previous=await one(env,'SELECT recipient_id,body,image_id FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,rid);
   if(previous&&(previous.recipient_id!==p.user_id||previous.body!==body||previous.image_id!==imageId))fail(409,'이미 다른 메시지에 사용된 전송 요청입니다.');
   await run(env,'INSERT OR IGNORE INTO direct_messages(id,sender_id,recipient_id,body,request_id,created,image_id) VALUES(?,?,?,?,?,?,?)',id(),user.id,p.user_id,body,rid,now(),imageId);
   return json({ok:true,message:await one(env,'SELECT rowid sequence,id,request_id,sender_id,recipient_id,body,created,read_at,image_id,(SELECT expires FROM chat_images WHERE id=direct_messages.image_id) image_expires FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,rid)},201);
  }
 }
 fail(404,'대화를 찾을 수 없어요.');
}
