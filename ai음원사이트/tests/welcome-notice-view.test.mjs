import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';
import {render as renderStickers} from '../shared/chat-stickers.js';
import {PREMIUM_OPEN_NOTICE,PREMIUM_OPEN_NOTICE_ID} from '../shared/premium-open-notice.js';
import {noticeDOM,eventTarget} from './official-notice-dom.mjs';

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
 const c=context(),html=c.officialNoticeEntryHTML({...guide(),id:'campaign:guide'});
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
 const html=c.officialNoticeEntryHTML({...d,id:'campaign:guide'});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
 assert.match(html,/&lt;svg onload=alert\(3\)&gt;/);
 assert.match(html,/&quot; onclick=&quot;alert\(4\)/);
 assert.doesNotMatch(html,/href="javascript:|attacker\.example|<script|<svg|<img src=x/);
 assert.equal((html.match(/class="text-link welcome-guide-link"/g)||[]).length,7);
 assert.equal((html.match(/<img /g)||[]).length,0);
});
test('the event and guide open in one chronological feed without a sender control',async()=>{
 const c=context(),id='campaign:'+PREMIUM_OPEN_NOTICE_ID;
 const data={channel:{name:'아이팩트 안내'},items:[{...guide(),id:'campaign:welcome-guide-20261108-v1',legacy_id:'aifect-guide'},
  {id,legacy_id:PREMIUM_OPEN_NOTICE_ID,notice:PREMIUM_OPEN_NOTICE,created:1795607093,read_at:0}],before:null};
 const calls=[],read=async path=>{calls.push(path);return path==='/api/notices/official'?data:{conversations:[]};};
 const opened=await c.dmNoticeView('dm/notice?peer='+PREMIUM_OPEN_NOTICE_ID,read);
 assert.deepEqual(calls,['/api/dm?notices=unified','/api/notices/official']);
 assert.equal(opened.noticeAnchor,id);
 assert.match(opened.html,/<h1>아이팩트 안내<\/h1>/);
 assert.doesNotMatch(opened.html,/<small>아이팩트 안내<\/small>/);
 assert.match(opened.html,/<img class="official-notice-banner" [^>]+width="2172" height="724"/);
 assert.ok(opened.html.indexOf('data-welcome-section="play"')<opened.html.indexOf('<img'));
 assert.ok(opened.html.indexOf('<img')<opened.html.indexOf(PREMIUM_OPEN_NOTICE.title));
 assert.match(opened.html,/12월 31일까지<br>👑 기존·신규 회원 모두 프리미엄 무료<br>✅ 별도 신청 및 결제 없이 자동 적용/);
 assert.doesNotMatch(opened.html,/<select|<form|<textarea|contenteditable|AIFECT 운영팀/);
});

test('the notice back button goes to the list after following another anchor in the same channel',()=>{
 const document=eventTarget(),window=eventTarget(),location={hash:'#dm',pathname:'/',search:''};
 let backs=0;
 const history={state:null,replaceState(state){this.state=state;},back(){backs++;}};
 context({document,window,location,history});
 location.hash='#dm/notice';window.emit('hashchange');assert.equal(history.state.aifectDmBack,true);
 history.state=null;location.hash='#dm/notice?peer=aifect-guide';window.emit('hashchange');
 assert.equal(history.state.aifectDmBack,false);
 document.emit('click',{target:{closest:selector=>selector.includes('a[href="#dm"]')?{}:null},preventDefault(){}});
 assert.equal(location.hash,'dm');assert.equal(backs,0);
});

