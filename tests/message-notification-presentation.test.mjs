import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
function client(){const c=vm.createContext({me:{id:'owner'},window:{addEventListener(){},dispatchEvent(e){c.lastEvent=e;}},document:{addEventListener(){},querySelectorAll:()=>[]},setInterval(){},CustomEvent:class {constructor(type,args){this.type=type;this.detail=args.detail;}},esc:s=>String(s??''),number:String,icon:name=>'<svg data-icon="'+name+'"></svg>',portrait:()=>'<span></span>'});vm.runInContext(source('social-chat.js')+'\n'+source('chat-features.js')+'\n'+source('notifications.js'),c);return c;}
test('chat payload exposes stored nickname independently of automatic crew suffix and leaves storage intact',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,nickname_confirmed,created) VALUES('friend','other','Hi(vi)',1,0);INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','CREW',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0),('crew','other','member',0)");
 await f.call('/api/dm/friend','POST',{body:'hello',request_id:crypto.randomUUID()});
 const inbox=(await f.call('/api/dm')).body;assert.equal(inbox.conversations[0].name,'Hi(vi)(CREW)');assert.equal(inbox.conversations[0].chat_nickname,'Hi(vi)');
 const thread=(await f.call('/api/dm/friend')).body;assert.equal(thread.peer.chat_nickname,'Hi(vi)');assert.equal(f.sql.prepare("SELECT name FROM producers WHERE id='friend'").get().name,'Hi(vi)');
 const c=client();c.items=inbox.conversations;const html=vm.runInContext('conversationListHTML(items)',c);assert.match(html,/Hi\(vi\)/);assert.doesNotMatch(html,/Hi\(vi\)\(CREW\)/);
});
test('successful mute state updates the cached inbox immediately without changing unread counts or other peers',()=>{
 const c=client();vm.runInContext("rememberDmInbox({unread:105,conversations:[{id:'a',unread:104,muted:0},{id:'b',unread:1,muted:0}],crew:{id:'c',unread:0,muted:0}});updateInboxMute('a',true)",c);
 let data=c.lastEvent.detail;assert.equal(data.unread,105);assert.equal(data.conversations[0].unread,104);assert.equal(data.conversations[0].muted,true);assert.equal(data.conversations[1].muted,0);
 vm.runInContext("updateInboxMute('a',false);updateInboxMute('c',true,true)",c);data=c.lastEvent.detail;assert.equal(data.conversations[0].muted,false);assert.equal(data.crew.muted,true);
});
test('the row separates conversation settings, unread presentation and current selection',()=>{
 const c=client(), peer={id:'peer',name:'대화 상대',last_message:'실제 미리보기',updated:1793451900,unread:104,muted:1};
 let html=c.conversationListHTML([peer],null,'peer');
 assert.match(html,/conversation-row is-selected is-unread/);
 assert.match(html,/dm-name-line[^]*?<\/strong>[^]*?bellOff[^]*?dm-unread-dot[^]*?<\/div><p>실제 미리보기<\/p>/);
 assert.match(html,/<time>\d{2}:\d{2}<\/time><span class="unread-badge"[^>]*>104<\/span>/);
 assert.doesNotMatch(html,/dmPin|data-dm-mute/);
 html=c.conversationListHTML([{...peer,muted:0,unread:0}],null,'peer');
 assert.match(html,/is-selected/);assert.doesNotMatch(html,/is-unread|dm-unread-dot|unread-badge|bellOff|dmPin/);
 html=c.conversationListHTML([],{...peer,id:'crew'});
 assert.match(html,/dmPin[^]*?bellOff[^]*?dm-unread-dot/);
 assert.doesNotMatch(html,/내 크루/);
});
test('notifications show Seoul time beside the type and an unread dot beside the avatar',()=>{
 const c=client();
 c.n={id:'n',kind:'follow',actor_name:'Name',target:'friend',available:true,created:Date.parse('2026-11-02T15:20:00Z')/1000};
 for(const read_at of [0,1]){
  c.n.read_at=read_at;
  const html=vm.runInContext('activityRowHTML(n)',c);
  assert.match(html,/<div class="activity-meta"><span>팔로우<\/span><span aria-hidden="true">·<\/span><time datetime="2026-11-02T15:20:00.000Z">00:20<\/time><\/div>/);
  assert.equal(html.match(/<time\b/g)?.length,1);
  assert.equal(html.includes('activity-dot'),!read_at);
  if(!read_at)assert.match(html,/<div class="activity-avatar"><i class="activity-dot"[^>]*><\/i><img /);
 }
});
