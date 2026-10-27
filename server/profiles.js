import {publicNumberSQL,profileActivity} from './profile-dashboard.js';
import {playerIdentity,playerColumnsSQL} from './player.js';
import {one,rows,query,id,now,str,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {storeImage} from './images.js';
import {nickname,nicknameBatch,requireAvailableNickname} from './nicknames.js';
import {assertUnblocked} from './account-safety.js';
import {supportFollowCount,supportFollowers} from './ai-support-follows.js';

export async function profileRoute(req,env,path,user){
 const preview=path.match(/^\/api\/producers\/([\w-]+)\/preview$/);
 if(preview){
  if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
  const profile=await one(env,`SELECT p.id,p.user_id,(SELECT account_type FROM users WHERE id=p.user_id) account_type,${publicNumberSQL('p.user_id')} public_number,(SELECT code FROM public_profile_ids WHERE user_id=p.user_id) public_id,${producerNameSQL()} name,p.bio,p.image_version,${playerColumnsSQL('p.user_id')} FROM producers p WHERE p.id=?`,preview[1]);
  if(!profile)fail(404,'프로필을 찾을 수 없습니다.');
  delete profile.player_xp; // Preview adds only the existing equipped artwork, without a level badge.
  assertUnblocked(env,profile.user_id);
  const [counts,crew,following]=await Promise.all([
   one(env,"SELECT (SELECT count(*) FROM follows WHERE kind='producer' AND target_id=?) followers,(SELECT count(*) FROM follows WHERE user_id=?) following",profile.id,profile.user_id),
   one(env,'SELECT c.id,c.name,c.image_version FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE cm.user_id=? ORDER BY cm.joined,c.id LIMIT 1',profile.user_id),
   user?one(env,"SELECT 1 found FROM follows WHERE user_id=? AND kind='producer' AND target_id=?",user.id,profile.id):null
  ]);
  const ai=await supportFollowCount(env,profile.user_id);
  return json({profile,followers:counts.followers+ai,human_followers:counts.followers,ai_followers:ai,following_count:counts.following,following:!!following,crew});
 }
 const follower=path.match(/^\/api\/followers\/([\w-]+)$/);
 if(follower){
  requireUser(user);if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
  // Only an existing follower of the viewer can open this listener identity.
  const person=await one(env,`SELECT p.id,u.id user_id,${publicNumberSQL('u.id')} public_number,(SELECT code FROM public_profile_ids WHERE user_id=u.id) public_id,${playerColumnsSQL('u.id')},${publicNameSQL()} name,p.bio,p.image_version FROM follows f JOIN producers owner ON owner.id=f.target_id JOIN users u ON u.id=f.user_id LEFT JOIN producers p ON p.user_id=u.id WHERE f.kind='producer' AND owner.user_id=? AND u.id=?`,user.id,follower[1]);
  if(!person)fail(404,'팔로워를 찾을 수 없어요.');
  delete person.player_xp;
  return json({profile:person});
 }
 if(!['/api/me/profile','/api/me/profile/image','/api/account/nickname'].includes(path))return null;
 if(path==='/api/account/nickname'&&req.method==='GET'){
  await rate(env,'nickname-check:'+(user?.id||req.headers.get('cf-connecting-ip')||'anonymous'),60,60);
  try{await requireAvailableNickname(env,user?.id||'',new URL(req.url).searchParams.get('name'));return json({available:true,message:'사용 가능한 닉네임입니다'});}catch(e){if(e.status===400||e.status===409)return json({available:false,message:e.message});throw e;}
 }
 requireUser(user);
 if(path==='/api/me/profile'&&req.method==='GET'&&new URL(req.url).searchParams.get('section')==='activity')return json(await profileActivity(env,user));
 if(path.endsWith('/image')){
  if(req.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  const p=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id);
  if(!p)fail(409,'닉네임을 먼저 저장해주세요.');
  await rate(env,'profile-image:'+user.id,20,3600);
  const img=await storeImage(req,env,'producer',p.id);
  await query(env,'UPDATE producers SET image_version=?,image_type=? WHERE id=?',img.version,img.type,p.id).run();
  return json({ok:true,image_version:img.version});
 }
 if(req.method==='PUT'){
  const b=await req.json(),name=typeof b.name==='string'?b.name.trim():b.name,previous=path==='/api/account/nickname'?await one(env,'SELECT bio FROM producers WHERE user_id=?',user.id):null,bio=str(previous?.bio??b.bio??'',1000,false);
  await rate(env,'nickname-change:'+user.id,20,3600);
  await nicknameBatch(env,user.id,name,[query(env,'INSERT INTO producers(id,user_id,name,bio,created,nickname_confirmed) VALUES(?,?,?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,bio=excluded.bio,nickname_confirmed=1',id(),user.id,name,bio,now())]);
 }else if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const profile=await one(env,`SELECT p.id,${producerNameSQL()} name,p.bio,p.image_version FROM producers p WHERE p.user_id=?`,user.id);
 const [followers,counts,identity,number]=await Promise.all([
 profile?rows(env,`SELECT p.id,u.id user_id,${playerColumnsSQL('u.id')},${publicNameSQL()} name,p.image_version,'producer' profile_kind FROM follows f JOIN users u ON u.id=f.user_id LEFT JOIN producers p ON p.user_id=f.user_id WHERE f.kind='producer' AND f.target_id=? ORDER BY f.created DESC LIMIT 200`,profile.id):[],
 one(env,"SELECT (SELECT count(*) FROM follows WHERE kind='producer' AND target_id=?) followers,(SELECT count(*) FROM follows WHERE user_id=?) following",profile?.id||'',user.id),playerIdentity(env,user.id),one(env,'SELECT number public_number,(SELECT code FROM public_profile_ids WHERE user_id=public_member_ids.user_id) public_id FROM public_member_ids WHERE user_id=?',user.id)]);
 const [ai,official]=await Promise.all([supportFollowCount(env,user.id),supportFollowers(env,user.id)]);
 return json({profile:{...(profile||{name:user.name,bio:'',image_version:''}),user_id:user.id,...identity,...number},user:profile?{...user,name:profile.name,profile_id:profile.id,image_version:profile.image_version||''}:user,followers:[...followers,...official],follower_count:counts.followers+ai,human_followers:counts.followers,ai_followers:ai,following_count:counts.following});
}