function acknowledgeHarness({hidden=false,renderState='ready',readAt=0,anchor='',olderRead=0}={}){
 const frames=new Map(),timers=new Map(),observers=[],calls=[];
 const older={id:'campaign:guide',legacy_id:'aifect-guide',created:1,read_at:olderRead};
 const latest={id:'campaign:premium',legacy_id:'premium',created:2,read_at:readAt};
 const feed={items:[older,latest],before:null};
 const dom=noticeDOM(feed.items);
 const document=eventTarget({hidden,documentElement:{dataset:{renderState}}}),window=eventTarget({});
 let next=0,acknowledged=0;
 const c=context({document,window,
  requestAnimationFrame:f=>{frames.set(++next,f);return next;},cancelAnimationFrame:id=>frames.delete(id),
  AbortController,setTimeout:(callback,delay)=>{timers.set(++next,{callback,delay});return next;},clearTimeout:id=>timers.delete(id),
  ResizeObserver:class{constructor(f){this.callback=f;observers.push(this);}observe(){}disconnect(){this.closed=true;}},
  MutationObserver:class{constructor(f){this.callback=f;observers.push(this);}observe(){}disconnect(){this.closed=true;}},
  api:(path,method,body,options={})=>{
   if(method==='GET')return Promise.resolve(feed);
   return new Promise((resolve,reject)=>{
    calls.push({path,method,body:JSON.parse(JSON.stringify(body)),options,resolve,reject});
    options.signal?.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true});
   });
  }
 });
 const cleanup=c.bindOfficialNotices(dom.host,feed,{anchor,onRead:()=>acknowledged++});
 return {c,...dom,document,window,observers,calls,timers,cleanup,acknowledged:()=>acknowledged,
  paint(){const scheduled=[...frames.values()];frames.clear();for(const f of scheduled)f();},
  fireTimer(delay){const entry=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(entry,'expected a '+delay+'ms timer');timers.delete(entry[0]);entry[1].callback();}
 };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('the selected notice opens after visible paint and scrolling reads only the notices in view',async()=>{
 const h=acknowledgeHarness({hidden:true,renderState:'loading',anchor:'premium'});
 h.paint();assert.equal(h.calls.length,0);
 h.document.hidden=false;h.document.emit('visibilitychange');h.paint();assert.equal(h.calls.length,0);
 h.document.documentElement.dataset.renderState='ready';h.observers.at(-1).callback();h.paint();
 assert.equal(h.pane.scrollTop,408);assert.equal(h.calls[0].path,'/api/notices/official');
 assert.equal(h.calls[0].method,'PATCH');assert.deepEqual(h.calls[0].body,{ids:['campaign:premium']});
 h.calls[0].resolve({ok:true});await settle();h.paint();assert.equal(h.calls.length,1);
 h.pane.scrollTop=0;h.pane.emit('scroll');h.paint();assert.deepEqual(h.calls[1].body,{ids:['campaign:guide']});
 h.calls[1].resolve({ok:true});await settle();
 assert.equal(h.acknowledged(),2);h.cleanup();assert.ok(h.observers.every(o=>o.closed));
 assert.equal(h.window.listenerCount('focus'),0);assert.equal(h.document.listenerCount('visibilitychange'),0);
});

test('default opening points to the latest notice and existing read state needs no write',()=>{
 const h=acknowledgeHarness({readAt:1,olderRead:1});
 h.paint();assert.equal(h.pane.scrollTop,408);assert.equal(h.calls.length,0);h.cleanup();
});

test('route and account switches prevent a receipt from changing the next panel',async()=>{
 const away=acknowledgeHarness();away.c.renderId=2;away.paint();assert.equal(away.calls.length,0);away.cleanup();
 const h=acknowledgeHarness();h.paint();h.c.me={id:'different-member'};
 h.calls[0].resolve({ok:true});await settle();assert.equal(h.acknowledged(),0);h.cleanup();
});

test('failed receipts remain unread and manual or network retries do not send a second pending write',async()=>{
 for(const event of ['click','online','pageshow']){
  const h=acknowledgeHarness();h.paint();h.calls[0].reject(new Error('연결 끊김'));await settle();
  assert.equal(h.acknowledged(),0);assert.equal(h.status.hidden,false);assert.match(h.label.textContent,/연결 끊김/);
  const target=event==='click'?h.retry:h.window;
  target.emit(event);target.emit(event);h.paint();assert.equal(h.calls.length,2);
  h.calls[1].resolve({ok:true});await settle();assert.equal(h.acknowledged(),1);assert.equal(h.status.hidden,true);
  h.cleanup();assert.equal(target.listenerCount(event),0);
 }
});

test('temporary receipt failures retry automatically with bounded backoff',async()=>{
 const h=acknowledgeHarness();h.paint();
 for(const [index,delay] of [1000,3000,8000].entries()){
  h.calls[index].reject(new Error('서버 연결 실패'));await settle();
  h.observers[0].callback();h.paint();assert.equal(h.calls.length,index+1);
  h.fireTimer(delay);h.paint();assert.equal(h.calls.length,index+2);
 }
 h.calls[3].reject(new Error('서버 연결 실패'));await settle();
 assert.equal(h.timers.size,0);assert.equal(h.status.hidden,false);
 h.retry.emit('click');h.paint();h.calls[4].resolve({ok:true});await settle();
 assert.equal(h.acknowledged(),1);h.cleanup();
});

test('a stalled receipt times out and closing lets an in-flight receipt finish without repainting',async()=>{
 const h=acknowledgeHarness();h.paint();h.fireTimer(10000);await settle();
 assert.equal(h.calls[0].options.signal.aborted,true);assert.equal(h.status.hidden,false);
 h.fireTimer(1000);h.paint();assert.equal(h.calls.length,2);
 h.cleanup();assert.equal(h.calls[1].options.signal.aborted,false);
 h.calls[1].resolve({ok:true});await settle();assert.equal(h.acknowledged(),0);assert.equal(h.timers.size,0);
});
