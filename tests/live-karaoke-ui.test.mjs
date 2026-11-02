import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=f=>readFileSync(new URL('../dist/'+f,import.meta.url),'utf8');
function context(overrides={}){
 const events=new Map(),calls=[];
 class Client{
  constructor(id){this.id=id;this.closed=false;this.bindCount=0;this.warmCount=0;}
  bind(host){this.host=host;this.bindCount++;}
  paint(){} warmMicrophone(){this.warmCount++;} action(action){calls.push(['base-action',action]);}
  leave(){this.closed=true;calls.push(['leave',this.id]);return Promise.resolve();}
 }
 const nodes=new Map(),node=()=>({textContent:'',innerHTML:'',hidden:false,value:0,readyState:0,isConnected:true});
 const host={isConnected:true,dataset:{},querySelector:sel=>{if(!nodes.has(sel))nodes.set(sel,node());return nodes.get(sel);},querySelectorAll:()=>[]};
 const c=vm.createContext({
  icon:()=>'<svg></svg>',esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),number:x=>String(x),time:x=>String(x),avatarImage:()=>'<img>',
  AifectGifts:{GIFT_CATALOG:[]},URL,URLSearchParams,AbortController,crypto,Date,
  voiceView:async()=>({html:'regular room'}),communityNavigation:()=>'<nav class="tabs"><a href="#community">토킹룸</a><a href="#community/crews">크루</a><a href="#community/rankings">랭킹</a></nav>',
  bindVoice:()=>calls.push(['base-bind']),cleanupVoiceRoute:()=>calls.push(['base-cleanup']),voiceController:null,voiceEntryAudio:null,
  setVoiceFocus:value=>calls.push(['focus',value]),prepareVoiceListening:id=>calls.push(['listen',id]),
  VoiceRoomClient:Client,heading:title=>'<h1>'+title+'</h1>',gate:()=>'<a href="#account">로그인</a>',me:{id:'self'},
  document:{querySelector:()=>null,addEventListener:(name,handler)=>events.set(name,handler)},
  window:{addEventListener(){},removeEventListener(){}},location:{origin:'https://aifect.co.kr',href:'https://aifect.co.kr/#live',pathname:'/',search:'',hash:'#live'},
  navigator:{clipboard:{writeText:async text=>calls.push(['clipboard',text])}},toast:()=>{},
  setInterval:()=>1,clearInterval:()=>{},clearTimeout:()=>{},
  voiceRequest:async path=>{calls.push(['request',path]);return path==='status'?{enabled:true}:path==='options'?{crews:[{id:'crew',name:'크루'}]}:{rooms:[{id:'sing',mode:'karaoke',title:'Live',visibility:'public'},{id:'talk',mode:'talk',title:'Chat',visibility:'public'}]};},
  ...overrides,
 });
 vm.runInContext(source('voice-room-template.js'),c);
 vm.runInContext(source('community-v3.js'),c);
 vm.runInContext(source('live-karaoke.js'),c);
 return {c,calls,events,host,nodes};
}

function monitorFixture(){
 const {c,host,nodes}=context();
 const node=()=>({connections:new Set(),connect(to){this.connections.add(to);},disconnect(to){if(to)this.connections.delete(to);else this.connections.clear();}});
 const contextForOutput=()=>({
  state:'running',destination:node(),
  createGain(){return Object.assign(node(),{gain:{value:1}});},
  createMediaStreamSource(stream){return Object.assign(node(),{stream});},
 });
 const micContext=contextForOutput(),vocal=node(),broadcast=node();
 vocal.connect(broadcast);
 const client=c.client={host,liveMode:true,stream:{},micSender:{track:{enabled:true}},processing:{analyser:vocal,context:micContext,stream:{}},levelContext:contextForOutput(),
  resumeSound(){},liveTrack:'one',state:{self:'self',room:{mode:'karaoke'},members:[{id:'self',name:'가창자',role:'host',publishing:true,muted:false}],
   karaoke:{phase:'ready',readyExpiresAt:Date.now()+10000,active:{user_id:'self',track:{id:'one',artist:'가수',title:'곡',duration:90}},queue:[]}}};
 return {c,client,nodes,vocal,broadcast};
}

