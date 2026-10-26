import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';

async function setup(t){
 const f=await fixture(t,{DUBBING_ENABLED:'true',BUCKET:memoryBucket()});
 f.sql.exec("UPDATE tracks SET karaoke_at=1; INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','Friend',0)");
 const cover=(id,{mode='solo',parent=null,open=0,created=10,status='published',owner='other'}={})=>f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id,duet_open) VALUES(?,?,'artist',?,?,'Rock','',1,'wav',128,?,?,'cover','one',?,?,?)").run(id,owner,owner==='other'?'friend':'producer',id,created,status,mode,parent,open);
 cover('solo');cover('half',{mode:'duet',open:1});cover('duet',{mode:'duet',parent:'half',created:20});cover('closed-half',{mode:'duet'});cover('private',{status:'hidden'});cover('processing',{status:'processing'});
 const dub=async(title,{state='complete',visibility='public',created=30,ready=true,who='other'}={})=>{
  const id=crypto.randomUUID(),script={...sampleScript(),title};
  const made=await f.call('/api/dubbing/projects','POST',{id,options,script},who);assert.equal(made.status,201,JSON.stringify(made));
  f.sql.prepare('UPDATE dubbing_projects SET state=?,visibility=?,created=?,updated=? WHERE id=?').run(state,visibility,created,created+100,id);
  const key=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(id).script_key;
  if(state==='complete'&&ready)f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,manifest_json,state,output_key,created,updated) VALUES(?,?,?,'{}','ready','qa-final',?,?)").run(crypto.randomUUID(),id,key,created,created+100);
  return {id,key};
 };
 return {...f,cover,dub};
}
test('PLAY returns only complete public covers and playable dubbings; originals, drafts and duet halves stay out',async t=>{
 const f=await setup(t),complete=await f.dub('완성 더빙');
 await f.dub('비공개',{visibility:'private'});await f.dub('미완성',{state:'recording'});await f.dub('오디오 없음',{ready:false});
 const r=await f.call('/api/play/works');assert.equal(r.status,200);
 assert.deepEqual(r.body.works.map(w=>w.id),[complete.id,'duet','solo']);
 assert.equal((await f.call('/api/play/works?type=solo')).body.works[0].id,'solo');
 assert.deepEqual((await f.call('/api/play/works?type=duet')).body.works.map(w=>w.id),['duet']);
 assert.equal((await f.call('/api/play/works?type=dubbing')).body.works.length,1);
 assert.equal((await f.call('/api/play/works','POST',{})).status,405);
 assert.equal((await f.call('/api/play/works?type=original')).status,400);
});
test('following uses creator follows only and respects logout, blocking, original visibility and moderation',async t=>{
 const f=await setup(t),d=await f.dub('팔로잉 작품');
 assert.equal((await f.call('/api/play/works?tab=following','GET',null,null)).status,401);
 f.sql.exec("INSERT INTO follows VALUES('owner','artist','artist',0)");
 assert.equal((await f.call('/api/play/works?tab=following')).body.works.length,0,'an AI artist follow is not a creator follow');
 f.sql.exec("INSERT INTO follows VALUES('owner','producer','friend',0)");
 assert.deepEqual((await f.call('/api/play/works?tab=following')).body.works.map(w=>w.id),[d.id,'duet','solo']);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 assert.deepEqual((await f.call('/api/play/works?tab=following')).body.works.map(w=>w.id),[d.id]);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',0)");
 assert.equal((await f.call('/api/play/works?tab=following')).body.works.length,0);
});
test('participation lists only ready projects with a free role and excludes the current participant',async t=>{
 const f=await setup(t),open=await f.dub('모집',{state:'recruiting'}),full=await f.dub('정원 완료',{state:'recording'});
 for(const p of [open,full])f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES(?,?,?,'basic','{}','ready','qa',0,0)").run(crypto.randomUUID(),p.id,p.key);
 f.sql.prepare("INSERT INTO dubbing_role_claims VALUES(?,'role_1','other',0)").run(open.id);
 for(const [role,uid] of [['role_1','owner'],['role_2','other']])f.sql.prepare('INSERT INTO dubbing_role_claims VALUES(?,?,?,0)').run(full.id,role,uid);
 await f.dub('배경 대기',{state:'recruiting'});await f.dub('완료');
 assert.deepEqual((await f.call('/api/play/participate')).body.projects.map(p=>p.id),[open.id]);
 assert.equal((await f.call('/api/play/participate','GET',null,'other')).body.projects.length,0);
});
test('mixed paging remains globally ordered, no duplicates, and popular uses existing likes/plays',async t=>{
 const f=await setup(t);for(let i=0;i<30;i++)f.cover('song-'+i,{created:100+i});
 const d=await f.dub('오래된 대본의 새 완성작',{created:25});
 const first=(await f.call('/api/play/works?tab=latest')).body,second=(await f.call('/api/play/works?tab=latest&offset='+first.nextOffset)).body;
 const all=[...first.works,...second.works];assert.equal(new Set(all.map(w=>w.id)).size,33);assert.ok(all.every((w,i)=>!i||all[i-1].publishedAt>=w.publishedAt));assert.ok(first.works.some(w=>w.id===d.id));
 f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('owner','solo',0)");
 assert.equal((await f.call('/api/play/works?tab=popular')).body.works[0].id,'solo');
 assert.deepEqual((await f.call('/api/play/works?q=solo')).body.works.map(w=>w.id),['solo']);
});
test('latest MR requires the existing singable conditions',async t=>{
 const f=await setup(t);f.sql.exec("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('two','ready','ready',1,'ready',0,0); UPDATE tracks SET created=50 WHERE id='two'");
 assert.deepEqual((await f.call('/api/play/latest')).body.tracks.map(w=>w.id),['two']);
});
test('all navigation aliases preserve engine entry routes and return stable URLs',()=>{
 const c=vm.createContext({URLSearchParams});vm.runInContext(readFileSync(new URL('../dist/play-page.js',import.meta.url),'utf8'),c);
 assert.equal(c.playAlias('#community/following'),null);
 assert.equal(c.playAlias('#community/covers?mode=solo'),'#karaoke/browse?tab=recommended&type=solo');
 assert.equal(c.playAlias('#community/covers?mode=duet'),'#karaoke/browse?tab=recommended&type=duet');
 assert.equal(c.playAlias('#dubbing?tab=mine'),'#karaoke/dubbing?tab=mine');
 for(const route of ['#sing/one?duet=half','#sing/one?draft=1','#dubbing/new?mode=manual','#dubbing/id?record=1','#song/one?covers=duet'])assert.equal(c.playAlias(route),null);
 for(const mode of ['song','dubbing','browse'])for(const [key] of vm.runInContext('playSections.'+mode,c)){const href=c.playHref(mode,key),raw=href.slice(1),param=raw.split('/')[1]?.split('?')[0];assert.equal(c.playSelection(param,raw).tab,key);}
});
