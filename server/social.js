import {one,rows,query,run,now,id,str,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {trackList,VISIBLE} from './catalog.js';
import {CREW_LEVELS,CREW_REWARDS,crewLevel} from '../shared/crews.js';
import {giftDay} from '../shared/gifts.js';

const xpSQL="COALESCE((SELECT sum(x.amount) FROM crew_xp x WHERE x.crew_id=c.id),0)";
const crewSelect=`SELECT c.*,${xpSQL} xp,(SELECT count(*) FROM crew_members m WHERE m.crew_id=c.id) members FROM crews c`;
const present=c=>({...c,...crewLevel(c.xp),xp:c.xp});
const requestId=b=>{if(typeof b.request_id!=='string'||!/^[\w-]{16,64}$/.test(b.request_id))fail(400,'전송 요청을 다시 시작해주세요.');return b.request_id;};
async function member(env,crewId,user){requireUser(user);const m=await one(env,'SELECT * FROM crew_members WHERE crew_id=? AND user_id=?',crewId,user.id);if(!m)fail(403,'크루에 가입한 멤버만 이용할 수 있어요.');return m;}
async function syncXp(env,crewId){
 // One published track can reward only one crew, after its author joined. Re-joining never farms XP.
 await run(env,`INSERT OR IGNORE INTO crew_xp(id,crew_id,user_id,amount,created) SELECT 'track:'||t.id,m.crew_id,t.user_id,?,? FROM tracks t JOIN crew_members m ON m.user_id=t.user_id WHERE m.crew_id=? AND t.created>=m.joined AND ${VISIBLE()}`,CREW_REWARDS.publishedTrack,now(),crewId);
}
async function crewDetail(env,cid,user){
 await syncXp(env,cid);const c=await one(env,`${crewSelect} WHERE c.id=?`,cid);if(!c)fail(404,'크루를 찾을 수 없어요.');
 const membership=user?await one(env,'SELECT role FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id):null;
 const members=await rows(env,`SELECT p.id,${producerNameSQL()} name,p.image_version,m.role FROM crew_members m JOIN producers p ON p.user_id=m.user_id WHERE m.crew_id=? ORDER BY m.joined LIMIT 150`,cid);
 const tracks=await trackList(env,`${VISIBLE()} AND t.user_id IN (SELECT user_id FROM crew_members WHERE crew_id=?)`,[cid],'t.created DESC',60);
 return {crew:present(c),membership,members,tracks,rules:{levels:CREW_LEVELS,...CREW_REWARDS}};
}
async function peer(env,pid,user){requireUser(user);const p=await one(env,`SELECT p.id,p.user_id,${producerNameSQL()} name,p.image_version FROM producers p WHERE p.id=?`,pid);if(!p)fail(404,'프로필을 찾을 수 없어요.');if(p.user_id===user.id)fail(400,'다른 이용자에게 메시지를 보내주세요.');return p;}
export async function socialRoute(req,env,path,user){
 if(!path.startsWith('/api/crews')&&!path.startsWith('/api/dm'))return null;
 const method=req.method,url=new URL(req.url);
 if(path==='/api/crews'){
  if(method==='GET'){
   const mine=user?await one(env,'SELECT crew_id FROM crew_members WHERE user_id=?',user.id):null;
   if(mine)await syncXp(env,mine.crew_id);
   const q=(url.searchParams.get('q')||'').slice(0,80);
   const crews=await rows(env,`${crewSelect} WHERE c.name LIKE ? OR c.interests LIKE ? ORDER BY (c.id=?) DESC,c.recruiting DESC,c.created DESC LIMIT 100`,'%'+q+'%','%'+q+'%',mine?.crew_id||'');
   const interests=user?await rows(env,'SELECT t.genre FROM likes l JOIN tracks t ON t.id=l.track_id WHERE l.user_id=? GROUP BY t.genre ORDER BY count(*) DESC LIMIT 5',user.id):[];
   const scored=crews.map(c=>({...present(c),match:interests.filter(g=>c.interests.toLowerCase().includes(g.genre.toLowerCase())).length})).sort((a,b)=>(b.id===mine?.crew_id)-(a.id===mine?.crew_id)||b.match-a.match||b.recruiting-a.recruiting);
   const tracks=await trackList(env,`${VISIBLE()} AND t.user_id IN (SELECT user_id FROM crew_members${mine?' WHERE crew_id=?':''})`,mine?[mine.crew_id]:[],'t.created DESC',30);
   return json({crews:scored,tracks,mine:mine?.crew_id||null,rules:{levels:CREW_LEVELS,...CREW_REWARDS}});
  }
  requireUser(user);if(method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  if(!await one(env,'SELECT id FROM producers WHERE user_id=?',user.id))fail(409,'보관함에서 닉네임을 먼저 저장해주세요.');
  if(await one(env,'SELECT 1 FROM crew_members WHERE user_id=?',user.id))fail(409,'이미 가입한 크루가 있어요.');
  await rate(env,'crew-create:'+user.id,3,86400);const b=await req.json(),cid=id();
  try{await env.DB.batch([
   query(env,'INSERT INTO crews(id,owner_id,name,description,interests,recruiting,created) VALUES(?,?,?,?,?,?,?)',cid,user.id,str(b.name,40),str(b.description||'',1000,false),str(b.interests||'',160,false),b.recruiting===false?0:1,now()),
   query(env,"INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES(?,?,'owner',?)",cid,user.id,now())
  ]);}catch(e){if(/UNIQUE/i.test(e.message))fail(409,'크루 이름 또는 가입 상태를 확인해주세요.');throw e;}
  return json(await crewDetail(env,cid,user),201);
 }
 let m=path.match(/^\/api\/crews\/([\w-]+)(?:\/(join|leave|messages))?$/);
 if(m){
  const cid=m[1],action=m[2];const c=await one(env,`${crewSelect} WHERE c.id=?`,cid);if(!c)fail(404,'크루를 찾을 수 없어요.');
  if(!action&&method==='GET')return json(await crewDetail(env,cid,user));
  requireUser(user);
  if(action==='join'&&method==='POST'){
   if(await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id))return json(await crewDetail(env,cid,user));
   if(!await one(env,'SELECT id FROM producers WHERE user_id=?',user.id))fail(409,'보관함에서 닉네임을 먼저 저장해주세요.');
   await syncXp(env,cid);
   const capacity=`CASE ${[...CREW_LEVELS].reverse().map(l=>`WHEN ${xpSQL}>=${l.xp} THEN ${l.capacity}`).join(' ')} END`;
   try{await run(env,`INSERT INTO crew_members(crew_id,user_id,role,joined) SELECT c.id,?,'member',? FROM crews c WHERE c.id=? AND c.recruiting=1 AND (SELECT count(*) FROM crew_members WHERE crew_id=c.id)<(${capacity})`,user.id,now(),cid);}catch(e){if(/UNIQUE/i.test(e.message))fail(409,'한 번에 하나의 크루에 가입할 수 있어요.');throw e;}
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
   if(membership.role==='owner'){
    if(next)writes.push(query(env,'UPDATE crews SET owner_id=? WHERE id=?',next.user_id,cid),query(env,"UPDATE crew_members SET role='owner' WHERE crew_id=? AND user_id=?",cid,next.user_id));
    else writes.push(query(env,'DELETE FROM crews WHERE id=?',cid));
   }
   await env.DB.batch(writes);return json({ok:true});
  }
  if(action==='messages'){
   if(method==='GET')return json({messages:(await rows(env,`SELECT m.id,m.body,m.created,m.user_id,p.id profile_id,${publicNameSQL()} name FROM crew_messages m JOIN users u ON u.id=m.user_id LEFT JOIN producers p ON p.user_id=m.user_id WHERE m.crew_id=? ORDER BY m.created DESC,m.id DESC LIMIT 100`,cid)).reverse()});
   if(method==='POST'){
    const b=await req.json(),rid=requestId(b),body=str(b.body,2000);await rate(env,'chat:'+user.id,60,60);
    const previous=await one(env,'SELECT crew_id,body FROM crew_messages WHERE user_id=? AND request_id=?',user.id,rid);
    if(previous&&(previous.crew_id!==cid||previous.body!==body))fail(409,'이미 다른 메시지에 사용된 전송 요청입니다.');
    await env.DB.batch([
     query(env,'INSERT OR IGNORE INTO crew_messages(id,crew_id,user_id,body,request_id,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?)',id(),cid,user.id,body,rid,now(),cid,user.id),
     query(env,'INSERT OR IGNORE INTO crew_xp(id,crew_id,user_id,amount,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?)','chat:'+user.id+':'+giftDay(now()),cid,user.id,CREW_REWARDS.dailyChat,now(),cid,user.id)
    ]);return json({ok:true},201);
   }
  }
  fail(405,'지원하지 않는 요청입니다.');
 }
 requireUser(user);
 if(path==='/api/dm'&&method==='GET'){
  return json({conversations:await rows(env,`SELECT p.id,${producerNameSQL()} name,p.image_version,max(d.created) updated,count(CASE WHEN d.recipient_id=? AND d.read_at=0 THEN 1 END) unread FROM direct_messages d JOIN producers p ON p.user_id=CASE WHEN d.sender_id=? THEN d.recipient_id ELSE d.sender_id END WHERE d.sender_id=? OR d.recipient_id=? GROUP BY p.id ORDER BY updated DESC LIMIT 100`,user.id,user.id,user.id,user.id)});
 }
 m=path.match(/^\/api\/dm\/([\w-]+)$/);
 if(m){
  const p=await peer(env,m[1],user);
  if(method==='GET'){
   const messages=(await rows(env,'SELECT id,sender_id,recipient_id,body,created,read_at FROM direct_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created DESC,id DESC LIMIT 100',user.id,p.user_id,p.user_id,user.id)).reverse();
   return json({peer:{id:p.id,name:p.name,image_version:p.image_version},messages});
  }
  if(method==='PATCH'){await run(env,'UPDATE direct_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at=0',now(),p.user_id,user.id);return json({ok:true});}
  if(method==='POST'){
   if(!await one(env,'SELECT id FROM producers WHERE user_id=?',user.id))fail(409,'보관함에서 닉네임을 먼저 저장해주세요.');
   const b=await req.json(),rid=requestId(b),body=str(b.body,2000);await rate(env,'dm:'+user.id,30,60);
   const previous=await one(env,'SELECT recipient_id,body FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,rid);
   if(previous&&(previous.recipient_id!==p.user_id||previous.body!==body))fail(409,'이미 다른 메시지에 사용된 전송 요청입니다.');
   await run(env,'INSERT OR IGNORE INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)',id(),user.id,p.user_id,body,rid,now());return json({ok:true},201);
  }
 }
 fail(404,'대화를 찾을 수 없어요.');
}
