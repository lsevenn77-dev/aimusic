import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectStickers from '../shared/chat-stickers.js';

function memoryStorage(entries=[]){
 const data=new Map(entries);
 return {get length(){return data.size;},clear(){data.clear();},getItem:key=>data.get(String(key))??null,key:index=>[...data.keys()][index]??null,removeItem:key=>{data.delete(String(key));},setItem:(key,value)=>{data.set(String(key),String(value));}};
}
function storageEntries(storage){return Array.from({length:storage.length},(_,index)=>{const key=storage.key(index);return [key,storage.getItem(key)];});}

function fixture(api,{storage=memoryStorage(),uid='user',attachments=false}={}){
 const inputEvents={},input={tagName:'TEXTAREA',value:'',style:{},disabled:false,addEventListener(name,fn){inputEvents[name]=fn;},removeEventListener(){}},button={disabled:false},earlier={hidden:true,disabled:false};
 const panel={style:{},getBoundingClientRect:()=>({top:100})},events={},observers=[],streams=[];
 const log={innerHTML:'',scrollTop:0,scrollHeight:100,clientHeight:100,closest:()=>panel,addEventListener:(name,fn)=>events[name]=fn,removeEventListener(){}};
 const form={dataset:{},querySelector:selector=>selector==='textarea'?input:button};
 const imageInput={files:[],value:'',disabled:false,isConnected:true,parentElement:{}};
 const nodes={'#chat-compose':form,'#chat-log':log,'#chat-earlier':earlier,'#chat-connection':{},'#chat-error':{},'#chat-image-file':imageInput,'#chat-upload-status':{}};
 const context=nicknameContext({renderId:1,me:{id:uid,name:'Me'},api,Date,Map,Math,Number,crypto,AifectStickers,localStorage:storage,innerHeight:800,innerWidth:390,window:{localStorage:storage,addEventListener(){},removeEventListener(){}},ResizeObserver:class{constructor(fn){observers.push(fn)}observe(){}disconnect(){}},requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame(){},setInterval:()=>0,clearInterval(){},bindChatImageUpload(){},refreshMessageBadge(){},document:{body:{classList:{add(){},toggle(){},remove(){}}},querySelector:selector=>nodes[selector],addEventListener(){}},$:selector=>nodes[selector],icon:()=>'',esc:value=>String(value??''),portrait:()=>'',playerLevel:()=>1,number:String});
 if(attachments){vm.runInContext(readFileSync(new URL('../dist/chat-features.js',import.meta.url),'utf8'),context);context.refreshMessageBadge=()=>{};}
 vm.runInContext(readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8'),context);
 context.watchSocialChat=(query,changed,status,revoked)=>{streams.push({query,changed,status,revoked});return ()=>{};};
 return {context,input,button,log,nodes,events,inputEvents,form,panel,imageInput,streams,resize:()=>observers.forEach(fn=>fn())};
}

const settleChat=()=>new Promise(resolve=>setImmediate(resolve));
function chatActionEvent(action,id){
 const selector='[data-chat-'+action+']',button={dataset:{[action==='retry'?'chatRetry':'chatDiscard']:id}};
 return {preventDefault(){},target:{closest:query=>query.split(',').some(part=>part.trim()===selector)?button:null}};
}
const directView=(path='/api/dm/friend',messages=[])=>({chat:{path,peer:{id:path.split('/').at(-1)},initial:{messages}}});
function offlineFixture(storage,options={}){
 const calls=[];
 const f=fixture(async(path,method,body)=>{calls.push({path,method:method||'GET',body});if(method==='POST')throw new Error('offline');return {messages:[],has_more:false};},{storage,...options});
 return {...f,calls};
}
async function submitChat(f,body){f.input.value=body;f.form.onsubmit({preventDefault(){}});await settleChat();}
const posts=f=>f.calls.filter(call=>call.method==='POST');

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

test('failed text, stickers and photos survive a fresh VM without automatic sends and retry the same request',async t=>{
 for(const kind of ['text','stickers','photo'])await t.test(kind,async()=>{
  const storage=memoryStorage(),attachments=kind==='photo',view=directView();
  const first=offlineFixture(storage,{attachments});first.context.bindSocialChat(view);
  const body=kind==='stickers'?'한글 🎵 [aifect:cat_basic_heart] [aifect:cat_text_wow]':'앱을 다시 열어도 보존 🎵\n두 번째 줄';
  if(attachments){
   first.context.optimizeUploadImage=async file=>file;
   first.context.fetch=async()=>({ok:true,json:async()=>({id:'uploaded-photo',expires:Math.floor(Date.now()/1000)+86400})});
   first.imageInput.files=[{name:'photo.webp',type:'image/webp'}];await first.imageInput.onchange();
  }else await submitChat(first,body);
  assert.equal(posts(first).length,1);assert.match(first.log.innerHTML,/\bis-failed\b/);
  const request=posts(first)[0].body;
  // Do not call cleanup or any unload hook: a killed page must already be durable.
  const reopened=offlineFixture(storage,{attachments});reopened.context.bindSocialChat(view);await settleChat();
  assert.notEqual(reopened.context,first.context);assert.equal(posts(reopened).length,0);
  assert.ok(reopened.log.innerHTML.includes('data-message="pending:'+request.request_id+'"'));
  assert.match(reopened.log.innerHTML,/\bis-failed\b/);assert.match(reopened.log.innerHTML,/data-chat-retry/);assert.equal(reopened.button.disabled,false);
  if(kind==='photo')assert.match(reopened.log.innerHTML,/\/media\/dm\/uploaded-photo/);
  else if(kind==='stickers'){assert.match(reopened.log.innerHTML,/cat_basic_heart\.webp/);assert.match(reopened.log.innerHTML,/cat_text_wow\.webp/);assert.match(reopened.log.innerHTML,/한글 🎵/);}
  else assert.ok(reopened.log.innerHTML.includes(body));
  reopened.events.click(chatActionEvent('retry','pending:'+request.request_id));await settleChat();
  assert.equal(posts(reopened).length,1);const retried=posts(reopened)[0].body;
  assert.equal(retried.request_id,request.request_id);assert.equal(retried.body,request.body);assert.equal(retried.image_id,request.image_id);
 });
});

test('persistent failed work is isolated by account and room across independent VMs',async()=>{
 const storage=memoryStorage(),cases=[['user','/api/dm/one','첫 계정 첫 대화'],['user','/api/dm/two','첫 계정 둘째 대화'],['other-user','/api/dm/one','다른 계정 대화']];
 for(const [uid,path,body] of cases){const f=offlineFixture(storage,{uid});f.context.bindSocialChat(directView(path));await submitChat(f,body);assert.equal(posts(f).length,1);}
 for(const [uid,path,body] of [...cases,['user','/api/dm/empty',null],['new-user','/api/dm/one',null]]){
  const f=offlineFixture(storage,{uid});f.context.bindSocialChat(directView(path));await settleChat();
  assert.equal(posts(f).length,0);
  for(const entry of cases)assert.equal(f.log.innerHTML.includes(entry[2]),entry[2]===body,uid+' '+path+' only restores its own work');
  assert.equal((f.log.innerHTML.match(/data-chat-retry=/g)||[]).length,body?1:0);
 }
});

test('restored pending content stays visible while initial history is unavailable',async()=>{
 const storage=memoryStorage(),first=offlineFixture(storage);first.context.bindSocialChat(directView());await submitChat(first,'오프라인 재접속에도 보이는 메시지');
 const calls=[];let rejectHistory;
 const reopened=fixture((path,method,body)=>{calls.push({path,method,body});return new Promise((resolve,reject)=>rejectHistory=reject);},{storage});
 reopened.context.bindSocialChat({chat:{path:'/api/dm/friend',peer:{id:'friend'}}});
 assert.match(reopened.log.innerHTML,/오프라인 재접속에도 보이는 메시지/);assert.match(reopened.log.innerHTML,/data-chat-retry/);
 rejectHistory(new Error('history offline'));await settleChat();
 assert.match(reopened.log.innerHTML,/오프라인 재접속에도 보이는 메시지/);assert.match(reopened.log.innerHTML,/data-chat-retry/);assert.equal(reopened.button.disabled,false);
 assert.equal(calls.length,1);assert.notEqual(calls[0].method,'POST');
});

test('independent open contexts retain both pending messages and discard only their own item',async()=>{
 const storage=memoryStorage(),first=offlineFixture(storage),second=offlineFixture(storage),view=directView();
 first.context.bindSocialChat(view);second.context.bindSocialChat(view);
 await submitChat(first,'첫 번째 열린 창');await submitChat(second,'두 번째 열린 창');
 const both=offlineFixture(storage);both.context.bindSocialChat(view);
 assert.match(both.log.innerHTML,/첫 번째 열린 창/);assert.match(both.log.innerHTML,/두 번째 열린 창/);assert.equal((both.log.innerHTML.match(/data-chat-retry=/g)||[]).length,2);assert.equal(posts(both).length,0);
 first.events.click(chatActionEvent('discard','pending:'+posts(first)[0].body.request_id));
 const final=offlineFixture(storage);final.context.bindSocialChat(view);
 assert.doesNotMatch(final.log.innerHTML,/첫 번째 열린 창/);assert.match(final.log.innerHTML,/두 번째 열린 창/);assert.equal((final.log.innerHTML.match(/data-chat-retry=/g)||[]).length,1);
});

test('a successful retry or explicit discard remains removed after another complete restart',async t=>{
 for(const outcome of ['success','discard'])await t.test(outcome,async()=>{
  const storage=memoryStorage();storage.setItem('unrelated-setting','keep');
  const view=directView(),first=offlineFixture(storage);first.context.bindSocialChat(view);await submitChat(first,'재접속 뒤 처리할 메시지');
  const request=posts(first)[0].body,calls=[];
  const reopened=fixture(async(path,method,body)=>{calls.push({path,method,body});return {message:{id:'saved',request_id:body.request_id,body:body.body,sender_id:'user',sequence:1,created:1}};},{storage});
  reopened.context.bindSocialChat(view);assert.match(reopened.log.innerHTML,/data-chat-retry/);assert.equal(calls.length,0);
  reopened.events.click(chatActionEvent(outcome==='success'?'retry':'discard','pending:'+request.request_id));await settleChat();
  assert.doesNotMatch(reopened.log.innerHTML,/data-message="pending:|data-chat-retry|data-chat-discard/);
  assert.equal(calls.length,outcome==='success'?1:0);
  if(outcome==='success'){assert.equal(calls[0].body.request_id,request.request_id);assert.match(reopened.log.innerHTML,/data-message="saved"/);}
  const final=offlineFixture(storage);final.context.bindSocialChat(view);await settleChat();
  assert.doesNotMatch(final.log.innerHTML,/재접속 뒤 처리할 메시지|data-message="pending:|data-chat-retry/);assert.equal(posts(final).length,0);
  assert.equal(storage.getItem('unrelated-setting'),'keep');
 });
});

test('server confirmation from initial history or a later read clears the durable pending copy',async t=>{
 for(const source of ['initial','realtime'])await t.test(source,async()=>{
  const storage=memoryStorage(),first=offlineFixture(storage);first.context.bindSocialChat(directView());await submitChat(first,'응답은 잃었지만 서버에서 확인');
  const request=posts(first)[0].body,message={id:'confirmed',request_id:request.request_id,body:request.body,sender_id:'user',sequence:1,created:1},calls=[];
  const pending=offlineFixture(storage);pending.context.bindSocialChat(directView());assert.match(pending.log.innerHTML,/data-chat-retry/);
  const reopened=fixture(async(path,method,body)=>{calls.push({path,method,body});return method==='PATCH'?{}:{messages:[message],has_more:false};},{storage});
  reopened.context.bindSocialChat(directView('/api/dm/friend',source==='initial'?[message]:[]));
  if(source==='realtime'){assert.match(reopened.log.innerHTML,/data-chat-retry/);reopened.streams[0].changed();}
  await settleChat();assert.equal((reopened.log.innerHTML.match(/data-message="confirmed"/g)||[]).length,1);
  assert.doesNotMatch(reopened.log.innerHTML,/data-message="pending:|data-chat-retry/);assert.equal(calls.filter(call=>call.method==='POST').length,0);
  const final=offlineFixture(storage);final.context.bindSocialChat(directView());
  assert.doesNotMatch(final.log.innerHTML,/응답은 잃었지만 서버에서 확인|data-message="pending:|data-chat-retry/);
 });
});

test('refresh during an unfinished POST restores a retryable failure without replaying the POST',async()=>{
 const storage=memoryStorage(),calls=[],first=fixture((path,method,body)=>{calls.push({path,method,body});return new Promise(()=>{});},{storage});
 first.context.bindSocialChat(directView());first.input.value='전송 도중 브라우저 종료';first.form.onsubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(first.button.disabled,true);assert.match(first.log.innerHTML,/전송 중/);
 const reopened=offlineFixture(storage);reopened.context.bindSocialChat(directView());await settleChat();
 assert.match(reopened.log.innerHTML,/전송 도중 브라우저 종료/);assert.match(reopened.log.innerHTML,/\bis-failed\b/);assert.doesNotMatch(reopened.log.innerHTML,/전송 중/);
 assert.equal(reopened.button.disabled,false);assert.equal(posts(reopened).length,0);
 reopened.events.click(chatActionEvent('retry','pending:'+calls[0].body.request_id));await settleChat();
 assert.equal(posts(reopened).length,1);assert.equal(posts(reopened)[0].body.request_id,calls[0].body.request_id);
});

test('a late POST failure cannot restore a message already sent or discarded by another context',async t=>{
 for(const outcome of ['success','discard'])await t.test(outcome,async()=>{
  const storage=memoryStorage(),requests=[];let rejectOld;
  const first=fixture((path,method,body)=>{requests.push(body);return new Promise((resolve,reject)=>rejectOld=reject);},{storage});
  first.context.bindSocialChat(directView());await submitChat(first,'늦은 실패 응답으로 부활하면 안 됨');assert.equal(requests.length,1);
  const calls=[],reopened=fixture(async(path,method,body)=>{calls.push({path,method,body});return {message:{id:'saved',request_id:body.request_id,body:body.body,sender_id:'user',sequence:1,created:1}};},{storage});
  reopened.context.bindSocialChat(directView());assert.match(reopened.log.innerHTML,/data-chat-retry/);
  reopened.events.click(chatActionEvent(outcome==='success'?'retry':'discard','pending:'+requests[0].request_id));await settleChat();
  assert.equal(calls.length,outcome==='success'?1:0);assert.doesNotMatch(reopened.log.innerHTML,/data-message="pending:|data-chat-retry/);
  rejectOld(new Error('late response lost'));await settleChat();
  const final=offlineFixture(storage);final.context.bindSocialChat(directView());
  assert.doesNotMatch(final.log.innerHTML,/늦은 실패 응답으로 부활하면 안 됨|data-message="pending:|data-chat-retry/);assert.equal(posts(final).length,0);
 });
});

test('crew access revocation removes persisted failed contents before a later reopening',async()=>{
 const storage=memoryStorage(),view={chat:{path:'/api/crews/crew/messages',crew:{id:'crew'},initial:{messages:[]}}},first=offlineFixture(storage);
 first.context.bindSocialChat(view);await submitChat(first,'가입했던 크루의 실패 메시지');assert.match(first.log.innerHTML,/data-chat-retry/);
 const pending=offlineFixture(storage);pending.context.bindSocialChat(view);assert.match(pending.log.innerHTML,/data-chat-retry/);
 const revoked=fixture(async()=>{throw Object.assign(new Error('membership revoked'),{status:403});},{storage});
 revoked.context.bindSocialChat({chat:{path:view.chat.path,crew:{id:'crew'}}});await settleChat();
 assert.equal(revoked.input.disabled,true);assert.doesNotMatch(revoked.log.innerHTML,/가입했던 크루의 실패 메시지/);
 const final=offlineFixture(storage);final.context.bindSocialChat(view);assert.doesNotMatch(final.log.innerHTML,/가입했던 크루의 실패 메시지|data-chat-retry/);assert.equal(posts(final).length,0);
});

test('malformed persisted values do not break reopening or a subsequent send',async t=>{
 const seeded=memoryStorage(),first=offlineFixture(seeded);first.context.bindSocialChat(directView());await submitChat(first,'손상 전 메시지');
 const entries=storageEntries(seeded);assert.ok(entries.length,'a failed send has durable state');
 for(const raw of ['{invalid json','null','42','{}','[null,42,"unexpected"]'])await t.test(raw,async()=>{
  const storage=memoryStorage(entries.map(([key])=>[key,raw])),f=offlineFixture(storage);
  assert.doesNotThrow(()=>f.context.bindSocialChat(directView()));assert.equal(posts(f).length,0);assert.doesNotMatch(f.log.innerHTML,/손상 전 메시지|data-chat-retry/);
  await submitChat(f,'손상 데이터 이후에도 작성 가능');assert.equal(posts(f).length,1);assert.match(f.log.innerHTML,/손상 데이터 이후에도 작성 가능/);assert.match(f.log.innerHTML,/data-chat-retry/);assert.equal(f.button.disabled,false);
 });
});

test('storage read, write, remove and access errors leave in-memory send and discard usable',async t=>{
 for(const operation of ['getItem','setItem','removeItem','access'])await t.test(operation,async()=>{
  const storage=memoryStorage(),first=offlineFixture(storage);first.context.bindSocialChat(directView());await submitChat(first,'기존 저장 메시지');
  let attempts=0;
  const broken=Object.create(storage),fail=()=>{attempts++;throw Object.assign(new Error('storage unavailable'),{name:operation==='setItem'?'QuotaExceededError':'SecurityError'});};
  if(operation!=='access')broken[operation]=fail;
  const f=offlineFixture(broken);
  if(operation==='access')for(const target of [f.context,f.context.window])Object.defineProperty(target,'localStorage',{get:fail,configurable:true});
  assert.doesNotThrow(()=>f.context.bindSocialChat(directView()));assert.equal(posts(f).length,0);
  if(operation==='removeItem'){
   assert.match(f.log.innerHTML,/기존 저장 메시지/);
   assert.doesNotThrow(()=>f.events.click(chatActionEvent('discard','pending:'+posts(first)[0].body.request_id)));
   assert.doesNotMatch(f.log.innerHTML,/기존 저장 메시지/);
  }
  await submitChat(f,'저장소 장애 중 새 메시지');assert.equal(posts(f).length,1);assert.match(f.log.innerHTML,/저장소 장애 중 새 메시지/);assert.match(f.log.innerHTML,/data-chat-retry/);assert.equal(f.button.disabled,false);
  assert.doesNotThrow(()=>f.events.click(chatActionEvent('discard','pending:'+posts(f)[0].body.request_id)));
  assert.doesNotMatch(f.log.innerHTML,/저장소 장애 중 새 메시지/);assert.equal(posts(f).length,1);assert.ok(attempts,'the failing Storage operation was exercised');
 });
});

test('an initial read and an overlapping stream update share one pending read receipt',async()=>{
 let finish;const receipts=[];
 const f=fixture(async(_path,method,body)=>{
  if(method==='PATCH'){receipts.push(body.sequence);await new Promise(resolve=>{finish=resolve;});return {};}
  return {messages:[],has_more:false};
 });
 f.context.bindSocialChat(directView('/api/dm/friend',[{id:'unread',sequence:4,sender_id:'friend',body:'hi',created:1}]));
 f.streams[0].changed();await settleChat();assert.deepEqual(receipts,[4]);
 finish();await settleChat();assert.deepEqual(receipts,[4]);
});
