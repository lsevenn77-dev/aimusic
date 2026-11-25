import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';
import {eventTarget} from './official-notice-dom.mjs';
import {PREMIUM_OPEN_NOTICE_ID,PREMIUM_OPEN_NOTICE} from '../shared/premium-open-notice.js';

const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const social=read('social-chat.js'),messages=read('messages-ui.js'),improvements=read('improvements.js');
const pageFunctions=read('page-redesign.js');
const aliases=['aifect-guide',PREMIUM_OPEN_NOTICE_ID,'aifect-official-notice'];
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const official={id:'aifect-official-notice',name:'아이팩트 안내',is_notice:true,notice_type:'official',read_only:true,last_message:PREMIUM_OPEN_NOTICE.title,updated:1795572000,unread:1};
const inbox=()=>({conversations:[{...official},{id:'friend',name:'아이팩트 안내',updated:1,unread:0}],crew:null,unread:1,notice_unread:1});
const feed=()=>({channel:{...official},items:[{id:'campaign:'+PREMIUM_OPEN_NOTICE_ID,legacy_id:PREMIUM_OPEN_NOTICE_ID,created:1795572000,read_at:0,notice:{...PREMIUM_OPEN_NOTICE}}],before:null});

function context(extra={}){
 const calls=[],c=nicknameContext({
  me:{id:'member'},renderId:1,URLSearchParams,AbortController,AbortSignal,DOMException,Event,
  location:{hash:'#dm',pathname:'/',search:''},history:{state:{}},
  document:{addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},
  esc:escape,icon:()=>'',portrait:()=>'',number:String,crewInboxHTML:()=>'',inboxControlsHTML:()=>'',
  api:async path=>{calls.push(path);if(path==='/api/dm?notices=unified')return inbox();if(path==='/api/notices/official')return feed();throw Error('Unexpected API '+path);},
  ...extra
 });
 for(const source of [social,messages,improvements,pageFunctions])vm.runInContext(source,c);
 c.chatPanelHTML=()=>'<form id="chat-compose"></form>';
 c.dmThreadActions=()=>'';
 return {c,calls};
}

test('every fixed official alias mounts the unified inbox before loading the official history',async()=>{
 for(const alias of ['notice',...aliases]){
  const {c,calls}=context();
  const view=await c.improvementsView('dm',alias,'dm/'+alias,c.api);
  assert.deepEqual(calls,['/api/dm?notices=unified'],alias);
  assert.equal(view.openThread,true);
  assert.equal(view.selectedConversation,'notice');
  assert.equal(view.refreshInbox,false);
  assert.match(view.html,/message-thread-pane[^>]*><span class="dm-loading-spinner"/);
  assert.match(view.html,/class="conversation-row pinned-notice is-selected"[^>]*href="#dm\/notice"[^>]*aria-current="true"/);
  assert.equal((view.html.match(/href="#dm\/notice"/g)||[]).length,1);
 }
});

test('fixed official alias histories use the official feed instead of a member DM or producer profile',async()=>{
 for(const alias of ['notice',...aliases]){
  const {c,calls}=context();
  const view=await c.dmRouteView(alias,'dm/'+alias,c.api,inbox());
  assert.deepEqual(calls,['/api/notices/official'],alias);
  assert.equal(view.selectedConversation,'notice');
  assert.equal(view.chat,undefined);
  assert.equal(view.noticeFeed.items[0].legacy_id,PREMIUM_OPEN_NOTICE_ID);
  if(alias===PREMIUM_OPEN_NOTICE_ID)assert.equal(view.noticeAnchor,'campaign:'+PREMIUM_OPEN_NOTICE_ID);
  assert.match(view.html,/아이팩트 안내/);
  assert.ok(view.html.includes(PREMIUM_OPEN_NOTICE.title));
  assert.doesNotMatch(view.html,/id="chat-compose"/);
 }
});

test('old notice peer links retain their original entry anchor and explicit entry links take precedence',async()=>{
 for(const [query,expected] of [
  ['peer='+PREMIUM_OPEN_NOTICE_ID,'campaign:'+PREMIUM_OPEN_NOTICE_ID],
  ['peer=aifect-guide','aifect-guide'],
  ['peer='+PREMIUM_OPEN_NOTICE_ID+'&entry='+encodeURIComponent('campaign:older'),'campaign:older']
 ]){
  const {c,calls}=context();
  const view=await c.dmRouteView('notice','dm/notice?'+query,c.api,null);
  assert.deepEqual(calls,['/api/dm?notices=unified','/api/notices/official']);
  assert.equal(view.noticeAnchor,expected);
  assert.equal(view.selectedConversation,'notice');
 }
});

