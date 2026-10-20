import {fault} from './protocol.js';
export class Sfu {
 constructor(env, fetcher=fetch) { this.env=env;this.fetcher=(...args)=>fetcher(...args); }
 async call(path, method='POST', body) {
  if(!this.env.REALTIME_SFU_APP_ID||!this.env.REALTIME_SFU_APP_SECRET)fault(503,'음성 서버 설정을 준비하고 있어요.');
  let response,result;
  try {
   response=await this.fetcher(`https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(this.env.REALTIME_SFU_APP_ID)}${path}`,{method,headers:{authorization:`Bearer ${this.env.REALTIME_SFU_APP_SECRET}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(path.endsWith('/tracks/new')?12000:8000)});
   result=await response.json();
  }catch(error){const timeout=['TimeoutError','AbortError'].includes(error?.name);console.warn(JSON.stringify({event:'voice_sfu_failure',operation:path.replace(/sessions\/(?!new$)[^/]+/,'sessions/[session]'),kind:error?.name||'network',reason:timeout?'timeout':/illegal invocation/i.test(error?.message||'')?'illegal_invocation':error instanceof SyntaxError?'invalid_json':'request_failed'}));throw Object.assign(new Error(timeout?'음성 서버 응답이 지연돼요. 연결을 정리하고 있어요.':'음성 서버에 연결하지 못했어요. 다시 시도해주세요.'),{status:502,sfuUncertain:true});}
  if(!response.ok||result.errorCode){console.warn(JSON.stringify({event:'voice_sfu_failure',status:response.status,code:result.errorCode||'http_error'}));throw Object.assign(new Error('음성 서버 연결에 실패했어요. 다시 연결해주세요.'),{status:502,sfuUncertain:true,sessionGone:response.status===410&&result.errorCode==='session_error'});}
  return result;
 }
 async create() {const r=await this.call('/sessions/new');if(typeof r.sessionId!=='string'||!r.sessionId)fault(502,'음성 세션을 만들지 못했어요.');return r.sessionId;}
 tracks(session, body) {return this.call(`/sessions/${encodeURIComponent(session)}/tracks/new`,'POST',body);}
 answer(session, description) {return this.call(`/sessions/${encodeURIComponent(session)}/renegotiate`,'PUT',{sessionDescription:description});}
 async close(session, mids, media={}) {
  // Inspect as well: a timed-out publication may have allocated a track without returning its mid.
  let state;try{state=await this.call(`/sessions/${encodeURIComponent(session)}`,'GET');}catch(e){if(e.sessionGone)return {resolved:true};throw e;}
  const tracks=state.tracks||[],inactive=new Set(tracks.filter(t=>t.status==='inactive').map(t=>t.mid));
  const all=[...new Set([...mids,...tracks.map(t=>t.mid).filter(Boolean)])].filter(mid=>!inactive.has(mid));
  if(all.length){
   const r=await this.call(`/sessions/${encodeURIComponent(session)}/tracks/close`,'PUT',{force:true,tracks:all.map(mid=>({mid}))});
   if(r.errorCode||r.tracks?.some(t=>t.errorCode&&t.errorCode!=='close_track_error')||r.requiresImmediateRenegotiation)fault(502,'음성 연결을 정리하는 중이에요.');
  }
  // An empty GET cannot settle a lost tracks/new response. This fresh session had
  // exactly one allocation request; retain the job until all its tracks are seen
  // and closed, or Cloudflare explicitly reports the session as expired (410).
  return {resolved:!media.uncertain||tracks.length>=(media.expected||1)};
 }
}