test('stage monitoring taps only the singer vocal and leaves the outgoing connection intact on toggles',async()=>{
 const {c,client,nodes,vocal,broadcast}=monitorFixture();
 const sync=()=>vm.runInContext('syncLiveMonitor(client)',c);
 const toggle=()=>vm.runInContext('liveKaraokeAction(client,"karaoke-monitor")',c);
 sync();assert.equal(vocal.connections.size,1);
 await toggle();
 const gain=client.liveMonitorTap.gain;
 assert.ok(vocal.connections.has(gain));assert.ok(gain.connections.has(client.processing.context.destination));
 assert.equal(nodes.get('#voice-monitor').checked,true);
 sync();assert.equal(client.liveMonitorTap.gain,gain);
 await toggle();assert.deepEqual([...vocal.connections],[broadcast]);assert.equal(gain.connections.size,0);
 assert.equal(nodes.get('#voice-monitor').checked,false);
 client.state.karaoke.active.user_id='other';await toggle();assert.equal(client.liveMonitorTap,null);
});

test('mute, changed device, turn handoff and capture fallback cannot leave an old local monitor playing',()=>{
 const {c,client,vocal,broadcast}=monitorFixture();
 const sync=()=>vm.runInContext('syncLiveMonitor(client)',c);
 client.liveMonitorEnabled=true;sync();
 client.state.members[0].muted=true;sync();assert.deepEqual([...vocal.connections],[broadcast]);
 client.state.members[0].muted=false;client.levelContext.sinkId='headset';sync();
 assert.equal(client.liveMonitorTap.source.stream,client.processing.stream);
 assert.ok(client.liveMonitorTap.gain.connections.has(client.levelContext.destination));
 const old=client.liveMonitorTap;
 client.processing={fallback:true};client.stream={id:'new capture'};sync();
 assert.equal(old.gain.connections.size,0);assert.equal(old.source.connections.size,0);
 assert.equal(client.liveMonitorTap.source.stream,client.stream);
 client.micSender.track.enabled=false;sync();assert.equal(client.liveMonitorTap,null);
 client.micSender.track.enabled=true;sync();assert.ok(client.liveMonitorTap);
 client.state.karaoke.phase='idle';sync();assert.equal(client.liveMonitorTap,null);
});

