import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {memoryBucket} from './dubbing-fixtures.mjs';
import {emptyDubbingScript,dubbingTimeline} from '../shared/dubbing.js';
import {encodeWav} from '../shared/karaoke-audio.js';
import {hash} from '../server/auth.js';
import {CASTING_LICENSE} from '../server/dubbing-casting.js';
import worker from '../server/index.js';

export async function castingFixture(t,n=3){
 const BUCKET=memoryBucket(),env={BUCKET,DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',TRANSCODER_TOKEN:'fixture-only'};
 const f=await fixture(t,env);env.DB=f.DB;
 for(let i=2;i<=7;i++){const uid='actor'+i;f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@example.test','테스트 배우 '+i);f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash(uid),uid,Math.floor(Date.now()/1000)+3600);}
 const options={genres:['공포'],roleCount:n,minutes:1,mood:'유쾌하게',ending:'해피엔딩',idea:''},script=emptyDubbingScript(options);script.title='[로컬 테스트] 닫힌 복도의 노크';
 script.roles.forEach((r,i)=>{r.name=['지훈','서연','의사','간호사','환자','경비'][i];r.personality='침착하게 상황을 확인하는 배역';});
 script.lines.forEach((l,i)=>{l.id='line_'+(i+1);l.text='[로컬 테스트] 문 밖에서 누군가 우리를 기다리고 있어요.';l.durationSeconds=5;});
 const created=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script});assert.equal(created.status,201,JSON.stringify(created.body));
 let p=created.body.project;p=(await f.call(`/api/dubbing/projects/${p.id}/publish`,'POST',{revision:p.revision,rightsAccepted:true})).body.project;
 p=(await f.call(`/api/dubbing/projects/${p.id}/claims/role_1`,'POST',{revision:p.revision})).body.project;
 const root=p.id,sk=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(root).script_key;
 const wav=encodeWav([Float32Array.from({length:48000},(_,i)=>.1*Math.sin(i*.05))],48000);await BUCKET.put('background',wav);
 f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES('bg',?,?,'basic',?,'ready','background',0,0)").run(root,sk,JSON.stringify(dubbingTimeline(p.script)));
 async function take(pid,role,user){
  const sid=f.sql.prepare('SELECT id FROM dubbing_sound_jobs WHERE project_id=?').get(pid).id;
  const started=await f.call(`/api/dubbing/projects/${pid}/recording/${role}/start`,'POST',{soundId:sid},user);assert.equal(started.status,200,JSON.stringify(started.body));
  let rev=1;for(const l of p.script.lines.filter(l=>l.roleId===role)){
   const r=await worker.fetch(new Request(`https://aifect.test/api/dubbing/projects/${pid}/recording/${role}/lines/${l.id}?revision=${rev}&take=${crypto.randomUUID()}`,{method:'PUT',headers:{origin:'https://aifect.test',cookie:'aifect_session='+user,'content-type':'audio/wav'},body:wav}),env,{waitUntil(p){p.catch(()=>{});}});assert.equal(r.status,200,await r.text());rev++;
  }return rev;
 }
 const submit=(pid,role,user,revision=2,extra={})=>f.call(`/api/dubbing/projects/${pid}/recording/${role}/submit`,'POST',{revision,visibility:'public',rightsAccepted:true,licenseVersion:CASTING_LICENSE,...extra},user);
 async function base(){const rev=await take(root,'role_1','owner');const r=await submit(root,'role_1','owner',rev);assert.equal(r.status,200,JSON.stringify(r.body));}
 async function draft(role,user,targetId){const r=await f.call(`/api/dubbing/casting/${root}/start`,'POST',{id:crypto.randomUUID(),roleId:role,targetId},user);assert.equal(r.status,201,JSON.stringify(r.body));const pid=r.body.projectId;return {pid,rev:await take(pid,role,user)};}
 return {...f,env,root,p,base,draft,submit,take};
}
