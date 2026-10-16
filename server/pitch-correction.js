import {isPremium} from './membership.js';
import {requireUser} from './auth.js';
import {json,fail} from './db.js';

export async function pitchCorrectionRoute(req,env,path,user){
 if(!path.startsWith('/api/pitch-correction'))return null;
 requireUser(user);if(!isPremium(user))fail(403,'음정 보정은 Premium 구독자 전용 기능이에요.');
 if(!['GET','HEAD'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
 if(path==='/api/pitch-correction/access')return json({allowed:true,expires:user.premium_until});
 if(path==='/api/pitch-correction/worker.js'){
  // The engine is a private Worker asset, never a public static file. Going
  // through ASSETS would otherwise allow free accounts to bypass the route.
  const {default:source}=await import('../.generated/pitch-correction-engine.js');
  return new Response(req.method==='HEAD'?null:source,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'private, no-store','vary':'Cookie, Authorization','x-content-type-options':'nosniff'}});
 }
 fail(404,'기능을 찾을 수 없습니다.');
}
