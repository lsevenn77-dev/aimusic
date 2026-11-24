import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './live-karaoke-fixture.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('room sheets sit inside the visible chat and above the composer',()=>{
 const c=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}}});
 vm.runInContext(readFileSync(new URL('../dist/room-layout.js',import.meta.url),'utf8'),c);
 const bounds={left:260,right:1360,top:8,bottom:760};
 const settings=c.roomPopupPlacement({left:940,top:184,right:1340,bottom:734},bounds);
 assert.equal(settings.width,372);assert.equal(settings.left,954);assert.equal(settings.top,196);assert.equal(settings.maxHeight,528);
 const short=c.roomPopupPlacement({left:940,top:184,right:1340,bottom:440},bounds);
 assert.equal(short.top,196);assert.equal(short.maxHeight,234,'short chat columns constrain the popup, not the other way round');
 const clipped=c.roomPopupPlacement({left:940,top:184,right:1340,bottom:900},{...bounds,bottom:480});
 assert.equal(clipped.top,196);assert.equal(clipped.maxHeight,274,'the player and viewport are also hard limits');
 const offscreen=c.roomPopupPlacement({left:940,top:20,right:1460,bottom:900},{...bounds,top:64});
 assert.equal(offscreen.top,76);assert.equal(offscreen.width,392);assert.equal(offscreen.maxHeight,560);
 const collapsed=c.roomPopupPlacement({left:940,top:480,right:1340,bottom:480},{...bounds,bottom:480});
 assert.equal(collapsed.maxHeight,0);assert.ok(collapsed.top+collapsed.maxHeight<=480);
});

test('settings, people, search, profile and gift use one desktop chat anchor and release it on mobile',()=>{
 const values=new Map(),attrs=new Set();let chat={left:940,top:184,right:1340,bottom:734};
 const sheet={open:true,id:'voice-room-settings',classList:{contains:()=>false},
  setAttribute:k=>attrs.add(k),removeAttribute:k=>attrs.delete(k),
  style:{getPropertyValue:k=>values.get(k),setProperty:(k,v)=>values.set(k,v)}};
 const host={getBoundingClientRect:()=>({left:260,top:90,right:1360,bottom:760}),querySelector:s=>s==='.voice-chat-panel'?{getBoundingClientRect:()=>chat}:null};
 const c=vm.createContext({innerWidth:1440,innerHeight:900,document:{addEventListener(){}},window:{addEventListener(){}}});
 vm.runInContext(readFileSync(new URL('../dist/room-layout.js',import.meta.url),'utf8'),c);
 const client={host,talkPopup:sheet,roomBounds:{bottom:760}};
 for(const id of ['voice-room-settings','voice-members','voice-sound','voice-invite-sheet','talk-leave','live-search-sheet','profile-preview','dialog']){
  sheet.id=id;c.positionRoomPopup(client);assert.equal(attrs.has('data-room-anchored'),true,id);
  assert.equal(values.get('--room-popup-left'),'954px',id);assert.equal(values.get('--room-popup-top'),'196px',id);
  assert.equal(values.get('--room-popup-width'),'372px',id);assert.equal(values.get('--room-popup-max'),'528px',id);
 }
 chat={left:850,top:160,right:1210,bottom:460};c.positionRoomPopup(client);
 assert.equal(values.get('--room-popup-left'),'864px');assert.equal(values.get('--room-popup-width'),'332px');assert.equal(values.get('--room-popup-max'),'278px');
 c.innerWidth=390;c.positionRoomPopup(client);assert.equal(attrs.has('data-room-anchored'),false,'the existing mobile CSS retains ownership');
 c.innerWidth=1440;sheet.classList.contains=name=>name==='room-emoji-dock';c.positionRoomPopup(client);
 assert.equal(attrs.has('data-room-anchored'),false,'the inline sticker tray remains part of the composer');
});

