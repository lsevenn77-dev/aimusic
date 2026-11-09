import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';
import {render as renderStickers} from '../shared/chat-stickers.js';

const social=readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8');
const notices=readFileSync(new URL('../dist/messages-ui.js',import.meta.url),'utf8');
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const links=[
 ['play','🎤 오늘 부를 노래는, 플레이에서','노래하러 가기','#karaoke'],
 ['karaoke','🎶 사람들과 함께 즐기는 노래방','노래방 가기','#live?mode=karaoke'],
 ['talking','💬 편하게 이야기 나누는 토킹룸','토킹룸 가기','#voice?mode=talk'],
 ['crew','🎮 크루에 가입하고 크루게임도 즐겨요','크루 둘러보기','#community/crews'],
 ['duet','🎙️ 두 목소리가 어우러지는 듀엣','듀엣 참여하기','#karaoke/duets'],
 ['dubbing','🎧 여러 목소리로 완성하는 더빙','더빙 참여하기','#karaoke/dubbing?tab=join'],
 ['artists','✨ 나의 취향에 맞는 AI 아티스트','아티스트 만나기','#artists'],
 ['studio','🎼 스튜디오에서 내 제작곡을 소개해요','제작곡 올리기','#upload'],
 ['premium','💎 더 많은 제작곡을 올리고 싶다면','프리미엄 혜택 보기','#membership']
];
const guide=()=>({campaign_id:'welcome-guide-20261108-v1',created:1794149051,read_at:0,guide:{
 greeting:'하늘님, 반가워요! 👋\n아이팩트에 오신 걸 환영해요.',
 intro:['좋아하는 노래를 부르고, 사람들과 이야기를 나누고, 내가 만든 음악도 들려주세요.','마음이 끌리는 것부터 가볍게 시작해보세요! 💚'],
 sections:links.map(([id,title,label,href])=>({id,title,label,href,body:id+' 안내'})),
 closing:['노래 한 곡, 짧은 인사, 나만의 작품 하나로 시작해보세요.','아이팩트에서 즐거운 시간 보내세요! 💚'],
 stickers:{greeting:'cat_hand_wave',closing:'cat_basic_heart'}
}});
function context(extra={}){
 const c=nicknameContext({
  document:{addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},
  location:{hash:'#dm',pathname:'/',search:''},history:{state:{}},URLSearchParams,
  me:{id:'member'},renderId:1,esc:escape,icon:()=>'',AifectStickers:{render:renderStickers},
  dmInboxHTML:(inbox,html)=>html,dmProfileLink:()=>'<a href="#producer/operator">운영자</a>',
  dmThreadActions:()=>'<button data-dm-mute="operator">알림</button>',chatPanelHTML:()=>'<form id="chat-compose"></form>',
  ...extra
 });
 vm.runInContext(social,c);vm.runInContext(notices,c);return c;
}
test('welcome is one read-only guide with nine distinct destinations and no legacy stickers',()=>{
 const c=context(),html=c.welcomeGuideHTML(guide());
 assert.equal((html.match(/class="welcome-guide-section"/g)||[]).length,9);
 assert.equal((html.match(/class="text-link welcome-guide-link"/g)||[]).length,9);
 for(const [,title,label,href] of links){assert.ok(html.includes(escape(title)));assert.ok(html.includes(escape(label)));assert.ok(html.includes('href="'+href+'"'));}
 assert.equal((html.match(/<img /g)||[]).length,0);
 assert.doesNotMatch(html,/welcome-guide-sticker|cat_hand_wave|cat_basic_heart/);
 assert.doesNotMatch(html,/<form|<textarea|contenteditable|data-dm-mute|data-dm-clear|data-person-block|#producer\//);
 assert.ok(html.indexOf('welcome-guide-intro')<html.indexOf('data-welcome-section="play"'));
 assert.ok(html.indexOf('data-welcome-section="duet"')<html.indexOf('data-welcome-section="dubbing"'));
});
test('nicknames and guide fields stay text, and unsafe links or sticker tokens cannot create markup',()=>{
 const c=context(),d=guide();
 d.guide.greeting='<img src=x onerror=alert(1)>님, 반가워요!\n환영해요.';
 d.guide.intro=['<script>alert(2)</script>'];d.guide.sections[0].title='<svg onload=alert(3)>';
 d.guide.sections[0].body='" onclick="alert(4)';d.guide.sections[0].href='javascript:alert(5)';
 d.guide.sections[0].id='play" onmouseover="alert(6)';
 d.guide.sections[1].href='https://attacker.example/#karaoke';
 d.guide.stickers.greeting='cat_hand_wave]\"><img src=x onerror=alert(7)>';
 const html=c.welcomeGuideHTML(d);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
 assert.match(html,/&lt;svg onload=alert\(3\)&gt;/);
 assert.match(html,/&quot; onclick=&quot;alert\(4\)/);
 assert.doesNotMatch(html,/href="javascript:|attacker\.example|<script|<svg|<img src=x/);
 assert.equal((html.match(/class="text-link welcome-guide-link"/g)||[]).length,7);
 assert.equal((html.match(/<img /g)||[]).length,0);
});
test('verified welcome channel uses its own endpoint while existing official DMs retain their route',async()=>{
 const c=context();c.dmProfileLink=()=>'<a href="#producer/operator">운영자</a>';c.dmThreadActions=()=>'<button data-dm-mute="operator">알림</button>';c.chatPanelHTML=()=>'<form id="chat-compose"></form>';
 const peers=[{id:'aifect-guide',name:'아이팩트 안내',is_notice:true,notice_type:'welcome',read_only:true,updated:20},{id:'operator',name:'운영자',is_notice:true,updated:10},{id:'fake',name:'아이팩트 안내',notice_type:'welcome',read_only:true,updated:30}];
 const calls=[],read=async path=>{calls.push(path);if(path==='/api/dm')return {conversations:peers};if(path==='/api/notices/welcome')return guide();return {peer:peers[1],messages:[]};};
 const welcome=await c.dmNoticeView('dm/notice?peer=fake',read);
 assert.deepEqual(calls,['/api/dm','/api/notices/welcome']);
 assert.equal(welcome.chat,undefined);assert.equal(welcome.welcomeNotice.campaign_id,guide().campaign_id);
 assert.match(welcome.html,/id="welcome-guide-scroll"/);assert.doesNotMatch(welcome.html,/<form|data-dm-mute|#producer\//);
 assert.match(welcome.html,/value="operator"/);assert.doesNotMatch(welcome.html,/value="fake"/);
 calls.length=0;
 const old=await c.dmNoticeView('dm/notice?peer=operator',read);
 assert.deepEqual(calls,['/api/dm','/api/dm/operator']);assert.equal(old.chat.path,'/api/dm/operator');
 assert.match(old.html,/id="chat-compose"/);assert.match(old.html,/data-dm-mute="operator"/);
});

function acknowledgeHarness({hidden=false,renderState='ready',readAt=0}={}){
 const docEvents=new Map(),winEvents=new Map(),retryEvents=new Map(),frames=new Map(),timers=new Map(),observers=[];
 const pane={scrollTop:900,isConnected:true,getClientRects:()=>[{}]};
 const label={textContent:''},retry={disabled:false,addEventListener:(e,f)=>retryEvents.set(e,f),removeEventListener:e=>retryEvents.delete(e)};
 const status={hidden:true,querySelector:s=>s==='span'?label:retry};
 const doc={hidden,documentElement:{dataset:{renderState}},addEventListener:(e,f)=>docEvents.set(e,f),removeEventListener:e=>docEvents.delete(e)};
 let next=0,acknowledged=0;const calls=[];
 const c=context({document:doc,window:{addEventListener:(e,f)=>winEvents.set(e,f),removeEventListener:e=>winEvents.delete(e)},$:selector=>({'#welcome-guide-scroll':pane,'#welcome-guide-status':status}[selector]),
  requestAnimationFrame:f=>{frames.set(++next,f);return next;},cancelAnimationFrame:id=>frames.delete(id),
  AbortController,setTimeout:(callback,delay)=>{timers.set(++next,{callback,delay});return next;},clearTimeout:id=>timers.delete(id),
  ResizeObserver:class{constructor(f){this.callback=f;observers.push(this);}observe(){}disconnect(){this.closed=true;}},
  MutationObserver:class{constructor(f){this.callback=f;observers.push(this);}observe(){}disconnect(){this.closed=true;}},
  api:(path,method,body,options={})=>new Promise((resolve,reject)=>{
   calls.push({path,method,body,options,resolve,reject});
   options.signal?.addEventListener('abort',()=>reject(Object.assign(new Error('Aborted'),{name:'AbortError'})),{once:true});
  })
 });
 const cleanup=c.bindWelcomeNotice({welcomeNotice:{campaign_id:'welcome-guide-20261108-v1',read_at:readAt}},()=>acknowledged++);
 return {c,pane,doc,docEvents,winEvents,retryEvents,status,label,retry,observers,calls,timers,cleanup,acknowledged:()=>acknowledged,
  paint:()=>{for(const f of [...frames.values()])f();frames.clear();},
  fireTimer(delay){const entry=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(entry,'expected a '+delay+'ms timer');timers.delete(entry[0]);entry[1].callback();}
 };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('notice opens at the beginning and is acknowledged only after visible ready paint, once',async()=>{
 const h=acknowledgeHarness({hidden:true,renderState:'loading'});
 assert.equal(h.pane.scrollTop,0);assert.equal(h.calls.length,0);h.paint();assert.equal(h.calls.length,0);
 h.doc.hidden=false;h.docEvents.get('visibilitychange')();assert.equal(h.calls.length,0);
 h.doc.documentElement.dataset.renderState='ready';h.observers.at(-1).callback();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'/api/notices/welcome');assert.equal(h.calls[0].method,'PATCH');
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].body)),{campaign_id:'welcome-guide-20261108-v1'});
 h.winEvents.get('focus')();h.observers[0].callback();assert.equal(h.calls.length,1);
 h.calls[0].resolve({ok:true});await settle();assert.equal(h.acknowledged(),1);
 h.winEvents.get('focus')();assert.equal(h.calls.length,1);h.cleanup();assert.ok(h.observers.every(o=>o.closed));
 assert.equal(h.winEvents.has('focus'),false);assert.equal(h.docEvents.has('visibilitychange'),false);
});
test('read acknowledgement failure stays unread and offers a single user retry',async()=>{
 const h=acknowledgeHarness();h.paint();h.calls[0].reject(new Error('연결 끊김'));await settle();
 assert.equal(h.acknowledged(),0);assert.equal(h.status.hidden,false);assert.match(h.label.textContent,/연결 끊김/);assert.equal(h.retry.disabled,false);
 h.retryEvents.get('click')();h.retryEvents.get('click')();assert.equal(h.calls.length,2);
 h.calls[1].resolve({ok:true});await settle();assert.equal(h.status.hidden,true);assert.equal(h.acknowledged(),1);h.cleanup();
});
test('already-read notices, route changes, and account changes cannot acknowledge the wrong view',async()=>{
 const read=acknowledgeHarness({readAt:1});read.paint();assert.equal(read.calls.length,0);read.cleanup();
 const away=acknowledgeHarness();away.c.renderId=2;away.paint();assert.equal(away.calls.length,0);away.cleanup();
 const switched=acknowledgeHarness();switched.paint();switched.c.me={id:'different-member'};switched.calls[0].resolve({ok:true});await settle();assert.equal(switched.acknowledged(),0);switched.cleanup();
});

