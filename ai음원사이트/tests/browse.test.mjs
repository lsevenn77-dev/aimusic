import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function viewContext(responses={},user=null){
 const calls=[];
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const context=vm.createContext({me:user,inApp:false,location:{hash:'#library/covers'},URLSearchParams,Date,esc,number:n=>String(n),
  heading:(title,description='')=>`<h1>${esc(title)}</h1><p>${esc(description)}</p>`,gate:()=>'<p>LOGIN REQUIRED</p>',giftButton:()=>'',icon:()=>'',
  empty:(title,description,href,label)=>`<p>${esc(title)}</p><a href="${href}">${esc(label)}</a>`,
  portrait:()=>'',followed:()=>false,cover:()=>'',credits:()=>'',trackStats:()=>'',time:()=>'',liked:()=>false,duetLobbyHTML:()=>'<h2>참여를 기다리는 듀엣</h2>',
  api:async path=>{calls.push(path);if(!(path in responses))throw Error('Unexpected API '+path);return responses[path];},
  list:tracks=>tracks.map(t=>esc(t.title)).join(','),section:title=>`<h2>${esc(title)}</h2>`,
  library:{follows:[]},refreshLibrary:async()=>{},identityCards:()=>'',moodOptions:[],genres:[]
 });
 vm.runInContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').match(/^const hasArtist=.*$/m)[0],context);
 vm.runInContext(readFileSync(new URL('../dist/music-ui.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../dist/community.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../dist/browse.js',import.meta.url),'utf8'),context);
 return {context,calls,view:(base,param,raw='')=>context.browseView(base,param,raw)};
}
test('karaoke chart contains covers only and reports an empty chart without substituting MR originals',async()=>{
 const path='/api/cover-rankings?kind=tracks&period=week&include_unranked=1';
 const {view,calls}=viewContext({[path]:{tracks:[{id:'cover',kind:'cover',title:'Cover',rank:1},{id:'original',kind:'original',title:'Original'}]}});
 const d=await view('charts','karaoke');assert.deepEqual(calls,[path]);assert.deepEqual(Array.from(d.tracks,t=>t.id),['cover']);assert.doesNotMatch(d.html,/Original|#sing\/original/);
 const empty=await viewContext({[path]:{tracks:[]}}).view('charts','karaoke');assert.match(empty.html,/아직 등록된 커버곡이 없어요/);assert.match(empty.html,/disabled/);
 const sing=await viewContext({'/api/karaoke':{tracks:[{id:'ready',title:'Ready',created:0}]},'/api/duets':{tracks:[]}}).view('karaoke');assert.match(sing.html,/#sing\/ready/);assert.match(sing.html,/마이크와 이어폰/);assert.match(sing.html,/참여를 기다리는 듀엣/);
});
test('community filters covers and originals through the public API',async()=>{
 const {view,calls}=viewContext({'/api/community?kind=cover&cover_mode=solo':{tracks:[]},'/api/community?kind=original':{tracks:[]}});
 await view('community','covers');await view('community','originals');assert.deepEqual(calls,['/api/community?kind=cover&cover_mode=solo','/api/community?kind=original']);
});
test('private library and following routes require login before fetching personal data',async()=>{
 const {view,calls}=viewContext();for(const [base,param] of [['community','following'],['library','history'],['library','covers'],['library','originals'],['library','following']])assert.match((await view(base,param)).html,/LOGIN REQUIRED/);assert.deepEqual(calls,[]);
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
 const {view,calls}=viewContext();assert.match((await view('search')).html,/노래방 차트/);assert.equal(await view('song','one'),null);assert.deepEqual(calls,[]);
});

test('popular chart connects calendar tabs and explains actual weighted metrics',async()=>{
 const path='/api/catalog?section=tracks&chart=top&period=month',track={id:'song',title:'<script>',chart_score:65.5,chart_plays:3,chart_likes:2,chart_comments:1,chart_gifts:5};
 const {view,calls}=viewContext({[path]:{chart:{label:'이달'},tracks:[track]}});const d=await view('charts',undefined,'charts?period=month');
 assert.deepEqual(calls,[path]);assert.match(d.html,/65.50/);assert.match(d.html,/재생 50점/);assert.match(d.html,/명예의 전당/);assert.match(d.html,/#charts\?period=today/);assert.match(d.html,/&lt;script&gt;/);assert.equal(d.tracks[0].id,'song');
});