test('talk controls expose labelled microphone states only for an eligible seated member',()=>{
 const source=readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8');
 const start=source.indexOf(' paintTalkPanel('),end=source.indexOf('\n showRoomNotice',start);
 const node=()=>({dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}}),mic=node(),down=node(),request=node();
 const c=vm.createContext({Date,voiceGlyph:n=>'<svg data-icon="'+n+'"></svg>',$:s=>s==='#talk-request'?request:{open:false},window:{dispatchEvent(){}},CustomEvent:class{}});
 const fn=vm.runInContext('({'+source.slice(start,end)+'}).paintTalkPanel',c);
 const self={id:'me',seat:null,locked:false},client={state:{self:'me',room:{id:'r',host_id:'me'},members:[self]},host:{querySelector:s=>s.includes('toggle-mic')?mic:down}};
 fn.call(client,self,false);assert.equal(mic.hidden,true);assert.equal(down.hidden,true);assert.equal(mic.disabled,true);
 self.seat=2;fn.call(client,self,false);assert.equal(down.hidden,false);assert.match(mic.innerHTML,/data-icon="talkMic"/);assert.equal(mic.title,'마이크 켜기');assert.equal(mic.attrs['aria-label'],mic.title);assert.equal(mic.attrs['aria-pressed'],'false');
 fn.call(client,self,true);assert.match(mic.innerHTML,/data-icon="talkMicOff"/);assert.equal(mic.title,'음소거');assert.equal(mic.attrs['aria-label'],mic.title);assert.equal(mic.attrs['aria-pressed'],'true');
 self.locked=true;fn.call(client,self,false);assert.equal(mic.disabled,true);assert.equal(request.textContent,'마이크 사용 제한');
 self.locked=false;client.micBusy=true;fn.call(client,self,false);assert.equal(mic.disabled,true);assert.equal(mic.attrs['aria-busy'],'true');
});

test('measured room bounds coalesce resize events and follow actual bars and visual viewport',()=>{
 const frames=[],styles=()=>{const v=new Map();return {getPropertyValue:k=>v.get(k),setProperty:(k,x)=>v.set(k,x),get:k=>v.get(k)};};
 const main={style:styles(),toggleAttribute(){}},room={isConnected:true,style:styles(),querySelector:()=>({getBoundingClientRect:()=>({height:46})}),querySelectorAll:()=>[],getBoundingClientRect:()=>({top:57,width:390})};
 let topHeight=57,playerTop=750;
 const shell=[{hidden:false,getBoundingClientRect:()=>({top:0,bottom:topHeight,height:topHeight}),matches:()=>true},{hidden:false,getBoundingClientRect:()=>({top:playerTop,bottom:844,height:844-playerTop}),matches:()=>false}];
 const events={},vv={offsetTop:0,height:844,addEventListener(){}};
 const c=vm.createContext({AbortController,URL,innerWidth:390,innerHeight:844,window:{visualViewport:vv,addEventListener:(k,fn)=>events[k]=fn},document:{querySelector:()=>main,querySelectorAll:()=>shell,addEventListener(){}},requestAnimationFrame:fn=>(frames.push(fn),frames.length),getComputedStyle:()=>({display:'block',visibility:'visible'}),setVoiceFocus(){},ResizeObserver:class{observe(){}disconnect(){}}});
 vm.runInContext(readFileSync(new URL('../dist/room-layout.js',import.meta.url),'utf8'),c);
 const client={host:room,joined:true};c.bindRoomViewport(client);assert.equal(room.style.get('--voice-viewport'),'693px');
 topHeight=18;events.resize();events.resize();assert.equal(frames.length,1);frames.shift()();assert.equal(room.style.get('--voice-viewport'),'732px');
 vv.height=450;events.resize();frames.shift()();assert.equal(room.style.get('--voice-viewport'),'432px');
 shell[1].hidden=true;vv.height=844;events.resize();frames.shift()();assert.equal(room.style.get('--voice-viewport'),'826px');
});

