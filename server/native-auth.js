import {one,run,id,now,fail,json} from './db.js';
import {session} from './auth.js';

// SDK access tokens are bearer credentials: only accept the configured Kakao app,
// and derive the account exclusively from Kakao's verified responses.
export async function kakaoIdentity(accessToken,appId,request=fetch){
 if(!/^\d+$/.test(String(appId||'')))fail(503,'카카오 앱 로그인을 준비하고 있습니다.');
 if(typeof accessToken!=='string'||!accessToken||accessToken.length>4096||/\s/.test(accessToken))fail(400,'카카오 인증 정보를 확인해주세요.');
 const get=async path=>{
  let r;try{r=await request('https://kapi.kakao.com'+path,{headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(10000)});}catch{fail(502,'카카오 인증 서버에 연결하지 못했어요. 다시 시도해주세요.');}
  if(!r.ok)fail(401,'카카오 인증이 만료됐어요. 다시 로그인해주세요.');
  try{return await r.json();}catch{fail(502,'카카오 인증 응답을 확인할 수 없어요.');}
 };
 const info=await get('/v1/user/access_token_info');
 if(String(info.app_id)!==String(appId)||!Number.isSafeInteger(info.id)||info.id<=0||!(info.expires_in>0))fail(401,'AIFECT 카카오 인증 정보가 일치하지 않습니다.');
 const profile=await get('/v2/user/me');
 if(profile.id!==info.id)fail(401,'카카오 계정 정보가 일치하지 않습니다.');
 return {sub:String(info.id),name:String(profile.kakao_account?.profile?.nickname||'AIFECT 리스너').slice(0,40),email:profile.kakao_account?.is_email_verified===true?profile.kakao_account.email:null};
}

export async function nativeAuthRoute(req,env,path){
 if(path!=='/api/auth/kakao/token'||req.method!=='POST')return null;
 const body=await req.json(),identity=await kakaoIdentity(body.accessToken,env.KAKAO_APP_ID);
 let user=await one(env,"SELECT id,name,email,provider FROM users WHERE provider='kakao' AND subject=?",identity.sub);
 if(!user){
  user={id:id(),name:identity.name,email:identity.email||`kakao-${identity.sub}@identity.aifect.invalid`,provider:'kakao'};
  await run(env,'INSERT INTO users(id,email,name,provider,subject,created) VALUES(?,?,?,?,?,?)',user.id,user.email,user.name,'kakao',identity.sub,now());
 }
 return json({user},200,{'set-cookie':await session(env,user,new URL(req.url).protocol==='https:'),'cache-control':'no-store'});
}
