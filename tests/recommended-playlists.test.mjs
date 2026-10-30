import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/explorer.js',import.meta.url),'utf8');
function client(api=async()=>({tracks:[{id:'first'},{id:'second'}]})){
 let click;const played=[],messages=[];
 const c=vm.createContext({me:{id:'listener'},renderId:1,api,esc:s=>String(s),number:String,icon:s=>`<svg data-icon="${s}"></svg>`,playlistArt:()=>'<div>real art</div>',empty:m=>m,
  document:{addEventListener:(type,fn)=>{click=fn;}},remember:tracks=>c.remembered=tracks,play:async(id,tracks)=>played.push({id,tracks}),toast:m=>messages.push(m),location:{hash:'#collections'},askLogin:()=>messages.push('login')});
 vm.runInContext(source.slice(source.indexOf('function recommendedPlaylistBookmark'),source.indexOf('function discoveryTabs')),c);
 vm.runInContext(source.slice(source.indexOf("document.addEventListener('click',async e=>"),source.indexOf('try{const restored=')),c);
 return {c,played,messages,click:b=>click({target:{closest:()=>b}})};
}
const playlist={id:'actual-id',user_id:'creator',name:'Actual playlist',description:'Detail-only description',owner_name:'Actual creator',tracks:4,saves:7,covers:[]};
test('recommendations render only returned playlists with creator, counts, detail links and saved state',()=>{
 const {c}=client(),html=c.recommendedPlaylistGrid([playlist,{...playlist,id:'saved',saved:true}],'empty');
 assert.equal((html.match(/<article /g)||[]).length,2);
 assert.match(html,/Actual creator/);assert.match(html,/4곡/);assert.match(html,/7<\/span>명 저장/);
 assert.match(html,/#playlist\/actual-id/);assert.match(html,/data-saved="true" aria-pressed="true"/);
 assert.doesNotMatch(html,/Detail-only description|내 플레이리스트|collection-kind/);
 assert.equal(c.recommendedPlaylistGrid([],'No results'),'No results');
});
test('own playlists keep their detail link; empty and locked playlists cannot play',()=>{
 const {c}=client();
 assert.doesNotMatch(c.recommendedPlaylistCard({...playlist,user_id:'listener'}),/data-save-collection/);
 for(const p of [{...playlist,tracks:0},{...playlist,locked:true}])assert.match(c.recommendedPlaylistCard(p),/재생" disabled/);
});
test('play calls the existing player with the complete ordered playlist once during a pending read',async()=>{
 let resolve;const h=client(()=>new Promise(r=>resolve=r)),b={dataset:{recommendedPlaylist:'actual-id'},isConnected:true};
 const first=h.click(b);await h.click(b);assert.equal(b.disabled,true);
 const tracks=[{id:'first'},{id:'second'}];resolve({tracks});await first;
 assert.equal(h.played.length,1);assert.equal(h.played[0].id,'first');assert.equal(h.played[0].tracks,tracks);assert.equal(h.c.remembered,tracks);assert.equal(b.disabled,false);
});
test('navigation, account changes and detached cards discard a pending play response',async()=>{
 for(const change of [h=>h.c.renderId++,h=>h.c.me={id:'another'},(_,b)=>b.isConnected=false]){
  let resolve;const h=client(()=>new Promise(r=>resolve=r)),b={dataset:{recommendedPlaylist:'actual-id'},isConnected:true};
  const pending=h.click(b);change(h,b);resolve({tracks:[{id:'first'}]});await pending;assert.equal(h.played.length,0);assert.equal(b.disabled,false);
 }
});
test('empty and failed playlist reads recover controls and show existing feedback',async()=>{
 for(const api of [async()=>({tracks:[]}),async()=>{throw Error('Playlist unavailable');}]){
  const h=client(api),b={dataset:{recommendedPlaylist:'actual-id'},isConnected:true};await h.click(b);
  assert.equal(h.played.length,0);assert.equal(b.disabled,false);assert.equal(h.messages.length,1);
 }
});

 test('bookmark save and unsave preserve SVG, labels, API methods and refreshed counts',async()=>{
 const calls=[];const h=client(async(path,method)=>{calls.push({path,method});return {playlist:{saves:method?0:8}};});
 h.c.refreshLibrary=async()=>{calls.push({refresh:true});};
 const count={isConnected:true,textContent:'7'},card={querySelector:()=>count},attrs={};
 const b={dataset:{saveCollection:'actual-id',saved:'false'},innerHTML:h.c.recommendedPlaylistBookmark(),isConnected:true,
 closest:()=>card,setAttribute:(k,v)=>attrs[k]=v};
 const svg=b.innerHTML;
 await h.click(b);
 assert.equal(b.innerHTML,svg);assert.equal(b.textContent,undefined);assert.equal(b.dataset.saved,'true');
 assert.equal(attrs['aria-pressed'],'true');assert.equal(attrs['aria-label'],'보관함 저장 해제');assert.equal(attrs.title,'보관함 저장 해제');assert.equal(count.textContent,'8');
 await h.click(b);
 assert.equal(b.innerHTML,svg);assert.equal(b.dataset.saved,'false');assert.equal(attrs['aria-label'],'보관함 저장');assert.equal(b.disabled,false);
 assert.deepEqual(calls.filter(x=>x.method).map(x=>x.method),['PUT','DELETE']);assert.equal(calls.filter(x=>x.refresh).length,2);
 });
 test('anonymous and failed saves keep the original bookmark state',async()=>{
 for(const anonymous of [true,false]){
 const h=client(async()=>{throw Error('Save failed');});h.c.refreshLibrary=async()=>{};if(anonymous)h.c.me=null;
 const attrs={},b={dataset:{saveCollection:'actual-id',saved:'false'},innerHTML:h.c.recommendedPlaylistBookmark(),closest:()=>({}),setAttribute:(k,v)=>attrs[k]=v};
 const svg=b.innerHTML;await h.click(b);assert.equal(b.innerHTML,svg);assert.equal(b.dataset.saved,'false');assert.equal(b.disabled,false);assert.equal(h.messages[0],anonymous?'login':'Save failed');
 }
 });
