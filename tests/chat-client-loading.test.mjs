import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture(api){
 const inputEvents={},input={tagName:'TEXTAREA',value:'',style:{},disabled:false,addEventListener(name,fn){inputEvents[name]=fn;},removeEventListener(){}},button={disabled:false},earlier={hidden:true,disabled:false};
 const panel={style:{},getBoundingClientRect:()=>({top:100})},events={},observers=[];
 const log={innerHTML:'',scrollTop:0,scrollHeight:100,clientHeight:100,closest:()=>panel,addEventListener:(name,fn)=>events[name]=fn,removeEventListener(){}};
 const form={dataset:{},querySelector:selector=>selector==='textarea'?input:button};
 const nodes={'#chat-compose':form,'#chat-log':log,'#chat-earlier':earlier,'#chat-connection':{},'#chat-error':{}};
 const context=nicknameContext({renderId:1,me:{id:'user',name:'Me'},api,Date,Map,Math,Number,crypto,innerHeight:800,innerWidth:390,window:{addEventListener(){},removeEventListener(){}},ResizeObserver:class{constructor(fn){observers.push(fn)}observe(){}disconnect(){}},requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame(){},bindChatImageUpload(){},refreshMessageBadge(){},document:{body:{classList:{add(){},toggle(){},remove(){}}},querySelector:selector=>nodes[selector],addEventListener(){}},$:selector=>nodes[selector],icon:()=>'',esc:value=>String(value??''),portrait:()=>'',playerLevel:()=>1,number:String});
 vm.runInContext(readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8'),context);
 vm.runInContext('watchSocialChat=()=>()=>{};',context);
 return {context,input,button,log,nodes,events,inputEvents,form,panel,resize:()=>observers.forEach(fn=>fn())};
}

const settleChat=()=>new Promise(resolve=>setImmediate(resolve));
function chatActionEvent(action,id){
 const selector='[data-chat-'+action+']',button={dataset:{[action==='retry'?'chatRetry':'chatDiscard']:id}};
 return {preventDefault(){},target:{closest:query=>query.split(',').some(part=>part.trim()===selector)?button:null}};
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
test('desktop focus also preserves history browsing',()=>{
 const f=fixture(()=>new Promise(()=>{}));f.context.innerWidth=1440;
 f.context.bindSocialChat({chat:{path:'/api/crews/crew/messages',crew:{id:'crew'}}});
 f.log.scrollHeight=1000;f.log.clientHeight=300;f.log.scrollTop=200;f.events.scroll();
 f.context.document.activeElement=f.input;f.resize();assert.equal(f.log.scrollTop,200);
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
 visible=true;f.input.scrollHeight=75;f.resize();assert.equal(f.panel.style.height,'688px');assert.equal(f.input.style.height,'75px');
});

test('consecutive senders share a profile until a time gap, day boundary or system event',()=>{
 const c=fixture(()=>new Promise(()=>{})).context;
 const make=(id,created,extra={})=>({id,user_id:'other',profile_id:'friend',name:'Friend',body:'hello',created,...extra});
 const html=c.chatHTML([make('a',100),make('b',110),make('c',500),make('s',501,{kind:'system'}),make('d',502),make('e',90000)],null,{id:'crew'});
 assert.equal((html.match(/is-grouped/g)||[]).length,1);assert.equal((html.match(/class="dm-profile-link"/g)||[]).length,4);
});

test('the shared geometry uses the complete mobile viewport and keeps desktop composing clear of the player',()=>{
 const c=fixture(()=>new Promise(()=>{})).context;
 assert.equal(c.messageWorkspaceGeometry({mobile:true,height:844,top:78,playerTop:786}).height,844);
 const keyboard=c.messageWorkspaceGeometry({mobile:true,height:320,offset:12,top:78,playerTop:262});assert.equal(keyboard.top,12);assert.equal(keyboard.height,320);
 const desktop=c.messageWorkspaceGeometry({mobile:false,height:900,top:112,playerTop:820});
 assert.equal(desktop.height,684);assert.ok(desktop.top+desktop.height<=820-24);
 assert.equal(c.messageWorkspaceGeometry({mobile:false,height:900,top:112}).height,720);
 const short=c.messageWorkspaceGeometry({mobile:false,height:540,top:112,playerTop:470});
 assert.equal(short.height,334);assert.ok(short.top+short.height<=470-24);
 assert.equal(c.messageWorkspaceGeometry({mobile:false,height:1600,top:112}).height,780);
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
 f.context.icon=name=>'<svg data-test-icon="'+name+'" aria-hidden="true"></svg>';
 f.context.voiceGlyph=f.context.icon;
 const view={chat:{path:'/api/crews/crew/messages',crew:{id:'crew'},initial:{messages:[]}}};f.context.bindSocialChat(view);
 const message='전송 실패에도 보존 🎵 '.repeat(24).trim();
 f.input.value=message;f.form.onsubmit({preventDefault(){}});f.input.value='다음 초안';f.form.onsubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(f.input.value,'다음 초안');
 reject(new Error('offline'));await settleChat();assert.ok(f.log.innerHTML.includes(message));assert.match(f.log.innerHTML,/class="[^"]*\bis-failed\b/);
 for(const [action,label,glyph] of [['discard','전송 실패 메시지 삭제','close'],['retry','다시 보내기','restart']]){
  const button=f.log.innerHTML.match(new RegExp('<button([^>]*data-chat-'+action+'="[^"]+"[^>]*)>([\\s\\S]*?)</button>'));
  assert.ok(button,action+' action is present');assert.match(button[1],/type="button"/);
  assert.ok(button[1].includes('aria-label="'+label+'"'));assert.ok(button[1].includes('title="'+label+'"'));
  assert.ok(button[2].includes('data-test-icon="'+glyph+'"'));assert.equal(button[2].replace(/<[^>]*>/g,'').trim(),'','failure actions have no visible text');
 }
 vm.runInContext('socialCleanup()',f.context);f.context.bindSocialChat(view);assert.match(f.log.innerHTML,/전송 실패에도 보존/);assert.equal(f.input.value,'다음 초안');
 f.events.click(chatActionEvent('retry','pending:'+calls[0].request_id));
 assert.equal(calls.length,2);assert.equal(calls[0].request_id,calls[1].request_id);
 resolve({message:{id:'saved',request_id:calls[0].request_id,body:calls[0].body,user_id:'user',sequence:1,created:1}});await new Promise(r=>setImmediate(r));
 assert.doesNotMatch(f.log.innerHTML,/data-chat-retry|data-chat-discard|\bis-failed\b/);assert.equal(f.input.value,'다음 초안');
});

test('discard removes only the failed local message across reentry without requests or draft loss',async()=>{
 const calls=[];const f=fixture(async(path,method,body)=>{calls.push({path,method,body});if(method==='POST')throw new Error('offline');return {};});
 const view={chat:{path:'/api/dm/friend',peer:{id:'friend'},initial:{messages:[]}}};f.context.bindSocialChat(view);
 for(const body of ['첫 번째 실패 🎵','두 번째 실패']){f.input.value=body;f.form.onsubmit({preventDefault(){}});await settleChat();}
 f.input.value='작성 중인 별도 초안';f.inputEvents.input();
 const first='pending:'+calls[0].body.request_id,second='pending:'+calls[1].body.request_id,before=calls.length;
 f.events.click(chatActionEvent('discard',first));
 assert.doesNotMatch(f.log.innerHTML,/첫 번째 실패/);assert.match(f.log.innerHTML,/두 번째 실패/);
 assert.equal(f.nodes['#chat-error'].textContent,'offline');assert.equal(f.input.value,'작성 중인 별도 초안');assert.equal(f.button.disabled,false);assert.equal(calls.length,before);
 vm.runInContext('socialCleanup()',f.context);f.context.renderId++;f.context.bindSocialChat(view);
 assert.doesNotMatch(f.log.innerHTML,/첫 번째 실패/);assert.match(f.log.innerHTML,/두 번째 실패/);assert.equal(f.input.value,'작성 중인 별도 초안');
 f.events.click(chatActionEvent('discard',second));
 assert.doesNotMatch(f.log.innerHTML,/두 번째 실패|data-chat-retry|data-chat-discard/);assert.equal(f.nodes['#chat-error'].textContent,'');assert.equal(f.button.disabled,false);
 vm.runInContext('socialCleanup()',f.context);f.context.renderId++;f.context.bindSocialChat(view);
 assert.doesNotMatch(f.log.innerHTML,/첫 번째 실패|두 번째 실패/);assert.equal(f.input.value,'작성 중인 별도 초안');assert.equal(calls.length,before);
});

test('discard cannot remove an in-flight retry or a confirmed server message',async()=>{
 const calls=[];let release;
 const f=fixture((path,method,body)=>{calls.push({path,method,body});if(method==='POST')return calls.length===1?Promise.reject(new Error('offline')):new Promise(resolve=>release=resolve);return Promise.resolve({});});
 f.context.bindSocialChat({chat:{path:'/api/dm/friend',peer:{id:'friend'},initial:{messages:[]}}});
 f.input.value='재시도 중 보존';f.form.onsubmit({preventDefault(){}});await settleChat();
 const id='pending:'+calls[0].body.request_id;
 f.events.click(chatActionEvent('retry',id));assert.equal(calls.length,2);assert.equal(calls[1].body.request_id,calls[0].body.request_id);
 f.events.click(chatActionEvent('discard',id));
 assert.match(f.log.innerHTML,/재시도 중 보존/);assert.match(f.log.innerHTML,/전송 중/);assert.ok(f.log.innerHTML.includes('data-message="'+id+'"'));assert.equal(f.button.disabled,true);assert.equal(calls.length,2);
 release({message:{id:'saved',request_id:calls[0].body.request_id,body:'재시도 중 보존',sender_id:'user',sequence:1,created:1}});await settleChat();
 assert.equal((f.log.innerHTML.match(/data-message="saved"/g)||[]).length,1);assert.doesNotMatch(f.log.innerHTML,/data-message="pending:|data-chat-retry|data-chat-discard/);assert.equal(f.button.disabled,false);
 const saved=f.log.innerHTML;
 for(const staleId of [id,'saved','pending:missing']){f.events.click(chatActionEvent('discard',staleId));f.events.click(chatActionEvent('retry',staleId));}
 assert.equal(f.log.innerHTML,saved);assert.equal(calls.length,2);
});

test('discarding failed content preserves an existing access error and disabled composer',async()=>{
 const calls=[];const f=fixture(async(path,method,body)=>{calls.push({path,method,body});throw Object.assign(new Error('access revoked'),{status:403});});
 f.context.bindSocialChat({chat:{path:'/api/dm/friend',peer:{id:'friend'},initial:{messages:[]}}});
 f.input.value='권한 실패 메시지';f.form.onsubmit({preventDefault(){}});await settleChat();
 const error=f.nodes['#chat-error'].textContent;assert.match(error,/로그인/);assert.equal(f.button.disabled,true);
 f.events.click(chatActionEvent('discard','pending:'+calls[0].body.request_id));
 assert.doesNotMatch(f.log.innerHTML,/권한 실패 메시지/);assert.equal(f.nodes['#chat-error'].textContent,error);assert.equal(f.button.disabled,true);assert.equal(f.input.disabled,true);assert.equal(calls.length,1);
});

test('stale route and account action handlers cannot discard or resend failed content',async t=>{
 for(const changed of ['route','account'])await t.test(changed,async()=>{
  const calls=[];const f=fixture(async(path,method,body)=>{calls.push({path,method,body});if(method==='POST')throw new Error('offline');return {};});
  const view={chat:{path:'/api/dm/friend',peer:{id:'friend'},initial:{messages:[]}}};f.context.bindSocialChat(view);
  f.input.value='이전 화면 실패 메시지';f.form.onsubmit({preventDefault(){}});await settleChat();
  const oldClick=f.events.click,id='pending:'+calls[0].body.request_id,html=f.log.innerHTML;
  vm.runInContext('socialCleanup()',f.context);
  if(changed==='route')f.context.renderId++;else f.context.me={id:'different',name:'Different'};
  oldClick(chatActionEvent('discard',id));oldClick(chatActionEvent('retry',id));
  assert.equal(f.log.innerHTML,html);assert.equal(calls.length,1);
  f.context.bindSocialChat(view);
  if(changed==='route')assert.match(f.log.innerHTML,/이전 화면 실패 메시지/);else assert.doesNotMatch(f.log.innerHTML,/이전 화면 실패 메시지/);
  const current=f.log.innerHTML;oldClick(chatActionEvent('discard',id));oldClick(chatActionEvent('retry',id));
  assert.equal(f.log.innerHTML,current);assert.equal(calls.length,1);
 });
});

test('a later server confirmation remains visible after the failed local copy is discarded',async()=>{
 const calls=[];let changed,request;
 const f=fixture(async(path,method,body)=>{
  calls.push({path,method,body});
  if(method==='POST'){request=body;throw new Error('response lost');}
  if(method==='PATCH')return {};
  return {messages:[{id:'confirmed',request_id:request.request_id,body:request.body,sender_id:'user',sequence:1,created:1}],has_more:false};
 });
 f.context.watchSocialChat=(query,onChange)=>{changed=onChange;return ()=>{};};
 f.context.bindSocialChat({chat:{path:'/api/dm/friend',peer:{id:'friend'},initial:{messages:[]}}});
 f.input.value='서버에서 늦게 확인한 메시지 🎵';f.form.onsubmit({preventDefault(){}});await settleChat();
 f.events.click(chatActionEvent('discard','pending:'+request.request_id));
 assert.doesNotMatch(f.log.innerHTML,/서버에서 늦게 확인한 메시지/);assert.equal(calls.length,1);
 changed();await settleChat();
 assert.match(f.log.innerHTML,/서버에서 늦게 확인한 메시지 🎵/);assert.equal((f.log.innerHTML.match(/data-message="confirmed"/g)||[]).length,1);
 assert.doesNotMatch(f.log.innerHTML,/data-message="pending:|data-chat-retry|data-chat-discard|\bis-failed\b/);assert.equal(calls.filter(call=>call.method==='DELETE').length,0);
});

test('late history from a departed room cannot paint or acknowledge the next room',async()=>{
 let release;const calls=[];const f=fixture((path,method)=>{calls.push([path,method]);return new Promise(r=>release=r);});
 f.context.bindSocialChat({chat:{path:'/old',peer:{id:'friend'}}});f.context.renderId++;
 release({messages:[{id:'late',body:'OLD ROOM',sequence:3,created:1}],has_more:false});await new Promise(r=>setImmediate(r));
 assert.doesNotMatch(f.log.innerHTML,/OLD ROOM/);assert.equal(calls.length,1);
});
