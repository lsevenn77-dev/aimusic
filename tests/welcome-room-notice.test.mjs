import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {render,preview} from '../shared/chat-stickers.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_GUIDE} from '../shared/welcome-guide.js';
import {noticeDOM,eventTarget as events} from './official-notice-dom.mjs';

const roomSource=readFileSync(new URL('../dist/room-release.js',import.meta.url),'utf8');
const guideSource=readFileSync(new URL('../dist/messages-ui.js',import.meta.url),'utf8');
const roomFunction=roomSource.slice(roomSource.indexOf('function roomMessages('),roomSource.indexOf('function bindRoomGiftWallet('));
const guideFunctions=guideSource.slice(0,guideSource.indexOf('async function dmNoticeView('));
const escape=text=>String(text??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const welcomePeer={id:'aifect-official-notice',name:'아이팩트 안내',is_notice:true,notice_type:'official',read_only:true,unread:1};
function harness({hidden=false,peers=[welcomePeer],waitForGuide=false,waitForRead=false}={}){
 const calls=[],avatars=[],nicknames=[],dispatched=[],observers=[],frames=new Map();let frameId=0,badgeRefreshes=0,resolveGuide,resolveRead;
 const doc=events({hidden,documentElement:{dataset:{renderState:'ready'}}}),win=events();
 win.dispatchEvent=event=>{dispatched.push(event.type);win.emit(event.type,event);return true;};
 const sheet=events({open:true,html:'',nodes:{}});
 const response=()=>({channel:welcomePeer,before:null,items:[{id:'campaign:'+WELCOME_CAMPAIGN_ID,created:1794149051,read_at:0,guide:structuredClone(WELCOME_GUIDE)}]});
 Object.defineProperty(sheet,'innerHTML',{get(){return this.html;},set(html){
  const previous=this.nodes['[data-official-notice-scroll]'];if(previous)previous.isConnected=false;
  this.html=html;this.nodes={};
  if(html.includes('room-dm-query')){
   this.nodes.input={value:''};this.nodes['.room-dm-list']={innerHTML:''};this.nodes['[data-room-dm-status]']={textContent:''};
  }
  if(html.includes('data-official-notice-scroll')){
   const {pane,status}=noticeDOM(response().items);
   this.nodes['[data-official-notice-scroll]']=pane;
   this.nodes['[data-official-notice-status]']=status;
   this.nodes['[data-room-back]']={};
  }
 }});
 sheet.querySelector=selector=>sheet.nodes[selector]||null;
 const client={closed:false};
 const c=vm.createContext({
  document:doc,window:win,me:{id:'member'},renderId:1,location:{hash:'#voice/current-room'},
  AbortController,Event,setTimeout,clearTimeout,esc:escape,chatNickname:p=>p.chat_nickname??p.name,
  voiceGlyph:name=>'<svg data-glyph="'+name+'"></svg>',inboxTime:()=>'',AifectStickers:{render,preview},
  avatarImage:p=>{avatars.push(p.profile_id);return '<span class="avatar-fallback"></span>';},
  userNickname:(name,p)=>{nicknames.push(p.profileId);return escape(name);},
  $:selector=>sheet.querySelector(selector),refreshMessageBadge:()=>{badgeRefreshes++;},
  requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  ResizeObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.closed=true;}},
  MutationObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.closed=true;}},
  api:async(path,method='GET',body)=>{
   calls.push({path,method,body:body===undefined?undefined:JSON.parse(JSON.stringify(body))});
   if(path==='/api/dm?notices=unified')return {conversations:peers};
   if(path==='/api/notices/official'&&method==='GET')return waitForGuide?await new Promise(resolve=>{resolveGuide=()=>resolve(response());}):response();
   if(path==='/api/notices/official'&&method==='PATCH')return waitForRead?await new Promise(resolve=>{resolveRead=()=>resolve({ok:true});}):{ok:true};
   // Keep the pre-existing DM renderer out of these notice-only tests while
   // checking that ordinary and unverified peers retain their original route.
   if(path.startsWith('/api/dm/'))throw new Error('ordinary DM endpoint reached');
   throw new Error('Unexpected endpoint: '+path);
  }
 });
 vm.runInContext(guideFunctions+'\n'+roomFunction,c);
 const view=c.roomMessages(client,sheet);
 return {c,doc,win,sheet,client,calls,avatars,nicknames,dispatched,observers,view,
  badgeRefreshes:()=>badgeRefreshes,
  async click(id=welcomePeer.id){sheet.querySelector('.room-dm-list').onclick({target:{closest:()=>({dataset:{roomPeer:id}})}});await settle();},
  async paint(){for(const [id,callback] of [...frames]){frames.delete(id);callback();}await settle();},
  async resolveGuide(){resolveGuide();await settle();},async resolveRead(){resolveRead();await settle();},
  close(){sheet.open=false;sheet.emit('close');}
 };
}

