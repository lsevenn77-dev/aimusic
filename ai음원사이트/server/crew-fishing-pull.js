import {one,fail} from './db.js';
import {position,progressAfter,IDLE_MS} from '../dist/crew-fishing/rules.js';
import {inputElapsed} from '../dist/crew-fishing/timing.js';

// Replay the displayed frames in order, then commit once. A retry of the same
// sequence cannot grant another hit. Never use client-supplied score or status.
export async function fishingPull(env,uid,body,{ms,receivedTime}){
  if(typeof body?.id!=='string'||!Number.isSafeInteger(body.seq)||body.seq<1)fail(400,'올바르지 않은 당기기 요청입니다.');
  const find=()=>one(env,`SELECT f.* FROM crew_fishing_casts f JOIN crew_members m ON m.user_id=f.user_id AND m.crew_id=f.crew_id WHERE f.id=? AND f.user_id=?`,body.id,uid);
  const first=await find();
  if(!first)fail(404,'낚시 기록을 찾지 못했습니다.');
  if(first.status!=='active')return first;
  const batch=body.batch!==undefined;
  const frames=batch?body.batch:[body];
  if(!Array.isArray(frames)||!frames.length||frames.length>24||
    frames.some((f,i)=>!f||f.seq!==body.seq+i||(batch&&(f.timeout!==undefined||!Number.isFinite(f.elapsed)))))fail(400,'올바르지 않은 당기기 요청입니다.');
  if(frames.at(-1).seq<=first.seq)return first;
  if(body.seq>first.seq+1)fail(409,'도전 상태를 다시 확인해 주세요.');
  let last=first.end_ms??first.start_ms,seq=first.seq,pass=first.last_pass;
  let state={status:'active',progress:first.progress,warnings:first.warnings,goal:first.goal},idle=false;
  const elapsedAt=receivedTime-first.start_ms;
  if(batch&&(!Number.isFinite(body.sentElapsed)||body.sentElapsed>elapsedAt+250||body.sentElapsed<elapsedAt-3000))fail(409,'연결이 지연되어 이번 입력을 판정하지 않았습니다.');
  for(const f of frames){
    if(f.seq<=seq)continue;
    if(!batch&&f.timeout===true){if(receivedTime>=last+IDLE_MS)idle=true;break;}
    let elapsed;
    try{
      if(batch){
        elapsed=f.elapsed;
        if(elapsed<0||elapsed>Math.min(elapsedAt+250,body.sentElapsed+250)||elapsed<body.sentElapsed-6000)throw Error('연결이 지연되어 이번 입력을 판정하지 않았습니다.');
      }else elapsed=inputElapsed({start:first.start_ms},f.elapsed,receivedTime);
    }catch(e){fail(409,e.message);}
    const touched=first.start_ms+elapsed;
    if(elapsed<0||receivedTime<first.start_ms||touched<last)break;
    if(touched>=last+IDLE_MS){idle=true;break;}
    const nextPass=Math.floor(2*elapsed/first.cycle_ms);
    if(nextPass>pass){
      const spot=position(elapsed,first.cycle_ms);
      Object.assign(state,progressAfter(state,spot>=first.target&&spot<=first.target+first.width));
    }
    pass=nextPass;seq=f.seq;last=touched;
    if(state.status!=='active')break;
  }
  if(idle)state.status='escaped';
  if(!idle&&seq===first.seq)return first;
  const row=await one(env,`UPDATE crew_fishing_casts SET progress=?,warnings=?,seq=?,last_pass=?,status=?,end_ms=?,
    notice=CASE WHEN ? THEN 'idle' WHEN ?='caught' THEN CASE
      WHEN NOT EXISTS(SELECT 1 FROM crew_fishing_casts WHERE crew_id=? AND fish=? AND status='caught') THEN 'new'
      WHEN ?>(SELECT MAX(length) FROM crew_fishing_casts WHERE crew_id=? AND fish=? AND status='caught') THEN 'best'
      END END WHERE id=? AND status='active' AND seq=? AND EXISTS(SELECT 1 FROM crew_members WHERE user_id=? AND crew_id=?) RETURNING *`,
    state.progress,state.warnings,seq,pass,state.status,idle?last+IDLE_MS:state.status==='active'?last:ms,
    Number(idle),state.status,first.crew_id,first.fish,first.length,first.crew_id,first.fish,first.id,first.seq,uid,first.crew_id);
  if(row)return row;
  const current=await find();if(!current)fail(404,'낚시 기록을 찾지 못했습니다.');return current;
}