test('same room aliases keep membership; outside navigation asks before leaving and restores the room route',()=>{
 const handlers={},location=new URL('https://aifect.co.kr/#voice/room');let leaves=0,confirms=0,prevented=0;
 const client={id:'room',joined:true,host:{isConnected:true},safe:fn=>fn(),action:()=>confirms++,leave(){leaves++;this.closed=true;}};
 const c=vm.createContext({URL,location,me:{id:'me'},voiceController:client,history:{state:null,replaceState(_a,_b,url){location.hash=url;}},document:{querySelector:()=>({dataset:{}}),addEventListener:(k,fn)=>handlers[k]=fn},window:{addEventListener:(k,fn)=>handlers[k]=fn}});
 vm.runInContext(readFileSync(new URL('../dist/room-layout.js',import.meta.url),'utf8'),c);
 const click=href=>handlers.click({button:0,preventDefault(){prevented++;},stopImmediatePropagation(){},target:{closest:()=>href?{href,target:'',hasAttribute:()=>false}:null}});
 click(null);click(location.href);click('https://aifect.co.kr/#live/room');assert.equal(confirms,0);assert.equal(leaves,0);
 click('https://aifect.co.kr/#home');assert.equal(confirms,1);assert.equal(leaves,0);assert.equal(prevented,1);assert.match(client.pendingRoomNavigation,/#home$/);
 location.hash='#community';handlers.hashchange();assert.equal(location.hash,'#voice/room');assert.equal(leaves,0);
 location.hash='#profile';assert.equal(c.retainRoomRoute('profile'),true);assert.equal(location.hash,'#voice/room');assert.equal(leaves,0);
 assert.equal(c.retainRoomRoute('live/room'),true);assert.equal(leaves,0);
});

test('reclicking the room gift icon closes its shared dialog without starting another request',async()=>{
 const source=readFileSync(new URL('../dist/voice-rooms.js',import.meta.url),'utf8'),start=source.indexOf(' async openGiftDialog('),end=source.indexOf('\n giftSummary(',start);
 const modal={open:true},form={elements:{gift_type:{value:'gift'},quantity:{value:1}}};let closed=0;
 const c=vm.createContext({AifectGifts:{GIFT_CATALOG:[{id:'gift'}]},$:s=>s==='#dialog'?modal:s==='#voice-gift-form'?form:s==='#voice-gift-target'?{value:'peer'}:{close(){}}});
 const fn=vm.runInContext('({'+source.slice(start,end)+'}).openGiftDialog',c);
 await fn.call({joined:true,host:{isConnected:true},state:{self:'me',members:[{id:'peer',profile_id:'peer',name:'Peer'}]},talkPopup:modal,closeRoomPopup(){closed++;modal.open=false;}});
 assert.equal(closed,1);assert.equal(modal.open,false);
});

test('personal songs only records actual starts, deduplicates songs, and never exposes another member history',async t=>{
 const f=await liveFixture(t),r=await f.create(),guest=await f.join(r);
 const library=(collection,user='owner',state=r.state)=>f.call(r.root+'karaoke-search?generation='+state.generation+'&collection='+collection,'GET',undefined,user);
 assert.deepEqual((await library('mine')).body.tracks,[]);
 const requested=await f.command(r,r.state,'request',{track_id:'one'}),id=requested.body.karaoke.active.invitation_id;
 assert.deepEqual((await library('mine')).body.tracks,[],'reservation is not singing history');
 await f.command(r,r.state,'accept',{invitation_id:id});
 assert.equal((await f.command(r,r.state,'start',{invitation_id:id})).status,409);
 assert.deepEqual((await library('mine')).body.tracks,[],'failed microphone start must not be recorded');
 r.room.data.members.owner.pub={ready:true,trackName:'fixture-track'};r.room.data.members.owner.muted=false;
 const started=await f.command(r,r.state,'start',{invitation_id:id});assert.equal(started.status,200);
 assert.deepEqual((await library('mine')).body.tracks.map(t=>t.id),['one']);
 assert.deepEqual((await library('mine','other',guest)).body.tracks,[]);
 assert.equal(f.roomSql.prepare("SELECT COUNT(*) n FROM voice_room_events WHERE action='karaoke-sung'").get().n,1);
 assert.ok(!r.room.data.notices.some(n=>/님 차례예요|3초 뒤/.test(n.body)));
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 assert.deepEqual((await library('mine')).body.tracks,[],'current publication/rights checks still apply');
});

test('popular catalogue uses 30 day reservations, stable count order, and a maximum of 30 eligible tracks',async t=>{
 const f=await liveFixture(t),r=await f.create(),now=Date.now();
 const add=(track,stamp,id)=>f.roomSql.prepare('INSERT INTO voice_room_events VALUES(?,?,?,?,?,?)').run(id,r.state.room.id,'owner','karaoke-reserve',track,stamp);
 for(let i=0;i<35;i++){f.addSong('popular-'+i);add('popular-'+i,now-i,'event-'+i);}
 add('popular-9',now,'bonus');add('one',now-31*86400000,'old');
 const result=await f.call(r.root+'karaoke-search?generation='+r.state.generation+'&collection=popular');
 assert.equal(result.status,200);assert.equal(result.body.tracks.length,30);assert.equal(result.body.tracks[0].id,'popular-9');assert.ok(!result.body.tracks.some(t=>t.id==='one'));
 const id=crypto.randomUUID();await f.command(r,r.state,'request',{track_id:'one',request_id:id});await f.command(r,r.state,'request',{track_id:'one',request_id:id});
 assert.equal(f.roomSql.prepare("SELECT COUNT(*) n FROM voice_room_events WHERE id=?").get('karaoke-reserve:'+id).n,1);
});

test('seat retries are idempotent, preserve publishing and reject reused IDs or karaoke seats',async t=>{
 const f=await liveFixture(t),r=await f.create({mode:'talk',seating_mode:'free'}),id=crypto.randomUUID();
 const member=r.room.data.members.owner;member.pub={ready:true,trackName:'retained'};member.muted=false;
 const move=seat=>f.call(r.root+'request-mic','POST',{generation:r.state.generation,seat,request_id:id});
 const moved=await move(3);assert.equal(moved.status,200);const revision=moved.body.revision;
 assert.equal((await move(3)).body.revision,revision);assert.equal((await move(4)).status,409);
 assert.equal(member.pub.trackName,'retained');assert.equal(member.muted,false);
 const k=await f.create();assert.equal((await f.call(k.root+'request-mic','POST',{generation:k.state.generation,seat:3,request_id:crypto.randomUUID()})).status,409);
});

test('optimistic seat move paints before awaiting network, uses one request, and rolls back only the pending preview',async()=>{
 const text=readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8');
 const start=text.indexOf(' async talkSeatAction('),end=text.indexOf('\n toggleEmojiPicker',start);
 const method=text.slice(start,end).trim().replace(/,$/,'');
 const context=vm.createContext({performance,crypto,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}});
 const fn=vm.runInContext('({'+method+'}).talkSeatAction',context);
 let finish,requests=0,paints=[],refreshes=0;
 const c={joined:true,state:{self:'me',room:{host_id:'me',seating_mode:'free'},members:[{id:'me',seat:0}]},paint(){paints.push(this.optimisticSeat?.seat??this.state.members[0].seat);},host:{dispatchEvent(){}},command(){requests++;return new Promise(resolve=>finish=resolve);},acceptState(state){this.state=state;return true;},async refresh(){refreshes++;}};
 const pending=fn.call(c,'request-mic','3');assert.deepEqual(paints,[3]);assert.equal(c.state.members[0].seat,0);
 await fn.call(c,'request-mic','4');assert.equal(requests,1);
 finish({...c.state,members:[{id:'me',seat:3}]});await pending;assert.equal(refreshes,0);assert.equal(c.optimisticSeat,null);assert.equal(paints.at(-1),3);
 c.command=async()=>{throw Error('occupied');};await assert.rejects(fn.call(c,'request-mic','4'),/occupied/);assert.equal(c.optimisticSeat,null);assert.equal(paints.at(-1),3);
});
