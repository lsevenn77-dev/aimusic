import {fail,one} from './db.js';
// The first recording owns its guide; joiners inherit it and cannot replace it.
export async function validateDuetGuide(env,value,original){
 if(value==null)return '';if(typeof value!=='object'||Array.isArray(value)||value.version!==1||!['free','lyrics'].includes(value.mode))fail(400,'듀엣 파트 안내를 확인해주세요.');
 const job=await one(env,'SELECT words FROM karaoke_jobs WHERE track_id=?',original.id),words=JSON.parse(job?.words||'[]'),duration=original.duration||600;
 const lines=value.lines??[];if(!Array.isArray(lines)||lines.length>1000||lines.length>words.length||lines.some(p=>!['','A','B','both'].includes(p)))fail(400,'가사 파트는 A·B·함께로 지정해주세요.');
 if(value.mode==='lyrics'&&(lines.length!==words.length||!lines.length||lines.some(p=>!p)||!lines.some(p=>p==='A'||p==='both')||!lines.some(p=>p==='B'||p==='both')))fail(400,'모든 가사의 파트와 두 사람이 부를 부분을 지정해주세요.');
 const guide={version:1,mode:value.mode,lines};
 if(value.mode==='free'&&value.activity!==undefined){const activity=value.activity;if(!Array.isArray(activity)||activity.length>600)fail(400,'음성 구간 안내를 확인해주세요.');let last=0;for(const r of activity){if(!r||!Number.isFinite(r.s)||!Number.isFinite(r.e)||r.s<last||r.e<=r.s||r.e>Math.min(600,duration)+.1)fail(400,'음성 구간 안내를 확인해주세요.');last=r.e;}guide.activity=activity.map(r=>({s:Math.round(r.s*100)/100,e:Math.round(r.e*100)/100}));}
 return JSON.stringify(guide);
}
export function readDuetGuide(value){try{return value?JSON.parse(value):null;}catch{return null;}}
