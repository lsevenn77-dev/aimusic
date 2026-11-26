import * as AifectMessages from '../shared/system-messages.js';
import {crewBadgeUrl,crewLevel} from '../shared/crews.js';
import {namedArtistSQL} from './artist-identity.js';
import {followCounts,assertArtistInteraction,producerFollowsViewer} from './follow-management.js';
import {publicNumberSQL,profileActivity} from './profile-dashboard.js';
import {myWorksPage} from './my-works.js';
import {playerIdentity,playerColumnsSQL} from './player.js';
import {one,rows,query,id,now,str,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {storeImage} from './images.js';
import {nickname,nicknameBatch,requireAvailableNickname} from './nicknames.js';
import {assertUnblocked} from './account-safety.js';
import {supportFollowCount,supportFollowers} from './ai-support-follows.js';
import {NICKNAME_DAYS} from '../shared/nickname-policy.js';

// The existing endpoint accepts JSON as before, or one bounded multipart draft.
// Upload bytes are staged under a new immutable key; only the DB batch publishes it.
async function profileDraft(req){
 if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))return {body:await req.json()};
 const limit=10*1024*1024+65536;
 if(Number(req.headers.get('content-length'))>limit)fail(413,'프로필과 배경 이미지는 각각 5MB 이하로 업로드해 주세요.');
 const reader=req.body?.getReader(),chunks=[];let size=0;
 if(!reader)fail(400,'프로필 정보를 확인해 주세요.');
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail(413,'프로필과 배경 이미지는 각각 5MB 이하로 업로드해 주세요.');}chunks.push(value);}
 const form=await new Response(new Blob(chunks),{headers:{'content-type':req.headers.get('content-type')}}).formData();
 const image=form.get('image'),banner=form.get('banner');
 return {body:{name:form.get('name'),bio:form.get('bio'),remove_image:form.get('remove_image')==='true',remove_banner:form.get('remove_banner')==='true'},image:image?.size?image:null,banner:banner?.size?banner:null};
}

async function previewCrew(env,userId){
 const c=await one(env,`SELECT c.id,c.name,c.image_version,c.highest_level,c.growth_started,
  COALESCE((SELECT SUM(x.amount) FROM crew_xp x WHERE x.crew_id=c.id),0) xp
  FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE cm.user_id=? ORDER BY cm.joined,c.id LIMIT 1`,userId);
 if(!c)return null;
 const {level}=crewLevel(c.xp,c.highest_level,c.growth_started);
 return {id:c.id,name:c.name,image_version:c.image_version,level,badge_url:crewBadgeUrl(level)};
}

