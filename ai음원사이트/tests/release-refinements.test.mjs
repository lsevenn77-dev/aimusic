import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {bundleClient} from '../scripts/client-bundle.mjs';
import {fixture} from './fixture.mjs';
const read=f=>readFileSync(new URL('../dist/'+f,import.meta.url),'utf8');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('shell search is bound before home renders, supports Enter submission and repeat queries',()=>{
 let focused=0,prevented=0,renders=0;const form={query:' Caught Ya! ',elements:{q:{focus(){focused++;}}}},location={hash:'#home'};
 const c=vm.createContext({$:s=>s==='#global-search'?form:null,FormData:class{constructor(f){this.f=f;}get(){return this.f.query;}},location,render(){renders++;}});
 vm.runInContext(read('actions.js').split('function formError')[0],c);
 form.onsubmit({preventDefault(){prevented++;}});assert.equal(location.hash,'#search/Caught%20Ya!');assert.equal(prevented,1);
 form.onsubmit({preventDefault(){}});assert.equal(renders,1);form.query='  ';form.onsubmit({preventDefault(){}});assert.equal(focused,1);assert.equal(location.hash,'#search/Caught%20Ya!');
});
function ui(){const c=vm.createContext({me:null,queueMicrotask,document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){},esc,empty:()=>'<p>EMPTY</p>',time:s=>'0:'+String(Number(s)||0).padStart(2,'0'),number:n=>Number(n||0).toLocaleString('ko-KR'),icon:()=>'',heading:s=>'<h1>'+s+'</h1>',communityNavigation:()=>'',portrait:()=>'',followed:()=>false,liked:()=>false,giftButton:()=>'',cover:()=>'',credits:()=>''});for(const f of ['music-ui.js','social-layouts.js','social-chat.js','release-refinements.js'])vm.runInContext(read(f),c);return c;}
test('release date is the registered timestamp in Korea, without inventing missing dates',()=>{
 const c=ui();assert.match(c.songReleaseDateHTML({created:Date.parse('2026-10-12T16:00:00Z')/1000}),/datetime="2026-10-13">2026.10.13/);assert.equal(c.songReleaseDateHTML({}), '');
});
test('crew discovery uses real rows, functioning filters and independently ranked sidebar',()=>{
 const c=ui(),crews=[{id:'a',name:'<script>x</script>',description:'Real',level:1,xp:2,members:3,capacity:10,recruiting:1,interests:'Rock, Ballad',created:1},{id:'b',name:'Two',level:3,xp:100,members:10,capacity:10,recruiting:1,interests:'Pop',created:2}];
 const page=c.crewDiscoveryHTML({crews,rankings:crews,mine:'a'});assert.match(page,/crew-featured-grid/);assert.match(page,/id="crew-search"/);assert.match(page,/id="crew-discovery-filters"/);assert.match(page,/data-crew-layout="list"/);assert.match(page,/내 크루 들어가기/);assert.doesNotMatch(page,/<script>|124|127명/);
 assert.deepEqual(Array.from(c.filterCrewDiscovery(crews,{recruiting:'open'}),v=>v.id),['a']);assert.deepEqual(Array.from(c.filterCrewDiscovery(crews,{recruiting:'closed'}),v=>v.id),['b']);assert.deepEqual(Array.from(c.filterCrewDiscovery(crews,{interest:'Ballad'}),v=>v.id),['a']);assert.deepEqual(Array.from(c.filterCrewDiscovery(crews,{scope:'mine'},'a'),v=>v.id),['a']);assert.deepEqual(Array.from(c.filterCrewDiscovery(crews,{sort:'level'}),v=>v.id),['b','a']);assert.equal(crews[0].id,'a');
 assert.doesNotThrow(()=>c.bindCrewDiscovery(null));assert.doesNotThrow(()=>c.bindCrewDiscovery(undefined));assert.doesNotThrow(()=>c.bindCrewDiscovery({}));
});
test('community concept preserves real post actions and escapes supplied strings; slogan removed',()=>{
 const c=ui(),card=c.communityConceptCard({id:'song',producer_id:'p',producer:'Singer',title:'<img>',description:'<script>',kind:'cover',likes:7,comments:2,plays:11});
 for(const re of [/community-post-description/,/community-song-panel/,/data-add="song"/,/data-play="song"/,/data-like="song"/,/#song\/song\?comments=1/])assert.match(card,re);
 assert.doesNotMatch(card,/<script>|<img>/);assert.doesNotMatch(c.communityLandingHTML([],{}),/더 가까워지는 우리/);
});
test('Enter sends consonants once across both Korean IME orderings; Shift+Enter and repeats do not submit',async()=>{
 for(const order of ['normal','chrome','safari']){
  const c=ui(),events={},sent=[],input={value:'ㄳㄳ',addEventListener:(type,fn)=>events[type]=fn};c.bindChatEnter(input,()=>{if(input.value.trim()){sent.push(input.value);input.value='';}});
  const key={key:'Enter',preventDefault(){},keyCode:13};
  if(order==='normal')events.keydown(key);
  else{events.compositionstart();if(order==='safari')events.compositionend();events.keydown({...key,isComposing:order==='chrome',keyCode:229});input.value='ㄳㄳ';if(order==='chrome')events.compositionend();events.keyup(key);}
  await Promise.resolve();events.keyup(key);assert.deepEqual(sent,['ㄳㄳ'],order);
  input.value='ㅇㅇ';events.keydown({...key,shiftKey:true});events.keyup({...key,shiftKey:true});events.keydown({...key,repeat:true});assert.equal(sent.length,1);
  events.keydown(key);assert.deepEqual(sent,['ㄳㄳ','ㅇㅇ']);
 }
});
test('server accepts shortened Korean in DM and crew chat without bypassing normal identity checks',async t=>{
 const f=await fixture(t);await f.call('/api/me/profile','PUT',{name:'Other Listener'},'other');const peer=f.sql.prepare("SELECT id FROM producers WHERE user_id='other'").get().id;
 for(const [i,body]of ['ㄳㄳ','ㅇㅇ','ㅋㅋ'].entries()){const r=await f.call('/api/dm/'+peer,'POST',{body,request_id:'consonant-dm-request-'+i});assert.equal(r.status,201,JSON.stringify(r.body));}
 const crew=await f.call('/api/crews','POST',{name:'Consonant Crew',description:'',interests:''});assert.equal(crew.status,201);
 assert.equal((await f.call('/api/crews/'+crew.body.crew.id+'/messages','POST',{body:'ㄳㄳ',request_id:'consonant-crew-request'})).status,201);
 const home=await f.call('/api/crews?home=1');assert.equal(home.body.detail.crew.id,crew.body.crew.id);assert.equal(home.body.detail.membership.role,'owner');assert.equal(home.body.crews,undefined);
});
test('live lightweight gold and silver are auth gated, never expose diamonds and stay fresh after a ledger change',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/api/gold/balance','GET',null,null)).status,401);
 assert.deepEqual((await f.call('/api/gold/balance')).body,{balance:0,silver_balance:0});
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('grant','owner','web',80,880,0,'paid',0,0)");
 f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',42)");
 assert.deepEqual((await f.call('/api/gold/balance')).body,{balance:80,silver_balance:42});assert.deepEqual((await f.call('/api/gold/balance','GET',null,'other')).body,{balance:0,silver_balance:0});
 assert.equal(JSON.stringify((await f.call('/api/me')).body).includes('blocked_ids'),false);
});
test('singing participation excludes hidden and blocked covers, and shows only real participants',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','job','ready',1,'ready',0,0); INSERT INTO producers(id,user_id,name,created) VALUES('peer','other','Other',0)");
 const insert=f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES(?,?,'artist',?,?,'Rock','QA',1,'wav',128,1,?,'cover','one')");
 insert.run('c1','owner','producer','Cover1','published');insert.run('c2','other','peer','Cover2','published');insert.run('secret','owner','producer','Hidden','hidden');
 let r=await f.call('/api/karaoke');assert.equal(r.status,200,JSON.stringify(r.body));let one=r.body.tracks.find(t=>t.id==='one');assert.equal(one.covers,2);assert.equal(one.cover_participants.length,2);assert.ok(!JSON.stringify(r.body).includes('Hidden'));
 await f.call('/api/blocks/other','PUT',{});r=await f.call('/api/karaoke');one=r.body.tracks.find(t=>t.id==='one');assert.equal(one.covers,1);assert.ok(!one.cover_participants.some(p=>p.producer_id==='peer'));
});
test('bundling retains classic global order, CSS relative paths and stable content hashes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'aifect-bundle-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));const url=pathToFileURL(directory+'/');
 await writeFile(join(directory,'a.js'),'var step=1; function shared(){ return step; }');await writeFile(join(directory,'b.js'),'step+=2; var outcome=shared();');await writeFile(join(directory,'a.css'),'.x{color:red;background:url(assets/a.webp)}');await writeFile(join(directory,'b.css'),'.x{color:blue}');
 const html='<link rel="stylesheet" href="a.css"><link rel="stylesheet" href="b.css"><script defer src="a.js?v=1"></script><script defer src="b.js"></script>',built=await bundleClient(html,url);assert.equal((built.match(/<script/g)||[]).length,1);assert.equal((built.match(/<link/g)||[]).length,1);assert.equal(await bundleClient(html,url),built);
 const script=built.match(/src="\/([^"]+)"/)[1],css=built.match(/href="\/([^"]+)"/)[1],context=vm.createContext({});vm.runInContext(await readFile(join(directory,script),'utf8'),context);assert.equal(context.outcome,3);assert.match(await readFile(join(directory,css),'utf8'),/assets\/a.webp/);
 await writeFile(join(directory,'b.js'),'step+=3; var outcome=shared();');assert.notEqual(await bundleClient(html,url),built);
});
