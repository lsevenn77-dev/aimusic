import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

async function setup(t){
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET performance_mode='duet',karaoke_at=1,duration=20,lyrics_mode='synced',lyrics='[00:01.00]함께 불러요\\n[00:10.00]다음 파트' WHERE id='one'");
 f.sql.exec("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words,words_state,created,updated) VALUES('one','job','ready',1,'[]','ready',0,0)");
 const body={original_id:'one',extension:'wav',bytes:128,own_voice:true,rights:true,cover_mode:'duet',duet_part:'male',duet_consent:true};
 const create=async(user='other',extra={})=>{const r=await f.call('/api/covers','POST',{...body,...extra},user);assert.equal(r.status,201,JSON.stringify(r.body));f.sql.prepare("UPDATE tracks SET status='published',duration=20 WHERE id=?").run(r.body.id);return r.body.id;};
 return {...f,body,create};
}
test('duet invitation loads the first full mix with the original lyrics and opposite part',async t=>{
 const f=await setup(t),first=await f.create();
 const list=(await f.call('/api/duets','GET',undefined,null)).body.tracks;
 assert.deepEqual(list.map(x=>[x.id,x.cover_mode,x.duet_part,x.duet_open]),[[first,'duet','male',1]]);
 assert.equal((await f.call('/api/duets/'+first,'GET',undefined,null)).status,401);
 const joined=(await f.call('/api/duets/'+first)).body;
 assert.equal(joined.mr,'/media/'+first+'/stream','reuse one existing mix, not a second MR');
 assert.equal(joined.track.id,'one');assert.equal(joined.duet.part,'female');assert.equal(joined.duet.partner.user_id,'other');
 const second=await f.create('owner',{duet_parent_id:first,duet_part:'female'});
 const completed=(await f.call('/api/tracks/'+second)).body.track;
 assert.equal(completed.duet_open,0);assert.equal(completed.duet_partner_id,list[0].producer_id);
 assert.match(completed.artist,/other & QA · 듀엣/);
 assert.equal((await f.call('/api/producers/'+list[0].producer_id)).body.covers.length,2,'both performances appear on the first singer profile');
 assert.deepEqual((await f.call('/api/duets')).body.tracks.map(x=>x.id),[first],'completed duets cannot become an endless mix chain');
 assert.equal((await f.call('/api/duets/'+second)).status,404);
});
test('duet consent, identity, original and empty part are enforced on the server',async t=>{
 const f=await setup(t);
 for(const extra of [{cover_mode:'unknown'},{duet_part:'other'},{duet_consent:false},{cover_mode:'solo'}])assert.equal((await f.call('/api/covers','POST',{...f.body,...extra},'other')).status,400);
 const first=await f.create();
 assert.equal((await f.call('/api/duets/'+first,'GET',undefined,'other')).status,400,'no joining yourself');
 for(const [user,extra] of [['other',{duet_part:'female'}],['owner',{duet_part:'male'}],['owner',{original_id:'two',duet_part:'female'}],['owner',{cover_mode:'solo',duet_part:''}]])assert.equal((await f.call('/api/covers','POST',{...f.body,duet_parent_id:first,...extra},user)).status,400);
 const female=await f.create('owner',{duet_part:'female'});
 assert.equal((await f.call('/api/duets/'+female,'GET',undefined,'other')).body.duet.part,'male');
});
test('hidden/deleted first recordings and original permission revocation hide derived duets and lyrics',async t=>{
 const f=await setup(t),first=await f.create(),second=await f.create('owner',{duet_parent_id:first,duet_part:'female'});
 for(const status of ['hidden','deleted']){
  f.sql.prepare('UPDATE tracks SET status=? WHERE id=?').run(status,first);
  assert.equal((await f.call('/api/duets/'+first)).status,404);
  assert.equal((await f.call('/api/tracks/'+second)).status,404);
  assert.equal((await f.call(`/api/tracks/${second}/lyrics/line?at=2`)).status,404);
 }
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(first);
 f.sql.exec("UPDATE tracks SET karaoke_at=0 WHERE id='one'");
 assert.equal((await f.call('/api/duets')).body.tracks.length,0);
 assert.equal((await f.call('/api/tracks/'+second)).status,404);
});
test('solo/duet filters retain old covers and both membership levels get the original cover lyrics',async t=>{
 const f=await setup(t),duet=await f.create(),solo=await f.create('other',{cover_mode:'solo',duet_part:''});
 assert.deepEqual((await f.call('/api/community?kind=cover&cover_mode=solo')).body.tracks.map(x=>x.id),[solo]);
 assert.deepEqual((await f.call('/api/community?kind=cover&cover_mode=duet')).body.tracks.map(x=>x.id),[duet]);
 assert.equal((await f.call('/api/community?cover_mode=wrong')).status,400);
 const free=(await f.call(`/api/tracks/${duet}/lyrics/line?at=2`)).body;
 assert.match(free.line.text,/함께 불러요/);
 f.sql.exec('UPDATE users SET premium_until=unixepoch()+300 WHERE id=\'owner\'');
 const full=(await f.call('/api/tracks/'+duet)).body.track;
 assert.equal(full.lyrics_mode,'synced');assert.match(full.lyrics,/함께 불러요/);
});
test('browser duet export plays one backing for its entire duration and only the new vocal interval',()=>{
 const played=[];const context=vm.createContext({window:{},document:{addEventListener(){}},JSON});
 vm.runInContext(readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),context);
 const audio={createGain(){return {gain:{},connect(){}};},createBufferSource(){return {connect(){},start(...args){played.push({buffer:this.buffer,args});}};},destination:{},startRendering(){}};
 const s={mode:'duet',mr:{duration:20},voice:{duration:5},mix:{mr:1,voice:1,offset:0}};
 context.audio=audio;context.s=s;vm.runInContext('voiceBuffer=s=>s.voice;scheduleMix(audio,0,0,s)',context);
 assert.equal(played.length,2);assert.equal(played[0].buffer,s.mr);assert.deepEqual(played[0].args,[0,0,20]);assert.deepEqual(played[1].args,[0,0,5]);
 s.mode='solo';played.length=0;vm.runInContext('scheduleMix(audio,0,0,s)',context);assert.equal(played[0].args[2],5);
});

