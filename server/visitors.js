import {fail,json,now,rate,query} from './db.js';
import {hash} from './auth.js';
import {sourceFromRequest} from './signup-source.js';

export const visitDay=(at=now())=>Math.floor((at+9*3600)/86400);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export async function recordVisit(req,env){
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON 형식이 필요합니다.');
 const payload=await req.json().catch(()=>null);
 if(!uuid.test(payload?.token)||typeof payload.token!=='string')fail(400,'방문 번호를 확인해주세요.');
 const day=visitDay();
 if(payload.day!==day)return json({day,recorded:false});
 const ua=req.headers.get('user-agent')||'';
 const platform=/^AIFECT-Android\//i.test(ua)?'android':/^AIFECT-iOS\//i.test(ua)?'ios':'web';
 if(platform==='web'&&/(?:bot\b|crawler|spider|AIFECT-(?:Android|Mobile|iOS)|; wv\))/i.test(ua))return json({day,recorded:false});
 const ip=req.headers.get('cf-connecting-ip');
 if(ip)await rate(env,'visits:'+await hash(day+':'+ip),600,60);
 const token=await hash(day+':'+payload.token.toLowerCase());
 const source=sourceFromRequest(req)||(platform==='web'?null:'app');
 await env.DB.batch([
  query(env,'INSERT INTO visitor_days(day,platform,token,source) VALUES(?,?,?,?) ON CONFLICT(day,platform,token) DO NOTHING',day,platform,token,source),
  expiredVisits(env,day)
 ]);
 return json({day,recorded:true});
}

function expiredVisits(env,day){
 return query(env,'DELETE FROM visitor_days WHERE rowid IN (SELECT rowid FROM visitor_days WHERE day<? LIMIT 5000)',day-89);
}
export const pruneVisits=env=>expiredVisits(env,visitDay()).run();
