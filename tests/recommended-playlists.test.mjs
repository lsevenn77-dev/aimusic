import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('dist/explorer.js','utf8');
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function client(){
 const c=nicknameContext({me:{id:'listener'},esc:escape,number:String,icon:s=>`<svg data-icon="${s}"></svg>`,playlistArt:()=>'<div>real art</div>',empty:m=>m});
 vm.runInContext(source.slice(source.indexOf('function recommendedPlaylistCard'),source.indexOf('function discoveryTabs')),c);
 return {c};
}
const playlist={id:'actual-id',user_id:'creator',name:'Actual playlist',description:'Actual description',owner_name:'Actual creator',tracks:4,saves:7,covers:[]};
test('public cards keep creator, count and detail links without saved or pinned controls',()=>{
 const {c}=client(),html=c.recommendedPlaylistGrid([playlist,{...playlist,id:'legacy',saved:true,pinned:true}],'empty');
 assert.equal((html.match(/<article /g)||[]).length,2);
 for(const text of ['Actual creator','Actual description','4곡 수록','#playlist/actual-id'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/data-save|data-pin|bookmark|명 저장|고정|<button/);
 assert.equal(c.recommendedPlaylistGrid([],'No results'),'No results');
 assert.doesNotMatch(c.recommendedPlaylistCard({...playlist,user_id:'listener'}),/disabled|저장|고정|<button/);
});
test('preview preserves order, caps three, escapes text, omits absent descriptions and calculates remainder',()=>{
 const {c}=client();
 for(const n of [0,1,2,3,4,20]){
  const covers=Array.from({length:Math.min(n,4)},(_,i)=>({id:String(i),title:'긴 곡명 <'+i,artist:'아티스트 '+i}));
  const html=c.recommendedPlaylistCard({...playlist,tracks:n,covers,saves:0});
  assert.equal((html.match(/class="public-playlist-index"/g)||[]).length,Math.min(n,3));assert.doesNotMatch(html,/명 저장|bookmark/);assert.ok(html.includes(n+'곡 수록'));
  assert.doesNotMatch(html,/외 0곡|긴 곡명 <\d/);if(n>3)assert.ok(html.includes('외 '+(n-3)+'곡'));else assert.doesNotMatch(html,/외 \d+곡/);
  for(let i=0;i<Math.min(n,3);i++)assert.ok(html.includes('>0'+(i+1)+'</span><span class="public-playlist-song">긴 곡명 &lt;'+i));
 }
 const html=c.recommendedPlaylistCard({...playlist,description:'',name:'<제목>',owner_name:'<소유자>'});
 assert.doesNotMatch(html,/public-playlist-description|좋아하는 음악|리스너/);assert.match(html,/&lt;제목>/);assert.match(html,/&lt;소유자>/);
});
test('search sizing reads the dropdown border box without enlarging it and cleans up detached forms',()=>{
 const {c}=client();let measure,disconnected=0;const values=[],trigger={getBoundingClientRect:()=>({height:37.5})};
 c.window={AifectDropdown:{mount:()=>({button:trigger})}};c.ResizeObserver=class{constructor(fn){measure=fn;}observe(el){assert.equal(el,trigger);}disconnect(){disconnected++;}};
 const form={elements:{sort:{}},isConnected:true,style:{setProperty:(k,v)=>values.push([k,v])}};c.alignCollectionSearchHeight(form);
 assert.deepEqual(values,[['--collection-control-height','37.5px']]);trigger.getBoundingClientRect=()=>({height:38});measure();assert.equal(values.at(-1)[1],'38px');
 form.isConnected=false;measure();assert.equal(disconnected,1);assert.equal(trigger.style,undefined);
});
test('playlist detail retains owner editors and visitor playback without save or pin actions',async()=>{
 const {c}=client();Object.assign(c,{URLSearchParams,time:()=>'',list:()=>'<div>tracks</div>'});
 vm.runInContext(source.slice(source.indexOf('async function explorerView'),source.indexOf('function filteredCollections')),c);
 for(const owned of [true,false]){
  const p={...playlist,user_id:owned?'listener':'creator',is_public:1,locked:true};
  const result=await c.explorerView('playlist',p.id,'playlist/'+p.id,false,async()=>({playlist:p,tracks:[{id:'song'}]}));
  assert.match(result.html,/data-play-all/);assert.doesNotMatch(result.html,/data-save|data-pin|명 저장|고정/);
  for(const action of ['data-pick-playlist','data-order-playlist','data-edit-playlist'])assert.equal(result.html.includes(action),owned);
 }
 const requests=[];const result=await c.explorerView('collections','','collections?sort=popular',false,async path=>{requests.push(path);return {playlists:[]};});
 assert.match(requests[0],/sort=recent/);assert.doesNotMatch(result.html,/많이 저장|value="popular"/);
});
