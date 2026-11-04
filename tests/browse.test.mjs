import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function viewContext(responses={},user=null){
 const calls=[];
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const context=vm.createContext({document:{addEventListener(){}},me:user,inApp:false,location:{hash:'#library/covers'},URLSearchParams,Date,esc,number:n=>String(n),
  heading:(title,description='')=>`<h1>${esc(title)}</h1><p>${esc(description)}</p>`,gate:()=>'<p>LOGIN REQUIRED</p>',giftButton:()=>'',icon:()=>'',
  empty:(title,description,href,label)=>`<p>${esc(title)}</p><a href="${href}">${esc(label)}</a>`,
  portrait:()=>'',followed:()=>false,cover:()=>'',credits:()=>'',trackStats:()=>'',time:()=>'',liked:()=>false,duetLobbyHTML:()=>'<h2>참여를 기다리는 듀엣</h2>',
  api:async path=>{calls.push(path);if(!(path in responses))throw Error('Unexpected API '+path);return responses[path];},
  list:tracks=>tracks.map(t=>esc(t.title)).join(','),section:title=>`<h2>${esc(title)}</h2>`,
  library:{follows:[]},refreshLibrary:async()=>{},identityCards:()=>'',moodOptions:[],genres:[],remember:()=>{}
 });
 vm.runInContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').match(/^const hasArtist=.*$/m)[0],context);
 vm.runInContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').split('function songTable(')[1].split('function identityCards(')[0].replace(/^/,'function songTable('),context);
 vm.runInContext(readFileSync(new URL('../dist/music-ui.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../dist/community.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../dist/singing-hub.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../dist/browse.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../dist/page-redesign.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../dist/social-layouts.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../dist/release-refinements.js',import.meta.url),'utf8'),context);
 return {context,calls,view:(base,param,raw='')=>context.browseView(base,param,raw)};
}
test('cover chart uses its full results and retains playlist and period controls',async()=>{
 const path='/api/cover-rankings?kind=tracks&period=week&include_unranked=1&full=1';
 const {view,calls}=viewContext({[path]:{tracks:[]}});
 const d=await view('charts','karaoke');assert.deepEqual(calls,[path]);assert.match(d.html,/노래방 차트/);assert.equal(d.chartKind,'karaoke');assert.match(d.html,/data-chart-playlist/);assert.match(d.html,/period=month/);assert.match(d.html,/disabled/);
 const sing=await viewContext({'/api/karaoke':{tracks:[{id:'ready',title:'Ready',created:0}]},'/api/duets':{tracks:[]}}).view('karaoke');assert.match(sing.html,/#sing\/ready/);assert.match(sing.html,/바로 부르기/);assert.match(sing.html,/참여 대기 듀엣/);
});
test('community filters covers and originals through the public API',async()=>{
 const {view,calls}=viewContext({'/api/community?kind=cover&cover_mode=solo':{tracks:[]},'/api/community?kind=original':{tracks:[]}});
 await view('community','covers');await view('community','originals');assert.deepEqual(calls,['/api/community?kind=cover&cover_mode=solo','/api/community?kind=original']);
});
test('private library and following routes require login before fetching personal data',async()=>{
 const {view,calls}=viewContext();for(const [base,param] of [['community','following'],['library','history'],['library','covers'],['library','originals']])assert.match((await view(base,param)).html,/LOGIN REQUIRED/);assert.deepEqual(calls,[]);
 const c=vm.createContext({URLSearchParams,me:null,location:{hash:'#library/following'},gate:()=>'LOGIN REQUIRED'});
 vm.runInContext(readFileSync(new URL('../dist/menu-integration.js',import.meta.url),'utf8'),c);
 vm.runInContext(readFileSync(new URL('../dist/follow-management.js',import.meta.url),'utf8'),c);
 const canonical=c.menuAlias(c.location.hash);assert.equal(canonical,'#follow?tab=following');
 assert.match((await c.followManagementView(canonical.slice(1),()=>{throw Error('private read');})).html,/LOGIN REQUIRED/);
});
test('owned covers exclude original songs and unpublished songs from the playback queue',async()=>{
 const {view}=viewContext({'/api/studio':{tracks:[{id:'cover',title:'Cover',kind:'cover',status:'published'},{id:'draft',title:'Draft',kind:'cover',status:'draft'},{id:'original',title:'Original',kind:'original',status:'published'}]}},{id:'owner'});
 const d=await view('library','covers');assert.deepEqual(Array.from(d.tracks,t=>t.id),['cover']);assert.match(d.html,/#manage\/draft/);assert.doesNotMatch(d.html,/data-play="draft"/);assert.doesNotMatch(d.html,/#manage\/original/);
});
test('community content is escaped and covers link back to their original song',async()=>{
 const {view}=viewContext({'/api/community?kind=cover&cover_mode=solo':{tracks:[{id:'cover',producer_id:'p',producer:'<img onerror=x>',title:'<script>x</script>',description:'<iframe src=x>',kind:'cover',original_id:'original',original_title:'Original',created:0}]}});
 const d=await view('community','covers');assert.doesNotMatch(d.html,/<script>|<iframe|<img onerror/);assert.match(d.html,/&lt;script&gt;/);assert.match(d.html,/#song\/original/);assert.match(d.html,/#song\/cover\?comments=1/);
});
test('search landing and unrelated routes do not perform unnecessary requests',async()=>{
 const {view,calls}=viewContext();assert.equal(await view('search'),null);assert.equal(await view('song','one'),null);assert.deepEqual(calls,[]);
});

test('popular chart shows yesterday movement instead of scores and retains calendar navigation',async()=>{
 const path='/api/catalog?section=tracks&full=1&chart=listens&period=month',track={id:'song',title:'<script>',duration:60,chart_score:65.5,chart_movement:'up',rank_change:3,chart_plays:3,chart_likes:2,chart_comments:1,chart_gifts:5};
 const {view,calls}=viewContext({[path]:{chart:{label:'이달'},tracks:[track]}});const d=await view('charts',undefined,'charts?period=month');
 assert.deepEqual(calls,[path]);assert.doesNotMatch(d.html,/65.50|인기점수|최대 100점|period=today|명예의 전당/);assert.match(d.html,/chart-movement up/);assert.ok(d.html.includes('<span class="chart-direction">▲</span><span>3</span>'));assert.match(d.html,/어제보다 3위 상승/);assert.match(d.html,/#charts\?period=all/);assert.doesNotMatch(d.html,/chart-meta|data-browse-count|총 1곡/);assert.match(d.html,/&lt;script&gt;/);assert.equal(d.tracks[0].id,'song');
});

test('chart playback keeps all playable results and shuffles a fresh queue without dropping songs',async()=>{
 const {context:c}=viewContext(),button={},mode={click(){vm.runInContext('shuffle=false',c);}};
 vm.runInContext('let routeTracks=[],shuffle=true;',c);
 c.bindCommunity=()=>{};c.document.querySelectorAll=()=>[];c.$=s=>s==='[data-browse-shuffle]'?button:s==='#shuffle'?mode:null;
 const tracks=Array.from({length:123},(_,i)=>({id:'song'+i,duration:i===0?0:60})),calls=[];
 c.play=async(id,queue)=>calls.push({id,queue:Array.from(queue,t=>t.id)});
 c.bindBrowse({chartPage:true,tracks});
 assert.equal(vm.runInContext('routeTracks.length',c),122);
 await button.onclick();assert.equal(calls.length,1);assert.equal(calls[0].id,calls[0].queue[0]);assert.equal(new Set(calls[0].queue).size,122);assert.ok(!calls[0].queue.includes('song0'));assert.equal(vm.runInContext('shuffle',c),false);
 assert.deepEqual(Array.from(tracks,t=>t.id),Array.from({length:123},(_,i)=>'song'+i));
});

test('chart highlight follows actual playback, clearing on pause, ads and media errors',()=>{
 const {context:c}=viewContext();
 const rows=['one','two','five'].map(id=>({id,playing:false,querySelector(){return {dataset:{play:id}};},classList:{toggle(_name,value){rows.find(r=>r.id===id).playing=value;}}}));
 c.document.querySelectorAll=()=>rows;
 const events={};c.audio={paused:false,ended:false,error:null,addEventListener(name,fn){events[name]=fn;}};
 c.current={id:'two'};c.window={};c.bindChartPlayback();
 assert.deepEqual(rows.map(r=>r.playing),[false,true,false]);
 c.audio.paused=true;events.pause();assert.ok(rows.every(r=>!r.playing));
 c.audio.paused=false;c.current={id:'five'};events.play();assert.deepEqual(rows.map(r=>r.playing),[false,false,true]);
 c.window.AifectAudioAds={active:true};events.play();assert.ok(rows.every(r=>!r.playing));
 c.window.AifectAudioAds.active=false;c.audio.error={code:4};events.error();assert.ok(rows.every(r=>!r.playing));
 c.audio.error=null;c.audio.ended=true;events.ended();assert.ok(rows.every(r=>!r.playing));
});
