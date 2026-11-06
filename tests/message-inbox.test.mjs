import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8');
const make=()=>{const c=nicknameContext({document:{addEventListener(){}},esc:String,crewInboxHTML:()=>'',number:String});vm.runInContext(source,c);return c;};
test('notice and crew stay first while only ordinary DMs follow message timestamps',()=>{
 const c=make();c.icon=()=>'';
 const items=[{id:'old',name:'old',updated:2},{id:'fake',name:'AIFECT 운영팀',updated:5},{id:'official',name:'official',is_notice:true,updated:1},{id:'new',name:'new',updated:9}];
 c.items=items;const ordered=JSON.parse(vm.runInContext('JSON.stringify(dmOrderedConversations(items))',c));
 assert.deepEqual(ordered.notices.map(p=>p.id),['official']);assert.deepEqual(ordered.direct.map(p=>p.id),['new','fake','old']);assert.equal(items[0].id,'old');
 c.portrait=()=>'';c.crewInboxHTML=()=>'<a>CREW</a>';
 const html=c.conversationListHTML(items);assert.ok(html.indexOf('공지채팅')<html.indexOf('CREW'));assert.ok(html.indexOf('CREW')<html.indexOf('#dm/new'));assert.ok(html.indexOf('#dm/new')<html.indexOf('#dm/old'));assert.doesNotMatch(html,/dm-pin|data-dm-filter/);
});

test('empty channels stay visible and search covers channel names and previews',()=>{
 const c=make();c.icon=()=>'';assert.match(c.conversationListHTML([]),/공지채팅/);assert.match(c.conversationListHTML([]),/크루채팅/);
 assert.equal(c.dmSearchMatch({name:'별빛',last_message:'내일 합주'},'합주'),true);
 assert.equal(c.dmSearchMatch({name:'별빛'},'공지','공지채팅'),true);
 vm.runInContext("dmInboxQuery='없는말'",c);assert.match(c.conversationListHTML([]),/검색 결과가 없어요/);
});

test('notice routing only opens server-verified channels and retains all official conversations',async()=>{
 const c=make();Object.assign(c,{me:{id:'me'},location:{hash:'#dm',pathname:'/',search:''},window:{addEventListener(){}},URLSearchParams,icon:()=>'',dmInboxHTML:(data,body)=>body,dmProfileLink:()=>'',dmThreadActions:()=>'',chatPanelHTML:()=>'<form>composer</form>'});
 vm.runInContext(readFileSync(new URL('../dist/messages-ui.js',import.meta.url),'utf8'),c);
 const paths=[];const read=async path=>{paths.push(path);return path==='/api/dm'?{conversations:[{id:'fake',name:'AIFECT',updated:9},{id:'a',name:'Admin A',updated:1,is_notice:true},{id:'b',name:'Admin B',updated:2,is_notice:true}]}:{peer:{id:path.split('/').at(-1),name:'Admin'},messages:[]};};
 const view=await c.dmNoticeView('dm/notice?peer=fake',read);assert.deepEqual(paths,['/api/dm','/api/dm/b']);assert.equal(view.selectedConversation,'notice');assert.match(view.html,/value="a"/);assert.match(view.html,/value="b"/);assert.match(view.html,/composer/);
 const empty=await c.dmNoticeView('dm/notice',async()=>({conversations:[]}));assert.match(empty.html,/아직 받은 공지/);assert.equal(empty.chat,undefined);
});

test('search filters the existing inbox synchronously without fetching or changing drafts',()=>{
 const root={innerHTML:''},error={textContent:''};let input,requests=0;
 const search={value:'',addEventListener:(name,handler)=>input=handler,removeEventListener(){}};
 const c=nicknameContext({document:{addEventListener(){},querySelector:s=>s==='#dm-inbox-search'?search:null},window:{addEventListener(){},removeEventListener(){}},renderId:1,me:{id:'me'},$:s=>({'#dm-conversations':root,'#dm-list-error':error}[s]),esc:String,icon:()=>'',portrait:()=>'',crewInboxHTML:()=>'',api:()=>{requests++;return new Promise(()=>{});}});
 vm.runInContext(source,c);vm.runInContext("watchSocialChat=()=>()=>{};rememberDmInbox({conversations:[{id:'a',name:'READ',last_message:'hello'},{id:'b',name:'NEW'}]});bindSocialChat({inbox:true})",c);
 search.value='hello';input();assert.match(root.innerHTML,/READ/);assert.doesNotMatch(root.innerHTML,/NEW/);assert.equal(requests,0);
});

