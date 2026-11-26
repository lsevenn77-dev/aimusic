import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';

test('authenticated work feed pages across types and ties, with scoped item refreshes',async t=>{
 const f=await fixture(t,{DUBBING_ENABLED:'true',BUCKET:memoryBucket()});
 f.sql.exec("INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES('friend','other','Other',0,1); UPDATE tracks SET created=100,karaoke_at=1 WHERE id='one'; INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','job','ready',1,'ready',0,0)");
 const insert=f.sql.prepare("INSERT INTO tracks(id,user_id,producer_id,artist_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id,duet_open,duet_part,original_key) VALUES(?,?,?,'artist',?,'Rock','',1,'wav',128,50,?,'cover','one',?,?,?,?,'audio')");
 for(let i=0;i<20;i++)insert.run('cover-'+String(i).padStart(2,'0'),'owner','producer','Cover','published','solo',null,0,'');
 insert.run('invite','owner','producer','Open duet','published','duet',null,1,'male');
 insert.run('joiner','other','friend','Finished duet','published','duet','invite',0,'female');
 insert.run('ended','owner','producer','Closed duet','published','duet',null,0,'male');
 insert.run('private','other','friend','Hidden duet','hidden','duet','invite',0,'female');

 const dub=crypto.randomUUID();
 assert.equal((await f.call('/api/dubbing/projects','POST',{id:dub,options,script:sampleScript()})).status,201);
 f.sql.prepare("UPDATE dubbing_projects SET created=50,state='complete',visibility='public' WHERE id=?").run(dub);
 const {script_key}=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(dub);
 const recording=f.sql.prepare("INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,write_token,created,updated) VALUES(?,?,?,?,?,'submitted','qa',0,0)");
 for(const [i,{id}] of sampleScript().roles.entries())recording.run('rec-'+i,dub,id,i?'other':'owner',script_key);
 f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,manifest_json,state,output_key,created,updated) VALUES('final',?,?,'{}','ready','final',0,0)").run(dub,script_key);
 f.sql.prepare("INSERT INTO likes(user_id,dubbing_id,created) VALUES('other',?,0)").run(dub);
 f.sql.prepare("INSERT INTO comments(id,dubbing_id,user_id,body,created) VALUES('comment',?,'other','테스트',0)").run(dub);
 f.sql.prepare("INSERT INTO dubbing_plays(project_id,request_id,started) VALUES(?,'play',0)").run(dub);

 const list=async(params='')=>{
  const response=await f.call('/api/me/works'+params);
  assert.equal(response.status,200,JSON.stringify(response.body));return response.body;
 };
 const first=await list(),second=await list('?cursor='+encodeURIComponent(first.next_cursor));
 assert.equal(first.items.length,16);
 assert.equal(second.next_cursor,null);
 const keys=[...first.items,...second.items].map(work=>work.key);
 assert.deepEqual(keys.slice(0,3),['track:one','dubbing:'+dub,'track:cover-00']);
 assert.equal(new Set(keys).size,keys.length);
 assert.ok(keys.includes('track:hidden')&&keys.includes('track:joiner'));
 assert.ok(!keys.includes('track:private'));
 assert.equal((await list('?filter=cover')).items.length,16);
 assert.deepEqual((await list('?filter=recruit')).items.map(work=>work.id),['invite']);
 const onlyDubbing=(await list('?filter=dubbing')).items[0];
 assert.equal(onlyDubbing.participants,2);
 assert.equal(onlyDubbing.role_count,2);
 assert.equal(onlyDubbing.likes,1);
 assert.equal(onlyDubbing.comments,1);
 assert.equal(onlyDubbing.plays,1);
 assert.equal((await f.call('/api/me/works','GET',undefined,null)).status,401);
 assert.equal((await f.call('/api/me/works?cursor=invalid')).status,400);
 assert.ok(!(await f.call('/api/me/works','GET',undefined,'other')).body.items.some(work=>work.id==='hidden'));
 const digest=(await f.call('/api/producers/producer?dashboard=1&work_list=1&feed_shell=1')).body;
 assert.deepEqual([digest.tracks,digest.covers,digest.dubbings],[[],[],[]]);
 const before=await list('?item=track%3Ainvite&item=track%3Ajoiner');
 assert.deepEqual(before.items.map(work=>[work.id,work.owned]),[['invite',true],['joiner',false]]);
 assert.equal(before.summary.profile_work_count,digest.profile_work_count);
 assert.equal((await f.call('/api/uploads/invite/unpublish','POST')).status,200);
 const after=await list('?item=track%3Ainvite&item=track%3Ajoiner');
 assert.deepEqual(after.items.map(work=>[work.id,work.work_public]),[['invite',0]]);
 assert.equal(after.summary.profile_work_count,before.summary.profile_work_count-2);
});

