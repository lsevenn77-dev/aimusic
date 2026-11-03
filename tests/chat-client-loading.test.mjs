import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture(api){
 const inputEvents={},input={value:'',style:{},disabled:false,addEventListener(name,fn){inputEvents[name]=fn;},removeEventListener(){}},button={disabled:false},earlier={hidden:true,disabled:false};
 const panel={style:{},getBoundingClientRect:()=>({top:100})},events={},observers=[];
 const log={innerHTML:'',scrollTop:0,scrollHeight:100,clientHeight:100,closest:()=>panel,addEventListener:(name,fn)=>events[name]=fn,removeEventListener(){}};
 const form={dataset:{},querySelector:selector=>selector==='textarea'?input:button};
 const nodes={'#chat-compose':form,'#chat-log':log,'#chat-earlier':earlier,'#chat-connection':{},'#chat-error':{}};
 const context=vm.createContext({renderId:1,me:{id:'user',name:'Me'},api,Date,Map,Math,Number,crypto,innerHeight:800,innerWidth:390,window:{addEventListener(){},removeEventListener(){}},ResizeObserver:class{constructor(fn){observers.push(fn)}observe(){}disconnect(){}},requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame(){},bindChatImageUpload(){},refreshMessageBadge(){},document:{body:{classList:{add(){},toggle(){},remove(){}}},querySelector:selector=>nodes[selector],addEventListener(){}},$:selector=>nodes[selector],icon:()=>'',esc:value=>String(value??''),portrait:()=>'',playerLevel:()=>1,number:String});
 vm.runInContext(readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8'),context);
 vm.runInContext('watchSocialChat=()=>()=>{};',context);
 return {context,input,button,log,nodes,events,inputEvents,form,panel,resize:()=>observers.forEach(fn=>fn())};
}

test('keyboard resizing keeps latest content visible while composing without stealing history browsing',()=>{
 const f=fixture(()=>new Promise(()=>{}));
 f.context.bindSocialChat({chat:{path:'/api/crews/crew/messages',crew:{id:'crew'}}});
 f.log.scrollHeight=1000;f.log.clientHeight=300;f.log.scrollTop=700;f.events.scroll();
 f.log.clientHeight=150;f.resize();assert.equal(f.log.scrollTop,1000);
 f.log.scrollTop=200;f.events.scroll();f.resize();assert.equal(f.log.scrollTop,200);
 f.context.document.activeElement=f.input;f.resize();assert.equal(f.log.scrollTop,200);
});

test('crew history starts immediately without waiting for any realtime event',async()=>{
 const calls=[];let release;
 const f=fixture(path=>{calls.push(path);return new Promise(resolve=>release=resolve);});
 f.context.bindSocialChat({chat:{path:'/api/crews/crew/messages',crew:{id:'crew',owner:false}}});
 assert.deepEqual(calls,['/api/crews/crew/messages']);assert.match(f.log.innerHTML,/불러오는 중/);
 release({messages:[{id:'message',user_id:'other',name:'Singer',body:'Ready immediately',created:1,sequence:2}],membership:{joined_sequence:1},has_more:false});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(f.log.innerHTML,/Ready immediately/);assert.doesNotMatch(f.log.innerHTML,/불러오는 중/);
});

test('incoming history preserves a user scroll even while the composer retains focus',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>release=resolve));
 f.context.bindSocialChat({chat:{path:'/api/crews/crew/messages',crew:{id:'crew'}}});
 f.log.scrollHeight=1000;f.log.clientHeight=300;f.log.scrollTop=200;
 f.context.document.activeElement=f.input;f.events.scroll();
 release({messages:[{id:'history',user_id:'other',name:'Singer',body:'History',created:1,sequence:1}],membership:{joined_sequence:1},has_more:false});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.log.scrollTop,200);assert.match(f.log.innerHTML,/History/);
});
test('desktop chat keeps its existing focus-follow behavior',()=>{
 const f=fixture(()=>new Promise(()=>{}));f.context.innerWidth=1440;
 f.context.bindSocialChat({chat:{path:'/api/crews/crew/messages',crew:{id:'crew'}}});
 f.log.scrollHeight=1000;f.log.clientHeight=300;f.log.scrollTop=200;f.events.scroll();
 f.context.document.activeElement=f.input;f.resize();assert.equal(f.log.scrollTop,1000);
});

test('a revoked initial crew read disables the composer without retaining chat content',async()=>{
 let reject;const f=fixture(()=>new Promise((resolve,no)=>reject=no));
 f.context.bindSocialChat({chat:{path:'/api/crews/crew/messages',crew:{id:'crew',owner:false}}});
 reject(Object.assign(new Error('membership revoked'),{status:403}));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.input.disabled,true);assert.equal(f.button.disabled,true);assert.match(f.nodes['#chat-error'].textContent,/가입 상태/);
 assert.doesNotMatch(f.log.innerHTML,/불러오는 중|Ready immediately/);
});

