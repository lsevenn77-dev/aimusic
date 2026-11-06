import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import * as AifectDubbing from '../shared/dubbing.js';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';

function playUI(){
 const c=nicknameContext({window:{addEventListener(){}},URLSearchParams,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;'),icon:name=>`<svg data-icon="${name}" aria-hidden="true"></svg>`,heading:()=>'<h1>플레이</h1>',cover:()=>'<img class="existing-cover">',card:t=>`<article class="album-card"><a href="#song/${t.id}">${t.title}</a></article>`});
 vm.runInContext(readFileSync(new URL('../dist/dubbing-casting.js',import.meta.url),'utf8'),c);
 vm.runInContext(readFileSync(new URL('../dist/play-page.js',import.meta.url),'utf8'),c);return c;
}

test('Android PLAY navigation keeps every existing route, selected state and creator entry',()=>{
 const c=playUI();
 for(const mode of ['song','dubbing','browse'])for(const [tab] of vm.runInContext('playSections.'+mode,c)){
  const s={mode,tab,type:'duet'},html=c.playShell(s,c.playToolbar(s));
  const main=html.match(/<nav[^>]*play-main-tabs[\s\S]*?<\/nav>/)[0];
  assert.doesNotMatch(main,/<svg/,'main navigation stays text-only');
  assert.equal((html.match(/aria-selected="true"/g)||[]).length,2,'one selection in each level');
  assert.equal((html.match(/tabindex="0"/g)||[]).length,2);
  assert.ok(html.includes('href="'+c.playHref(mode,tab,'duet').replaceAll('&','&amp;')+'"'));
  if(mode==='dubbing'){
   const menu=html.match(/<nav[^>]*play-category-tabs[\s\S]*?<\/nav>/)[0];
   assert.deepEqual([...menu.matchAll(/<span>(.*?)<\/span>/g)].map(m=>m[1]),['더빙 만들기','작품찾기','더빙참여','내 작업']);
   assert.equal((menu.match(/href="#dubbing\/new"/g)||[]).length,1);
   assert.equal((menu.match(/aria-selected="true"/g)||[]).length,1);
   assert.ok(html.indexOf(menu)<html.indexOf('id="play-search"'));
  }
  assert.doesNotMatch(html,/play-create/,'the standalone creation row is removed');
  if(mode==='browse'){
   assert.ok(html.indexOf('id="play-search"')<html.indexOf('id="play-work-type"'));
   assert.match(html,/<option value="duet" selected>/);
  }
 }
});

test('responsive song rows preserve catalog and recording targets without giving MR a player',()=>{
 const c=playUI(),track={id:'cover-1',original_id:'original-1',title:'기존 곡',participants:2};
 for(const tab of ['recommended','duets']){
  const html=c.playResults({play:{mode:'song',tab},items:[track]});
  assert.match(html,/play-song-unified/);assert.equal((html.match(/play-song-row"/g)||[]).length,1);
  if(tab==='recommended')assert.doesNotMatch(html,/data-play=/);else assert.match(html,/data-play="cover-1"/);
  assert.match(html,/data-track-menu="cover-1"/);
  assert.match(html,/existing-cover/);assert.ok(html.includes('기존 곡'));
  const target=tab==='duets'?'#sing/original-1?duet=cover-1':'#sing/cover-1';
  assert.ok(html.includes('href="'+target+'"'),target);
 }
});

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
 const c=playUI();
 assert.equal(c.playAlias('#community/following'),'#karaoke/browse?tab=following&type=all');
 assert.equal(c.playAlias('#community/following?type=duet'),'#karaoke/browse?tab=following&type=duet');
 for(const people of ['following','followers'])assert.equal(c.playAlias('#community/following?people='+people),null);
 assert.equal(c.playAlias('#community/covers?mode=solo'),'#karaoke/browse?tab=recommended&type=solo');
 assert.equal(c.playAlias('#community/covers?mode=duet'),'#karaoke/browse?tab=recommended&type=duet');
 assert.equal(c.playAlias('#dubbing?tab=mine'),'#karaoke/dubbing?tab=mine');
 for(const route of ['#sing/one?duet=half','#sing/one?draft=1','#dubbing/new?mode=manual','#dubbing/id?record=1','#song/one?covers=duet'])assert.equal(c.playAlias(route),null);
 for(const mode of ['song','dubbing','browse'])for(const [key] of vm.runInContext('playSections.'+mode,c)){const href=c.playHref(mode,key),raw=href.slice(1),param=raw.split('/')[1]?.split('?')[0];assert.equal(c.playSelection(param,raw).tab,key);}
});

test('song rows search the full singable catalog and count people instead of recordings',async t=>{
 const f=await setup(t);
 f.sql.exec("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','ready','ready',1,'ready',0,0); UPDATE artists SET name='Voice Moon'; UPDATE producers SET name='Creator Sun' WHERE id='producer'");
 f.cover('another-solo');
 for(const q of ['one','Creator Sun','Voice Moon']){
  const r=await f.call('/api/play/songs?q='+encodeURIComponent(q));assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(r.body.tracks.map(x=>x.id),['one']);assert.equal(r.body.tracks[0].participants,1);
 }
 assert.equal((await f.call('/api/play/songs?q=missing')).body.tracks.length,0);
 assert.equal((await f.call('/api/play/songs?tab=invalid')).status,400);
 assert.equal((await f.call('/api/play/songs','POST',{})).status,405);
 f.sql.exec("UPDATE karaoke_jobs SET mr_ready=0 WHERE track_id='one'");
 assert.equal((await f.call('/api/play/songs')).body.tracks.length,0);
});

test('song pagination searches beyond the first page and duet entry keeps existing eligibility',async t=>{
 const f=await setup(t);
 f.sql.exec("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','ready','ready',1,'ready',0,0)");
 for(let i=0;i<30;i++){
  const id='mr-'+i;
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,karaoke_at) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,?,'published',1)").run(id,id,i+1);
  f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES(?,?,'ready',1,'ready',0,0)").run(id,id);
 }
 const first=(await f.call('/api/play/songs?tab=latest')).body,next=(await f.call('/api/play/songs?tab=latest&offset='+first.nextOffset)).body;
 assert.equal(first.tracks.length,25);assert.equal(next.tracks.length,6);assert.equal(new Set([...first.tracks,...next.tracks].map(x=>x.id)).size,31);
 assert.deepEqual((await f.call('/api/play/songs?q=mr-0')).body.tracks.map(x=>x.id),['mr-0']);
 assert.deepEqual((await f.call('/api/play/songs?tab=duets')).body.tracks.map(x=>x.id),['half']);
 assert.equal((await f.call('/api/play/songs?tab=duets','GET',null,'other')).body.tracks.length,0);
 f.sql.exec("UPDATE karaoke_jobs SET mr_ready=0 WHERE track_id='one'");
 assert.equal((await f.call('/api/play/songs?tab=duets')).body.tracks.length,0);
});


test('dubbing artwork failures use the existing default artwork once and never touch music/profile images',()=>{
 const c=nicknameContext({AifectDubbing});vm.runInContext(readFileSync(new URL('../dist/play-page.js',import.meta.url),'utf8'),c);
 let src='/assets/dubbing-genres/action.webp',writes=0;
 const image={matches:s=>s==='img.play-dubbing-art',getAttribute:()=>src,setAttribute(k,v){assert.equal(k,'src');src=v;writes++;}};
 c.playDubbingArtworkError({target:image});assert.equal(src,AifectDubbing.dubbingGenreArtwork());assert.equal(writes,1);
 c.playDubbingArtworkError({target:image});assert.equal(writes,1,'a missing default cannot create an error loop');
 c.playDubbingArtworkError({target:{...image,matches:()=>false}});assert.equal(writes,1);
 c.playDubbingArtworkError({target:{}});assert.equal(writes,1);
});


test('browse artwork keeps each project genre and detail URL across recommended and following',async t=>{
 const f=await setup(t),action=await f.dub('액션 작품'),romance=await f.dub('로맨스 작품');
 for(const [work,genres] of [[action,['액션']],[romance,['로맨스']]])f.sql.prepare("UPDATE dubbing_projects SET options_json=json_set(options_json,'$.genres',json(?)) WHERE id=?").run(JSON.stringify(genres),work.id);
 f.sql.exec("INSERT INTO follows VALUES('owner','producer','friend',0)");
 const c=nicknameContext({AifectDubbing,esc:s=>String(s??''),time:String,icon:()=>''});vm.runInContext(readFileSync(new URL('../dist/play-page.js',import.meta.url),'utf8'),c);
 for(const tab of ['recommended','following']){
  const r=await f.call('/api/play/works?tab='+tab);assert.equal(r.status,200);
  for(const [work,slug] of [[action,'action'],[romance,'romance']]){
   const project=r.body.works.find(w=>w.id===work.id),html=c.playDubbingCard(project);assert.match(html,new RegExp('/assets/dubbing-genres/'+slug+'\\.webp'));assert.ok(html.includes('#dubbing/'+work.id));assert.doesNotMatch(html,/\/media\/producer|profile-avatar-image/);
  }
  assert.ok(r.body.works.some(w=>w.type==='solo'));assert.ok(r.body.works.some(w=>w.type==='duet'));
 }
 for(const genre of AifectDubbing.DUBBING_GENRES){const path=AifectDubbing.dubbingGenreArtwork([genre]);assert.ok(readFileSync(new URL('../dist'+path,import.meta.url)).length>0);}
 for(const genres of [[],null,['알 수 없는 장르']])assert.equal(AifectDubbing.dubbingGenreArtwork(genres),'/assets/dubbing-genres/daily.webp');
});

 test('compact browse controls preserve work types and put the select next to search',()=>{
 const c=nicknameContext({esc:String,icon:()=>'',Date});vm.runInContext(readFileSync(new URL('../dist/play-page.js',import.meta.url),'utf8'),c);
 const html=c.playToolbar({mode:'browse',tab:'following',type:'duet'});
 assert.match(html,/play-discovery-tools/);assert.match(html,/id="play-search"/);assert.match(html,/aria-label="플레이 작품 검색"/);assert.match(html,/value="duet" selected/);
 assert.deepEqual([...html.matchAll(/option value="([^"]+)"/g)].map(m=>m[1]),['all','solo','duet','dubbing']);
 assert.doesNotMatch(c.playToolbar({mode:'song'}),/play-work-type|play-discovery-tools/);
 });

 test('flat PLAY drafts preserve solo and duet resume URLs and deletion keys',()=>{
 const c=nicknameContext({esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('\"','&quot;'),icon:()=>'',heading:()=>'',time:String,Date,document:{addEventListener(){}}});
 vm.runInContext(readFileSync(new URL('../dist/sing-drafts.js',import.meta.url),'utf8'),c);vm.runInContext(readFileSync(new URL('../dist/play-page.js',import.meta.url),'utf8'),c);
 const drafts=[{draftKey:'owner:one',id:'one',mode:'solo',part:'male',title:'<길고 긴 제목>',artist:'음악가',duration:12,updated:0},{draftKey:'owner:two:duet:female:first',id:'two',mode:'duet',part:'female',duration:22,updated:0},{draftKey:'owner:one:duet:male:parent',id:'one',mode:'duet',part:'male',parent:'parent',duration:32,updated:0}];
 const old=c.karaokeDraftsHTML(drafts),html=c.playDraftRows(drafts);
 assert.deepEqual([...html.matchAll(/href="(#[^"]*draft=1)"/g)].map(m=>m[1]),[...old.matchAll(/href="(#[^"]*draft=1)"/g)].map(m=>m[1]));
 for(const key of ['data-draft-key','data-delete-draft','data-draft-title'])assert.deepEqual([...html.matchAll(new RegExp(key+'="([^"]+)"','g'))].map(m=>m[1]),[...old.matchAll(new RegExp(key+'="([^"]+)"','g'))].map(m=>m[1]));
 assert.doesNotMatch(html,/MY RECORDINGS|draft-workspace|recording-draft/);assert.match(html,/&lt;길고 긴 제목>/);assert.match(html,/play-draft-row/);
 const empty=c.playDraftRows([]);assert.match(empty,/data-delete-all-drafts disabled/);assert.match(empty,/첫 목소리를 기다리고 있어요/);
 });

test('PLAY duet counts and child pages use the exact half ID and distinct visible participants',async t=>{
 const f=await setup(t);
 f.sql.exec("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','duet-qa','ready',1,'ready',0,0)");
 f.cover('other-half',{mode:'duet',open:1});
 f.cover('child-a',{mode:'duet',parent:'half',owner:'owner'});
 f.cover('child-b',{mode:'duet',parent:'half',owner:'owner'});
 f.cover('wrong-parent',{mode:'duet',parent:'other-half',owner:'owner'});
 f.cover('inconsistent-child',{mode:'duet',parent:'half',owner:'owner'});
 f.sql.exec("UPDATE tracks SET original_id='two' WHERE id='inconsistent-child'");
 f.cover('hidden-child',{mode:'duet',parent:'half',status:'hidden',owner:'owner'});
 f.sql.exec("UPDATE tracks SET title='same title' WHERE kind='cover'");
 const page=(await f.call('/api/play/songs?tab=duets')).body;
 const half=page.tracks.find(x=>x.id==='half');assert.equal(half.participants,1);assert.equal(half.completions,3);
 assert.equal(half.producer,'Friend');assert(page.tracks.every(x=>!x.duet_parent_id));
 const children=(await f.call('/api/tracks/one/covers?view=children&parent=half')).body;
 assert.deepEqual(new Set(children.covers.map(x=>x.id)),new Set(['duet','child-a','child-b']));
 assert(children.covers.every(x=>x.duet_parent_id==='half'&&x.producer));
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',1)");
 assert.equal((await f.call('/api/play/songs?tab=duets')).body.tracks.length,0);
});

test('duet child pagination reaches every completion without mixing another recruitment',async t=>{
 const f=await setup(t);
 f.sql.exec("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','duet-pages','ready',1,'ready',0,0)");
 for(let i=0;i<55;i++)f.cover('child-'+i,{mode:'duet',parent:'half',owner:'owner'});
 const half=(await f.call('/api/play/songs?tab=duets')).body.tracks.find(x=>x.id==='half');assert.equal(half.completions,56);assert.equal(half.participants,1);
 const first=(await f.call('/api/tracks/one/covers?view=children&parent=half')).body;
 const second=(await f.call('/api/tracks/one/covers?view=children&parent=half&offset='+first.next_offset)).body;
 assert.equal(first.covers.length,50);assert.equal(second.covers.length,6);assert.equal(second.next_offset,null);
 assert.equal(new Set([...first.covers,...second.covers].map(x=>x.id)).size,56);
});

test('PLAY duet expansion fetches children once, toggles locally and keeps child playback IDs',async()=>{
 const attrs={},target={dataset:{},hidden:true,innerHTML:'',isConnected:true},calls=[];
 class Element{closest(){return this;}}
 class Button extends Element{constructor(){super();this.dataset={playDuetChildren:'half',original:'original'};this.disabled=false;}setAttribute(k,v){attrs[k]=v;}removeAttribute(k){delete attrs[k];}}
 const button=new Button(),root={dataset:{},isConnected:true,addEventListener(type,fn){this.listener=fn;},querySelector(){return button;}};
 const c=nicknameContext({URLSearchParams,Element,HTMLButtonElement:Button,CSS:{escape:s=>s},document:{getElementById:()=>target},esc:String,icon:()=>'',
  api:async path=>{calls.push(path);return {covers:[{id:'child',duet_parent_id:'half'}],next_offset:null};},remember(){},paintInteractions(){},bindSongCoverPlayback(){},toast(){},
  songCoverRowHTML:t=>'<button data-play="'+t.id+'">child</button>',setSongCoverExpanded(b,t,on){t.hidden=!on;b.setAttribute('aria-expanded',String(on));}});
 vm.runInContext(readFileSync(new URL('../dist/play-page.js',import.meta.url),'utf8'),c);c.bindPlayDuetChildren(root);
 const click=()=>root.listener({target:button,preventDefault(){},stopPropagation(){}});
 await click();assert.match(calls[0],/tracks\/original\/covers\?view=children&parent=half&offset=0/);assert.equal(target.hidden,false);assert.match(target.innerHTML,/data-play="child"/);assert.doesNotMatch(target.innerHTML,/data-play="half"/);
 await click();assert.equal(target.hidden,true);await click();assert.equal(target.hidden,false);assert.equal(calls.length,1);assert.equal(button.disabled,false);assert.equal(attrs['aria-busy'],undefined);
});