test('the single pinned official row uses the guide name and stays selected for every old official identifier',()=>{
 const {c}=context();
 for(const selected of ['notice',...aliases]){
  const html=c.noticeInboxHTML(official,selected);
  assert.match(html,/<strong[^>]*>아이팩트 안내<\/strong>/);
  assert.equal((html.match(/href="#dm\/notice"/g)||[]).length,1);
  assert.match(html,/aria-current="true"/);
  assert.match(html,/pinned-notice is-selected/);
  assert.match(html,/안 읽은 메시지 1개/);
 }
 assert.doesNotMatch(c.noticeInboxHTML(official,'friend'),/aria-current|is-selected/);
});

test('an ordinary member copying the official name retains the existing DM route and composer',async()=>{
 const {c,calls}=context();
 const mounted=await c.improvementsView('dm','friend','dm/friend',c.api);
 assert.deepEqual(calls,[]);
 assert.equal(mounted.selectedConversation,'friend');
 assert.equal(mounted.openThread,true);
 const paths=[],peer={id:'friend',name:'아이팩트 안내',chat_nickname:'아이팩트 안내'};
 const opened=await c.dmRouteView('friend','dm/friend',async path=>{paths.push(path);return {peer,settings:{},messages:[]};},inbox());
 assert.deepEqual(paths,['/api/dm/friend']);
 assert.equal(opened.chat.path,'/api/dm/friend');
 assert.match(opened.html,/id="chat-compose"/);
 assert.equal(opened.noticeFeed,undefined);
});

function row(href){
 const attributes=new Map([['href',href]]),classes=new Set();
 return {
  matches:selector=>selector==='a',
  classList:{toggle(name,active){if(active)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
  getAttribute:name=>attributes.get(name),setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name)
 };
}

function workspace(){
 const selectedRows=[row('#dm/notice'),row('#dm/friend')],bound=[],panes=[];
 const list={innerHTML:''},error={textContent:''},main={dataset:{account:'member'}};
 const retry={};
 const pane={className:'message-welcome',querySelector:selector=>selector==='button'?retry:null,setAttribute(){},removeAttribute(){},get innerHTML(){return panes.at(-1)||'';},set innerHTML(value){panes.push(value);}};
 const aside={append(){}};
 const root={isConnected:true,classList:{toggle(){}},querySelector:selector=>selector==='aside'?aside:pane,querySelectorAll:()=>selectedRows};
 const doc=eventTarget({hidden:false,querySelector:selector=>selector==='.message-workspace'?root:null,createElement:()=>({dataset:{},append(){}})});
 const {c,calls}=context({document:doc,window:eventTarget({}),$:selector=>({'#main':main,'#dm-conversations':list,'#dm-list-error':error}[selector])});
 c.watchSocialChat=()=>()=>{};
 c.bindOfficialNotices=(_host,_feed,options)=>{bound.push(options.anchor);return ()=>{};};
 c.bindChatThread=()=>()=>{};
 c.rememberDmInbox(inbox());
 c.bindSocialChat({inbox:true});
 return {c,calls,selectedRows,bound,pane,list,async select(raw){c.location.hash='#'+raw;await vm.runInContext('dmSession.select('+JSON.stringify(raw)+')',c);},cleanup:()=>vm.runInContext('socialCleanup()',c)};
}

test('warm workspace navigation selects the existing official row and preserves the legacy event anchor',async()=>{
 const h=workspace();
 try{
  for(const alias of aliases){
   h.calls.length=0;
   await h.select('dm/'+alias);
   assert.deepEqual(h.calls,['/api/notices/official'],alias);
   assert.equal(h.selectedRows[0].getAttribute('aria-current'),'true');
   assert.equal(h.selectedRows[1].getAttribute('aria-current'),undefined);
   assert.ok(h.pane.innerHTML.includes(PREMIUM_OPEN_NOTICE.title));
   assert.doesNotMatch(h.pane.innerHTML,/프로필을 찾을 수 없습니다/);
  }
  await h.select('dm/notice?peer='+PREMIUM_OPEN_NOTICE_ID);
  assert.equal(h.bound.at(-1),'campaign:'+PREMIUM_OPEN_NOTICE_ID);
  assert.equal(h.selectedRows[0].getAttribute('aria-current'),'true');
 }finally{h.cleanup();}
});