test('desktop panel ends twelve pixels above payouts and respects available viewport',()=>{const c=make();assert.equal(vm.runInContext('dmWorkspaceHeight(1092,188,16,826)',c),626);assert.equal(vm.runInContext('dmWorkspaceHeight(700,188,110,826)',c),402);assert.equal(vm.runInContext('dmWorkspaceHeight(700,188,78,undefined)',c),434);assert.equal(vm.runInContext('dmWorkspaceHeight(300,188,78,undefined)',c),180);});
test('a fetched thread does not wait for another inbox request and never reuses another account inbox',async()=>{
 const c=make();c.me={id:'one'};c.api=()=>{throw Error('thread should not fetch the inbox');};vm.runInContext(readFileSync(new URL('../dist/page-redesign.js',import.meta.url),'utf8'),c);c.dmInboxHTML=d=>JSON.stringify(d);
 vm.runInContext("rememberDmInbox({conversations:[{id:'private'}]})",c);
 const view={chat:{peer:{id:'peer'}},html:'CHAT'};const result=await c.dmWorkspaceView(view);assert.match(result.html,/private/);assert.equal(result.refreshInbox,true);
 c.me={id:'two'};const other=await c.dmWorkspaceView(view);assert.doesNotMatch(other.html,/private/);assert.equal(other.html,'{"conversations":[]}');
});
test('crew opens from the lightweight history endpoint without loading the crew home',async()=>{
 const calls=[];const c=nicknameContext({document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){},esc:String,icon:()=>'',number:String,chatPanelHTML:(label,initial)=>initial?.messages[0]?.body||'EMPTY',api:async path=>{calls.push(path);return {crew:{id:'test',name:'Crew'},messages:[{body:'READY'}],membership:{joined_sequence:1,role:'member'}};}});
 vm.runInContext(readFileSync(new URL('../dist/chat-features.js',import.meta.url),'utf8'),c);const view=await c.crewChatView('dm/crew/test');assert.deepEqual(calls,['/api/crews/test/messages']);assert.match(view.html,/READY/);assert.doesNotMatch(view.html,/undefined|NaN/);assert.equal(view.chat.initial.messages[0].body,'READY');
});
test('read all updates the inbox immediately, avoids navigation, and restores counts on failure',async()=>{
 const events=[];let rejectRequest;const c=nicknameContext({document:{addEventListener(){}},window:{addEventListener(){},dispatchEvent:e=>events.push(e.type)},setInterval(){},me:{id:'me'},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},Event:class{constructor(type){this.type=type;}},api:()=>new Promise((resolve,reject)=>{rejectRequest=reject;}),dmInboxSnapshot:{uid:'me',data:{conversations:[{id:'p',unread:3}],crew:{unread:2}}}});
 c.rememberDmInbox=data=>{c.dmInboxSnapshot={uid:c.me.id,data};};vm.runInContext(readFileSync(new URL('../dist/chat-features.js',import.meta.url),'utf8'),c);c.paintMessageBadge=()=>{};c.refreshMessageBadge=()=>{};
 const original=c.dmInboxSnapshot.data,pending=c.readAllMessages();assert.equal(c.dmInboxSnapshot.data.conversations[0].unread,0);assert.equal(c.dmInboxSnapshot.data.crew.unread,0);assert.ok(events.includes('aifect:inbox-local'));rejectRequest(Error('offline'));await assert.rejects(pending,/offline/);assert.equal(c.dmInboxSnapshot.data,original);assert.ok(events.includes('aifect:inbox-refresh'));
});
test('block management needs only the block list and reuses the account inbox',async()=>{
 const calls=[];const c=nicknameContext({document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){},me:{id:'me'},esc:String,icon:()=>'',dmInboxSnapshot:{uid:'me',data:{conversations:[{id:'peer'}]}},dmInboxHTML:inbox=>JSON.stringify(inbox),api:async path=>{calls.push(path);return {blocks:[]};}});
 vm.runInContext(readFileSync(new URL('../dist/chat-features.js',import.meta.url),'utf8'),c);const view=await c.blockedPeopleView();assert.deepEqual(calls,['/api/blocks']);assert.match(view.html,/peer/);
});
test('guest login and unrelated routes never initialize chat or dereference an empty inbox cache',()=>{
 const c=make();c.me=null;c.renderId=1;c.document.querySelector=()=>{throw Error('unrelated page must not inspect chat DOM');};assert.doesNotThrow(()=>c.bindSocialChat(null));assert.doesNotThrow(()=>c.bindSocialChat({}));
 c.me={id:'signed-in'};assert.doesNotThrow(()=>c.bindSocialChat({}));
});
test('guest account renders email and social login before unrelated chat binding',()=>{
 const c=make();c.me=null;c.inApp=false;c.location={hash:'#account'};c.authConfig={providers:['google','kakao','apple']};c.icon=()=>'';c.formField=(label,name)=>'<input name="'+name+'">';vm.runInContext(readFileSync(new URL('../dist/views.js',import.meta.url),'utf8'),c);const html=c.accountHTML();assert.match(html,/id="auth-form"/);assert.match(html,/name="email"/);assert.match(html,/name="password"/);assert.match(html,/\/api\/auth\/google/);assert.doesNotThrow(()=>c.bindSocialChat(null));
});

test('DM and crew share the talking-room field and keep transport hooks',()=>{
 const c=nicknameContext({document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){},icon:()=>'',esc:String});
 for(const name of ['improvements','chat-features','social-chat'])vm.runInContext(readFileSync(new URL('../dist/'+name+'.js',import.meta.url),'utf8'),c);
 for(const peer of [{id:'peer'},null]){
  const html=c.chatPanelHTML('채팅',null,peer,true);
  for(const hook of ['chat-ui-composer','chat-ui-field','data-dm-editor','data-dm-emoji','data-chat-send','chat-image-file'])assert.ok(html.includes(hook),hook);
  assert.equal(html.includes('data-profile-gift="peer"'),!!peer);
 }
 const room=c.chatComposerHTML({id:'voice-chat-form',inputId:'voice-message',limit:500,emojiAttributes:'data-voice="emoji"'});
 assert.match(room,/chat-ui-composer/);assert.match(room,/maxlength="500"/);assert.match(room,/id="voice-message"/);
});