test('crew conversations use DM bubbles, profile links, role actions and escaped names',()=>{
 const f=fixture(()=>new Promise(()=>{}));
 const msg={id:'m',profile_id:'singer',user_id:'other',name:'<Singer>',body:'Hello <friend>',created:1};
 f.context.esc=value=>String(value??'').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const html=f.context.chatHTML([msg],null,{id:'crew',owner:false});
 assert.match(html,/class="dm-message /);assert.match(html,/class="dm-bubble"/);
 assert.match(html,/#producer\/singer/);assert.match(html,/&lt;friend&gt;/);assert.doesNotMatch(html,/<Singer>/);
 const owner=f.context.chatHTML([msg],null,{id:'crew',owner:true});assert.match(owner,/data-crew-member="singer"/);
 const mine=f.context.chatHTML([{...msg,user_id:'user'}],null,{id:'crew'});assert.match(mine,/dm-message mine/);
});

test('a hidden router mount is measured again after it becomes visible',()=>{
 const f=fixture(()=>new Promise(()=>{}));let visible=false;
 f.panel.getClientRects=()=>visible?[{}]:[];
 f.context.bindSocialChat({chat:{path:'/api/crews/crew/messages',crew:{id:'crew'}}});
 assert.equal(f.panel.style.height,undefined);
 visible=true;f.input.scrollHeight=75;f.resize();assert.equal(f.panel.style.height,'688px');assert.equal(f.input.style.height,'77px');
});

test('a mobile workspace uses the removed navigation space and clears a visible player',()=>{
 const f=fixture(()=>new Promise(()=>{})),attrs=new Map(),workspace={style:{setProperty(){}},getClientRects:()=>[{}],toggleAttribute:(key,on)=>attrs.set(key,on)};
 f.panel.closest=()=>workspace;f.context.innerHeight=420;
 f.nodes['.topbar']={getBoundingClientRect:()=>({bottom:78})};
 f.context.bindSocialChat({chat:{path:'/crew',crew:{id:'crew'}}});
 assert.equal(workspace.style.height,'342px');assert.equal(attrs.get('data-chat-compact'),false);
 f.nodes['.player:not([hidden])']={getBoundingClientRect:()=>({height:58,top:f.context.innerHeight-58})};
 f.resize();assert.equal(workspace.style.height,'284px');assert.equal(attrs.get('data-chat-compact'),true);
 f.context.innerHeight=844;f.resize();assert.equal(workspace.style.height,'708px');assert.equal(attrs.get('data-chat-compact'),false);
 delete f.nodes['.player:not([hidden])'];f.resize();assert.equal(workspace.style.height,'766px');
});

test('room drafts survive navigation and remain isolated by account and room',()=>{
 const f=fixture(()=>new Promise(()=>{})),view=path=>({chat:{path,crew:{id:path}}});
 f.context.bindSocialChat(view('/one'));f.input.value='한글 🎵 초안';f.inputEvents.input();vm.runInContext('socialCleanup()',f.context);
 f.context.bindSocialChat(view('/two'));assert.equal(f.input.value,'');vm.runInContext('socialCleanup()',f.context);
 f.context.bindSocialChat(view('/one'));assert.equal(f.input.value,'한글 🎵 초안');
 vm.runInContext('socialCleanup()',f.context);f.context.me={id:'different'};f.context.bindSocialChat(view('/one'));assert.equal(f.input.value,'');
});

test('duplicate submit is blocked, failed content survives room changes, retry reuses its request id',async()=>{
 const calls=[];let reject,resolve;
 const f=fixture((path,method,body)=>{if(method==='POST'){calls.push(body);return new Promise((yes,no)=>{resolve=yes;reject=no;});}return new Promise(()=>{});});
 const view={chat:{path:'/api/crews/crew/messages',crew:{id:'crew'},initial:{messages:[]}}};f.context.bindSocialChat(view);
 f.input.value='전송 실패에도 보존';f.form.onsubmit({preventDefault(){}});f.input.value='다음 초안';f.form.onsubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(f.input.value,'다음 초안');
 reject(new Error('offline'));await new Promise(r=>setImmediate(r));assert.match(f.log.innerHTML,/전송 실패에도 보존/);assert.match(f.log.innerHTML,/다시 보내기/);
 vm.runInContext('socialCleanup()',f.context);f.context.bindSocialChat(view);assert.match(f.log.innerHTML,/전송 실패에도 보존/);assert.equal(f.input.value,'다음 초안');
 f.events.click({target:{closest:()=>({dataset:{chatRetry:'pending:'+calls[0].request_id}})}});
 assert.equal(calls.length,2);assert.equal(calls[0].request_id,calls[1].request_id);
 resolve({message:{id:'saved',request_id:calls[0].request_id,body:calls[0].body,user_id:'user',sequence:1,created:1}});await new Promise(r=>setImmediate(r));
 assert.doesNotMatch(f.log.innerHTML,/다시 보내기/);assert.equal(f.input.value,'다음 초안');
});

test('late history from a departed room cannot paint or acknowledge the next room',async()=>{
 let release;const calls=[];const f=fixture((path,method)=>{calls.push([path,method]);return new Promise(r=>release=r);});
 f.context.bindSocialChat({chat:{path:'/old',peer:{id:'friend'}}});f.context.renderId++;
 release({messages:[{id:'late',body:'OLD ROOM',sequence:3,created:1}],has_more:false});await new Promise(r=>setImmediate(r));
 assert.doesNotMatch(f.log.innerHTML,/OLD ROOM/);assert.equal(calls.length,1);
});
