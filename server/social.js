import {syncCrewGrowth,crewGrowthView,crewCapacitySQL} from './crew-growth.js';
import {CREW_ROLE_LIMITS,CREW_ROLE_ALIAS,crewSettings,assertCrewLevel,auditCrew} from './crew-v3.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {playerColumnsSQL} from './player.js';
import {assertUnblocked} from './account-safety.js';
import {one,rows,query,run,now,id,str,fail,json,rate,rateQuery} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {publicNameSQL as chatPublicNameSQL,producerNameSQL as chatProducerNameSQL,publicCrewNameSQL as publicNameSQL,memberNameSQL as producerNameSQL} from './identity.js';
import {nicknameBatch} from './nicknames.js';
import {trackList,trackListQuery,VISIBLE} from './catalog.js';
import {trackClassification} from '../shared/genres.js';
import {CREW_LEVELS,CREW_REWARDS,CREW_ROLES,crewLevel} from '../shared/crews.js';
import {chatSummary} from './chat-features.js';
import {giftDay} from '../shared/gifts.js';

const xpSQL="COALESCE((SELECT sum(x.amount) FROM crew_xp x WHERE x.crew_id=c.id),0)";
const crewSelect=`SELECT c.*,${xpSQL} xp,(SELECT count(*) FROM crew_members m WHERE m.crew_id=c.id) members FROM crews c`;
const CREW_RENAME_INTERVAL=30*86400;
const nameChangeAvailableAt=c=>c.name_changed_at?c.name_changed_at+CREW_RENAME_INTERVAL:0;
const present=c=>({...c,...crewLevel(c.xp,c.highest_level,c.growth_started),capacity:Math.min(c.member_limit||150,crewLevel(c.xp,c.highest_level,c.growth_started).capacity),xp:c.xp,name_change_available_at:nameChangeAvailableAt(c),can_rename:now()>=nameChangeAvailableAt(c)});
const requestId=b=>{if(typeof b.request_id!=='string'||!/^[\w-]{16,64}$/.test(b.request_id))fail(400,'전송 요청을 다시 시작해주세요.');return b.request_id;};
async function member(env,crewId,user){requireUser(user);const m=await one(env,'SELECT m.*,c.name crew_name,c.image_version crew_image_version FROM crew_members m JOIN crews c ON c.id=m.crew_id WHERE m.crew_id=? AND m.user_id=?',crewId,user.id);if(!m)fail(403,'크루에 가입한 멤버만 이용할 수 있어요.');return m;}
function crewXpQueries(env,crewId){return [query(env,'SELECT 1'),query(env,'SELECT 1')];}
async function syncXp(env,crewId){await syncCrewGrowth(env,crewId);}
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
 rows(env,`SELECT m.rowid sequence,m.id,m.request_id,m.body,m.created,m.user_id,m.kind,m.image_id,(SELECT expires FROM crew_chat_images WHERE id=m.image_id) image_expires,p.id profile_id,p.image_version,${playerColumnsSQL('u.id')},${publicNameSQL()} name,${chatPublicNameSQL()} chat_nickname,COALESCE(cm.role,m.author_role) role FROM crew_messages m JOIN users u ON u.id=m.user_id JOIN crew_members viewer ON viewer.crew_id=m.crew_id AND viewer.user_id=? LEFT JOIN producers p ON p.user_id=m.user_id LEFT JOIN crew_members cm ON cm.crew_id=m.crew_id AND cm.user_id=m.user_id WHERE m.crew_id=? AND m.rowid>=viewer.joined_sequence AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=viewer.user_id AND b.blocked_id=m.user_id) OR (b.blocked_id=viewer.user_id AND b.user_id=m.user_id))${cursor?` AND m.rowid${before?'<':'>'}?`:''} ORDER BY m.rowid ${direction} LIMIT 101`,membership.user_id,cid,...(cursor?[Number(cursor)]:[])),
 rows(env,'SELECT p.id profile_id,m.role FROM crew_members m JOIN producers p ON p.user_id=m.user_id WHERE m.crew_id=?',cid)]);
 const has_more=messages.length>100;messages.length=Math.min(messages.length,100);if(!after)messages.reverse();
 return json({messages,has_more,membership,member_roles,roles:CREW_ROLES,crew:{id:cid,name:membership.crew_name,image_version:membership.crew_image_version}});
}
async function crewDetail(env,cid,user){
 await syncCrewGrowth(env,cid);
 // One DB round trip: synchronize XP, then read a consistent, live snapshot.
 // Do not cache membership, bans, or viewer-filtered music between requests.
 const result=await env.DB.batch([
 ...crewXpQueries(env,cid),
 query(env,`${crewSelect} WHERE c.id=?`,cid),
 query(env,'SELECT role,joined,joined_sequence,muted FROM crew_members WHERE crew_id=? AND user_id=?',cid,user?.id||''),
 query(env,`SELECT p.id,p.user_id,${playerColumnsSQL('p.user_id')},${producerNameSQL()} name,p.image_version,m.role FROM crew_members m JOIN producers p ON p.user_id=m.user_id WHERE m.crew_id=? ORDER BY (m.role='owner') DESC,m.joined LIMIT 150`,cid),
 trackListQuery(env,`${VISIBLE()} AND t.kind='cover' AND (t.cover_mode='solo' OR t.duet_parent_id IS NOT NULL) AND (t.user_id IN (SELECT user_id FROM crew_members WHERE crew_id=?) OR EXISTS(SELECT 1 FROM tracks parent JOIN crew_members cm ON cm.user_id=parent.user_id WHERE parent.id=t.duet_parent_id AND cm.crew_id=?))`,[cid,cid],'t.created DESC',60),
 query(env,'SELECT 1 FROM crew_bans WHERE crew_id=? AND user_id=?',cid,user?.id||''),query(env,`SELECT p.id,p.title,p.updated FROM dubbing_projects p JOIN users du ON du.id=p.owner_id WHERE du.provider!='deleted' AND p.visibility='public' AND p.state='complete' AND ${dubbingVisibleSQL()} AND EXISTS(SELECT 1 FROM dubbing_final_jobs f WHERE f.project_id=p.id AND f.state='ready') AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id)) AND (p.owner_id IN (SELECT user_id FROM crew_members WHERE crew_id=?) OR EXISTS(SELECT 1 FROM dubbing_role_claims dc JOIN crew_members cm ON cm.user_id=dc.user_id WHERE dc.project_id=p.id AND cm.crew_id=?)) ORDER BY p.updated DESC LIMIT 60`,user?.id||'',user?.id||'',cid,cid)]);
 const c=result[2].results[0],membership=result[3].results[0]||null,members=result[4].results,tracks=result[5].results.map(trackClassification),ban=result[6].results[0];
 if(!c)fail(404,'크루를 찾을 수 없어요.');if(c.join_policy==='invite_only'&&!membership)fail(403,'크루 회원만 볼 수 있어요.');const banned=!!ban;
 const dubbings=result[7].results;
 return {growth:await crewGrowthView(env,cid),dubbings,crew:present(c),membership:membership?{...membership,canonical_role:CREW_ROLE_ALIAS[membership.role]}:null,members:members.map(m=>({...m,canonical_role:CREW_ROLE_ALIAS[m.role]})),tracks,banned,rules:{levels:CREW_LEVELS,...CREW_REWARDS},roles:CREW_ROLES};
}
async function peer(env,pid,user,withSettings=false){requireUser(user);const p=await one(env,`SELECT p.id,p.user_id,${playerColumnsSQL('p.user_id')},${producerNameSQL()} name,${chatProducerNameSQL()} chat_nickname,p.image_version${withSettings?',COALESCE((SELECT muted FROM dm_settings WHERE user_id=? AND peer_id=p.user_id),0) muted,COALESCE((SELECT cleared_sequence FROM dm_settings WHERE user_id=? AND peer_id=p.user_id),0) cleared_sequence':''} FROM producers p WHERE p.id=?`,...(withSettings?[user.id,user.id,pid]:[pid]));if(!p)fail(404,'프로필을 찾을 수 없어요.');assertUnblocked(env,p.user_id);if(p.user_id===user.id)fail(400,'다른 이용자에게 메시지를 보내주세요.');return p;}
export async function socialRoute(req,env,path,user){
 if(!path.startsWith('/api/crews')&&!path.startsWith('/api/dm'))return null;
 const method=req.method,url=new URL(req.url);
 if(path==='/api/crews'){
  if(method==='GET'){
   const mine=user?await one(env,'SELECT crew_id FROM crew_members WHERE user_id=?',user.id):null;
   if(mine&&url.searchParams.get('home')==='1')return json({mine:mine.crew_id,detail:await crewDetail(env,mine.crew_id,user)});
   if(mine)await syncXp(env,mine.crew_id);
   const q=(url.searchParams.get('q')||'').slice(0,80);
   // Level is a monotonic function of total XP, so this orders by level then XP
   // across every crew, independently of discovery's search and 100-row limit.
   const [crews,interests,tracks,rankings]=await Promise.all([
    rows(env,`${crewSelect} WHERE c.name LIKE ? OR c.interests LIKE ? ORDER BY (c.id=?) DESC,c.recruiting DESC,c.created DESC LIMIT 100`,'%'+q+'%','%'+q+'%',mine?.crew_id||''),
    user?rows(env,'SELECT t.genre FROM likes l JOIN tracks t ON t.id=l.track_id WHERE l.user_id=? GROUP BY t.genre ORDER BY count(*) DESC LIMIT 5',user.id):[],
    url.searchParams.get('summary')==='1'?[]:trackList(env,`${VISIBLE()} AND t.user_id IN (SELECT user_id FROM crew_members${mine?' WHERE crew_id=?':''})`,mine?[mine.crew_id]:[],'t.created DESC',30),
    rows(env,`${crewSelect} ORDER BY xp DESC,c.created ASC,c.id ASC LIMIT 5`)]);
   const scored=crews.map(c=>({...present(c),match:interests.filter(g=>c.interests.toLowerCase().includes(g.genre.toLowerCase())).length})).sort((a,b)=>(b.id===mine?.crew_id)-(a.id===mine?.crew_id)||b.match-a.match||b.recruiting-a.recruiting);
   return json({crews:scored,rankings:rankings.map(present),tracks,mine:mine?.crew_id||null,rules:{levels:CREW_LEVELS,...CREW_REWARDS}});
  }
  requireUser(user);if(method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  if(await one(env,'SELECT 1 FROM crew_members WHERE user_id=?',user.id))fail(409,'이미 가입한 크루가 있어요.');
  await rate(env,'crew-create:'+user.id,3,86400);const b=await req.json(),settings=crewSettings(b),cid=id(),name=str(b.name,40),description=str(b.description||'',1000,false),interests=str(b.interests||'',160,false);
  await ensureSocialProfile(env,user);
  try{await env.DB.batch([
   query(env,'INSERT INTO crews(id,owner_id,name,description,interests,recruiting,created,join_policy,minimum_level,member_limit,notice) VALUES(?,?,?,?,?,?,?,?,?,?,?)',cid,user.id,name,description,interests,b.recruiting===false?0:1,now(),settings.join_policy,settings.minimum_level,settings.member_limit,settings.notice),
   query(env,"INSERT INTO crew_members(crew_id,user_id,role,joined,joined_sequence) VALUES(?,?,'owner',?,COALESCE((SELECT max(rowid) FROM crew_messages WHERE crew_id=?),0)+1)",cid,user.id,now(),cid),
   crewNotice(env,cid,user.id,(await memberName(env,user.id))+'님이 크루를 만들었습니다.')
  ]);}catch(e){if(/UNIQUE/i.test(e.message))fail(409,'크루 이름 또는 가입 상태를 확인해주세요.');throw e;}
  return json(await crewDetail(env,cid,user),201);
 }
 let m=path.match(/^\/api\/crews\/([\w-]+)\/members\/([\w-]+)$/);
 if(m){
  const cid=m[1],actor=await member(env,cid,user);
  if(actor.role!=='owner'&&!(method==='DELETE'&&actor.role==='deputy'))fail(403,'크루장만 직책을 변경하고 크루장·부크루장만 강퇴할 수 있어요.');
  const target=await one(env,`SELECT m.*,${producerNameSQL()} name FROM crew_members m JOIN producers p ON p.user_id=m.user_id WHERE m.crew_id=? AND p.id=?`,cid,m[2]);
  if(!target)fail(404,'크루원을 찾을 수 없어요.');
  if(actor.role==='deputy'&&target.role==='deputy')fail(403,'동급 운영진은 강퇴할 수 없어요.');
  if(target.role==='owner')fail(400,'크루장 본인의 직책을 변경하거나 강퇴할 수 없어요.');
  if(method==='PATCH'){
   const b=await req.json();if(b.role==='operator')b.role='manager';if(!['member','deputy','manager'].includes(b.role))fail(400,'직책을 선택해주세요.');
   if(b.role!==target.role){
    const cap=CREW_ROLE_LIMITS[b.role]||150;
    const updated=await one(env,'UPDATE crew_members SET role=? WHERE crew_id=? AND user_id=? AND role=? AND (SELECT count(*) FROM crew_members WHERE crew_id=? AND role=?)<? RETURNING user_id',b.role,cid,target.user_id,target.role,cid,b.role,cap);
    if(!updated)fail(409,'직책 정원이 가득 찼거나 멤버 정보가 변경됐어요.');
    await env.DB.batch([crewNotice(env,cid,user.id,`${target.name}님의 직책이 ${CREW_ROLES[b.role]}(으)로 변경되었습니다.`),auditCrew(env,cid,user.id,'role_changed',target.user_id+':'+b.role)]);
   }
  }else if(method==='DELETE'){
   await env.DB.batch([query(env,'INSERT OR IGNORE INTO crew_bans(crew_id,user_id,created) VALUES(?,?,?)',cid,target.user_id,now()),query(env,'DELETE FROM crew_members WHERE crew_id=? AND user_id=?',cid,target.user_id),auditCrew(env,cid,user.id,'member_removed',target.user_id),crewNotice(env,cid,user.id,`${target.name}님이 크루에서 내보내졌습니다.`)]);
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
   await ensureSocialProfile(env,user);await assertCrewLevel(env,c,user.id);
   if(await one(env,'SELECT 1 FROM crew_members WHERE user_id=?',user.id))fail(409,'한 번에 하나의 크루에 가입할 수 있어요.');
   if(c.join_policy==='invite_only'&&!await one(env,'SELECT 1 FROM direct_messages WHERE recipient_id=? AND crew_invite_id=?',user.id,cid))fail(403,'초대받은 회원만 가입할 수 있어요.');
   if(c.join_policy==='approval'){
    await run(env,"INSERT INTO crew_applications(crew_id,user_id,state,created) VALUES(?,?,'pending',?) ON CONFLICT(crew_id,user_id) DO UPDATE SET state='pending',created=excluded.created WHERE crew_applications.state='rejected'",cid,user.id,now());
    return json({pending:true,message:'가입 신청을 보냈어요.'},202);
   }
   await syncXp(env,cid);
   const capacity=`min(CASE WHEN c.member_limit>0 THEN c.member_limit ELSE 150 END,${crewCapacitySQL()})`;
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
   if(!['owner','deputy','manager','operator'].includes(membership.role))fail(403,'크루 운영진만 설정할 수 있어요.');
   const b=await req.json(),settings=crewSettings(b,c),name=b.name===undefined?c.name:str(b.name,40),changed=name!==c.name,t=now();
   if(membership.role!=='owner'&&(changed||b.join_policy!==undefined&&b.join_policy!==c.join_policy||b.member_limit!==undefined&&Number(b.member_limit)!==c.member_limit||b.minimum_level!==undefined&&Number(b.minimum_level)!==c.minimum_level))fail(403,'이 설정은 크루장만 변경할 수 있어요.');
   const cooldown=()=>fail(409,`${Math.max(1,Math.ceil((nameChangeAvailableAt(c)-t)/86400))}일 뒤에 수정 가능합니다. 크루 이름은 변경 후 30일에 한 번 수정할 수 있어요.`);
   if(changed&&t<nameChangeAvailableAt(c))cooldown();
   if(b.version!==undefined&&b.version!==c.version)fail(409,'크루 정보가 변경됐어요. 다시 열어주세요.');
   const details=[settings.join_policy,settings.minimum_level,settings.member_limit,settings.notice,str(b.description??c.description,1000,false),str(b.interests??c.interests,160,false),b.recruiting===undefined?c.recruiting:b.recruiting===false?0:1];
   try{
    // The cooldown and ownership are checked in the write too, so two requests cannot rename twice.
    const updated=changed?await one(env,'UPDATE crews SET name=?,name_changed_at=?,join_policy=?,minimum_level=?,member_limit=?,notice=?,description=?,interests=?,recruiting=?,version=version+1 WHERE id=? AND owner_id=? AND version=? AND name=? AND (name_changed_at=0 OR name_changed_at<=?) RETURNING id',name,t,...details,cid,user.id,c.version,c.name,t-CREW_RENAME_INTERVAL):await one(env,'UPDATE crews SET join_policy=?,minimum_level=?,member_limit=?,notice=?,description=?,interests=?,recruiting=?,version=version+1 WHERE id=? AND owner_id=? AND version=? RETURNING id',...details,cid,c.owner_id,c.version);
    if(!updated)fail(409,'크루 정보가 변경되었어요. 새로고침 후 다시 확인해주세요.');
    await auditCrew(env,cid,user.id,'settings_changed').run();
   }catch(e){if(/UNIQUE.*crews.name/i.test(e.message))fail(409,'이미 사용 중인 크루 이름이에요. 다른 이름을 입력해주세요.');throw e;}
   return json(await crewDetail(env,cid,user));
  }
  if(action==='leave'&&method==='POST'){
   if(membership.role==='owner')fail(409,'크루장을 위임한 후 탈퇴해주세요.');
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
    const b=await req.json(),rid=requestId(b),imageId=b.image_id||null,body=imageId?'사진':str(b.body,2000);
    if(imageId&&(typeof imageId!=='string'||!/^[-\w]{1,80}$/.test(imageId)))fail(400,'이미지 정보를 확인해주세요.');
    if(imageId&&!await one(env,'SELECT id FROM crew_chat_images WHERE id=? AND crew_id=? AND sender_id=? AND deleted=0 AND expires>? AND created>=?',imageId,cid,user.id,now(),membership.joined))fail(400,'다시 이미지를 선택해주세요.');
    const [limit,prior]=await env.DB.batch([rateQuery(env,'chat:'+user.id,60),query(env,'SELECT rowid sequence,crew_id,body,image_id FROM crew_messages WHERE user_id=? AND request_id=?',user.id,rid)]);
    if(limit.results[0].count>60)fail(429,'요청이 많습니다. 잠시 후 다시 시도해주세요.');
    const previous=prior.results[0];
    if(previous&&(previous.crew_id!==cid||previous.body!==body||previous.image_id!==imageId))fail(409,'이미 다른 메시지에 사용된 전송 요청입니다.');
    if(previous&&previous.sequence<membership.joined_sequence)fail(409,'이미 사용된 전송 요청입니다. 새 메시지로 다시 보내주세요.');
    const sent=await env.DB.batch([
     query(env,'INSERT OR IGNORE INTO crew_messages(id,crew_id,user_id,body,request_id,created,author_role,image_id) SELECT ?,?,?,?,?,?,role,? FROM crew_members WHERE crew_id=? AND user_id=?',id(),cid,user.id,body,rid,now(),imageId,cid,user.id),
     query(env,'SELECT 1'),
     query(env,`SELECT m.rowid sequence,m.id,m.request_id,m.body,m.created,m.user_id,m.kind,m.image_id,(SELECT expires FROM crew_chat_images WHERE id=m.image_id) image_expires,m.author_role role,p.id profile_id,p.image_version,${playerColumnsSQL('u.id')},${publicNameSQL()} name,${chatPublicNameSQL()} chat_nickname FROM crew_messages m JOIN users u ON u.id=m.user_id JOIN crew_members viewer ON viewer.crew_id=m.crew_id AND viewer.user_id=? LEFT JOIN producers p ON p.user_id=m.user_id WHERE m.user_id=? AND m.request_id=? AND m.rowid>=viewer.joined_sequence`,user.id,user.id,rid)
    ]);
    const message=sent[2].results[0];
    if(!message)fail(403,'크루에 가입한 멤버만 전송할 수 있어요.');
    return json({ok:true,message},201);
   }
  }
  fail(405,'지원하지 않는 요청입니다.');
 }
 requireUser(user);
 m=path.match(/^\/api\/dm\/([\w-]+)\/crew-invite$/);
 if(m){
  if(method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  const p=await peer(env,m[1],user),b=await req.json(),rid=requestId(b),cid=str(b.crew_id,80);
  const previous=await one(env,'SELECT id,recipient_id,crew_invite_id FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,rid);
  if(previous){
   if(previous.recipient_id!==p.user_id||previous.crew_invite_id!==cid)fail(409,'이미 다른 메시지에 사용된 전송 요청입니다.');
   return json({ok:true,peer_id:p.id,message_id:previous.id});
  }
  await member(env,cid,user);
  const c=await one(env,`${crewSelect} WHERE c.id=?`,cid);
  if(!c)fail(404,'크루를 찾을 수 없어요.');
  if(!c.recruiting||c.members>=present(c).capacity)fail(409,'모집 중이며 정원이 남은 크루만 초대할 수 있어요.');
  if(await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?',cid,p.user_id))fail(409,'이미 같은 크루의 멤버예요.');
  if(await one(env,'SELECT 1 FROM crew_bans WHERE crew_id=? AND user_id=?',cid,p.user_id))fail(403,'이 크루에 가입할 수 없는 이용자예요.');
  await ensureSocialProfile(env,user);
  await rate(env,'dm:'+user.id,30,60);
  const body=`「${c.name}」 크루에 초대합니다! 함께 음악을 듣고 이야기해요.\n크루 둘러보기: https://aifect.co.kr/#crew/${cid}`;
  await run(env,`INSERT OR IGNORE INTO direct_messages(id,sender_id,recipient_id,body,request_id,created,crew_invite_id) SELECT ?,?,?,?,?,?,c.id FROM crews c JOIN crew_members cm ON cm.crew_id=c.id AND cm.user_id=? WHERE c.id=? AND c.recruiting=1 AND NOT EXISTS(SELECT 1 FROM crew_bans WHERE crew_id=c.id AND user_id=?) AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?))`,id(),user.id,p.user_id,body,rid,now(),user.id,cid,p.user_id,user.id,p.user_id,p.user_id,user.id);
  const sent=await one(env,'SELECT id,recipient_id,crew_invite_id FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,rid);
  if(!sent)fail(409,'초대할 수 없는 상태로 변경되었어요. 크루와 대화 상대를 다시 확인해주세요.');
  if(sent.recipient_id!==p.user_id||sent.crew_invite_id!==cid)fail(409,'이미 다른 메시지에 사용된 전송 요청입니다.');
  return json({ok:true,peer_id:p.id,message_id:sent.id},201);
 }
 if(path==='/api/dm'&&method==='GET'){
  const summary=await chatSummary(env,user);return json({...summary,conversations:(await rows(env,`WITH mine AS (SELECT rowid sequence,d.*,CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END peer_id FROM direct_messages d WHERE (sender_id=? OR recipient_id=?) AND d.rowid>COALESCE((SELECT cleared_sequence FROM dm_settings WHERE user_id=? AND peer_id=CASE WHEN d.sender_id=? THEN d.recipient_id ELSE d.sender_id END),0)),latest AS (SELECT *,row_number() OVER(PARTITION BY peer_id ORDER BY sequence DESC) position,sum(CASE WHEN recipient_id=? AND read_at=0 THEN 1 ELSE 0 END) OVER(PARTITION BY peer_id) unread FROM mine) SELECT p.id,p.user_id,${playerColumnsSQL('p.user_id')},${producerNameSQL()} name,${chatProducerNameSQL()} chat_nickname,p.image_version,COALESCE(s.muted,0) muted,d.body last_message,d.created updated,d.unread FROM latest d JOIN producers p ON p.user_id=d.peer_id LEFT JOIN dm_settings s ON s.user_id=? AND s.peer_id=d.peer_id WHERE d.position=1 ORDER BY d.sequence DESC LIMIT 100`,user.id,user.id,user.id,user.id,user.id,user.id,user.id)).map(p=>({...p,is_notice:isAdmin(env,{id:p.user_id})}))});
 }
 m=path.match(/^\/api\/dm\/([\w-]+)$/);
 if(m){
  const p=await peer(env,m[1],user,true),settings={muted:p.muted,cleared_sequence:p.cleared_sequence};
  if(method==='GET'){
   const before=url.searchParams.get('before'),after=url.searchParams.get('after'),cursor=before||after;
   if((before&&after)||[before,after].some(v=>v!==null&&!/^[1-9]\d{0,14}$/.test(v)))fail(400,'대화 위치를 확인해주세요.');
   const historyQuery=query(env,`SELECT rowid sequence,id,request_id,sender_id,recipient_id,body,created,read_at,crew_invite_id,image_id,(SELECT expires FROM chat_images WHERE id=direct_messages.image_id) image_expires FROM direct_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND rowid>?${cursor?` AND rowid${before?'<':'>'}?`:''} ORDER BY rowid ${after?'ASC':'DESC'} LIMIT 101`,user.id,p.user_id,p.user_id,user.id,settings.cleared_sequence,...(cursor?[Number(cursor)]:[]));
   const [history,receipt]=await env.DB.batch([historyQuery,query(env,'SELECT rowid sequence,read_at FROM direct_messages WHERE sender_id=? AND recipient_id=? AND read_at>0 ORDER BY rowid DESC LIMIT 1',user.id,p.user_id)]);
   const messages=history.results,read_receipt=receipt.results[0]||{sequence:0,read_at:0};
   const has_more=messages.length>100;messages.length=Math.min(messages.length,100);if(!after)messages.reverse();
   return json({peer:{id:p.id,user_id:p.user_id,name:p.name,chat_nickname:p.chat_nickname,image_version:p.image_version},settings,messages,has_more,read_receipt});
  }
  if(method==='PATCH'){
   // Bound acknowledgements to history the client actually received. A message
   // arriving between GET and PATCH must remain unread until the next GET.
   const b=await req.json().catch(()=>({})),sequence=b.sequence;
   if(sequence!==undefined&&(!Number.isSafeInteger(sequence)||sequence<0))fail(400,'읽음 위치를 확인해주세요.');
   await run(env,'UPDATE direct_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at=0'+(sequence===undefined?'':' AND rowid<=?'),now(),p.user_id,user.id,...(sequence===undefined?[]:[sequence]));return json({ok:true});
  }
  if(method==='POST'){
   const b=await req.json(),rid=requestId(b),imageId=b.image_id||null,body=imageId?'사진':str(b.body,2000);
   if(imageId&&(typeof imageId!=='string'||!/^[-\w]{1,80}$/.test(imageId)))fail(400,'이미지 정보를 확인해주세요.');
   if(imageId&&!await one(env,'SELECT id FROM chat_images WHERE id=? AND sender_id=? AND recipient_id=? AND expires>? AND deleted=0',imageId,user.id,p.user_id,now()))fail(400,'다시 이미지를 선택해주세요.');
   const [profile,limit,prior]=await env.DB.batch([query(env,'SELECT id FROM producers WHERE user_id=?',user.id),rateQuery(env,'dm:'+user.id,60),query(env,'SELECT recipient_id,body,image_id FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,rid)]);
   if(!profile.results.length)fail(409,'보관함에서 닉네임을 먼저 저장해주세요.');if(limit.results[0].count>30)fail(429,'요청이 많습니다. 잠시 후 다시 시도해주세요.');
   const previous=prior.results[0];
   if(previous&&(previous.recipient_id!==p.user_id||previous.body!==body||previous.image_id!==imageId))fail(409,'이미 다른 메시지에 사용된 전송 요청입니다.');
   const result=await env.DB.batch([query(env,'INSERT OR IGNORE INTO direct_messages(id,sender_id,recipient_id,body,request_id,created,image_id) VALUES(?,?,?,?,?,?,?)',id(),user.id,p.user_id,body,rid,now(),imageId),query(env,'SELECT rowid sequence,id,request_id,sender_id,recipient_id,body,created,read_at,crew_invite_id,image_id,(SELECT expires FROM chat_images WHERE id=direct_messages.image_id) image_expires FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,rid)]);
   return json({ok:true,message:result[1].results[0]},201);
  }
 }
 fail(404,'대화를 찾을 수 없어요.');
}
