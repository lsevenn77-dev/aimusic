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
test('inbox deletion is per conversation, separate from links and never on pinned crew',()=>{
  const c=chatContext(),html=c.conversationListHTML([{id:'a',name:'One',updated:1},{id:'b',name:'Two',updated:1}],{id:'crew',name:'Crew'});
  assert.match(html,/data-dm-clear="a"/);assert.match(html,/data-dm-clear="b"/);
  assert.doesNotMatch(html,/data-dm-clear="all"|data-dm-clear="crew"/);
  assert.doesNotMatch(c.inboxControlsHTML(),/data-dm-clear/);
  assert.match(html,/<\/a><button[^>]*data-dm-mute/);
});
test('incoming and outgoing bubble/time pairs share a row, including images and retry status',()=>{
  const c=chatContext();c.chatImageHTML=()=>'<img alt="사진">';
  const html=c.chatHTML([{id:'one',sender_id:'other',created:1,body:'<hello>'},{id:'two',sender_id:'self',created:2,image_id:'photo',delivery:'failed'}],{id:'peer',name:'Peer'});
  assert.equal((html.match(/class="dm-message-line"/g)||[]).length,2);
  assert.match(html,/&lt;hello>/);assert.match(html,/chat-retry/);assert.match(html,/<img alt="사진">/);
  assert.match(html,/<\/span><\/div><div class="chat-message-meta"><time>/);
});
