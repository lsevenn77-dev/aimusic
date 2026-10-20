import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {sampleScript,options,memoryBucket} from './dubbing-fixtures.mjs';
import {dubbingTimeline,validateDubbingScript} from '../shared/dubbing.js';
import {pikaRequest} from '../server/dubbing-pika.js';

test('scene music spans its dialogue range; events start with dialogue and old anchors remain stable',()=>{
 const s=sampleScript(),line=s.lines[0];
 s.lines=Array.from({length:8},(_,i)=>({...s.lines[i%2],id:'line_'+i,durationSeconds:10,gapSeconds:1}));
 const cue={...s.soundCues[0],sceneId:line.sceneId,lineId:'line_0',kind:'bgm',anchor:'scene',endLineId:'line_7',label:'신비로운 공간의 BGM',durationSeconds:20,generationSeconds:20,volume:.4};
 s.soundCues=[cue,{...s.soundCues[0],id:'crack',label:'기둥이 갈라지는 소리',kind:'sfx',lineId:'line_4',anchor:'start',durationSeconds:2,generationSeconds:2}];
 const checked=validateDubbingScript(s,{...options,minutes:2}),timeline=dubbingTimeline(checked);
 assert.equal(timeline.sounds[0].start,0);
 assert.equal(timeline.sounds[0].end,timeline.lines.at(-1).slotEnd);
 assert.ok(timeline.sounds[0].durationSeconds>30);
 assert.equal(pikaRequest(timeline.sounds[0]).body.duration,90);
 assert.equal(timeline.sounds[1].start,timeline.lines[4].start);
 const old=sampleScript(),before=dubbingTimeline(old);
 assert.equal(before.sounds[0].start,0);
 assert.equal(before.sounds[0].end,old.soundCues[0].durationSeconds);
 const bad=structuredClone(s);bad.soundCues[0].endLineId='missing';
 assert.throws(()=>validateDubbingScript(bad,options),/종료 대사/);
 bad.soundCues[0].endLineId='line_7';bad.soundCues[0].kind='sfx';
 assert.throws(()=>validateDubbingScript(bad,options));
});

test('Pika receives separate music/SFX requests with long score support and bounded SFX',()=>{
 const cue=sampleScript().soundCues[0];
 const music=pikaRequest({...cue,kind:'bgm',generationSeconds:120});
 assert.equal(music.body.duration,120);assert.match(music.body.prompt,/No vocals/);
 const fx=pikaRequest({...cue,kind:'sfx',generationSeconds:3});
 assert.match(fx.body.prompt,/Isolated sound effect/);assert.match(fx.body.prompt,/No music/);
 assert.throws(()=>pikaRequest({...cue,kind:'bgm',generationSeconds:301}));
 assert.throws(()=>pikaRequest({...cue,kind:'sfx',generationSeconds:21}));
});

test('a claimed listener can prepare free recording once without spending Gold or replacing paid audio',async t=>{
 const BUCKET=memoryBucket(),f=await fixture(t,{DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',TRANSCODER_TOKEN:'fixture',BUCKET});
 let p=(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()})).body.project;
 const path='/api/dubbing/projects/'+p.id;
 p=(await f.call(path+'/publish','POST',{revision:p.revision,rightsAccepted:true})).body.project;
 assert.equal((await f.call(path+'/recording/prepare','POST',{},'other')).status,403);
 assert.equal((await f.call(path+'/recording/prepare','POST',{},null)).status,401);
 p=(await f.call(path+'/claims/role_1','POST',{revision:p.revision},'other')).body.project;
 const replies=await Promise.all([f.call(path+'/recording/prepare','POST',{},'other'),f.call(path+'/recording/prepare','POST',{},'other')]);
 assert.ok(replies.every(r=>r.status===202),JSON.stringify(replies));
 assert.equal(replies[0].body.sound.id,replies[1].body.sound.id);
 const job=f.sql.prepare('SELECT * FROM dubbing_sound_jobs').get();
 assert.equal(job.mode,'basic');assert.deepEqual(JSON.parse(job.timeline_json).sounds,[]);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_gold_orders').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_provider_usage').get().n,0);
 assert.equal(f.sql.prepare('SELECT first_recorded_at FROM dubbing_projects').get().first_recorded_at,0);
 f.sql.prepare("UPDATE dubbing_sound_jobs SET mode='ai',state='generating' WHERE id=?").run(job.id);
 assert.equal((await f.call(path+'/recording/prepare','POST',{},'other')).body.sound.mode,'ai');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,1);
 f.sql.prepare("UPDATE dubbing_sound_jobs SET state='ready',output_key='bg' WHERE id=?").run(job.id);
 const ready=await f.call(path+'/recording/prepare','POST',{},'other');
 assert.equal(ready.status,200);
 assert.equal((await f.call(path+'/recording/role_1/start','POST',{soundId:ready.body.sound.id},'other')).status,200);
});