test('an already-read guide synchronizes its inbox once after it is actually visible',()=>{
 const h=acknowledgeHarness({hidden:true,renderState:'loading',readAt:123});h.paint();
 assert.equal(h.acknowledged(),0);assert.equal(h.calls.length,0);
 h.doc.hidden=false;h.docEvents.get('visibilitychange')();assert.equal(h.acknowledged(),0);
 h.doc.documentElement.dataset.renderState='ready';h.pane.getClientRects=()=>[];h.observers.at(-1).callback();assert.equal(h.acknowledged(),0);
 h.pane.getClientRects=()=>[{}];h.observers[0].callback();assert.equal(h.acknowledged(),1);
 h.winEvents.get('focus')();h.observers[0].callback();assert.equal(h.acknowledged(),1);assert.equal(h.calls.length,0);h.cleanup();
});

test('network recovery and page restoration retry a failed receipt without reopening the guide',async()=>{
 for(const event of ['online','pageshow']){
  const h=acknowledgeHarness();h.paint();h.calls[0].reject(new Error('연결 끊김'));await settle();
  h.winEvents.get(event)?.();assert.equal(h.calls.length,2,event+' must retry the receipt');
  h.winEvents.get(event)?.();assert.equal(h.calls.length,2,'recovery cannot duplicate an in-flight receipt');
  h.calls[1].resolve({ok:true});await settle();assert.equal(h.acknowledged(),1);assert.equal(h.status.hidden,true);assert.equal(h.timers.size,0);
  h.cleanup();assert.equal(h.winEvents.has(event),false);
 }
});

