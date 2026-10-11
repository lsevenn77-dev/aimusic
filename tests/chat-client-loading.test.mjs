import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture(api){
 const input={value:'',disabled:false,addEventListener(){},removeEventListener(){}},button={disabled:false},earlier={hidden:true,disabled:false};
 const panel={style:{},getBoundingClientRect:()=>({top:100})},events={};let resized=()=>{};
 const log={innerHTML:'',scrollTop:0,scrollHeight:100,clientHeight:100,closest:()=>panel,addEventListener:(name,fn)=>events[name]=fn,removeEventListener(){}};
 const form={querySelector:selector=>selector==='textarea'?input:button};
 const nodes={'#chat-compose':form,'#chat-log':log,'#chat-earlier':earlier,'#chat-connection':{},'#chat-error':{}};
 const context=vm.createContext({renderId:1,me:{id:'user',name:'Me'},api,Date,Map,Math,Number,crypto,innerHeight:800,innerWidth:390,window:{addEventListener(){},removeEventListener(){}},ResizeObserver:class{constructor(fn){resized=fn}observe(){}disconnect(){}},requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame(){},bindChatImageUpload(){},refreshMessageBadge(){},document:{body:{classList:{toggle(){},remove(){}}},querySelector:selector=>nodes[selector],addEventListener(){}},$:selector=>nodes[selector],icon:()=>'',esc:value=>String(value??''),portrait:()=>'',number:String});
 vm.runInContext(readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8'),context);
 vm.runInContext('watchSocialChat=()=>()=>{};',context);
 return {context,input,button,log,nodes,events,resize:()=>resized()};
}

test('keyboard resizing keeps latest content visible while composing without stealing history browsing',()=>{
 const f=fixture(()=>new Promise(()=>{}));
 f.context.bindSocialChat({chat:{path:'/api/crews/crew/messages',crew:{id:'crew'}}});
 f.log.scrollHeight=1000;f.log.clientHeight=300;f.log.scrollTop=700;f.events.scroll();
 f.log.clientHeight=150;f.resize();assert.equal(f.log.scrollTop,1000);
 f.log.scrollTop=200;f.events.scroll();f.resize();assert.equal(f.log.scrollTop,200);
 f.context.document.activeElement=f.input;f.resize();assert.equal(f.log.scrollTop,1000);
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
