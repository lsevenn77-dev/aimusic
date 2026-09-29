import {one,rows,query,id,now,str,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {storeImage} from './images.js';

export async function profileRoute(req,env,path,user){
 if(!['/api/me/profile','/api/me/profile/image'].includes(path))return null;
 requireUser(user);
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
  const b=await req.json(),name=str(b.name,60),bio=str(b.bio||'',1000,false);
  await env.DB.batch([query(env,'INSERT INTO producers(id,user_id,name,bio,created,nickname_confirmed) VALUES(?,?,?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,bio=excluded.bio,nickname_confirmed=1',id(),user.id,name,bio,now())]);
 }else if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const profile=await one(env,`SELECT p.id,${producerNameSQL()} name,p.bio,p.image_version FROM producers p WHERE p.user_id=?`,user.id);
 const [followers,counts]=await Promise.all([
 profile?rows(env,`SELECT p.id,${publicNameSQL()} name,p.image_version,'producer' profile_kind FROM follows f JOIN users u ON u.id=f.user_id LEFT JOIN producers p ON p.user_id=f.user_id WHERE f.kind='producer' AND f.target_id=? ORDER BY f.created DESC LIMIT 200`,profile.id):[],
 one(env,"SELECT (SELECT count(*) FROM follows WHERE kind='producer' AND target_id=?) followers,(SELECT count(*) FROM follows WHERE user_id=?) following",profile?.id||'',user.id)]);
 return json({profile:profile||{name:user.name,bio:'',image_version:''},user:profile?{...user,name:profile.name,profile_id:profile.id,image_version:profile.image_version||''}:user,followers,follower_count:counts.followers,following_count:counts.following});
}
