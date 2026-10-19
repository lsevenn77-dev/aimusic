import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8');
const make=()=>{const c=vm.createContext({document:{addEventListener(){}},esc:String,crewInboxHTML:()=>'',number:String});vm.runInContext(source,c);return c;};
test('filters include unread crew, exclude read conversations, and require verified notices',()=>{const c=make();c.items=[{id:'friend',unread:0},{id:'new',unread:2},{id:'operator',unread:1,is_notice:true},{id:'fake',name:'AIFECT 운영팀',unread:0}];c.crew={id:'crew',unread:3};const select=f=>JSON.parse(vm.runInContext(`JSON.stringify(dmInboxSelection(items,crew,'${f}'))`,c));assert.equal(select('all').conversations.length,4);assert.deepEqual(select('unread').conversations.map(p=>p.id),['new','operator']);assert.equal(select('unread').crew.id,'crew');assert.deepEqual(select('crew').conversations,[]);assert.equal(select('crew').crew.id,'crew');assert.deepEqual(select('notice').conversations.map(p=>p.id),['operator']);assert.equal(select('notice').crew,null);c.crew.unread=0;assert.equal(select('unread').crew,null);});
test('empty states and selected tab remain accurate on refresh',()=>{const c=make();vm.runInContext("dmInboxFilter='unread'",c);assert.match(vm.runInContext('conversationListHTML([])',c),/안 읽은 메시지가 없어요/);assert.match(vm.runInContext('dmInboxTabsHTML()',c),/data-dm-filter="unread" aria-pressed="true"/);vm.runInContext("dmInboxFilter='notice'",c);assert.match(vm.runInContext('conversationListHTML([])',c),/받은 공지가 없어요/);});
test('tabs render synchronously from the account inbox without another API call',()=>{
 const root={innerHTML:''},count={textContent:''},error={textContent:''};let click,requests=0;
 const buttons=['all','unread','crew','notice'].map(key=>({dataset:{dmFilter:key},setAttribute(){}}));
 const tabs={addEventListener:(name,handler)=>{click=handler;},removeEventListener(){},querySelectorAll:()=>buttons};
 const c=vm.createContext({document:{addEventListener(){},querySelector:s=>s==='.dm-inbox-tabs'?tabs:null},window:{addEventListener(){},removeEventListener(){}},innerWidth:375,renderId:1,me:{id:'me'},$:s=>({'#dm-conversations':root,'#dm-inbox-count':count,'#dm-list-error':error}[s]),esc:String,number:String,portrait:()=>'',dmMuteButton:()=>'',crewInboxHTML:crew=>crew?'CREW':'',api:()=>{requests++;return new Promise(()=>{});}});
 vm.runInContext(source,c);vm.runInContext("watchSocialChat=()=>()=>{};rememberDmInbox({conversations:[{id:'read',name:'READ',unread:0,updated:1},{id:'new',name:'NEW',unread:2,updated:1},{id:'team',name:'NOTICE',unread:0,is_notice:true,updated:1}],crew:{id:'crew',unread:1}});bindSocialChat({inbox:true})",c);
 const select=key=>click({target:{closest:()=>buttons.find(b=>b.dataset.dmFilter===key)}});
 select('unread');assert.match(root.innerHTML,/NEW/);assert.doesNotMatch(root.innerHTML,/READ|NOTICE/);assert.match(root.innerHTML,/CREW/);
 select('notice');assert.match(root.innerHTML,/NOTICE/);assert.doesNotMatch(root.innerHTML,/NEW|CREW/);
 select('crew');assert.equal(root.innerHTML,'CREW');select('all');assert.match(root.innerHTML,/READ/);assert.equal(requests,0);
});

test('desktop panel ends twelve pixels above payouts and respects available viewport',()=>{const c=make();assert.equal(vm.runInContext('dmWorkspaceHeight(1092,188,16,826)',c),626);assert.equal(vm.runInContext('dmWorkspaceHeight(700,188,110,826)',c),402);assert.equal(vm.runInContext('dmWorkspaceHeight(700,188,78,undefined)',c),434);assert.equal(vm.runInContext('dmWorkspaceHeight(300,188,78,undefined)',c),180);});
test('a fetched thread does not wait for another inbox request and never reuses another account inbox',async()=>{
 const c=make();c.me={id:'one'};c.api=()=>{throw Error('thread should not fetch the inbox');};vm.runInContext(readFileSync(new URL('../dist/page-redesign.js',import.meta.url),'utf8'),c);c.dmInboxHTML=d=>JSON.stringify(d);
 vm.runInContext("rememberDmInbox({conversations:[{id:'private'}]})",c);
 const view={chat:{peer:{id:'peer'}},html:'CHAT'};const result=await c.dmWorkspaceView(view);assert.match(result.html,/private/);assert.equal(result.refreshInbox,true);
 c.me={id:'two'};const other=await c.dmWorkspaceView(view);assert.doesNotMatch(other.html,/private/);assert.equal(other.html,'{"conversations":[]}');
});
test('crew history starts alongside crew details and is ready in the first render',async()=>{
 const calls=[];let resolveCrew;const c=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){},esc:String,icon:()=>'',number:String,chatPanelHTML:(label,initial)=>initial?.messages[0]?.body||'EMPTY',api:path=>{calls.push(path);return path.endsWith('/messages')?Promise.resolve({messages:[{body:'READY'}],membership:{joined_sequence:1}}):new Promise(resolve=>{resolveCrew=resolve;});}});
 vm.runInContext(readFileSync(new URL('../dist/chat-features.js',import.meta.url),'utf8'),c);const pending=c.crewChatView('dm/crew/test');assert.deepEqual(calls,['/api/crews/test','/api/crews/test/messages']);resolveCrew({crew:{id:'test',name:'Crew',members:2},membership:{role:'member'}});const view=await pending;assert.match(view.html,/READY/);assert.equal(view.chat.initial.messages[0].body,'READY');
});