test('temporary receipt failures retry automatically with bounded backoff',async()=>{
 const h=acknowledgeHarness();h.observers.at(-1).callback();
 for(const [index,delay] of [1000,3000,8000].entries()){
  h.calls[index].reject(new Error('서버 연결 실패'));await settle();
  h.observers[0].callback();h.paint();assert.equal(h.calls.length,index+1,'layout and paint do not bypass backoff');
  h.fireTimer(delay);assert.equal(h.calls.length,index+2);
 }
 h.calls[3].reject(new Error('서버 연결 실패'));await settle();
 assert.equal(h.timers.size,0,'automatic retries stop after three attempts');assert.equal(h.acknowledged(),0);assert.equal(h.status.hidden,false);
 h.retryEvents.get('click')();assert.equal(h.calls.length,5);h.calls[4].resolve({ok:true});await settle();
 assert.equal(h.acknowledged(),1);assert.equal(h.timers.size,0);h.cleanup();
});

test('a stalled receipt is aborted and retried instead of remaining pending forever',async()=>{
 const h=acknowledgeHarness();h.paint();assert.ok(h.calls[0].options.signal);
 h.fireTimer(10000);await settle();assert.equal(h.calls[0].options.signal.aborted,true);assert.equal(h.status.hidden,false);assert.equal(h.acknowledged(),0);
 h.fireTimer(1000);assert.equal(h.calls.length,2);h.calls[1].resolve({ok:true});await settle();
 assert.equal(h.acknowledged(),1);assert.equal(h.timers.size,0);h.cleanup();
});