export async function profileRoute(req,env,path,user){
 if(path==='/api/me/works'){
  if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
  requireUser(user);
  return json(await myWorksPage(env,user,new URL(req.url).searchParams));
 }
 const fan=path.match(/^\/api\/artist-preview\/([\w-]+)$/);
 if(fan){
  if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
  const profile=await one(env,`SELECT a.id,a.name,a.bio,a.image_version,p.user_id,p.id producer_id,${producerNameSQL()} producer_name FROM artists a JOIN producers p ON p.id=a.producer_id JOIN users u ON u.id=p.user_id WHERE u.provider!='deleted' AND a.id=? AND ${namedArtistSQL()}`,fan[1]);
  if(!profile)fail(404,'아티스트를 찾을 수 없습니다.');assertUnblocked(env,profile.user_id);await assertArtistInteraction(env,profile.id,user?.id);
  const [counts,following]=await Promise.all([followCounts(env,profile.user_id,user?.id,profile.id),user?one(env,"SELECT 1 FROM follows WHERE user_id=? AND kind='artist' AND target_id=?",user.id,profile.id):null]);
  return json({profile,artist:true,...counts,following:!!following,follows_viewer:false});
 }
 const listener=path.match(/^\/api\/member-preview\/([\w-]+)$/);
 if(listener){
  if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
  assertUnblocked(env,listener[1]);const profile=await one(env,`SELECT u.id user_id,p.id,${publicNameSQL()} name,p.bio,p.image_version,(SELECT code FROM public_profile_ids WHERE user_id=u.id) public_id FROM users u LEFT JOIN producers p ON p.user_id=u.id WHERE u.id=? AND u.provider!='deleted'`,listener[1]);
  if(!profile)fail(404,'회원을 찾을 수 없습니다.');
  if(profile.id)return profileRoute(req,env,'/api/producers/'+profile.id+'/preview',user);
  const crew=await previewCrew(env,profile.user_id);
  const c=await followCounts(env,profile.user_id,user?.id);return json({profile,followers:c.followers,following_count:c.following,follows_viewer:false,crew});
 }
 const preview=path.match(/^\/api\/producers\/([\w-]+)\/preview$/);
 if(preview){
  if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
  const profile=await one(env,`SELECT p.id,p.user_id,(SELECT account_type FROM users WHERE id=p.user_id) account_type,${publicNumberSQL('p.user_id')} public_number,(SELECT code FROM public_profile_ids WHERE user_id=p.user_id) public_id,${producerNameSQL()} name,p.bio,p.image_version,${playerColumnsSQL('p.user_id')} FROM producers p WHERE p.id=?`,preview[1]);
  if(!profile)fail(404,'프로필을 찾을 수 없습니다.');
  delete profile.player_xp; // Preview adds only the existing equipped artwork, without a level badge.
  assertUnblocked(env,profile.user_id);
  const [counts,crew,following,followsViewer]=await Promise.all([
   followCounts(env,profile.user_id,user?.id),
   previewCrew(env,profile.user_id),
   user?one(env,"SELECT 1 found FROM follows WHERE user_id=? AND kind='producer' AND target_id=?",user.id,profile.id):null,
   producerFollowsViewer(env,profile.user_id,user?.id)
  ]);
  const ai=await supportFollowCount(env,profile.user_id,user?.id||null);
  return json({profile,followers:counts.followers,human_followers:Math.max(0,counts.followers-ai),ai_followers:ai,following_count:counts.following,following:!!following,follows_viewer:followsViewer,crew});
 }
 const follower=path.match(/^\/api\/followers\/([\w-]+)$/);
 if(follower){
  requireUser(user);if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
  // Only an existing follower of the viewer can open this listener identity.
  const person=await one(env,`SELECT p.id,u.id user_id,${publicNumberSQL('u.id')} public_number,(SELECT code FROM public_profile_ids WHERE user_id=u.id) public_id,${playerColumnsSQL('u.id')},${publicNameSQL()} name,p.bio,p.image_version FROM follows f JOIN producers owner ON owner.id=f.target_id JOIN users u ON u.id=f.user_id LEFT JOIN producers p ON p.user_id=u.id WHERE f.kind='producer' AND owner.user_id=? AND u.id=?`,user.id,follower[1]);
  if(!person)fail(404,'팔로워를 찾을 수 없습니다.');
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
  if(req.method!=='PUT')fail(405,AifectMessages.unsupportedRequest);
  const p=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id);
  if(!p)fail(409,'닉네임을 먼저 저장해 주세요.');
  await rate(env,'profile-image:'+user.id,20,3600);
  const img=await storeImage(req,env,'producer',p.id);
  await query(env,'UPDATE producers SET image_version=?,image_type=? WHERE id=?',img.version,img.type,p.id).run();
  return json({ok:true,image_version:img.version});
 }
 if(req.method==='PUT'){
  const {body:b,image,banner}=path==='/api/me/profile'?await profileDraft(req):{body:await req.json()};
  const name=typeof b.name==='string'?b.name.trim():b.name,previous=await one(env,'SELECT id,bio FROM producers WHERE user_id=?',user.id),bio=str((path==='/api/account/nickname'?previous?.bio:undefined)??b.bio??'',1000,false);
  if(image&&b.remove_image)fail(400,'변경할 사진을 다시 선택해 주세요.');
  if(banner&&b.remove_banner)fail(400,'변경할 배경 이미지를 다시 선택해 주세요.');
  await rate(env,'nickname-change:'+user.id,20,3600);
  const pid=previous?.id||id(),writes=[query(env,'INSERT INTO producers(id,user_id,name,bio,created,nickname_confirmed) VALUES(?,?,?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,bio=excluded.bio,nickname_confirmed=1',pid,user.id,name,bio,now())];
  const staged=[];
  try{
   for(const [file,remove,kind,column] of [[image,b.remove_image,'producer','image'],[banner,b.remove_banner,'banner','banner']]){
    if(file){
     await rate(env,'profile-'+column+':'+user.id,20,3600);
     const saved=await storeImage(new Request(req.url,{method:'PUT',headers:{'content-type':file.type},body:file}),env,kind,pid);
     staged.push(`images/${kind}/${pid}/${saved.version}`);
     writes.push(query(env,`UPDATE producers SET ${column}_version=?,${column}_type=? WHERE user_id=?`,saved.version,saved.type,user.id));
    }else if(path==='/api/me/profile'&&remove===true){
     // Unlink only the selected image; retained originals and equipment stay intact.
     writes.push(query(env,`UPDATE producers SET ${column}_version='',${column}_type='' WHERE user_id=?`,user.id));
    }
   }
   await nicknameBatch(env,user.id,name,writes);
  }catch(error){await Promise.all(staged.map(key=>env.BUCKET.delete(key).catch(()=>{})));throw error;}
 }else if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
 const profile=await one(env,`SELECT p.id,${producerNameSQL()} name,p.bio,p.image_version,p.banner_version FROM producers p WHERE p.user_id=?`,user.id);
 const [followers,counts,identity,number]=await Promise.all([
 profile?rows(env,`SELECT p.id,u.id user_id,${playerColumnsSQL('u.id')},${publicNameSQL()} name,p.image_version,'producer' profile_kind FROM follows f JOIN users u ON u.id=f.user_id LEFT JOIN producers p ON p.user_id=f.user_id WHERE f.kind='producer' AND f.target_id=? ORDER BY f.created DESC LIMIT 200`,profile.id):[],
 followCounts(env,user.id,user.id),playerIdentity(env,user.id),one(env,'SELECT number public_number,(SELECT code FROM public_profile_ids WHERE user_id=public_member_ids.user_id) public_id FROM public_member_ids WHERE user_id=?',user.id)]);
 const [ai,official,changed]=await Promise.all([supportFollowCount(env,user.id),supportFollowers(env,user.id),one(env,'SELECT changed_at FROM nickname_changes WHERE user_id=?',user.id)]);
 return json({nickname_change_available_at:changed?changed.changed_at+NICKNAME_DAYS*86400:0,profile:{...(profile||{name:user.name,bio:'',image_version:''}),user_id:user.id,...identity,...number},user:profile?{...user,name:profile.name,profile_id:profile.id,image_version:profile.image_version||''}:user,followers:[...followers,...official],follower_count:counts.followers,human_followers:Math.max(0,counts.followers-ai),ai_followers:ai,following_count:counts.following});
}
