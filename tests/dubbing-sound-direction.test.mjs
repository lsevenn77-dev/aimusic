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

test('new opening ends at first speech, one short climax remains and effects keep their clock',()=>{
 const s=drama();s.soundCues.push(music(s,'intro','intro'),music(s,'repeat_intro','intro'),music(s,'climax','climax',5),music(s,'repeat_climax','climax',6),music(s,'filler','outro',7));
 const before=structuredClone(s),raw=dubbingTimeline(s),directed=dubbingSoundTimeline(s),scores=directed.sounds.filter(c=>c.kind==='bgm');
 assert.deepEqual(scores.map(c=>c.id),['intro','climax']);
 assert.equal(scores[0].start,0);assert.equal(scores[0].end,raw.lines[0].start);assert.equal(scores[0].generationSeconds,10);
 assert.equal(scores[1].start,raw.lines[5].start);assert.equal(scores[1].durationSeconds,15);
 assert.deepEqual(directed.lines,raw.lines);assert.equal(directed.duration,raw.duration);
 assert.deepEqual(directed.sounds.find(c=>c.kind==='sfx'),raw.sounds.find(c=>c.kind==='sfx'));
 assert.deepEqual(s,before,'saved script and already generated files are not rewritten');
});
test('ballroom source music explicitly keeps playing through dialogue',()=>{
 const s=drama(),bg=music(s,'ballroom','diegetic');bg.endLineId=s.lines.at(-1).id;s.soundCues.push(bg);
 const checked=validateDubbingScript(s,{...options,minutes:2}),raw=dubbingTimeline(checked),score=dubbingSoundTimeline(checked).sounds.find(c=>c.kind==='bgm');
 assert.equal(score.durationSeconds,90);assert.equal(score.start,0);assert.equal(score.end,raw.lines.at(-1).slotEnd);assert.equal(score.generationSeconds,90);
 assert.equal(score.volume,.45);assert.equal(pikaRequest(score).body.duration,90);
});
test('unspecified legacy scores are not reused as dialogue beds for new generation',()=>{
 const s=drama();s.soundCues.push(music(s,'old',undefined,3),music(s,'transition','transition',4));
 assert.equal(dubbingSoundTimeline(s).sounds.filter(c=>c.kind==='bgm').length,0);
 assert.equal(dubbingTimeline(s).sounds.filter(c=>c.kind==='bgm').length,2,'legacy playback contract stays intact');
});
test('historical instrument constraints reach the paid provider while SFX prompts stay intact',()=>{
 const s=drama();s.genres=['사극'];const score=music(s,'climax','climax',4);score.prompt='Sad piano melody and synthesizer pad';s.soundCues.push(score);
 const directed=dubbingSoundTimeline(s),musicRequest=pikaRequest(directed.sounds.find(c=>c.kind==='bgm'));
 assert.match(musicRequest.body.prompt,/gayageum/);assert.match(musicRequest.body.prompt,/No piano/);assert.doesNotMatch(musicRequest.body.prompt,/Sad piano melody|synthesizer pad/);
 const fx=directed.sounds.find(c=>c.kind==='sfx');assert.match(pikaRequest(fx).body.prompt,new RegExp(fx.prompt));
});
test('both AI writing paths plan causal detailed effects, reaction timing, silence and earned ending cues',async()=>{
 const s=drama(),requests=[],fetcher=async(url,init)=>{
  const body=JSON.parse(init.body);requests.push(body);
  const result=body.text.format.name==='aifect_sound_plan'?{soundCues:s.soundCues}:s;
  return Response.json({id:'resp_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}],usage:{}});
 };
 const env={DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'mock-only'},opts={...options,minutes:1.5};
 await generateDubbingScript(env,opts,fetcher);await generateDubbingSoundPlan(env,s,opts,fetcher);
 for(const body of requests){assert.match(body.instructions,/대본 작성 단계부터 소리/);assert.match(body.instructions,/그 행동을 장면 설명 또는 연기 지시에 명시/);assert.match(body.instructions,/실제 사건의 SFX/);assert.match(body.instructions,/도입 1회와 실제 절정 장면 1회/);assert.match(body.instructions,/피아노·신시사이저/);assert.match(body.instructions,/diegetic/);assert.match(body.instructions,/빈 배열/);assert.match(body.instructions,/자동 감쇠는 BGM에만/);assert.doesNotMatch(body.instructions,/20%와 24초|0~3개만/);
  assert.match(body.instructions,/몇 번\/어떤 간격/);assert.match(body.instructions,/반응하기 전에 그 소리가 먼저/);assert.match(body.instructions,/마지막 말 뒤의 소리는 after와 짧은 정적/);assert.match(body.instructions,/gapSeconds에 미리 확보/);assert.match(body.instructions,/모든 공포 작품에 귀신이나 비명을 붙이지/);assert.match(body.instructions,/타격과 간격·잔향/);
 }
});
test('new event requests generate only their playback window and preserve SFX timing and music gain',()=>{
 const s=drama();s.soundCues[0].generationSeconds=10;s.soundCues[0].durationSeconds=2.2;s.soundCues.push(music(s,'intro','intro'));
 const raw=dubbingTimeline(s),timeline=dubbingSoundTimeline(s),cue=timeline.sounds.find(c=>c.id==='door');
 assert.equal(cue.generationSeconds,3);assert.equal(pikaRequest(cue).body.duration,3);assert.equal(cue.start,raw.sounds[0].start);assert.equal(cue.durationSeconds,2.2);assert.equal(cue.volume,raw.sounds[0].volume);
 assert.match(pikaRequest(cue).body.prompt,/exact requested count/);assert.match(pikaRequest(cue).body.prompt,/within 2.2 seconds/);assert.match(pikaRequest(cue).body.prompt,/Nonverbal breath/);
 assert.equal(timeline.sounds.find(c=>c.kind==='bgm').volume,.45);assert.deepEqual(timeline.lines,raw.lines);assert.equal(s.soundCues[0].generationSeconds,10);
});
test('new sound jobs preserve source music and its event effect',async t=>{
 const f=await fixture(t,{DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_PAID_API_ENABLED:'true',PIKA_API_KEY:'mock-only',TRANSCODER_TOKEN:'fixture',BUCKET:memoryBucket()});
 const s=drama();s.soundCues.push({...music(s,'score','diegetic'),endLineId:s.lines.at(-1).id});
 const p=(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options:{...options,minutes:2},script:s})).body.project;
 const r=await f.call('/api/dubbing/projects/'+p.id+'/sound','POST',{requestId:crypto.randomUUID(),revision:p.revision,mode:'ai',acceptedGold:50,acceptedChargeGold:0});
 assert.equal(r.status,202,JSON.stringify(r));
 const timeline=JSON.parse(f.sql.prepare('SELECT timeline_json FROM dubbing_sound_jobs').get().timeline_json);
 assert.equal(timeline.sounds.find(c=>c.kind==='bgm').durationSeconds,90);
 assert.equal(timeline.sounds.find(c=>c.kind==='bgm').volume,.45);
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
