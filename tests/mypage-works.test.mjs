import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';

test('profile counts completed public children of the exact duet parent and preserves join ownership',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET karaoke_at=1; INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','job','ready',1,'ready',0,0)");
 const seed=(id,owner,parent,open,status='published')=>f.sql.prepare("INSERT INTO tracks(id,user_id,producer_id,artist_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id,duet_open) VALUES(?,?,'producer','artist',?,'Rock','',1,'wav',128,0,?,'cover','one','duet',?,?)").run(id,owner,id,status,parent,open);
 seed('parent','owner',null,1);seed('child','other','parent',0);seed('draft','other','parent',0,'hidden');seed('unfinished','other','parent',1);seed('unrelated','other',null,0);
 const get=async user=>(await f.call('/api/producers/producer?dashboard=1','GET',undefined,user)).body.covers.find(t=>t.id==='parent');
 const own=await get('owner'),visitor=await get('other'),guest=await get(null);
 assert.equal(own.completions,1);assert.equal(own.participants,1);assert.equal(own.can_join,false);assert.equal(visitor.can_join,true);assert.equal(guest.can_join,false);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',0)");
 assert.equal((await get('owner')).completions,0);
});

test('dubbing children exclude drafts, unavailable mixes, private, unrelated and moderated works',async t=>{
 const f=await fixture(t,{DUBBING_ENABLED:'true',BUCKET:memoryBucket()});
 const seed=async(title,root=null,state='complete',visibility='public',ready=true)=>{
  const id=crypto.randomUUID(),r=await f.call('/api/dubbing/projects','POST',{id,options,script:{...sampleScript(),title}});assert.equal(r.status,201);
  f.sql.prepare('UPDATE dubbing_projects SET root_id=?,state=?,visibility=? WHERE id=?').run(root,state,visibility,id);
  const key=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(id).script_key;
  if(ready)f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,manifest_json,state,output_key,created,updated) VALUES(?,?,?,'{}','ready','final',0,0)").run(crypto.randomUUID(),id,key);
  return id;
 };
 const root=await seed('원본'),child=await seed('완성 참여작',root);
 await seed('다른 작품');await seed('초안',root,'recording');await seed('비공개',root,'complete','private');await seed('믹스 대기',root,'complete','public',false);
 const r=await f.call('/api/dubbing/projects/'+root+'/completed');assert.equal(r.status,200);assert.deepEqual(r.body.items.map(t=>t.id),[child]);assert.equal(r.body.total,1);
 const profile=await f.call('/api/producers/producer?dashboard=1');assert.equal(profile.status,200);assert.equal(profile.body.dubbings.find(t=>t.id===root).completions,1);
 const key=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(root).script_key;
 f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES(?,?,?,'manual','{}','ready','background',0,0)").run(crypto.randomUUID(),root,key);
 const reusable=(await f.call('/api/producers/producer?dashboard=1')).body.dubbings.find(t=>t.id===root);assert.equal(reusable.can_join,true,'completed public roots retain the existing new-performance path');
 f.sql.prepare("UPDATE dubbing_projects SET owner_id='other' WHERE id=?").run(child);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',0)");
 assert.equal((await f.call('/api/dubbing/projects/'+root+'/completed')).body.total,0);
 f.sql.exec('DELETE FROM user_blocks');
 f.sql.prepare("UPDATE dubbing_projects SET deleted_at=1 WHERE id=?").run(child);
 assert.equal((await f.call('/api/dubbing/projects/'+root+'/completed')).body.total,0);
 assert.equal((await f.call('/api/dubbing/projects/'+root+'/completed?offset=-1')).status,400);
 f.sql.prepare("UPDATE dubbing_projects SET visibility='private' WHERE id=?").run(root);
 assert.equal((await f.call('/api/dubbing/projects/'+root+'/completed','GET',undefined,'other')).status,404);
});

test('profile uses song rows, separates actions, hides unavailable joins and removes category icons',()=>{
 const c=vm.createContext({esc:String,number:String,time:()=> '0:45',cover:()=>'<img>',liked:()=>false,icon:n=>`<svg data-icon="${n}"></svg>`,me:{id:'viewer'},document:{addEventListener(){}},window:{addEventListener(){}},AifectDubbing:{dubbingGenreArtwork:()=>'/art'},opportunityHref:()=> '#karaoke'});
 for(const file of ['song-covers.js','mypage.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),c);
 const t={id:'parent',title:'제목',kind:'cover',producer:'가수',cover_mode:'duet',duet_open:1,original_id:'original',participants:2,completions:3,can_join:true};
 const html=c.myWorkItemHTML(t);assert.match(html,/song-cover-row/);assert.match(html,/data-mp-children="parent"/);assert.match(html,/#sing\/original\?duet=parent/);assert.match(html,/data-icon="play"/);assert.match(html,/data-play="parent"/);assert.doesNotMatch(c.myWorkItemHTML({...t,can_join:false}),/참여하기/);
 assert.doesNotMatch(c.myWorkItemHTML({...t,completions:0,participants:0}),/id="mp-children|data-mp-children/);
 const works=c.myWorksHTML({profile:{id:'p'},covers:[t],tracks:[],dubbings:[]});assert.doesNotMatch(works.match(/class="mp-filters"[\s\S]*?<\/div>/)[0],/<svg/);assert.match(works,/mp-work-list/);
 assert.match(c.myWorkItemHTML({...t,status:'hidden'}),/#manage\/parent/);assert.doesNotMatch(c.myWorkItemHTML({...t,status:'hidden'}),/data-play=/);
});
