// Official REST contract, checked 2026-10-20: dev.pika.art/models/pika/pika-audio/…
import {fail} from './db.js';
export const PIKA_ORIGIN='https://api.dev.pika.art';
export function pikaAvailable(env){return env.DUBBING_SOUND_ENABLED==='true'&&env.DUBBING_PAID_API_ENABLED==='true'&&!!env.PIKA_API_KEY;}
export function pikaRequest(cue){
 const music=cue.kind==='bgm',duration=cue.generationSeconds;
 if(!Number.isFinite(duration)||duration<(music?10:1)||duration>(music?30:20))fail(400,'Pika 음향 생성 길이를 확인해주세요.');
 return {model:music?'pika/pika-audio/pika-music':'pika/pika-audio/pika-sfx',body:{
  prompt:music?`Instrumental only. No vocals, no singing, no speech. ${cue.prompt}`:cue.prompt,duration,seed:-1,
  ...(music?{mode:'text_to_music',lyrics:'',rewrite_prompt:false}:{})}};
}
export function pikaAudioURL(value){
 let u;try{u=new URL(value);}catch{fail(502,'Pika 음향 다운로드 주소가 올바르지 않습니다.');}
 // Only the documented Pika media CDN. Never forward the API key to this URL.
 if(u.protocol!=='https:'||u.hostname!=='cdn.pika.art'||u.port||u.username||u.password)fail(502,'지원하지 않는 Pika 음향 저장소입니다.');
 return u.href;
}
function job(data){
 if(!data||!/^media_[\w-]{1,160}$/.test(data.id)||!['queued','running','completed','failed'].includes(data.status))fail(502,'Pika 작업 응답을 확인하지 못했습니다.');
 const billing=data.billing&&typeof data.billing==='object'?data.billing:null;
 const charge=billing?.charge_micro_usd;
 let url=null,invalidOutput=false;
 if(data.status==='completed'){try{url=pikaAudioURL(data.output?.audio?.url);}catch{invalidOutput=true;}}
 return {id:data.id,status:invalidOutput?'failed':data.status,usage:data.usage&&typeof data.usage==='object'?data.usage:null,
  billing:{state:typeof billing?.state==='string'?billing.state:null,chargeMicroUsd:Number.isSafeInteger(charge)&&charge>=0?charge:null},
  url,errorCode:invalidOutput?'invalid_audio_url':typeof data.error?.code==='string'?data.error.code:null};
}
export async function pikaSubmit(env,cue,requestId,fetcher=fetch){
 if(!pikaAvailable(env))fail(503,'Pika 연동 또는 유료 API 실행 승인을 기다리고 있습니다.');
 const r=pikaRequest(cue),response=await fetcher(`${PIKA_ORIGIN}/v1/media/${r.model}`,{
  method:'POST',headers:{'X-API-Key':env.PIKA_API_KEY,'Content-Type':'application/json','Idempotency-Key':requestId},
  body:JSON.stringify(r.body),signal:AbortSignal.timeout(45000),redirect:'error'});
 // Rejections can carry a real job ID and billing; preserve that envelope too.
 const data=await response.json();if(!data?.id)fail(502,'Pika 요청 결과를 확인하지 못했습니다. 자동으로 재결제하지 않습니다.');
 return job(data);
}
export async function pikaPoll(env,providerId,fetcher=fetch){
 if(!env.PIKA_API_KEY||!/^media_[\w-]{1,160}$/.test(providerId))fail(503,'Pika 작업 조회 설정이 필요합니다.');
 const response=await fetcher(`${PIKA_ORIGIN}/v1/media/jobs/${providerId}`,{headers:{'X-API-Key':env.PIKA_API_KEY},signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!response.ok)fail(502,'Pika 작업 상태를 일시적으로 확인하지 못했습니다.');
 const result=job(await response.json());if(result.id!==providerId)fail(502,'Pika 작업 식별자가 일치하지 않습니다.');return result;
}
