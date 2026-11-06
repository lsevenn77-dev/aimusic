import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=file=>readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {resolve,promise};};

test('all direct fragments hide public HTML until the current app render is ready',()=>{
 for(const hash of ['', '#home','#song/one','#profile','#community','#search/%3Cscript%3E']){
  const root={dataset:{}},main={innerHTML:'PUBLIC MUSIC',setAttribute(){},removeAttribute(){}};
  const c={location:{hash},document:{documentElement:root,getElementById:id=>id==='main'?main:null},window:{addEventListener(){}},setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(source('render-state.js'),c);c.window.AifectRender.mount();
  assert.equal(root.dataset.renderState,'loading');assert.equal(main.inert,true);assert.equal(main.innerHTML,'PUBLIC MUSIC','SEO/no-JS content is retained behind the head gate');
  const id=c.window.AifectRender.begin(hash,'',()=>{});main.innerHTML='CURRENT DESIGN';c.window.AifectRender.ready(id);assert.equal(root.dataset.renderState,'ready');assert.equal(main.inert,false);
 }
});

test('a pending playlist dialog cannot reopen over a different route',async()=>{
 const read=deferred();let opened=0;
 const c=nicknameContext({renderId:1,me:{id:'owner'},library:{playlists:[]},refreshLibrary:()=>read.promise,dialog:()=>opened++,$:()=>({}),esc:String});
 const action=source('actions.js').match(/async function addToPlaylist[^\r\n]*/)[0];vm.runInContext(action,c);
 const opening=c.addToPlaylist('song');c.renderId++;read.resolve();await opening;
 assert.equal(opened,0);
});

test('profile activity replaces outgoing tab data with a local loading state',async()=>{
 const read=deferred(),content={innerHTML:'OLD WORKS',isConnected:true,setAttribute(){},removeAttribute(){}},aside={innerHTML:'OLD ASIDE'};
 const nodes={'#mp-content':content,'#mp-aside-content':aside,'.mp-segment':{dataset:{},querySelectorAll:()=>[]}};
 const c=nicknameContext({api:async()=>({}),me:{id:'owner'},window:{addEventListener(){}},document:{addEventListener(){}},$:selector=>nodes[selector],icons(){},paintInteractions(){},syncSongCoverPlayback(){}});
 vm.runInContext(source('mypage.js'),c);c.myActivityData=()=>read.promise;c.myActivityHTML=()=>'<p>NEW ACTIVITY</p>';c.myActivityAside=()=>'<p>NEW ASIDE</p>';
 vm.runInContext("myPageState={own:true,account:'owner',tab:'works',d:{}}",c);
 const opening=c.mySelectTab('activity',false);
 assert.doesNotMatch(content.innerHTML,/OLD WORKS/);assert.match(content.innerHTML,/불러오는/);assert.doesNotMatch(aside.innerHTML,/OLD ASIDE/);
 read.resolve({});await opening;assert.match(content.innerHTML,/NEW ACTIVITY/);
});

test('profile tab shows the account-validated header and local loader before its fresh data returns',async()=>{
 const read=deferred(),content={innerHTML:'OLD WORKS',isConnected:true,setAttribute(){},removeAttribute(){}},aside={innerHTML:'OLD ASIDE'};
 const main={dataset:{route:'profile'},querySelector:()=>true};
 const nodes={'#main':main,'#mp-content':content,'#mp-aside-content':aside,'.mp-segment':{dataset:{},querySelectorAll:()=>[]}};
 const c=nicknameContext({api:async()=>({}),renderId:1,URLSearchParams,me:{id:'owner'},window:{addEventListener(){}},document:{addEventListener(){}},$:selector=>nodes[selector],icons(){},paintInteractions(){},syncSongCoverPlayback(){}});
 vm.runInContext(source('mypage.js'),c);
 c.myActivityData=()=>read.promise;c.myActivityHTML=()=>'<p>NEW ACTIVITY</p>';c.myActivityAside=()=>'<p>NEW ASIDE</p>';
 vm.runInContext("myPageState={own:true,account:'owner',tab:'works',d:{}}",c);
 let visible=0;
 const opening=c.refreshMyPageRoute('profile?view=activity',1,undefined,()=>{
  visible++;
  assert.equal(main.dataset.route,'profile?view=activity');
  assert.match(content.innerHTML,/불러오는/);
  assert.doesNotMatch(content.innerHTML,/OLD WORKS/);
 });
 assert.equal(visible,1);
 read.resolve({});await opening;
 assert.match(content.innerHTML,/NEW ACTIVITY/);
 c.me={id:'other'};
 assert.equal(await c.refreshMyPageRoute('profile',1,undefined,()=>visible++),false);
 assert.equal(visible,1,'another account cannot reveal the old header');
});

function skin(){
 let observer,scans=0,styles=0;
 const item={matches:()=>false,classList:{contains:()=>false,add(){}},scrollWidth:100,clientWidth:100};
 const c=nicknameContext({MutationObserver:class{constructor(fn){observer=fn;}observe(){}},requestAnimationFrame:fn=>{fn();return 0;},getComputedStyle:()=>{styles++;return {overflowX:'hidden'};},window:{addEventListener(){}},document:{body:{},querySelector:()=>null,querySelectorAll:selector=>{scans++;return selector.startsWith('#main')?[item]:[];}}});
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
 const c=nicknameContext({renderId:1,decodeUploadImage:()=>read.promise,document:{addEventListener(){},createElement(){created++;throw Error('Must not open a dialog');}}});
 vm.runInContext(source('image-crop.js'),c);
 const opening=c.cropPhotoEditor({type:'image/png',size:10});c.renderId++;
 read.resolve({width:100,height:100,close(){closed++;}});await assert.rejects(opening,/취소/);assert.equal(closed,1);assert.equal(created,0);
});

test('entering the talk-room lobby with no active voice room releases focus without interrupting navigation',()=>{
 const focus=[];const c=nicknameContext({me:{id:'member'},voiceController:null,setVoiceFocus:value=>focus.push(value)});
 vm.runInContext(source('voice-rooms.js').match(/function cleanupVoiceRoute[^\r\n]*/)[0],c);
 c.cleanupVoiceRoute('voice',undefined);assert.deepEqual(focus,[false]);
});
test('a late playlist limit check cannot open a membership dialog over the next page',async()=>{
 const pending=deferred();let checked=0;
 const c=nicknameContext({me:{id:'owner'},renderId:7,refreshLibrary:()=>pending.promise,canCreatePlaylist:()=>{checked++;return false;}});
 vm.runInContext(source('actions.js').match(/async function playlistDialog[^\r\n]*/)[0],c);
 const work=c.playlistDialog();c.renderId++;pending.resolve();await work;assert.equal(checked,0);
});