test('song upload persists solo or duet choice and rejects an invalid classification',async t=>{
 const f=await fixture(t);const upload={title:'새 노래',producer:'QA',artist_id:'none',genre:'Rock',ai_tool:'QA',rights:true,is_ai:true,karaoke:true,extension:'wav',bytes:128,lyrics_mode:'none'};
 for(const mode of ['solo','duet']){const r=await f.call('/api/uploads','POST',{...upload,performance_mode:mode});assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(f.sql.prepare('SELECT performance_mode FROM tracks WHERE id=?').get(r.body.id).performance_mode,mode)}
 assert.equal((await f.call('/api/uploads','POST',{...upload,performance_mode:'male'})).status,400);
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'");
 assert.equal((await f.call('/api/covers','POST',{original_id:'one',extension:'wav',bytes:128,own_voice:true,rights:true,cover_mode:'duet',duet_slot:'first',duet_consent:true},'other')).status,201,'every original can be recorded as a duet');
 const edit={...upload,artist_id:'none',performance_mode:'duet'};assert.equal((await f.call('/api/studio/tracks/one','PUT',edit)).status,200);assert.equal((await f.call('/api/tracks/one')).body.track.performance_mode,'duet');
});
test('neutral duet slots let any two people join, including legacy first recordings',async t=>{
 const f=await setup(t),base={...f.body,duet_slot:'first'};delete base.duet_part;
 const first=(await f.call('/api/covers','POST',base,'other')).body.id;assert.ok(first);f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(first);
 assert.equal((await f.call('/api/duets/'+first)).body.duet.slot,'second');
 const join=await f.call('/api/covers','POST',{...base,duet_slot:'second',duet_parent_id:first},'owner');assert.equal(join.status,201,JSON.stringify(join.body));
 const legacy=await f.create('owner',{duet_part:'female'});assert.equal((await f.call('/api/covers','POST',{...base,duet_slot:'second',duet_parent_id:legacy},'other')).status,201);
 assert.equal((await f.call('/api/covers','POST',{...base,duet_slot:'second'},'other')).status,400);
});
test('every original offers solo and duet without singer gender labels',()=>{
 const context=vm.createContext({window:{},document:{addEventListener(){}},JSON,esc:s=>s});vm.runInContext(readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),context);
 context.d={mode:'solo',track:{performance_mode:'solo'}};const solo=vm.runInContext('singModeHTML(d)',context);assert.match(solo,/data-sing-mode="solo"/);assert.match(solo,/data-sing-mode="duet"/);assert.doesNotMatch(solo,/남자|여자/);
 context.d={mode:'duet',track:{performance_mode:'duet'}};const duet=vm.runInContext('singModeHTML(d)',context);assert.match(duet,/>듀엣</);assert.match(duet,/aria-pressed="true"/);assert.doesNotMatch(duet,/남자|여자/);
});
