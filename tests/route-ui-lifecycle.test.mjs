import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=file=>readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {resolve,promise};};

test('direct fragment entry paints the destination before the main bundle while home keeps its public fallback',()=>{
 const script=source('index.html').match(/<script id="route-initial-content">([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
 for(const [hash,title] of [['#song/one','곡 이야기'],['#profile','마이'],['#community','커뮤니티'],['#search/%3Cscript%3E','음악 검색']]){
  const main={innerHTML:'SERVER HOME',setAttribute(){}};vm.runInNewContext(script,{location:{hash},document:{getElementById:()=>main}});
  assert.doesNotMatch(main.innerHTML,/SERVER HOME|<script>/);assert.match(main.innerHTML,new RegExp(title));assert.match(main.innerHTML,/role="status"/);
 }
 for(const hash of ['','#home']){const main={innerHTML:'PUBLIC MUSIC'};vm.runInNewContext(script,{location:{hash},document:{getElementById:()=>main}});assert.equal(main.innerHTML,'PUBLIC MUSIC');}
});

test('a pending playlist dialog cannot reopen over a different route',async()=>{
 const read=deferred();let opened=0;
 const c=vm.createContext({renderId:1,me:{id:'owner'},library:{playlists:[]},refreshLibrary:()=>read.promise,dialog:()=>opened++,$:()=>({}),esc:String});
 const action=source('actions.js').match(/async function addToPlaylist[^\r\n]*/)[0];vm.runInContext(action,c);
 const opening=c.addToPlaylist('song');c.renderId++;read.resolve();await opening;
 assert.equal(opened,0);
});

test('profile activity replaces outgoing tab data with a local loading state',async()=>{
 const read=deferred(),content={innerHTML:'OLD WORKS',isConnected:true,setAttribute(){},removeAttribute(){}},aside={innerHTML:'OLD ASIDE'};
 const nodes={'#mp-content':content,'#mp-aside-content':aside,'.mp-segment':{dataset:{},querySelectorAll:()=>[]}};
 const c=vm.createContext({api:async()=>({}),me:{id:'owner'},window:{addEventListener(){}},document:{addEventListener(){}},$:selector=>nodes[selector],icons(){},paintInteractions(){},syncSongCoverPlayback(){}});
 vm.runInContext(source('mypage.js'),c);c.myActivityData=()=>read.promise;c.myActivityHTML=()=>'<p>NEW ACTIVITY</p>';c.myActivityAside=()=>'<p>NEW ASIDE</p>';
 vm.runInContext("myPageState={own:true,account:'owner',tab:'works',d:{}}",c);
 const opening=c.mySelectTab('activity',false);
 assert.doesNotMatch(content.innerHTML,/OLD WORKS/);assert.match(content.innerHTML,/불러오는/);assert.doesNotMatch(aside.innerHTML,/OLD ASIDE/);
 read.resolve({});await opening;assert.match(content.innerHTML,/NEW ACTIVITY/);
});

function skin(){
 let observer,scans=0,styles=0;
 const item={matches:()=>false,classList:{contains:()=>false,add(){}},scrollWidth:100,clientWidth:100};
 const c=vm.createContext({MutationObserver:class{constructor(fn){observer=fn;}observe(){}},requestAnimationFrame:fn=>{fn();return 0;},getComputedStyle:()=>{styles++;return {overflowX:'hidden'};},window:{addEventListener(){}},document:{body:{},querySelector:()=>null,querySelectorAll:selector=>{scans++;return selector.startsWith('#main')?[item]:[];}}});
 vm.runInContext(source('unified-search.js'),c);scans=0;styles=0;
 return {fire:records=>observer(records),counts:()=>({scans,styles})};
}
test('playback text updates do not repeatedly rescan every page element',()=>{
 const c=skin();for(let i=0;i<60;i++)c.fire([{addedNodes:[{nodeType:3}],removedNodes:[]}]);
 assert.equal(c.counts().scans,0);
 c.fire([{addedNodes:[{nodeType:1}],removedNodes:[]}]);assert.ok(c.counts().scans>0,'new controls must still receive the existing search skin');
});
test('nonoverflowing elements do not need computed-style reads during scrollbar discovery',()=>{
 const c=skin();c.fire([{addedNodes:[{nodeType:1}],removedNodes:[]}]);assert.equal(c.counts().styles,0);
});
test('an image decoded after leaving the editor releases its bitmap without opening a crop dialog',async()=>{
 const read=deferred();let closed=0,created=0;
 const c=vm.createContext({renderId:1,decodeUploadImage:()=>read.promise,document:{addEventListener(){},createElement(){created++;throw Error('Must not open a dialog');}}});
 vm.runInContext(source('image-crop.js'),c);
 const opening=c.cropPhotoEditor({type:'image/png',size:10});c.renderId++;
 read.resolve({width:100,height:100,close(){closed++;}});await assert.rejects(opening,/취소/);assert.equal(closed,1);assert.equal(created,0);
});
