import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('dist/explorer.js','utf8');
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function client(api=async()=>({saved:true,saves:8})){
 let click;const messages=[],buttons=[],cards=[];
 const c=vm.createContext({me:{id:'listener'},api,esc:escape,number:String,icon:s=>`<svg data-icon="${s}"></svg>`,playlistArt:()=>'<div>real art</div>',empty:m=>m,
  document:{addEventListener:(type,fn)=>{click=fn;},querySelectorAll:s=>s==='[data-save-collection]'?buttons:cards},toast:m=>messages.push(m),location:{hash:'#collections'},askLogin:()=>messages.push('login'),refreshLibrary:async()=>{}});
 vm.runInContext(source.slice(source.indexOf('function recommendedPlaylistBookmark'),source.indexOf('function discoveryTabs')),c);
 vm.runInContext(source.slice(source.indexOf("document.addEventListener('click',async e=>"),source.indexOf('try{const restored=')),c);
 const addCard=()=>{
  const attrs={},count={textContent:'7'},b={dataset:{saveCollection:'actual-id',saved:'false'},innerHTML:c.recommendedPlaylistBookmark(),classList:{contains:n=>n==='public-playlist-bookmark'},setAttribute:(k,v)=>attrs[k]=v};
  buttons.push(b);cards.push({dataset:{publicPlaylist:'actual-id'},querySelector:()=>count});return {b,attrs,count};
 };
 return {c,messages,addCard,click:async b=>{const e={target:{closest:()=>b},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};await click(e);return e;}};
}
const playlist={id:'actual-id',user_id:'creator',name:'Actual playlist',description:'Actual description',owner_name:'Actual creator',tracks:4,saves:7,covers:[]};
test('public cards use the owner, description, counts and detail link with a separate bookmark',()=>{
 const {c}=client(),html=c.recommendedPlaylistGrid([playlist,{...playlist,id:'saved',saved:true}],'empty');
 assert.equal((html.match(/<article /g)||[]).length,2);
 for(const text of ['Actual creator','Actual description','4곡 수록','7</span>명 저장','#playlist/actual-id','data-saved="true" aria-pressed="true"'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/data-(?:home|recommended)-playlist=|재생|캐러셀/);assert.ok(html.indexOf('</a>')<html.indexOf('<button'));
 assert.equal(c.recommendedPlaylistGrid([],'No results'),'No results');
 const own=c.recommendedPlaylistCard({...playlist,user_id:'listener'});assert.doesNotMatch(own,/data-save-collection/);assert.match(own,/disabled.*이미 보관함에 있음/);
});
test('preview preserves order, caps three, escapes text, omits absent descriptions and calculates remainder',()=>{
 const {c}=client();
 for(const n of [0,1,2,3,4,20]){
  const covers=Array.from({length:Math.min(n,4)},(_,i)=>({id:String(i),title:'긴 곡명 <'+i,artist:'아티스트 '+i}));
  const html=c.recommendedPlaylistCard({...playlist,tracks:n,covers,saves:0});
  assert.equal((html.match(/class="public-playlist-index"/g)||[]).length,Math.min(n,3));assert.match(html,/0<\/span>명 저장/);assert.ok(html.includes(n+'곡 수록'));
  assert.doesNotMatch(html,/외 0곡|긴 곡명 <\d/);if(n>3)assert.ok(html.includes('외 '+(n-3)+'곡'));else assert.doesNotMatch(html,/외 \d+곡/);
  for(let i=0;i<Math.min(n,3);i++)assert.ok(html.includes('>0'+(i+1)+'</span><span class="public-playlist-song">긴 곡명 &lt;'+i));
 }
 const html=c.recommendedPlaylistCard({...playlist,description:'',name:'<제목>',owner_name:'<소유자>'});
 assert.doesNotMatch(html,/public-playlist-description|좋아하는 음악|리스너/);assert.match(html,/&lt;제목>/);assert.match(html,/&lt;소유자>/);
});
test('save and unsave synchronize both cards and real counts without reading full playlists or navigating',async()=>{
 const calls=[],h=client(async(path,method)=>{calls.push({path,method});return {saved:method==='PUT',saves:method==='PUT'?8:7};});h.c.refreshLibrary=async fresh=>calls.push({fresh});
 const a=h.addCard(),b=h.addCard(),svg=a.b.innerHTML,event=await h.click(a.b);assert.equal(event.prevented,true);assert.equal(event.stopped,true);
 for(const card of [a,b]){assert.equal(card.b.dataset.saved,'true');assert.equal(card.attrs['aria-pressed'],'true');assert.equal(card.count.textContent,'8');}
 h.c.location.hash='#home';await h.click(b.b);
 for(const card of [a,b]){assert.equal(card.b.dataset.saved,'false');assert.equal(card.attrs['aria-label'],'보관함 저장');assert.equal(card.count.textContent,'7');assert.equal(card.b.innerHTML,svg);}
 assert.deepEqual(calls.filter(x=>x.method),[{path:'/api/playlists/actual-id/save',method:'PUT'},{path:'/api/playlists/actual-id/save',method:'DELETE'}]);assert.equal(calls.filter(x=>x.fresh===true).length,2);
});
test('anonymous and failed saves retain the original bookmark, SVG and count',async()=>{
 for(const anonymous of [true,false]){
  const h=client(async()=>{throw Error('Save failed');});if(anonymous)h.c.me=null;
  const {b,count}=h.addCard(),svg=b.innerHTML;await h.click(b);
  assert.equal(b.innerHTML,svg);assert.equal(b.dataset.saved,'false');assert.equal(count.textContent,'7');assert.equal(b.disabled,false);assert.equal(h.messages[0],anonymous?'login':'Save failed');
 }
});
test('pending saves are single-flight and cannot update another signed-in account',async()=>{
 let resolve,calls=0;const h=client(()=>{calls++;return new Promise(r=>resolve=r);}),a=h.addCard(),b=h.addCard();
 const pending=h.click(a.b);await h.click(b.b);assert.equal(calls,1);h.c.me={id:'another'};resolve({saved:true,saves:8});await pending;
 assert.equal(a.b.dataset.saved,'false');assert.equal(b.count.textContent,'7');assert.equal(h.messages.length,0);
});
test('navigation during save updates the current card; library refresh failures do not undo persisted state',async()=>{
 let resolve;const h=client(()=>new Promise(r=>resolve=r)),a=h.addCard();h.c.refreshLibrary=async()=>{throw Error('Network');};
 const pending=h.click(a.b);h.c.location.hash='#home';const b=h.addCard();resolve({saved:true,saves:9});await pending;
 assert.equal(b.b.dataset.saved,'true');assert.equal(b.count.textContent,'9');assert.equal(h.messages.length,1);
});
test('search sizing reads the dropdown border box without enlarging it and cleans up detached forms',()=>{
 const {c}=client();let measure,disconnected=0;const values=[],trigger={getBoundingClientRect:()=>({height:37.5})};
 c.window={AifectDropdown:{mount:()=>({button:trigger})}};c.ResizeObserver=class{constructor(fn){measure=fn;}observe(el){assert.equal(el,trigger);}disconnect(){disconnected++;}};
 const form={elements:{sort:{}},isConnected:true,style:{setProperty:(k,v)=>values.push([k,v])}};c.alignCollectionSearchHeight(form);
 assert.deepEqual(values,[['--collection-control-height','37.5px']]);trigger.getBoundingClientRect=()=>({height:38});measure();assert.equal(values.at(-1)[1],'38px');
 form.isConnected=false;measure();assert.equal(disconnected,1);assert.equal(trigger.style,undefined);
});
