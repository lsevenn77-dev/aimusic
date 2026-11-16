import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {CREW_ACTIVITIES,CREW_GENRES,CREW_JOIN_LABELS} from '../shared/crew-tags.js';

test('migration preserves existing crews, interests, policies, and memberships',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  const dir=new URL('../drizzle/',import.meta.url);
  const sql=name=>readFileSync(new URL(name,dir),'utf8');
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0104').sort())db.exec(sql(name));
  db.exec("INSERT INTO users(id,name,email,created) VALUES('o','Owner','a@test',0); INSERT INTO crews(id,name,owner_id,created,join_policy,interests) VALUES('a','Existing','o',1,'approval','Original'); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('a','o','owner',1)");
  const read=()=>db.prepare('SELECT c.*,m.role FROM crews c JOIN crew_members m ON m.crew_id=c.id').get();
  const original=read();
  db.exec(sql('0104_crew_activity_tags.sql'));
  assert.deepEqual({...read()},{...original,primary_activity:null,additional_activities:'[]',music_genres:'[]'});
 } finally {db.close();}
});

test('desktop create requires a primary and round trips independent tags; old clients preserve them',async t=>{
 const f=await fixture(t);
 assert.equal(CREW_ACTIVITIES.length,9);
 assert.equal(CREW_GENRES.length,13);
 assert.equal((await f.call('/api/crews?tags=1','POST',{name:'Tagged'})).status,400);
 const tags={primary_activity:'AI 음악 제작',additional_activities:['작사·작곡','친목·소통'],music_genres:['R&B·소울','팝','인디']};
 const created=await f.call('/api/crews?tags=1','POST',{name:'Tagged',...tags,interests:'legacy'});
 assert.equal(created.status,201,JSON.stringify(created.body));
 const path='/api/crews/'+created.body.crew.id;
 await f.call(path,'PATCH',{description:'mobile edit'});
 let crew=(await f.call(path)).body.crew;
 for(const [key,value] of Object.entries(tags))assert.deepEqual(crew[key],value);
 assert.equal(crew.interests,'legacy');
 const before=crew.version;
 for(const invalid of [
  {primary_activity:null},{primary_activity:'unlisted'},{additional_activities:['AI 음악 제작']},
  {additional_activities:['노래방','노래방']},{additional_activities:CREW_ACTIVITIES.slice(1,4)},
  {additional_activities:'노래방'},{music_genres:CREW_GENRES.slice(0,4)},{music_genres:['팝','팝']},{music_genres:['unknown']}
 ])assert.equal((await f.call(path,'PATCH',invalid)).status,400,JSON.stringify(invalid));
 assert.equal((await f.call(path)).body.crew.version,before);
 assert.equal((await f.call(path,'PATCH',{primary_activity:'커버·보컬',additional_activities:[],music_genres:[],version:before})).status,200);
 assert.equal((await f.call(path,'PATCH',{primary_activity:'노래방',version:before})).status,409);
 crew=(await f.call(path)).body.crew;
 assert.equal(crew.primary_activity,'커버·보컬');assert.deepEqual(crew.music_genres,[]);assert.deepEqual(crew.additional_activities,[]);
 await f.call(path+'/join','POST',{},'other');
 f.sql.prepare("UPDATE crew_members SET role='deputy' WHERE user_id='other'").run();
 assert.equal((await f.call(path,'PATCH',{music_genres:['팝']},'other')).status,403);
 assert.equal((await f.call(path,'PATCH',{description:'deputy allowed'},'other')).status,200);
});

test('legacy creation/edit accepts unset tags and keeps the original search contract',async t=>{
 const f=await fixture(t);
 const created=await f.call('/api/crews','POST',{name:'Legacy',interests:'blues',join_policy:'approval'});
 assert.equal(created.status,201);const path='/api/crews/'+created.body.crew.id;
 assert.equal((await f.call(path,'PATCH',{description:'새로운 소개'})).body.crew.primary_activity,null);
 assert.equal((await f.call('/api/crews?q=blues')).body.crews.length,1);
 assert.equal((await f.call('/api/crews?directory=1&q=blues')).body.total,0);
 assert.equal((await f.call(path,'PATCH',{primary_activity:'음악 감상'})).status,200);
 assert.equal((await f.call(path)).body.crew.join_policy,'approval');
});

test('directory counts all matches before paging and filters literal names, descriptions, tags and live availability',async t=>{
 const f=await fixture(t);
 const insert=f.sql.prepare('INSERT INTO crews(id,owner_id,name,description,created,primary_activity,additional_activities,music_genres,recruiting,join_policy) VALUES(?,?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<105;i++)insert.run('c'+i,'owner','Crew '+i,i===0?'듀엣 100%_':'일반 소개',i,i===0?'듀엣·콜라보':null,i===0?'["대본 제작"]':'[]',i===0?'["OST·뮤지컬"]':'[]',i===104?0:1,i===0?'approval':i===104?'invite_only':'open');
 const get=async params=>(await f.call('/api/crews?directory=1&'+new URLSearchParams(params),'GET',undefined,null)).body;
 assert.equal((await get({})).total,105);
 assert.equal((await get({})).crews.length,24);
 assert.equal((await get({offset:96})).crews.length,9);
 for(const p of [{q:'%_'},{q:'듀엣'},{activity:'듀엣·콜라보'},{activity:'대본 제작',genre:'OST·뮤지컬',policy:'approval',recruiting:'open'}]){
  const result=await get(p);assert.equal(result.total,1);assert.equal(result.crews[0].id,'c0');
 }
 assert.equal((await get({q:'cReW 104',policy:'invite_only',recruiting:'closed'})).total,1);
 assert.equal((await get({activity:'대본 제작',genre:'인디'})).total,0);
 for(let i=0;i<10;i++){
  f.sql.prepare('INSERT INTO users(id,name,email,created) VALUES(?,?,?,0)').run('u'+i,'N'+i,i+'@test');
  f.sql.prepare("INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('c0',?,'member',0)").run('u'+i);
 }
 const full=(await get({activity:'듀엣·콜라보',recruiting:'closed'})).crews[0];
 assert.equal(full.members,full.capacity);assert.equal((await get({activity:'듀엣·콜라보',recruiting:'open'})).total,0);
});

for(const [policy,label] of Object.entries({open:'즉시 가입',approval:'승인 후 가입',invite_only:'초대 전용'})) {
 test('stored join policy drives '+label+' and existing admission behavior',async t=>{
  const f=await fixture(t);
  const created=await f.call('/api/crews?tags=1','POST',{name:'Policy',primary_activity:'친목·소통',join_policy:policy});
  const crew=(await f.call('/api/crews?directory=1','GET',undefined,'other')).body.crews[0];
  assert.equal(CREW_JOIN_LABELS[crew.join_policy],label);const path='/api/crews/'+created.body.crew.id;
  const join=()=>f.call(path+'/join','POST',{},'other');
  assert.equal((await join()).status,{open:200,approval:202,invite_only:403}[policy]);
  if(policy==='approval') assert.equal((await f.call(path+'/applications/other','POST',{decision:'approve'})).status,200);
  if(policy==='invite_only'){
   const {id}= (await f.call('/api/me/profile','PUT',{name:'Invited'},'other')).body.profile;
   assert.equal((await f.call('/api/dm/'+id+'/crew-invite','POST',{crew_id:crew.id,request_id:crypto.randomUUID()})).status,201);
   assert.equal((await join()).status,200);
  }
  assert.equal((await f.call(path)).body.crew.members,2);
 });
}

