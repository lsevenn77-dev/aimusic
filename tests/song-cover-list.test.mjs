import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';

async function setup(t){
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id IN ('one','two'); INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','job','ready',1,'ready',0,0)");
 const seed=(id,{mode='solo',parent=null,open=0,user='other',status='published',created=1,published=created,original='one'}={})=>f.sql.prepare("INSERT INTO tracks(id,user_id,producer_id,artist_id,title,kind,original_id,cover_mode,duet_parent_id,duet_open,status,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,first_published_at) VALUES(?,?,'producer','artist',?,'cover',?,?,?,?,?,'Rock','',1,'wav',128,?,?)").run(id,user,id,original,mode,parent,open,status,created,published);
 const list=async(view='all',extra='',user='owner')=>{const r=await f.call('/api/tracks/one/covers?view='+view+extra,'GET',undefined,user);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 return {...f,seed,list};
}
test('song all and recent share only public completed covers; ranking reuses qualified plays',async t=>{
 const f=await setup(t);
 f.seed('invite',{mode:'duet',open:1});f.seed('closed',{mode:'duet'});
 f.seed('solo',{created:100,published:200});f.seed('joined',{mode:'duet',parent:'invite',created:90,published:300});
 for(const status of ['uploading','processing','hidden','deleted','failed'])f.seed("state-"+status,{status});
 f.seed('other-original',{original:'two'});
 f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('owner','joined',0); INSERT INTO listens(id,track_id,listener,day,started,qualified) VALUES('listen','solo','viewer','2026-10-27',0,1)");
 const all=await f.list(),recent=await f.list('recent');
 assert.deepEqual(all.covers.map(t=>[t.id,t.rank]),[['solo',1],['joined',2]]);
 assert.deepEqual(recent.covers.map(t=>t.id),['joined','solo']);assert(recent.covers.every(t=>!('rank'in t)));
 assert.deepEqual(all.counts,{all:2,recent:2,duet:1});assert.deepEqual(recent.counts,all.counts);
 assert.equal(all.ranking_basis,'qualified_plays');
 const legacy=(await f.call('/api/tracks/one/covers?sort=plays')).body.covers.filter(t=>['solo','joined'].includes(t.id));
 assert.deepEqual(all.covers.map(t=>t.id),legacy.map(t=>t.id));
});
test('duet availability uses MR readiness, source state and viewer ownership; completed participation leaves join open',async t=>{
 const f=await setup(t);
 f.seed('old',{mode:'duet',open:1,published:100});f.seed('new',{mode:'duet',open:1,published:200});
 f.seed('mine',{mode:'duet',open:1,user:'owner'});f.seed('closed',{mode:'duet'});
 f.seed('child',{mode:'duet',parent:'old',user:'owner'});
 const d=await f.list('duet');assert.deepEqual(d.covers.map(t=>t.id),['new','old']);assert(d.covers.every(t=>t.can_join));
 assert.equal(d.covers[1].completions,1);assert.equal(d.covers[1].participants,1);
 assert.equal((await f.list('duet','',null)).covers.length,3);
 f.sql.exec("UPDATE karaoke_jobs SET mr_ready=0 WHERE track_id='one'");assert.equal((await f.list('duet')).covers.length,0);
 assert.equal((await f.list()).covers.length,1,'completed works remain listenable without a ready MR');
});
test('children and counts use exact parent IDs, visible works and distinct participants, excluding the starter',async t=>{
 const f=await setup(t);f.seed('a',{mode:'duet',open:1});f.seed('b',{mode:'duet',open:1});
 f.seed('a1',{mode:'duet',parent:'a',user:'owner'});f.seed('a2',{mode:'duet',parent:'a',user:'owner'});
 f.seed('starter',{mode:'duet',parent:'a'});f.seed('b1',{mode:'duet',parent:'b',user:'owner'});
 for(const status of ['hidden','deleted','uploading'])f.seed("state-"+status,{mode:'duet',parent:'a',status,user:'owner'});
 const a=(await f.list('duet')).covers.find(t=>t.id==='a');assert.equal(a.participants,1);assert.equal(a.completions,3);
 assert.deepEqual((await f.list('children','&parent=a')).covers.map(t=>t.id),['a1','a2','starter']);
 assert.deepEqual((await f.list('children','&parent=b')).covers.map(t=>t.id),['b1']);
 assert.equal((await f.call('/api/tracks/two/covers?view=children&parent=a')).status,404);
 assert.equal((await f.call('/api/tracks/one/covers?view=children&parent=a1')).status,404);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='a'");assert.equal((await f.list()).covers.length,1);
});
test('pagination reaches every completed item and child without duplicate ranks or arbitrary 100-item truncation',async t=>{
 const f=await setup(t);f.seed('parent',{mode:'duet',open:1});
 for(let i=0;i<107;i++)f.seed('work-'+String(i).padStart(3,'0'),{mode:'duet',parent:'parent',created:i+1});
 for(const view of ['all','recent','children']){
  let offset=0,result=[];do{const d=await f.list(view,'&offset='+offset+(view==='children'?'&parent=parent':''));result.push(...d.covers);offset=d.next_offset;}while(offset!=null);
  assert.equal(result.length,107);assert.equal(new Set(result.map(t=>t.id)).size,107);
  if(view==='all')assert.deepEqual(result.map(t=>t.rank),Array.from({length:107},(_,i)=>i+1));
 }
 for(const query of ['view=bad','view=all&offset=-1','view=all&offset=1.5'])assert.equal((await f.call('/api/tracks/one/covers?'+query)).status,400);
});
test('first successful publication sorts later than draft creation; re-publication retains first-publication policy',async t=>{
 const f=await setup(t);f.seed('previous',{published:100});f.seed('draft',{status:'uploading',created:1,published:0});
 f.sql.exec("UPDATE tracks SET status='published' WHERE id='draft'");
 const first=f.sql.prepare("SELECT first_published_at at FROM tracks WHERE id='draft'").get().at;assert(first>100);
 assert.equal((await f.list('recent')).covers[0].id,'draft');
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='draft'; UPDATE tracks SET status='published' WHERE id='draft'");
 assert.equal(f.sql.prepare("SELECT first_published_at at FROM tracks WHERE id='draft'").get().at,first);
});
test('two different participants create independent completed works and keep the original recruitment and guide intact',async t=>{
 const f=await setup(t);
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','Third',0)");
 f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash('third'),'third',Math.floor(Date.now()/1000)+3600);
 const base={original_id:'one',extension:'wav',bytes:128,own_voice:true,rights:true,cover_mode:'duet',duet_slot:'first',duet_consent:true};
 const r=await f.call('/api/covers','POST',base,'other');assert.equal(r.status,201);const parent=r.body.id;
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(parent);
 const original=f.sql.prepare('SELECT * FROM tracks WHERE id=?').get(parent),children=[];
 for(const user of ['owner','third','owner']){
  const c=await f.call('/api/covers','POST',{...base,duet_slot:'second',duet_parent_id:parent},user);assert.equal(c.status,201);children.push(c.body.id);
  f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(c.body.id);
  assert.equal((await f.call('/api/duets/'+parent,'GET',undefined,user)).status,200);
 }
 assert.equal(new Set(children).size,3);assert.deepEqual(f.sql.prepare('SELECT * FROM tracks WHERE id=?').get(parent),original);
 const d=(await f.list('duet')).covers.find(t=>t.id===parent);assert.equal(d.participants,2);assert.equal(d.completions,3);assert.equal(d.can_join,true);
 assert(children.every(id=>f.sql.prepare('SELECT duet_parent_id FROM tracks WHERE id=?').get(id).duet_parent_id===parent));
});
test('blocked performers are omitted consistently from lists, counts and child pages',async t=>{
 const f=await setup(t);f.seed('source',{mode:'duet',open:1});f.seed('work',{mode:'duet',parent:'source'});
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',1)");
 const d=await f.list();assert.deepEqual(d.counts,{all:0,recent:0,duet:0});assert.equal(d.covers.length,0);
 assert.equal((await f.call('/api/tracks/one/covers?view=children&parent=source')).status,403);
});
test('row markup has separate native links and controls, exact tabs, escaped IDs and shared line play icon',()=>{
 const c=vm.createContext({esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),number:String,time:()=> '0:45',cover:()=>'<img>',liked:()=>false,icon:n=>`<i data-icon="${n}"></i>`});
 vm.runInContext(readFileSync(new URL('../dist/song-covers.js',import.meta.url),'utf8'),c);
 const track={id:'cover',title:'<Long title>',producer:'Singer',rank:1,cover_mode:'duet',original_id:'original',completions:2,participants:1,can_join:true};
 const html=c.songCoversPanelHTML({id:'original'},{view:'all',covers:[track],counts:{all:1,recent:1,duet:1},accepts_covers:true},'all');
 assert.match(html,/covers=all/);assert.match(html,/covers=duet/);assert.match(html,/covers=recent/);assert.doesNotMatch(html,/covers=solo|covers=ranking/);
 assert.match(html,/&lt;Long title&gt;/);assert.match(html,/data-community-toggle/);assert.match(html,/data-icon="play"/);
 assert.match(html,/<\/a>\s*<button/);assert.match(html,/#cover\/original/);assert.match(html,/#song\/cover/);
 const duet=c.songCoverItemHTML(track,'duet');assert.match(duet,/#sing\/original\?duet=cover/);assert.match(duet,/1<span class="sr-only">명 참여<\/span>/);assert.match(duet,/완성작 2개/);assert.doesNotMatch(duet,/완성된 참여작|song-cover-counts/);
 assert.doesNotMatch(c.songCoverItemHTML({...track,participants:0,completions:0},'duet'),/data-cover-children/);
 assert.match(c.songCoverItemHTML({...track,participants:0,completions:0},'duet'),/disabled[^>]*>0<span class="sr-only">명 참여<\/span>/);
});

 test('two-line metadata omits unavailable fields and exposes real duet performers in child rows',()=>{
 const c=vm.createContext({esc:v=>String(v??''),number:String,time:()=> '0:45',cover:()=>'',liked:()=>false,icon:()=>''});vm.runInContext(readFileSync(new URL('../dist/song-covers.js',import.meta.url),'utf8'),c);
 const t={id:'a',title:'제목',producer:'참여자',duet_partner:'먼저 부른 사람',genre:'Rock',duration:45,cover_mode:'duet'};
 assert.match(c.songCoverRowHTML(t),/>참여자 · 듀엣<\/span>/);
 assert.match(c.songCoverRowHTML(t,{child:true}),/먼저 부른 사람 & 참여자 · 듀엣/);
 const missing=c.songCoverRowHTML({id:'a',title:'제목'});assert.match(missing,/song-cover-meta" title=""><\/span>/);assert.doesNotMatch(missing,/undefined|NaN|0:45|>솔로</);
 const state={},arrow={textContent:'▼'},button={setAttribute(k,v){state[k]=v;},querySelector(){return arrow;}},target={hidden:true};
 c.setSongCoverExpanded(button,target,true);assert.equal(target.hidden,false);assert.equal(state['aria-expanded'],'true');assert.equal(arrow.textContent,'⌃');
 c.setSongCoverExpanded(button,target,false);assert.equal(target.hidden,true);assert.equal(state['aria-expanded'],'false');assert.equal(arrow.textContent,'⌄');
 });