test('a room opens the verified welcome in its current sheet with all nine links and no stickers',async()=>{
 const h=harness();await h.view.inbox();
 assert.deepEqual(h.avatars,[]);assert.deepEqual(h.nicknames,[]);
 await h.click();
 assert.deepEqual(h.calls.map(call=>call.path),['/api/dm?notices=unified','/api/notices/official']);
 assert.equal(h.c.location.hash,'#voice/current-room');assert.equal(h.client.closed,false);assert.equal(h.sheet.open,true);
 assert.equal((h.sheet.innerHTML.match(/class="welcome-guide-section"/g)||[]).length,9);
 assert.equal((h.sheet.innerHTML.match(/class="text-link welcome-guide-link"/g)||[]).length,9);
 for(const section of WELCOME_GUIDE.sections)assert.ok(h.sheet.innerHTML.includes('href="'+section.href+'"'));
 assert.doesNotMatch(h.sheet.innerHTML,/welcome-guide-sticker|cat_hand_wave|cat_basic_heart/);
 assert.doesNotMatch(h.sheet.innerHTML,/<form|<textarea|contenteditable|data-dm-mute|data-room-dm-gift|data-profile|#producer\//);
 assert.equal(h.calls.filter(call=>call.method==='PATCH').length,0);
 await h.paint();
 assert.deepEqual(h.calls.filter(call=>call.method==='PATCH'),[{path:'/api/notices/official',method:'PATCH',body:{ids:['campaign:'+WELCOME_CAMPAIGN_ID]}}]);
 assert.equal(h.badgeRefreshes(),1);assert.ok(h.dispatched.includes('aifect:dm-read'));
 h.win.emit('focus');await settle();assert.equal(h.calls.filter(call=>call.method==='PATCH').length,1);
 h.sheet.querySelector('[data-room-back]').onclick();await settle();
 assert.ok(h.sheet.querySelector('.room-dm-list'));assert.equal(h.c.location.hash,'#voice/current-room');
 assert.ok(h.observers.every(observer=>observer.closed));assert.equal(h.win.listenerCount('focus'),0);
 h.view.destroy();
});

test('hidden or closed room guides are not marked read and closing removes the visibility watchers',async()=>{
 const h=harness({hidden:true});await h.view.inbox();await h.click();await h.paint();
 assert.equal(h.calls.filter(call=>call.method==='PATCH').length,0);
 h.close();h.doc.hidden=false;h.doc.emit('visibilitychange');h.win.emit('focus');await h.paint();
 assert.equal(h.calls.filter(call=>call.method==='PATCH').length,0);assert.equal(h.badgeRefreshes(),0);
 assert.ok(h.observers.every(observer=>observer.closed));assert.equal(h.doc.listenerCount('visibilitychange'),0);
});

test('ordinary and lookalike notice peers retain the member DM endpoint',async()=>{
 for(const peer of [{id:'friend',name:'Friend'},{...welcomePeer,id:'lookalike',is_notice:false},{...welcomePeer,id:'writable',read_only:false}]){
  const h=harness({peers:[peer]});await h.view.inbox();await h.click(peer.id);
  assert.deepEqual(h.calls.map(call=>call.path),['/api/dm?notices=unified','/api/dm/'+peer.id]);
  assert.deepEqual(h.avatars,[peer.id]);assert.deepEqual(h.nicknames,[peer.id]);
  assert.equal(h.c.location.hash,'#voice/current-room');h.view.destroy();
 }
});

test('account changes and sheet cleanup cannot paint or acknowledge a stale room guide',async()=>{
 const switched=harness({waitForGuide:true});await switched.view.inbox();await switched.click();switched.c.me={id:'another-member'};
 await switched.resolveGuide();await switched.paint();
 assert.equal(switched.sheet.querySelector('[data-official-notice-scroll]'),null);assert.equal(switched.calls.filter(call=>call.method==='PATCH').length,0);switched.view.destroy();
 const closed=harness({waitForRead:true});await closed.view.inbox();await closed.click();await closed.paint();
 assert.equal(closed.calls.filter(call=>call.method==='PATCH').length,1);closed.close();await closed.resolveRead();
 assert.equal(closed.badgeRefreshes(),0);assert.deepEqual(closed.dispatched,[]);assert.ok(closed.observers.every(observer=>observer.closed));
});