test('retry timers retain view guards and cleanup lets an already-visible receipt finish within its deadline',async()=>{
 const hidden=acknowledgeHarness();hidden.paint();hidden.calls[0].reject(new Error('연결 끊김'));await settle();
 hidden.doc.hidden=true;hidden.fireTimer(1000);assert.equal(hidden.calls.length,1);
 hidden.winEvents.get('online')?.();assert.equal(hidden.calls.length,1);
 hidden.doc.hidden=false;hidden.docEvents.get('visibilitychange')();assert.equal(hidden.calls.length,2);hidden.cleanup();await settle();
 assert.equal(hidden.calls[1].options.signal.aborted,false,'following a guide link must not cancel a receipt already being saved');assert.equal(hidden.acknowledged(),0);
 hidden.calls[1].resolve({ok:true});await settle();assert.equal(hidden.acknowledged(),0);assert.equal(hidden.timers.size,0);
 for(const event of ['focus','online','pageshow'])assert.equal(hidden.winEvents.has(event),false);
 assert.equal(hidden.docEvents.has('visibilitychange'),false);assert.equal(hidden.retryEvents.size,0);
 for(const change of [h=>{h.c.renderId++;},h=>{h.c.me={id:'other-member'};},h=>{h.pane.isConnected=false;}]){
  const h=acknowledgeHarness();h.paint();h.calls[0].reject(new Error('연결 끊김'));await settle();change(h);h.fireTimer(1000);
  h.winEvents.get('pageshow')?.();assert.equal(h.calls.length,1);assert.equal(h.acknowledged(),0);h.cleanup();assert.equal(h.timers.size,0);
 }
 const stalled=acknowledgeHarness();stalled.paint();stalled.cleanup();stalled.fireTimer(10000);await settle();
 assert.equal(stalled.calls[0].options.signal.aborted,true);assert.equal(stalled.calls.length,1);assert.equal(stalled.acknowledged(),0);assert.equal(stalled.timers.size,0);
});
