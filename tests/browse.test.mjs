import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function viewContext(responses={},user=null){
 const calls=[];
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const context=vm.createContext({me:user,inApp:false,location:{hash:'#library/covers'},URLSearchParams,Date,esc,
  heading:(title,description='')=>`<h1>${esc(title)}</h1><p>${esc(description)}</p>`,gate:()=>'<p>LOGIN REQUIRED</p>',icon:()=>'',
  empty:(title,description,href,label)=>`<p>${esc(title)}</p><a href="${href}">${esc(label)}</a>`,
  cover:()=>'',credits:()=>'',trackStats:()=>'',time:()=>'',liked:()=>false,
  api:async path=>{calls.push(path);if(!(path in responses))throw Error('Unexpected API '+path);return responses[path];},
  list:tracks=>tracks.map(t=>esc(t.title)).join(','),section:title=>`<h2>${esc(title)}</h2>`,
  library:{follows:[]},refreshLibrary:async()=>{},identityCards:()=>'',moodOptions:[],genres:[]
 });
 vm.runInContext(readFileSync(new URL('../dist/browse.js',import.meta.url),'utf8'),context);
 return {context,calls,view:(base,param,raw='')=>context.browseView(base,param,raw)};
}
test('karaoke chart only requests the eligible MR catalog and preserves server ranking',async()=>{
 const {view,calls}=viewContext({'/api/karaoke':{tracks:[{id:'ready',title:'Ready',created:0},{id:'second',title:'Second',created:0}]}});
 const d=await view('charts','karaoke');assert.deepEqual(calls,['/api/karaoke']);assert.deepEqual(Array.from(d.tracks,t=>t.id),['ready','second']);assert.equal(d.tracks[1].browseRank,2);assert.match(d.html,/원곡 재생·좋아요 기준/);assert.doesNotMatch(d.html,/#sing\//);
});
test('community filters covers and originals through the public API',async()=>{
 const {view,calls}=viewContext({'/api/community?kind=cover':{tracks:[]},'/api/community?kind=original':{tracks:[]}});
 await view('community','covers');await view('community','originals');assert.deepEqual(calls,['/api/community?kind=cover','/api/community?kind=original']);
});
test('private library and following routes require login before fetching personal data',async()=>{
 const {view,calls}=viewContext();for(const [base,param] of [['community','following'],['library','history'],['library','covers'],['library','originals'],['library','following']])assert.match((await view(base,param)).html,/LOGIN REQUIRED/);assert.deepEqual(calls,[]);
});
test('owned covers exclude original songs and unpublished songs from the playback queue',async()=>{
 const {view}=viewContext({'/api/studio':{tracks:[{id:'cover',title:'Cover',kind:'cover',status:'published'},{id:'draft',title:'Draft',kind:'cover',status:'draft'},{id:'original',title:'Original',kind:'original',status:'published'}]}},{id:'owner'});
 const d=await view('library','covers');assert.deepEqual(Array.from(d.tracks,t=>t.id),['cover']);assert.match(d.html,/#manage\/draft/);assert.doesNotMatch(d.html,/data-play="draft"/);assert.doesNotMatch(d.html,/#manage\/original/);
});
test('community content is escaped and covers link back to their original song',async()=>{
 const {view}=viewContext({'/api/community?kind=cover':{tracks:[{id:'cover',producer_id:'p',producer:'<img onerror=x>',title:'<script>x</script>',description:'<iframe src=x>',kind:'cover',original_id:'original',original_title:'Original',created:0}]}});
 const d=await view('community','covers');assert.doesNotMatch(d.html,/<script>|<iframe|<img onerror/);assert.match(d.html,/&lt;script&gt;/);assert.match(d.html,/#song\/original/);assert.match(d.html,/#song\/cover\?comments=1/);
});
test('search landing and unrelated routes do not perform unnecessary requests',async()=>{
 const {view,calls}=viewContext();assert.match((await view('search')).html,/노래방 차트/);assert.equal(await view('song','one'),null);assert.deepEqual(calls,[]);
});
