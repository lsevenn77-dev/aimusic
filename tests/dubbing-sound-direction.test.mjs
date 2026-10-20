import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {sampleScript,options,memoryBucket} from './dubbing-fixtures.mjs';
import {dubbingTimeline,dubbingSoundTimeline,validateDubbingScript} from '../shared/dubbing.js';
import {generateDubbingScript,generateDubbingSoundPlan} from '../server/dubbing-ai.js';
import {pikaRequest} from '../server/dubbing-pika.js';

function drama(){
 const s=sampleScript();
 s.lines=Array.from({length:8},(_,i)=>({...s.lines[i%2],id:'line_'+i,order:i+1,durationSeconds:10,gapSeconds:1}));
 s.soundCues=[{...s.soundCues[0],id:'door',kind:'sfx',lineId:'line_3',anchor:'start',durationSeconds:2,generationSeconds:2,volume:.3}];
 return s;
}
function music(s,id,use,line=0){return {...s.soundCues[0],id,kind:'bgm',musicUse:use,lineId:s.lines[line].id,anchor:line?'start':'scene',durationSeconds:20,generationSeconds:20,volume:.45,fadeInSeconds:1,fadeOutSeconds:1};}

test('legacy full-scene BGM becomes a quiet opening without moving speech, SFX or the recording clock',()=>{
 const s=drama(),bg=music(s,'score',undefined);bg.endLineId=s.lines.at(-1).id;s.soundCues.push(bg);
 const before=structuredClone(s),raw=dubbingTimeline(s),directed=dubbingSoundTimeline(s),score=directed.sounds.find(c=>c.kind==='bgm');
 assert.equal(raw.sounds.find(c=>c.kind==='bgm').durationSeconds,90);
 assert.equal(score.durationSeconds,5);assert.equal(score.volume,.1);assert.equal(score.start,0);assert.equal(score.generationSeconds,10);
 assert.deepEqual(directed.lines,raw.lines);assert.equal(directed.duration,raw.duration);
 assert.deepEqual(directed.sounds.find(c=>c.kind==='sfx'),raw.sounds.find(c=>c.kind==='sfx'));
 assert.deepEqual(s,before,'already saved script is not rewritten');
});
test('music appears only as separated intro, pre-twist and ending accents, bounded to 20 percent even for short scripts',()=>{
 for(const short of [false,true]){
  const s=drama();if(short)s.lines.forEach(l=>{l.durationSeconds=2;l.gapSeconds=.5;});
  s.soundCues.push(music(s,'intro','intro'),music(s,'turn','transition',4),music(s,'end','outro',7));
  const timeline=dubbingSoundTimeline(s),scores=timeline.sounds.filter(c=>c.kind==='bgm');
  assert.equal(scores.length,3);
  assert.ok(scores.reduce((n,c)=>n+c.durationSeconds,0)<=Math.min(24,timeline.duration*.2)+.01);
  assert.equal(scores[0].start,0);assert.equal(scores[1].end,timeline.lines[4].start);assert.equal(scores[2].end,timeline.duration);
  for(const [i,c] of scores.entries()){
   assert.ok(c.volume<=.1);assert.ok(c.durationSeconds<=5);assert.ok(c.generationSeconds<=10);
   if(i)assert.ok(c.start-scores[i-1].end>=2);
   assert.equal(pikaRequest(c).body.duration,10);
  }
 }
});
test('ordinary middle dialogue gets no inferred score; an explicit climax is still brief and quiet',()=>{
 const s=drama();s.soundCues.push(music(s,'middle',undefined,3));
 assert.ok(dubbingSoundTimeline(s).sounds.every(c=>c.kind!=='bgm'));
 s.soundCues[1].musicUse='climax';
 const score=dubbingSoundTimeline(s).sounds.find(c=>c.kind==='bgm');
 assert.equal(score.durationSeconds,12);assert.equal(score.volume,.14);assert.equal(score.generationSeconds,12);
 assert.match(pikaRequest(score).body.prompt,/brief cinematic climax/);
 s.soundCues[1].musicUse='invalid';assert.throws(()=>validateDubbingScript(s,{...options,minutes:2}),/용도/);
});
test('both AI writing paths request sparse music and concrete event effects',async()=>{
 const s=drama(),requests=[],fetcher=async(url,init)=>{
  const body=JSON.parse(init.body);requests.push(body);
  const result=body.text.format.name==='aifect_sound_plan'?{soundCues:s.soundCues}:s;
  return Response.json({id:'resp_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}],usage:{}});
 };
 const env={DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'mock-only'},opts={...options,minutes:1.5};
 await generateDubbingScript(env,opts,fetcher);await generateDubbingSoundPlan(env,s,opts,fetcher);
 for(const body of requests){assert.match(body.instructions,/실제 사건의 SFX/);assert.match(body.instructions,/반전이 없으면 transition을 생략/);assert.match(body.instructions,/20%와 24초/);assert.doesNotMatch(body.instructions,/volume은 BGM 0.3/);}
});
test('new sound jobs persist the restrained mix rather than passing an old full score to Pika',async t=>{
 const f=await fixture(t,{DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_PAID_API_ENABLED:'true',PIKA_API_KEY:'mock-only',TRANSCODER_TOKEN:'fixture',BUCKET:memoryBucket()});
 const s=drama();s.soundCues.push({...music(s,'score',undefined),endLineId:s.lines.at(-1).id});
 const p=(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options:{...options,minutes:2},script:s})).body.project;
 const r=await f.call('/api/dubbing/projects/'+p.id+'/sound','POST',{requestId:crypto.randomUUID(),revision:p.revision,mode:'ai',acceptedGold:50,acceptedChargeGold:0});
 assert.equal(r.status,202,JSON.stringify(r));
 const timeline=JSON.parse(f.sql.prepare('SELECT timeline_json FROM dubbing_sound_jobs').get().timeline_json);
 assert.equal(timeline.sounds.find(c=>c.kind==='bgm').durationSeconds,5);
 assert.equal(timeline.sounds.find(c=>c.kind==='bgm').volume,.1);
 assert.equal(timeline.sounds.find(c=>c.kind==='sfx').start,dubbingTimeline(s).sounds[0].start);
});
test('list badges reflect completed audible effects, including inherited audio, never cues alone or silent tracks',async t=>{
 const bucket=memoryBucket(),f=await fixture(t,{DUBBING_ENABLED:'true',BUCKET:bucket});
 const p=(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()})).body.project;
 await f.call('/api/dubbing/projects/'+p.id+'/publish','POST',{revision:1,rightsAccepted:true});
 f.sql.prepare("UPDATE dubbing_projects SET state='complete' WHERE id=?").run(p.id);
 const badge=async()=>{const r=await f.call('/api/dubbing/projects?tab=complete');assert.equal(r.status,200);return r.body.projects.find(x=>x.id===p.id).hasSoundEffects;};
 assert.equal(await badge(),false,'script cues are not generated audio');
 const key=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(p.id).script_key;
 const timeline=dubbingTimeline(sampleScript());await bucket.put('fixture-bg',new Uint8Array([1,2,3]));
 f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES(?,?,?,'ai',?,'generating','fixture-bg',0,0)").run(crypto.randomUUID(),p.id,key,JSON.stringify(timeline));
 assert.equal(await badge(),false);
 f.sql.exec("UPDATE dubbing_sound_jobs SET state='ready'");assert.equal(await badge(),true);
 const child=crypto.randomUUID();assert.equal((await f.call('/api/dubbing/projects/'+p.id+'/performances','POST',{id:child,roleId:'role_1'},'other')).status,201);
 const mine=(await f.call('/api/dubbing/projects?tab=mine','GET',null,'other')).body.projects;
 assert.equal(mine.find(x=>x.id===child).hasSoundEffects,true,'copied audio needs no provider asset rows');
 f.sql.prepare("UPDATE dubbing_sound_jobs SET mode='basic' WHERE project_id=?").run(p.id);assert.equal(await badge(),false);
 f.sql.prepare("UPDATE dubbing_sound_jobs SET mode='ai',timeline_json=? WHERE project_id=?").run(JSON.stringify({...timeline,sounds:[]}),p.id);assert.equal(await badge(),false);
 timeline.sounds[0].volume=0;f.sql.prepare('UPDATE dubbing_sound_jobs SET timeline_json=? WHERE project_id=?').run(JSON.stringify(timeline),p.id);assert.equal(await badge(),false);
 timeline.sounds[0].volume=.3;timeline.sounds[0].kind='bgm';f.sql.prepare('UPDATE dubbing_sound_jobs SET timeline_json=? WHERE project_id=?').run(JSON.stringify(timeline),p.id);assert.equal(await badge(),false,'music alone is not an effect');
 f.sql.prepare("UPDATE dubbing_sound_jobs SET script_key='old-script' WHERE project_id=?").run(p.id);assert.equal(await badge(),false);
});
