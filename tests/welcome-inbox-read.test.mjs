import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';

const source=readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const welcome=unread=>({id:'aifect-guide',name:'안내',is_notice:true,notice_type:'welcome',read_only:true,unread});
const inbox=(notice=1)=>({unread:notice+5,direct_unread:notice+3,notice_unread:notice,conversations:[welcome(notice),{id:'operator',name:'운영자',is_notice:true,unread:1},{id:'friend',name:'친구',unread:2}],crew:{id:'crew',name:'크루',unread:2}});
function harness(initial=inbox()){
 const events=new Map(),requests=[],badges=[],dispatched=[],paints=[];
 const root={get innerHTML(){return paints.at(-1)||'';},set innerHTML(value){paints.push(value);}},error={textContent:''};
 let confirmRead,streamChange,badgeRefresh=0;
 const c=nicknameContext({me:{id:'member'},renderId:1,Event,
  document:{addEventListener(){},querySelector:()=>null},
  window:{addEventListener:(type,listener)=>events.set(type,listener),removeEventListener:type=>events.delete(type),dispatchEvent:event=>{dispatched.push(event.type);events.get(event.type)?.(event);}},
  $:selector=>({'#dm-conversations':root,'#dm-list-error':error}[selector]),
  esc:String,icon:()=>'',portrait:()=>'',crewInboxHTML:()=>'',
  api:(...args)=>new Promise((resolve,reject)=>requests.push({args,resolve,reject})),
  bindWelcomeNotice:(view,confirmed)=>{confirmRead=confirmed;return ()=>{};},
  paintMessageBadge:value=>badges.push(value),refreshMessageBadge:()=>{badgeRefresh++;}
 });
 vm.runInContext(source,c);
 c.watchSocialChat=(query,changed)=>{if(!query)streamChange=changed;return ()=>{};};
 c.rememberDmInbox(initial);root.innerHTML=c.conversationListHTML(initial.conversations,initial.crew,'notice');
 c.bindSocialChat({inbox:true,selectedConversation:'notice',welcomeNotice:{campaign_id:'welcome-guide-20261108-v1',read_at:0}});
 return {c,requests,badges,dispatched,paints,error,events,confirmed:()=>confirmRead(),changed:()=>streamChange(),badgeRefresh:()=>badgeRefresh,
  snapshot:()=>JSON.parse(vm.runInContext('JSON.stringify(dmInboxSnapshot.data)',c)),cleanup:()=>vm.runInContext('socialCleanup()',c)};
}

test('confirmed welcome read immediately removes only its unread count and refreshes all badge owners',()=>{
 const h=harness();h.confirmed();const d=h.snapshot();
 assert.equal(d.conversations[0].unread,0);assert.equal(d.notice_unread,0);
 assert.equal(d.conversations[1].unread,1);assert.equal(d.conversations[2].unread,2);assert.equal(d.crew.unread,2);
 assert.equal(d.unread,5);assert.equal(d.direct_unread,3);assert.deepEqual(h.badges,[5]);
 assert.ok(h.dispatched.includes('aifect:dm-read'));assert.equal(h.badgeRefresh(),1);
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].args[3]?.fresh,true);h.cleanup();
});

test('a pre-read inbox response cannot restore the notice while the fresh refresh is pending',async()=>{
 const h=harness();h.changed();assert.equal(h.requests.length,1);
 h.confirmed();const paintedAfterRead=h.paints.length;
 h.requests[0].resolve(inbox(1));await tick();
 assert.equal(h.snapshot().conversations[0].unread,0);assert.equal(h.paints.length,paintedAfterRead);
 assert.equal(h.requests.length,2);assert.equal(h.requests[1].args[3]?.fresh,true);
 h.requests[1].resolve(inbox(0));await tick();assert.equal(h.snapshot().notice_unread,0);assert.equal(h.snapshot().unread,5);h.cleanup();
});

test('already-read welcome content reconciles an inbox whose summary was taken before the read',()=>{
 const d=inbox(1);d.conversations[0].unread=0;
 const h=harness(d);h.confirmed();assert.equal(h.snapshot().unread,5);assert.equal(h.snapshot().direct_unread,3);assert.equal(h.snapshot().notice_unread,0);h.cleanup();
});

test('a failed pre-read request still runs the queued refresh after the confirmed read',async()=>{
 const h=harness();h.changed();h.confirmed();
 h.requests[0].reject(new Error('old connection failed'));await tick();
 assert.equal(h.requests.length,2);assert.equal(h.error.textContent,'');assert.equal(h.snapshot().notice_unread,0);
 h.requests[1].resolve(inbox(0));await tick();assert.equal(h.snapshot().unread,5);h.cleanup();
});

test('refresh after an external read discards the in-flight inbox result',async()=>{
 const h=harness();h.changed();const paints=h.paints.length;
 const stale=inbox(1);stale.conversations[2].unread=4;
 h.events.get('aifect:inbox-refresh')();h.requests[0].resolve(stale);await tick();
 assert.equal(h.paints.length,paints);assert.equal(h.requests.length,2);
 h.requests[1].resolve(inbox(0));await tick();assert.equal(h.snapshot().notice_unread,0);h.cleanup();
});

test('read callback and pending inbox cannot update a different account or route',async()=>{
 for(const boundary of ['account','route']){
  const h=harness();h.changed();const paints=h.paints.length;
  if(boundary==='account')h.c.me={id:'other'};else h.c.renderId++;
  h.confirmed();h.requests[0].resolve(inbox(0));await tick();
  assert.equal(h.snapshot().notice_unread,1);assert.equal(h.paints.length,paints);assert.deepEqual(h.badges,[]);assert.equal(h.badgeRefresh(),0);assert.equal(h.requests.length,1);h.cleanup();
 }
});
