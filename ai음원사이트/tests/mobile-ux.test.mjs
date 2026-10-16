import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');

test('collapse and restore never change playback, and expose their current state',()=>{
  let collapsed=false, click;
  const attrs={},player={classList:{toggle(name){assert.equal(name,'is-collapsed');return collapsed=!collapsed;}}};
  const button={addEventListener(type,fn){assert.equal(type,'click');click=fn;},setAttribute(k,v){attrs[k]=v;}};
  vm.runInNewContext(read('mobile-ux.js'),{document:{querySelector:s=>s==='.player'?player:button}});
  click(); assert.equal(collapsed,true);assert.equal(attrs['aria-expanded'],'false');assert.equal(attrs['aria-label'],'재생바 펼치기');
  click(); assert.equal(collapsed,false);assert.equal(attrs['aria-expanded'],'true');assert.equal(attrs['aria-label'],'재생바 접기');
});

function chatContext(){
  const c=vm.createContext({me:{id:'self'},Date,number:String,esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),portrait:()=>'',icon:()=>'',
    document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){}});
  vm.runInContext(read('chat-features.js'),c);vm.runInContext(read('social-chat.js'),c);return c;
}
test('whole-room deletion belongs only in the DM header, not inbox rows or message bubbles',()=>{
  const c=chatContext(),html=c.conversationListHTML([{id:'a',name:'One',updated:1},{id:'b',name:'Two',updated:1}],{id:'crew',name:'Crew'});
  assert.doesNotMatch(html,/data-dm-clear/);
  assert.doesNotMatch(c.inboxControlsHTML(),/data-dm-clear/);
  const header=c.dmThreadActions({id:'a',name:'One'});
  assert.match(header,/data-dm-clear="a"/);
  assert.match(header,/aria-label="이 대화방 내용 전체 삭제"/);
  assert.doesNotMatch(c.chatHTML([{id:'one',sender_id:'other',created:1,body:'Hi'}],{id:'a',name:'One'}),/data-dm-clear/);
  assert.match(html,/<\/a><button[^>]*data-dm-mute/);
});

function clearContext({confirmed=true,request=async()=>({})}={}){
  const listeners=[],calls=[],confirmations=[],notices=[];let renders=0;
  const button={disabled:false,dataset:{dmClear:'peer'}};
  const c=vm.createContext({me:{id:'self'},location:{hash:'#dm/peer'},confirm:message=>{confirmations.push(message);return confirmed;},
    api:async(...args)=>{calls.push(args);return request(...args);},render:async()=>{renders++;},toast:message=>notices.push(message),
    document:{addEventListener:(name,fn)=>{if(name==='click')listeners.push(fn);}},window:{addEventListener(){}},setInterval(){}});
  vm.runInContext(read('chat-features.js'),c);c.refreshMessageBadge=()=>{};
  return {c,button,calls,confirmations,notices,get renders(){return renders;},click:()=>listeners.find(fn=>String(fn).includes('data-dm-clear'))({target:{closest:selector=>selector==='[data-dm-clear]'?button:null},preventDefault(){},stopPropagation(){}})};
}
test('whole-room clear requires confirmation, targets one peer, and remains in the open room',async()=>{
  const f=clearContext();await f.click();
  assert.deepEqual(f.calls,[['/api/dm/peer','DELETE']]);
  assert.match(f.confirmations[0],/내용을 전부 삭제/);assert.match(f.confirmations[0],/상대방의 기록과 다른 대화방은 유지/);
  assert.equal(f.c.location.hash,'#dm/peer');assert.equal(f.renders,1);assert.equal(f.button.disabled,false);
  assert.match(f.notices[0],/모두 삭제/);
});
test('cancelled, failed and double-clicked clear never wipe unrelated UI',async()=>{
  const cancel=clearContext({confirmed:false});await cancel.click();assert.equal(cancel.calls.length,0);assert.equal(cancel.renders,0);assert.equal(cancel.button.disabled,false);
  const failed=clearContext({request:async()=>{throw Error('offline');}});await failed.click();assert.equal(failed.renders,0);assert.deepEqual(failed.notices,['offline']);assert.equal(failed.button.disabled,false);
  let resolve;const pending=clearContext({request:()=>new Promise(r=>resolve=r)});
  const first=pending.click();await pending.click();assert.equal(pending.calls.length,1);
  pending.c.location.hash='#dm/another';resolve({});await first;assert.equal(pending.renders,0);assert.equal(pending.c.location.hash,'#dm/another');
});
test('clear does not refresh a switched account or allow an inbox-wide target',async()=>{
  let resolve;const f=clearContext({request:()=>new Promise(r=>resolve=r)});const action=f.click();f.c.me={id:'other'};resolve({});await action;
  assert.equal(f.renders,0);assert.equal(f.notices.length,0);
  const all=clearContext();all.button.dataset.dmClear='all';await all.click();assert.equal(all.calls.length,0);assert.equal(all.confirmations.length,0);
});
test('incoming and outgoing bubble/time pairs share a row, including images and retry status',()=>{
  const c=chatContext();c.chatImageHTML=()=>'<img alt="사진">';
  const html=c.chatHTML([{id:'one',sender_id:'other',created:1,body:'<hello>'},{id:'two',sender_id:'self',created:2,image_id:'photo',delivery:'failed'}],{id:'peer',name:'Peer'});
  assert.equal((html.match(/class="dm-message-line"/g)||[]).length,2);
  assert.match(html,/&lt;hello>/);assert.match(html,/chat-retry/);assert.match(html,/<img alt="사진">/);
  assert.match(html,/<\/span><\/div><div class="chat-message-meta"><time>/);
});