test('profile counts completed public children of the exact duet parent and preserves join ownership',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET karaoke_at=1; INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','job','ready',1,'ready',0,0)");
 const seed=(id,owner,parent,open,status='published')=>f.sql.prepare("INSERT INTO tracks(id,user_id,producer_id,artist_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id,duet_open) VALUES(?,?,'producer','artist',?,'Rock','',1,'wav',128,0,?,'cover','one','duet',?,?)").run(id,owner,id,status,parent,open);
 seed('parent','owner',null,1);seed('child','other','parent',0);seed('draft','other','parent',0,'hidden');seed('unfinished','other','parent',1);seed('unrelated','other',null,0);f.sql.exec("UPDATE tracks SET duet_part='male',original_key='ready' WHERE id='parent'");
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


function profileClient(me={id:'owner'}){
 const context=nicknameContext({me,URLSearchParams,esc:String,number:String,icon:n=>`<svg data-icon="${n}"></svg>`,cover:()=>'<img>',castingMineTabs:()=>'<nav>내 원작</nav>',AifectDubbing:{dubbingGenreArtwork:()=>'/art'},document:{addEventListener(){}},window:{addEventListener(){}}});
 vm.runInContext(readFileSync(new URL('../dist/mypage.js',import.meta.url),'utf8'),context);
 return context;
}

test('full profile list exposes first publication, plain nickname, complete entities and matching section links',async t=>{
 const f=await fixture(t),c=profileClient();
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('testcrew','owner','별',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('testcrew','owner','owner',0); UPDATE tracks SET first_published_at=5 WHERE id='one'; UPDATE producers SET name='별 (내 이름)' WHERE id='producer'");
 const get=async user=>(await f.call('/api/producers/producer?dashboard=1&work_list=1','GET',undefined,user)).body;
 const d=await get('owner'),catalog=c.profileWorkCatalog(d);
 assert.equal(catalog[0].t.id,'one');assert.equal(catalog[0].nickname,'별 (내 이름)');
 assert.deepEqual(Array.from(catalog,w=>w.t.id),['one','hidden','three','two']);
 assert.ok(catalog.some(w=>w.t.id==='hidden'));assert.ok(!(await get('other')).tracks.some(w=>w.id==='hidden'));
 for(const key of ['original','complete','recruit'])assert.ok(c.myWorksHTML(d).includes('#profile/works?tab='+key));
 const page=c.profileWorksPage(d,new URLSearchParams('tab=complete&type=script'));
 assert.equal(page.profileWorks.type,'all');assert.match(page.html,/내 작품 검색/);assert.doesNotMatch(page.html,/최신순/);
});

test('cover and dubbing classification uses readiness, preserves private work, and keeps same IDs in separate namespaces',()=>{
 const c=profileClient(),base={producer_id:'p',user_id:'owner',work_nickname:'가수',created:2,work_public:1};
 const d={profile:{id:'p',user_id:'owner'},covers:[
  {...base,id:'x',kind:'cover',cover_mode:'solo',title:'내 제목 (Cover)'},
  {...base,id:'c',kind:'cover',cover_mode:'duet',duet_open:0,duet_parent_id:'parent'},
  {...base,id:'p',kind:'cover',cover_mode:'duet',duet_open:1,recruiting:true},
  {...base,id:'closed',kind:'cover',cover_mode:'duet',duet_open:0},
  {...base,id:'draft',kind:'cover',status:'hidden',work_public:0}],
  dubbings:[{id:'x',kind:'dubbing',owner_id:'owner',root_id:'z',audio_ready:1,work_finished:1},
  {id:'z',kind:'dubbing',owner_id:'other',work_open:1},{id:'k',root_id:'z',kind:'dubbing',work_open:1,casting_combo:1}]};
 const works=c.profileWorkCatalog(d);assert.equal(works.length,8);
 const type=(id,entity='track')=>works.find(w=>w.key===entity+':'+id);
 assert.equal(type('closed').section,null);assert.equal(type('draft').section,null);
 assert.equal(type('p').section,'recruit');assert.equal(type('c').section,'complete');
 assert.equal(type('x','dubbing').section,'complete');assert.equal(type('z','dubbing').type,'script');
 assert.equal(type('k','dubbing').type,'dubbing');
 assert.match(c.profileWorkCard(type('x')),/내 제목 \(Cover\)/);assert.match(c.profileWorkCard(type('x')),/#C4B5FD/);
 const script=c.profileWorkCard(type('z','dubbing'));assert.match(script,/#F2D477/);assert.match(script,/data-mp-work-join="dubbing:z" disabled/);assert.doesNotMatch(script,/data-mp-dubbing-play/);
 assert.doesNotMatch(c.profileWorkCard(type('draft')),/data-play=/);
 assert.equal(c.profileWorkIcon('duet'),c.profileWorkIcon(type('c').type));assert.match(c.profileWorkIcon(type('p').type),/#F3A6CF/);
});

test('visitor studio follows recruitment in the same column and appears only once',async()=>{
 const d={profile:{id:'p',user_id:'owner'}},visitor=profileClient({id:'visitor'});
 Object.assign(visitor,{myProfileHeader:()=>'',myMoments:()=>'',myArtists:()=>''});
 const {html}=await visitor.myPageView('producer','p','producer/p',async()=>d);
 assert.match(html,/mp-catalog-recruit[^]*?<\/section><section class="mp-card mp-studio">/);
 assert.equal(html.split('href="#studio"').length-1,1);
 assert.doesNotMatch(html,/id="mp-aside"/);
 assert.doesNotMatch(profileClient().myWorksHTML(d),/mp-studio/);
});

test('dashboard removes owner management controls while retaining the same work identities, counts and playback',()=>{
 const c=profileClient(),base={producer_id:'p',user_id:'owner',work_public:1,work_nickname:'음악가',created:1};
 const d={profile:{id:'p',user_id:'owner'},tracks:[{...base,id:'song',kind:'original',title:'제작곡'}],
  covers:Array.from({length:5},(_,i)=>({...base,id:'cover-'+i,kind:'cover',cover_mode:'solo',title:'솔로 '+i,created:10-i})),
  dubbings:[{id:'dub',kind:'dubbing',owner_id:'owner',root_id:'root',work_finished:1,audio_ready:1,owner_name:'음악가',title:'더빙',created:20}]};
 const catalog=c.profileWorkCatalog(d),before=JSON.stringify(catalog),html=c.myWorksHTML(d);
 assert.match(html,/완성곡 <span>6<\/span>/);
 assert.equal((html.match(/class="mp-catalog-card"/g)||[]).length,4,'one original and the existing three completed preview slots');
 assert.doesNotMatch(html,/data-track-menu=|>관리<|class="card-more"/);
 assert.match(html,/data-play="song"/);assert.match(html,/data-mp-dubbing-play="dub"/);
 assert.match(html,/#song\/cover-0/);assert.match(html,/#profile\/works\?tab=complete/);
 assert.equal(JSON.stringify(c.profileWorkCatalog(d)),before);
 for(const work of catalog){
  const preview=c.profileWorkCard(work),managed=c.profileWorkCard(work,{showManagement:true});
  assert.match(managed,/>관리<\/a>/);
  assert.deepEqual(preview.match(/(?:data-play|data-mp-dubbing-play)="[^"]*"/g),managed.match(/(?:data-play|data-mp-dubbing-play)="[^"]*"/g));
  if(work.t.kind!=='dubbing')assert.match(managed,/data-track-menu=/);
 }
 const visitor=profileClient({id:'visitor'}),foreign=visitor.profileWorkCatalog(d)[0];
 assert.doesNotMatch(visitor.profileWorkCard(foreign,{showManagement:true}),/>관리<\/a>/);
});

test('full work list opts into existing management and uses the completed-song label',()=>{
 const c=profileClient(),d={profile:{id:'p',user_id:'owner'},tracks:[{id:'song',kind:'original',producer_id:'p',user_id:'owner',work_public:1,title:'제작곡'}]};
 const view=c.profileWorksPage(d,new URLSearchParams('tab=all')),results={},search={value:''},select={value:'all'};
 assert.match(view.html,/>완성곡 <span>/);
 const root={style:{setProperty(){}},querySelector:s=>s==='input'?search:s==='[data-mp-types]'?select:results,querySelectorAll:()=>[]};
 Object.assign(c,{icons(){},paintInteractions(){},ResizeObserver:class{observe(){}},window:{AifectDropdown:{mount(){}}},document:{querySelector:s=>s==='.mp-catalog-page'?root:null}});
 c.bindProfileWorks(view.profileWorks);
 assert.match(results.innerHTML,/data-track-menu="song"/);
 assert.match(results.innerHTML,/href="#manage\/song">관리/);
});

test('four gallery slots count actual photos and open the existing owner-only upload form directly',()=>{
 const d={profile:{id:'p',name:'회원',user_id:'owner'},gallery:[{url:'/image'}]},own=profileClient(),other=profileClient({id:'visitor'});
 const html=own.myMoments(d);
 assert.equal((html.match(/data-profile-photo-add="p"/g)||[]).length,3);
 assert.equal((html.match(/data-gallery-photo=/g)||[]).length,1);
 assert.match(html,/갤러리 <span>1<\/span>/);assert.doesNotMatch(other.myMoments(d),/data-profile-photo-add/);
 assert.doesNotMatch(own.myMoments({...d,gallery:Array(10).fill({url:'/image'})}),/data-profile-photo-add/);
});


test('eligible casting scripts and live combinations stay distinct and drafts never become finished',async t=>{
 const {castingFixture}=await import('./dubbing-casting-fixtures.mjs'),f=await castingFixture(t,3);
 const list=async viewer=>{
  const r=await f.call('/api/producers/producer?dashboard=1&work_list=1','GET',undefined,viewer);
  assert.equal(r.status,200,JSON.stringify(r.body));return r.body.dubbings;
 };
 assert.equal((await list('actor3')).length,0);
 await f.base();
 assert.equal((await list('actor3')).find(p=>p.id===f.root).work_open,1);
 assert.equal((await list('owner')).find(p=>p.id===f.root).can_join,false);
 assert.equal((await list('actor3')).find(p=>p.id===f.root).can_join,true);
 assert.equal((await list(null)).find(p=>p.id===f.root).can_join,false);
 const d=await f.draft('role_2','actor2');assert.ok(!(await list('actor3')).some(p=>p.id===d.pid));
 const r=await f.submit(d.pid,'role_2','actor2',d.rev),id=r.body.casting.combinationId;
 const combo=(await list('actor3')).find(p=>p.id===id);
 assert.ok(combo.casting_combo);assert.ok(combo.work_open);assert.equal(combo.work_finished,0);
 assert.equal((await list('actor2')).find(p=>p.id===id).viewer_claimed,1);
 assert.equal((await list('actor2')).find(p=>p.id===id).can_join,false);
 assert.equal((await list('actor3')).find(p=>p.id===id).can_join,true);
 f.sql.prepare('UPDATE dubbing_combinations SET last_participation=0 WHERE project_id=?').run(id);
 assert.ok(!(await list('actor3')).some(p=>p.id===id));
});
test('work list counts beyond the dashboard preview cap without exposing private originals to visitors',async t=>{
 const f=await fixture(t);
 f.sql.exec("WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<501) INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) SELECT 'extra-'||i,'owner','artist','producer','등록곡','Rock','QA',1,'wav',128,i,'published' FROM n");
 const r=await f.call('/api/producers/producer?dashboard=1&work_list=1','GET',undefined,'other');
 assert.equal(r.status,200);assert.equal(r.body.tracks.length,504);assert.ok(!r.body.tracks.some(t=>t.id==='hidden'));
});

test('works header and URLs use the viewed profile and retain valid tab, type and query state',()=>{
 const c=profileClient(),d={profile:{id:'p',user_id:'owner',name:'실제 닉네임'}};
 const own=c.profileWorksPage(d,new URLSearchParams('tab=complete&type=duet&q=노래'));
 assert.match(own.html,/실제 닉네임의 작품/);assert.match(own.html,/완성곡/);
 assert.match(own.html,/class="mp-back" href="#profile"/);
 assert.match(own.html,/aria-controls="mp-work-search"/);
 const visitor=profileClient({id:'visitor'}).profileWorksPage(d,new URLSearchParams('tab=recruit&type=script&q=대사'));
 assert.match(visitor.html,/href="#producer\/p"/);
 assert.match(visitor.html,/#profile-works\/p\?tab=recruit&type=script&q=/);
 assert.doesNotMatch(visitor.html,/<h1>내 작품<\/h1>/);
});

test('every recruiting card has a CTA, denies unavailable roles, and preserves management',()=>{
 const c=profileClient({id:'visitor'}),base={key:'track:d',type:'duet',section:'recruit',mine:false,t:{id:'d',title:'듀엣',kind:'cover',original_id:'o',recruiting:true,can_join:true}};
 assert.equal(c.profileWorkJoin(base).href,'#sing/o?duet=d');
 assert.match(c.profileWorkCard(base),/data-mp-work-join="track:d" >참여하기/);
 for(const item of [{...base,mine:true},{...base,t:{...base.t,can_join:false}},{...base,t:{...base.t,recruiting:false}}]){
  assert.ok(c.profileWorkJoin(item).reason);assert.match(c.profileWorkCard(item),/disabled aria-describedby=/);
 }
 assert.match(c.profileWorkCard({...base,mine:true},{showManagement:true}),/>관리<\/a>/);
 assert.match(profileClient(null).profileWorkJoin(base).reason,/로그인/);
 const dub={...base,type:'script',t:{id:'s',kind:'dubbing',work_open:1,can_join:true}};
 assert.equal(c.profileWorkJoin(dub).href,'#karaoke/dubbing?tab=discover&project=s&target=s');
 assert.equal(c.profileWorkJoin({...dub,t:{...dub.t,id:'combo',root_id:'s',casting_combo:1}}).href,'#karaoke/dubbing?tab=discover&project=s&target=combo');
 assert.equal(c.profileWorkJoin({...dub,t:{...dub.t,root_id:'s'}}).href,null,'legacy participation opens a role picker, not a detail link');
 assert.match(c.profileWorkJoin({...dub,t:{...dub.t,viewer_claimed:1}}).reason,/이미 참여/);
});

test('participation rechecks fresh server state and never navigates a stale or denied card',async()=>{
 const c=profileClient({id:'visitor'}),status={textContent:''},button={dataset:{mpWorkJoin:'track:d'},isConnected:true,parentElement:{querySelector:()=>status}},root={querySelectorAll:()=>[button]};
 c.location={hash:'#profile-works/p?tab=recruit'};
 const d={profile:{id:'p',user_id:'owner'},covers:[{id:'d',producer_id:'p',user_id:'owner',kind:'cover',cover_mode:'duet',work_public:1,recruiting:true,can_join:false,original_id:'o'}]};
 c.api=async(path,method,body,opts)=>{assert.equal(path,'/api/producers/p?dashboard=1&work_list=1');assert.equal(method,'GET');assert.equal(opts.fresh,true);return d;};
 c.bindProfileWorkJoins(root,d);await button.onclick();assert.equal(button.disabled,true);assert.match(status.textContent,/권한/);assert.match(c.location.hash,/profile-works/);
 d.covers[0].can_join=true;c.bindProfileWorkJoins(root,d);await button.onclick();assert.equal(c.location.hash,'#sing/o?duet=d');
 c.location.hash='#profile-works/p?tab=recruit';d.covers[0].recruiting=false;c.bindProfileWorkJoins(root,d);await button.onclick();assert.match(status.textContent,/마감/);assert.match(c.location.hash,/profile-works/);
});