test('live room wraps the current template while preserving chat, gifts, settings and participants',()=>{
 const {c}=context(),html=vm.runInContext('liveKaraokeRoomHTML("live-room")',c);
 for(const id of ['live-lyrics','live-search','voice-chat','voice-gift-form','voice-settings-form','voice-members'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/class="voice-room live-karaoke-room"/);assert.match(html,/data-voice-room="live-room"/);
 assert.match(html,/href="#live"/);assert.match(html,/id="voice-title">라이브 노래방/);
 assert.match(html,/3|노래가 시작/);
});

test('existing talking room lobby excludes karaoke rooms while live reuses the current card/form design',()=>{
 const {c}=context();
 const data={rooms:[{id:'sing',mode:'karaoke',title:'Live',visibility:'public'},{id:'talk',mode:'talk',title:'Chat',visibility:'public'}],crews:[]};c.data=data;
 const talk=vm.runInContext('voiceLobbyHTML(data,true)',c),live=vm.runInContext('liveKaraokeLobbyHTML(data,true)',c);
 assert.match(talk,/#voice\/talk/);assert.doesNotMatch(talk,/#voice\/sing/);
 assert.match(live,/#live\/sing/);assert.doesNotMatch(live,/#live\/talk/);
 assert.match(live,/class="v3-room-card"/);assert.match(live,/id="voice-create-form"/);
 assert.match(live,/name="background"/);assert.match(live,/name="announcement"/);
 assert.match(vm.runInContext('communityNavigation("live")',c),/href="#live" aria-current="page"/);
});

test('live loader returns a real route with membership-filtered rooms/options and gates anonymous creation',async()=>{
 const {c,calls}=context();const view=await vm.runInContext('voiceView("live",undefined)',c);
 assert.match(view.html,/라이브 노래방/);assert.match(view.html,/#live\/sing/);
 assert.ok(calls.some(x=>x[1]==='rooms'));assert.ok(calls.some(x=>x[1]==='options'));
 assert.equal(view.liveLobby,true);
 c.me=null;calls.length=0;const guest=await vm.runInContext('voiceView("live",undefined)',c);
 assert.ok(calls.some(x=>x[1]==='public-rooms'));assert.ok(!calls.some(x=>x[1]==='rooms'));
 assert.match(guest.html,/id="v3-create-room" disabled/);assert.match(guest.html,/href="#account"/);
 assert.match((await vm.runInContext('voiceView("live","one")',c)).html,/로그인/);
 assert.equal((await vm.runInContext('voiceView("voice","one")',c)).html,'regular room');
});

test('an enabled empty live lobby reports no rooms to guests rather than a disabled service',()=>{
 const {c}=context({me:null});
 const html=vm.runInContext('liveKaraokeLobbyHTML({rooms:[],crews:[]},true)',c);
 assert.match(html,/아직 열린 노래방이 없어요\./);assert.doesNotMatch(html,/연결을 준비하고/);
 assert.match(html,/id="v3-create-room" disabled/);assert.match(html,/로그인하면/);
 const disabled=vm.runInContext('liveKaraokeLobbyHTML({rooms:[],crews:[]},false)',c);
 assert.match(disabled,/라이브 노래방 연결을 준비하고 있어요\./);
});

test('live entry preserves the listening user gesture without requesting a microphone',()=>{
 const {c,calls,events}=context();const event={button:0,target:{closest:()=>({href:'https://aifect.co.kr/#live/one',hasAttribute:()=>false,target:''})}};
 events.get('click')(event);assert.deepEqual(calls,[['listen','one']]);
 calls.length=0;events.get('click')({...event,ctrlKey:true});assert.deepEqual(calls,[]);
 c.me=null;events.get('click')(event);assert.deepEqual(calls,[]);
});

test('listener clients never warm microphone and outgoing live routes release room resources',async()=>{
 const {c,calls}=context();vm.runInContext('voiceController=new VoiceRoomClient("one");voiceController.liveMode=true;voiceController.joined=true;voiceController.state={self:"listener",karaoke:{active:{user_id:"singer"}}};voiceController.warmMicrophone()',c);
 assert.equal(c.voiceController.warmCount,0);
 vm.runInContext('voiceController.state.self="singer";voiceController.state.karaoke.phase="invited";voiceController.warmMicrophone()',c);assert.equal(c.voiceController.warmCount,0);
 vm.runInContext('voiceController.state.karaoke.phase="ready";voiceController.warmMicrophone()',c);assert.equal(c.voiceController.warmCount,1);
 vm.runInContext('cleanupVoiceRoute("live","one")',c);assert.ok(!c.voiceController.closed);
 await vm.runInContext('cleanupVoiceRoute("live",undefined)',c);assert.equal(c.voiceController,null);assert.ok(calls.some(x=>x[0]==='leave'));
 vm.runInContext('cleanupVoiceRoute("home")',c);assert.ok(calls.some(x=>x[0]==='base-cleanup'));
});

test('a pending karaoke command cannot advance twice and start requires prepared MR',async()=>{
 const {c,host}=context();let finish,count=0;
 const client={closed:false,host,state:{self:'self',room:{mode:'karaoke'},members:[{id:'self',role:'host'}],karaoke:{active:null,queue:[],phase:'idle'}},command:()=>{count++;return new Promise(resolve=>{finish=resolve;});},refresh:async()=>{}};
 c.client=client;
 const first=vm.runInContext('liveKaraokeAction(client,"karaoke-next")',c);await vm.runInContext('liveKaraokeAction(client,"karaoke-next")',c);assert.equal(count,1);
 finish({});await first;assert.equal(client.liveCommandPending,false);
 await assert.rejects(vm.runInContext('liveKaraokeAction(client,"karaoke-start")',c),/반주를 불러온 뒤/);assert.equal(count,1);
});

test('delayed MR fetch completion after leaving cannot restore audio',async()=>{
 let finish,created=0;
 const {c}=context({fetch:()=>new Promise(resolve=>{finish=resolve;}),Audio:class{constructor(){created++;}}});
 const client={closed:false,host:{isConnected:true},liveTrack:null};c.client=client;
 vm.runInContext('livePrepareTrack(client,{track:{id:"song"}});liveStopAudio(client)',c);
 finish({ok:true,json:async()=>({mr:'/media/song/mr',words:[{e:1,w:[{s:0,t:'안녕'}]}]})});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(created,0);assert.equal(client.liveAudio,undefined);
});

test('live script follows all current room extensions and is included in the build',()=>{
 const html=source('index.html'),live=html.indexOf('src="/live-karaoke.js');
 for(const required of ['src="voice-room-controls.js','src="/community-v3.js','src="/decoration-display.js'])assert.ok(live>html.indexOf(required),required);
 assert.match(readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8'),/'live-karaoke.js','live-karaoke.css'/);
 assert.match(source('views.js'),/voiceView\(base,param,readApi.signal\)/);
 const css=source('live-karaoke.css');assert.doesNotMatch(css,/(?:^|\n)(?:body|:root|\*)\s*\{/);assert.match(css,/min-height:44px/);
});


test('nickname call, next card and horizontal reservation controls preserve escaping and real identities',()=>{
 const {c,host,nodes}=context();
 c.client={closed:false,host,state:{self:'self',room:{mode:'karaoke'},members:[{id:'self',role:'host'},{id:'next',name:'<코코>',profile_id:'p'}],karaoke:{active:null,queue:[{user_id:'next',name:'stale',track:{id:'song',title:'예약곡',artist:'가수'}}],phase:'idle'}}};
 vm.runInContext('paintLiveKaraoke(client)',c);
 assert.match(nodes.get('#live-actions').innerHTML,/&lt;코코>님 부르기/);
 assert.doesNotMatch(nodes.get('#live-actions').innerHTML,/<코코>|다음 가창자/);
 assert.match(nodes.get('#live-next-card').innerHTML,/예약곡/);assert.equal(nodes.get('#live-next-card').hidden,false);
 assert.match(nodes.get('#live-queue').innerHTML,/&lt;코코>/);
 const html=vm.runInContext('liveKaraokeRoomHTML("room")',c);
 for(const id of ['live-search-sheet','live-search','live-mr-volume','live-delay','voice-chat','voice-members'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/data-voice="karaoke-search-open"/);
});

test('invitation countdown follows server time and accept completes before microphone setup without extra refresh',async()=>{
 const now=100000,clock={now:()=>now};const {c,host,nodes}=context({Date:clock});let mic=0,refresh=0,seen;
 const state={self:'self',room:{mode:'karaoke'},members:[{id:'self',name:'코코',role:'host'}],karaoke:{phase:'invited',inviteExpiresAt:now+10500,active:{user_id:'self',invitation_id:'nonce',track:{id:'song',title:'곡',artist:'가수',duration:90}},queue:[]}};
 c.client={closed:false,host,state,musicClock:500,liveTrack:'song',command:async(_path,b)=>{seen=b;assert.equal(mic,0);return {...state,karaoke:{...state.karaoke,phase:'ready',inviteExpiresAt:0}};},acceptState(s){this.state=s;return true;},refresh:async()=>{refresh++;},enableMic:async()=>{mic++;}};
 vm.runInContext('paintLiveKaraoke(client)',c);assert.equal(nodes.get('#live-phase').textContent,'응답 대기 · 10초');assert.equal(nodes.get('#live-invite').hidden,false);
 await vm.runInContext('liveKaraokeAction(client,"karaoke-accept","nonce")',c);
 assert.equal(seen.invitation_id,'nonce');assert.equal(mic,1);assert.equal(refresh,0);assert.equal(nodes.get('#live-invite').hidden,false);
 state.karaoke.inviteExpiresAt=now; c.client.state=state;
 vm.runInContext('liveSync(client)',c);assert.equal(nodes.get('[data-voice="karaoke-accept"]').disabled,true);assert.equal(nodes.get('#live-phase').textContent,'다음 예약자로 이동 중');
});

test('song picker opens through the existing dialog manager without issuing a search or microphone request',async()=>{
 const {c,host,nodes,calls}=context();let opened,focused=false;
 host.querySelector('#live-query').focus=()=>{focused=true;};c.client={host,showSheet:id=>{opened=id;}};
 await vm.runInContext('liveKaraokeAction(client,"karaoke-search-open")',c);
 assert.equal(opened,'live-search-sheet');assert.ok(focused);assert.equal(calls.length,0);
});


test('static search button is re-enabled after a request finishes',()=>{
 const {c,host}=context();const picker={disabled:false};host.querySelectorAll=selector=>selector.includes('karaoke-search-open')?[picker]:[];
 c.client={closed:false,host,liveCommandPending:true,state:{self:'self',room:{mode:'karaoke'},members:[{id:'self',role:'host'}],karaoke:{active:null,queue:[],phase:'idle'}}};
 vm.runInContext('paintLiveKaraoke(client)',c);assert.equal(picker.disabled,true);
 vm.runInContext('client.liveCommandPending=false;paintLiveKaraoke(client)',c);assert.equal(picker.disabled,false);
});

test('microphone preparation shows its own clock and disables expired start while retaining give up',()=>{
 let now=100000;const {c,host,nodes}=context({Date:{now:()=>now}});
 c.client={closed:false,host,musicClock:500,liveTrack:'song',liveAudio:{readyState:2,paused:true},liveWords:[{e:1,w:[]}],state:{self:'self',room:{mode:'karaoke'},members:[{id:'self',role:'host',publishing:true,muted:false}],karaoke:{phase:'ready',readyExpiresAt:now+10500,active:{user_id:'self',invitation_id:'nonce',track:{id:'song',title:'곡',artist:'가수',duration:90}},queue:[]}}};
 vm.runInContext('paintLiveKaraoke(client)',c);assert.equal(nodes.get('#live-phase').textContent,'마이크 준비 · 10초');assert.equal(nodes.get('[data-voice="karaoke-start"]').disabled,false);
 assert.match(nodes.get('#live-actions').innerHTML,/노래 포기/);assert.doesNotMatch(nodes.get('#live-actions').innerHTML,/노래 종료/);
 now+=10000;vm.runInContext('liveSync(client)',c);assert.equal(nodes.get('[data-voice="karaoke-start"]').disabled,true);assert.equal(nodes.get('#live-phase').textContent,'다음 예약자로 이동 중');
});

test('an unanswered microphone permission prompt does not block abandoning the turn',async()=>{
 const {c,host}=context();let releaseMic;const operations=[];
 const state={self:'self',room:{mode:'karaoke'},members:[{id:'self',name:'코코',role:'host'}],karaoke:{phase:'invited',active:{user_id:'self',invitation_id:'nonce',track:{id:'song',title:'곡',artist:'가수',duration:90}},queue:[]}};
 c.client={closed:false,host,state,liveTrack:'song',command:async(_path,b)=>{operations.push(b.operation);return {...state,karaoke:{...state.karaoke,phase:b.operation==='accept'?'ready':'idle',active:b.operation==='accept'?state.karaoke.active:null,readyExpiresAt:Date.now()+10000}};},acceptState(s){this.state=s;return true;},enableMic:()=>new Promise(resolve=>{releaseMic=resolve;})};
 const accept=vm.runInContext('liveKaraokeAction(client,"karaoke-accept","nonce")',c);await new Promise(resolve=>setImmediate(resolve));assert.equal(c.client.liveCommandPending,false);
 await vm.runInContext('liveKaraokeAction(client,"karaoke-abandon","nonce")',c);assert.deepEqual(operations,['accept','abandon']);releaseMic();await accept;
});
