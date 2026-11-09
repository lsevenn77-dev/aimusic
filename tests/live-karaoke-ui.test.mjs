import {nicknameContext} from './nickname-context.mjs';
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
 const nodes=new Map(),node=()=>({dataset:{},textContent:'',innerHTML:'',hidden:false,value:0,readyState:0,isConnected:true,style:{},attributes:new Map(),children:new Map(),
  setAttribute(name,value){this.attributes.set(name,value);},
  getAttribute(name){return this.attributes.get(name);},
  querySelector(selector){if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);}
 });
 const host={isConnected:true,dataset:{},querySelector:sel=>{if(!nodes.has(sel))nodes.set(sel,node());return nodes.get(sel);},querySelectorAll:()=>[]};
 const c=nicknameContext({
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
 vm.runInContext(source('community.js'),c);
 vm.runInContext(source('voice-room-template.js'),c);
 vm.runInContext(source('community-v3.js'),c);
 const controls=source('voice-room-controls.js'),avatarStart=controls.indexOf('function roomMemberAvatar(');
 vm.runInContext(controls.slice(avatarStart,controls.indexOf('\nObject.assign(',avatarStart)),c);
 vm.runInContext(source('live-karaoke.js'),c);
 return {c,calls,events,host,nodes};
}

test('a mode snapshot changes the view once without leaving, rejoining or enabling capture',()=>{
 const cleared=[],{c,calls,host}=context({clearTimeout:id=>cleared.push(id)});let captures=0,stops=0,replaced=0;
 const nextHost={...host};host.replaceWith=()=>replaced++;
 c.document.createElement=()=>({content:{firstElementChild:nextHost}});
 c.document.querySelector=()=>({dataset:{}});
 c.history={state:null,replaceState(_a,_b,url){c.location.hash=url;}};
 c.location.hash='#live/one';
 const editor={get:()=> '안녕 [aifect:cat_basic_laugh]',set:v=>{editor.saved=v;}};
 const client=new c.VoiceRoomClient('one');
 Object.assign(client,{host,liveMode:true,joined:true,generation:'stable-generation',epoch:7,state:{room:{mode:'talk'}},
  ws:{id:'socket'},receiver:{id:'receiver'},heartbeat:42,levelContext:{id:'audio'},chatEditor:editor,
  volumeTimer:'old-volume',roomShareTimer:'old-share',roomShareAbort:new AbortController(),
  stopMicrophone(){stops++;},stopMicTest(){},closeRoomPopup(){},releaseRoomExternal(){},onViewport(){},
  enableMic(){captures++;},micAttempt:0});
 c.voiceController=client;c.client=client;
 const refs=[client.ws,client.receiver,client.levelContext];
 vm.runInContext('client.paint();client.paint()',c);
 assert.equal(replaced,1);assert.equal(client.bindCount,1);assert.equal(client.liveMode,false);
 assert.equal(client.id,'one');assert.equal(client.generation,'stable-generation');assert.equal(client.epoch,7);assert.equal(client.heartbeat,42);
 assert.deepEqual([client.ws,client.receiver,client.levelContext],refs);
 assert.equal(stops,1);assert.equal(captures,0);assert.equal(client.micDesired,false);
 assert.equal(editor.saved,'안녕 [aifect:cat_basic_laugh]');assert.equal(c.location.hash,'#voice/one');
 assert.equal(calls.filter(x=>x[0]==='leave'||x[0]==='request').length,0);
 assert.equal(cleared.filter(id=>id==='old-volume').length,1);assert.equal(cleared.filter(id=>id==='old-share').length,1);
 assert.equal(client.roomShareAbort.signal.aborted,true);
});

test('stopping karaoke audio closes the old worklet port and ignores late latency messages',async()=>{
 const disconnected=[],closed=[],node=label=>({connect:target=>target,disconnect(){disconnected.push(label);}});
 class Worklet{
  constructor(){Object.assign(this,node('worklet'));this.port={onmessage:null,close(){closed.push('port');}};}
 }
 const {c}=context({AudioWorkletNode:Worklet});
 const levelContext={audioWorklet:{addModule:async()=>{}},destination:{},createMediaElementSource:()=>node('source'),createGain:()=>({...node('gain'),gain:{value:1}})};
 const audio={pause(){closed.push('pause');},removeAttribute(){closed.push('src');},load(){closed.push('load');}};
 c.client={closed:false,liveAudio:audio,levelContext,liveAbort:new AbortController(),ws:{id:'retained'}};
 await vm.runInContext('livePitchGraph(client)',c);
 const oldPitch=c.client.livePitch,lateMessage=oldPitch.node.port.onmessage,request=c.client.liveAbort;
 lateMessage({data:{latency:.25}});assert.equal(c.client.livePitchLatency,.25);
 vm.runInContext('liveStopAudio(client)',c);
 assert.equal(oldPitch.node.port.onmessage,null);assert.deepEqual(disconnected,['source','worklet','gain']);
 assert.deepEqual(closed,['port','pause','src','load']);assert.equal(request.signal.aborted,true);
 assert.equal(c.client.liveAudio,null);assert.equal(c.client.livePitch,null);assert.equal(c.client.levelContext,levelContext);assert.equal(c.client.ws.id,'retained');
 c.client.livePitchLatency=.5;lateMessage({data:{latency:9}});assert.equal(c.client.livePitchLatency,.5);
});

test('current and queued singers keep the host crown by the nickname and mute only their avatars',()=>{
 const {c,host,nodes}=context();
 c.client={closed:false,host,liveTrack:'song',state:{self:'self',room:{mode:'karaoke',host_id:'self'},
  members:[{id:'self',role:'host',name:'방장',muted:true},{id:'guest',role:'member',name:'참여자',muted:true}],
  karaoke:{active:{user_id:'self',invitation_id:'turn',track:{id:'song',title:'곡',duration:90}},queue:[{user_id:'guest',track:{id:'song',title:'곡'}}],phase:'invited',inviteExpiresAt:Date.now()+15000}}};
 vm.runInContext('paintLiveKaraoke(client)',c);
 const current=nodes.get('#live-current').innerHTML,queue=nodes.get('#live-queue').innerHTML;
 assert.match(current,/<span class="room-member-photo is-muted">/);assert.match(current,/class="room-muted-mark"/);
 assert.match(current,/<strong><span class="room-host-crown"[^>]*>[\s\S]*?<\/span><span>/);
 assert.equal((queue.match(/class="room-host-crown"/g)||[]).length,1);
 assert.equal((queue.match(/class="room-member-photo is-muted"/g)||[]).length,2);
 assert.doesNotMatch(current+queue,/<strong[^>]*is-muted/);
});

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

test('MR start waits for an initial buffer and volume uses the Web Audio gain on iOS-compatible paths',()=>{
 const {c}=context();let end=.2;
 c.client={liveWords:[{}],liveAudio:{readyState:2,duration:120,buffered:{length:1,start:()=>0,end:()=>end}},levelContext:{currentTime:4}};
 assert.equal(vm.runInContext('liveTrackReady(client)',c),false);end=3;
 assert.equal(vm.runInContext('liveTrackReady(client)',c),true);
 const changes=[];c.client.livePitch={gain:{gain:{setTargetAtTime:(...args)=>changes.push(args)}}};
 vm.runInContext('liveSetVolume(client,0)',c);assert.equal(c.client.liveAudio.volume,1);assert.equal(changes[0][0],0);
});

test('stage monitoring taps only the singer vocal and leaves the outgoing connection intact on toggles',async()=>{
 const {c,client,nodes,vocal,broadcast}=monitorFixture();
 const sync=()=>vm.runInContext('syncLiveMonitor(client)',c);
 const toggle=()=>vm.runInContext('liveKaraokeAction(client,"karaoke-monitor")',c);
 sync();assert.equal(vocal.connections.size,1);
 await toggle();
 const gain=client.liveMonitorTap.gain;
 assert.ok(vocal.connections.has(gain));assert.ok(gain.connections.has(client.processing.context.destination));
 assert.equal(nodes.get('#voice-monitor').checked,true);
 assert.equal(nodes.get('#live-monitor-toggle').disabled,false);
 assert.equal(nodes.get('#live-monitor-toggle').getAttribute('aria-pressed'),'true');
 assert.equal(nodes.get('#live-monitor-toggle').querySelector('span').textContent,'내 목소리 듣기 켜짐');
 sync();assert.equal(client.liveMonitorTap.gain,gain);
 await toggle();assert.deepEqual([...vocal.connections],[broadcast]);assert.equal(gain.connections.size,0);
 assert.equal(nodes.get('#voice-monitor').checked,false);
 client.state.karaoke.active.user_id='other';await toggle();assert.equal(client.liveMonitorTap,null);
 vm.runInContext('paintLiveKaraoke(client)',c);
 assert.equal(nodes.get('#live-monitor-toggle').disabled,true);
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
 assert.doesNotMatch(html,/class="voice-back"/);assert.match(html,/id="voice-title">라이브 노래방/);
 assert.match(html,/3|노래가 시작/);
 assert.equal((html.match(/data-voice="sound"/g)||[]).length,1);
 assert.match(html.slice(0,html.indexOf('id="live-karaoke-stage"')),/data-voice="sound"/);
 assert.doesNotMatch(html,/live-sound-toolbar|id="live-monitor-toggle"/);
 assert.match(html,/id="voice-monitor"/);
});

test('unified directory links each real type to its original room and exposes the same settings',()=>{
 const {c}=context();
 const talk=vm.runInContext("talkingRoomCard({id:'chat',title:'Talk'})",c);
 const sing=vm.runInContext("talkingRoomCard({id:'sing',title:'Sing',mode:'karaoke'})",c);
 assert.match(talk,/#voice\/chat/);assert.match(sing,/#live\/sing/);
 assert.match(sing,/live-type-karaoke/);assert.match(talk,/live-type-talk/);
 assert.doesNotMatch(talk,/talk-follows|>LIVE</);
 const html=vm.runInContext("liveDirectoryHTML('karaoke')",c);
 for(const field of ['background','announcement','mode','visibility','max_members','crew_id','title'])
  assert.match(html,new RegExp('name="'+field+'"'));
 for(const selector of ['data-live-reset','data-auto-title','data-room-filter="all"','data-room-filter="talk"','data-room-filter="karaoke"'])
  assert.ok(html.includes(selector),selector);
 const tabs=vm.runInContext('communityNavigation("live")',c);
 assert.match(tabs,/href="#live" aria-current="page"/);
 assert.deepEqual([...tabs.matchAll(/href="([^"]+)"/g)].map(match=>match[1]),['#live','#crew','#community/rankings']);
});

test('live lobby mounts a paginated shell without eager legacy reads and retains anonymous room gates',async()=>{
 const {c,calls}=context();const view=await vm.runInContext('voiceView("live",undefined)',c);
 assert.equal(view.liveLobby,true);assert.match(view.html,/talk-sentinel/);assert.equal(calls.length,0);
 c.me=null;const guest=await vm.runInContext('voiceView("live",undefined)',c);
 assert.match(guest.html,/v3-create-room/);assert.equal(calls.length,0);
 assert.match((await vm.runInContext('voiceView("live","one")',c)).html,/로그인/);
 assert.equal((await vm.runInContext('voiceView("voice","one")',c)).html,'regular room');
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
 assert.doesNotMatch(nodes.get('#live-actions').innerHTML,/karaoke-call/);
 assert.doesNotMatch(nodes.get('#live-actions').innerHTML,/<코코>|다음 가창자/);
 assert.equal((nodes.get('#live-queue').innerHTML.match(/<li/g)||[]).length,6);assert.doesNotMatch(nodes.get('#live-queue').innerHTML,/NOW/);
 assert.match(nodes.get('#live-queue').innerHTML,/&lt;코코>/);
 const html=vm.runInContext('liveKaraokeRoomHTML("room")',c);
 for(const id of ['live-search-sheet','live-search','live-mr-volume','live-delay','voice-chat','voice-members'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/data-voice="karaoke-search-open"/);
});

test('invitation countdown follows server time and accept completes before microphone setup without extra refresh',async()=>{
 const now=100000,clock={now:()=>now};const {c,host,nodes}=context({Date:clock});let mic=0,refresh=0,seen;
 const state={self:'self',room:{mode:'karaoke'},members:[{id:'self',name:'코코',role:'host'}],karaoke:{phase:'invited',inviteExpiresAt:now+15500,active:{user_id:'self',invitation_id:'nonce',track:{id:'song',title:'곡',artist:'가수',duration:90}},queue:[]}};
 c.client={closed:false,host,state,musicClock:500,liveTrack:'song',command:async(_path,b)=>{seen=b;assert.equal(mic,0);return {...state,karaoke:{...state.karaoke,phase:'ready',inviteExpiresAt:0}};},acceptState(s){this.state=s;return true;},refresh:async()=>{refresh++;},enableMic:async()=>{mic++;}};
 vm.runInContext('paintLiveKaraoke(client)',c);assert.equal(nodes.get('#live-phase').textContent,'응답 대기 · 15초');assert.equal(nodes.get('#live-invite').hidden,false);
 await vm.runInContext('liveKaraokeAction(client,"karaoke-accept","nonce")',c);
 assert.equal(seen.invitation_id,'nonce');assert.equal(mic,1);assert.equal(refresh,0);assert.equal(nodes.get('#live-invite').hidden,false);
 state.karaoke.inviteExpiresAt=now; c.client.state=state;
 vm.runInContext('liveSync(client)',c);assert.equal(nodes.get('[data-voice="karaoke-begin"]').disabled,true);assert.equal(nodes.get('#live-phase').textContent,'다음 예약자로 이동 중');
});

test('song picker uses the real personal catalogue and does not start the microphone',async()=>{
 const {c,host,nodes,calls}=context({voiceRequest:async path=>{calls.push(['request',path]);return {tracks:[]};}});let opened;
 host.querySelector('#live-query').value='';c.client={host,generation:'g',path:a=>'rooms/r/'+a,showSheet:id=>{opened=id;host.querySelector('#live-search-sheet').open=true;}};
 await vm.runInContext('liveKaraokeAction(client,"karaoke-search-open")',c);
 assert.equal(opened,'live-search-sheet');assert.equal(calls.length,1);assert.match(calls[0][1],/collection=mine/);assert.match(nodes.get('#live-results').innerHTML,/아직 부른 곡/);
});


test('static search button is re-enabled after a request finishes',()=>{
 const {c,host}=context();const picker={disabled:false};host.querySelectorAll=selector=>selector.includes('karaoke-search-open')?[picker]:[];
 c.client={closed:false,host,liveCommandPending:true,state:{self:'self',room:{mode:'karaoke'},members:[{id:'self',role:'host'}],karaoke:{active:null,queue:[],phase:'idle'}}};
 vm.runInContext('paintLiveKaraoke(client)',c);assert.equal(picker.disabled,true);
 vm.runInContext('client.liveCommandPending=false;paintLiveKaraoke(client)',c);assert.equal(picker.disabled,false);
});

test('microphone preparation shows its own clock and disables expired start while retaining give up',()=>{
 let now=100000;const {c,host,nodes}=context({Date:{now:()=>now}});
 c.client={closed:false,host,musicClock:500,liveTrack:'song',liveAudio:{readyState:2,paused:true},liveWords:[{e:1,w:[]}],state:{self:'self',room:{mode:'karaoke'},members:[{id:'self',role:'host',publishing:true,muted:false}],karaoke:{phase:'ready',readyExpiresAt:now+15500,active:{user_id:'self',invitation_id:'nonce',track:{id:'song',title:'곡',artist:'가수',duration:90}},queue:[]}}};
 vm.runInContext('paintLiveKaraoke(client)',c);assert.equal(nodes.get('#live-phase').textContent,'마이크 준비 · 15초');assert.equal(nodes.get('[data-voice="karaoke-begin"]').disabled,false);
 assert.match(nodes.get('#live-actions').innerHTML,/내려가기/);assert.doesNotMatch(nodes.get('#live-actions').innerHTML,/노래 종료/);
 now+=15000;vm.runInContext('liveSync(client)',c);assert.equal(nodes.get('[data-voice="karaoke-begin"]').disabled,true);assert.equal(nodes.get('#live-phase').textContent,'다음 예약자로 이동 중');
});

test('an unanswered microphone permission prompt does not block abandoning the turn',async()=>{
 const {c,host}=context();let releaseMic;const operations=[];
 const state={self:'self',room:{mode:'karaoke'},members:[{id:'self',name:'코코',role:'host'}],karaoke:{phase:'invited',active:{user_id:'self',invitation_id:'nonce',track:{id:'song',title:'곡',artist:'가수',duration:90}},queue:[]}};
 c.client={closed:false,host,state,liveTrack:'song',command:async(_path,b)=>{operations.push(b.operation);return {...state,karaoke:{...state.karaoke,phase:b.operation==='accept'?'ready':'idle',active:b.operation==='accept'?state.karaoke.active:null,readyExpiresAt:Date.now()+10000}};},acceptState(s){this.state=s;return true;},enableMic:()=>new Promise(resolve=>{releaseMic=resolve;})};
 const accept=vm.runInContext('liveKaraokeAction(client,"karaoke-accept","nonce")',c);await new Promise(resolve=>setImmediate(resolve));assert.equal(c.client.liveCommandPending,false);
 await vm.runInContext('liveKaraokeAction(client,"karaoke-abandon","nonce")',c);assert.deepEqual(operations,['accept','abandon']);releaseMic();await accept;
});

test('one singer gesture accepts, connects microphone and starts once; listeners cannot begin',async()=>{
 const {c,host,nodes}=context();const operations=[];
 const member={id:'self',name:'나',role:'participant',publishing:false,muted:true};
 const k={phase:'invited',inviteExpiresAt:Date.now()+15000,active:{user_id:'self',invitation_id:'id',track:{id:'song',title:'곡',artist:'A',duration:120}},queue:[]};
 c.client={host,liveTrack:'song',state:{self:'self',room:{mode:'karaoke'},members:[member],karaoke:k},liveAudio:{play:async()=>{},pause(){},paused:true,readyState:2},liveWords:[{e:1,w:[]}],
  async command(path,b){operations.push(b.operation);k.phase=b.operation==='accept'?'ready':'singing';k.readyExpiresAt=Date.now()+15000;k.startsAt=Date.now()+3000;return this.state;},
  acceptState(){return true;},async enableMic(){operations.push('mic');member.publishing=true;member.muted=false;}};
 vm.runInContext('paintLiveKaraoke(client)',c);assert.match(nodes.get('#room-turn-action').innerHTML,/>시작</);
 const begin=()=>vm.runInContext('liveKaraokeAction(client,"karaoke-begin","id")',c);
 await Promise.all([begin(),begin()]);assert.deepEqual(operations,['accept','mic','start']);assert.equal(k.phase,'singing');
});

test('each new own singing turn enables monitoring once and respects a manual off',()=>{
 const {c,client}=monitorFixture(),sync=()=>vm.runInContext('syncRoomSingerMonitor(client)',c);
 client.state.karaoke.active.invitation_id='turn-1';sync();assert.equal(client.liveMonitorEnabled,undefined);
 client.state.karaoke.phase='singing';sync();assert.equal(client.liveMonitorEnabled,true);
 client.liveMonitorEnabled=false;sync();sync();assert.equal(client.liveMonitorEnabled,false);
 client.state.karaoke.active.user_id='other';sync();assert.equal(client.liveMonitorEnabled,false);
 client.state.karaoke.active.user_id='self';client.state.karaoke.active.invitation_id='turn-2';sync();assert.equal(client.liveMonitorEnabled,true);
 client.state.karaoke.phase='idle';sync();assert.equal(client.liveMonitorEnabled,false);
});


test('an interrupted karaoke room cannot restart accompaniment or monitoring from sync and volume changes',()=>{
 const {c,client}=monitorFixture();let played=0;
 vm.runInContext(source('room-audio-session.js'),c);
 const audio={muted:false,paused:false,currentTime:5,readyState:4,pause(){this.paused=true;},play(){played++;this.paused=false;return Promise.resolve();}};
 const parameter={value:1,cancelScheduledValues(){},setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;}};
 Object.assign(client,{liveAudio:audio,livePitch:{gain:{gain:parameter}},liveVolume:.75,liveMonitorEnabled:true});
 client.state.karaoke.phase='singing';client.state.karaoke.startsAt=Date.now()-5000;
 client.state.karaoke.active.invitation_id='turn';client.state.karaoke.active.track.duration=90;
 vm.runInContext('client.roomAudio=new RoomAudioSession(client);client.roomAudio.interrupt("session");liveSetVolume(client,1);liveSync(client)',c);
 assert.equal(audio.muted,true);assert.equal(audio.paused,true);assert.equal(parameter.value,0);assert.equal(played,0);assert.equal(client.liveMonitorTap,undefined);
});

function delayedAcceptFixture(){
 const session={state:'active',type:'auto',addEventListener(){},removeEventListener(){}};
 const {c,host}=context({performance,navigator:{audioSession:session,mediaDevices:{getUserMedia:async()=>{throw Error('capture is instrumented');}}}});
 // Run the real capture entry point and guard along with the real karaoke
 // action. Only the asynchronous server response and hardware are replaced.
 vm.runInContext(source('voice-rooms.js')+';this.actualEnableMic=VoiceRoomClient.prototype.enableMic;',c);
 vm.runInContext(source('room-audio-session.js'),c);
 let acceptResponse,captures=0;
 const state={self:'self',room:{mode:'karaoke'},members:[{id:'self',name:'나',seat:0,role:'participant',muted:true,publishing:false}],
  karaoke:{phase:'invited',inviteExpiresAt:Date.now()+15000,active:{user_id:'self',invitation_id:'turn',track:{id:'song',title:'곡',artist:'A',duration:90}},queue:[]}};
 c.client={host,state,closed:false,joined:true,liveMode:true,liveTrack:'song',epoch:1,generation:'g',micAttempt:1,micState:'muted',
  command:(_path,body)=>body?.operation==='accept'?new Promise(resolve=>{acceptResponse=resolve;}):Promise.resolve({}),
  acceptState(next){if(next?.karaoke)this.state=next;return true;},
  paint(){},status(){},resumeSound(){},stopMicTest(){},stopMicrophone(){},setCaptureEnabled(){},setMicPhase(){return 0;},
  captureMicrophone:async()=>{captures++;return null;},enableMic:c.actualEnableMic};
 vm.runInContext('client.roomAudio=new RoomAudioSession(client);liveNow=()=>Infinity;',c);
 return {c,client:c.client,session,get captures(){return captures;},
  finish(){assert.ok(acceptResponse,'the accept request is pending');acceptResponse({...state,karaoke:{...state.karaoke,phase:'ready',readyExpiresAt:Date.now()+10000}});}};
}
for(const action of ['karaoke-begin','karaoke-accept']){
 test(`${action}: an old accept response cannot authorize capture after interruption and recovery`,async()=>{
  const h=delayedAcceptFixture();h.c.requestedAction=action;
  const actionTask=vm.runInContext('liveKaraokeAction(client,requestedAction,"turn")',h.c);
  await new Promise(resolve=>setImmediate(resolve));
  h.session.state='interrupted';h.client.roomAudio.onSessionState();await h.client.roomAudio.muteTask;
  h.session.state='active';h.client.roomAudio.onSessionState();
  assert.equal(h.client.roomAudio.blocked,false);assert.equal(h.client.roomAudio.micNeedsGesture,true);
  h.finish();await actionTask;
  assert.equal(h.captures,0);assert.equal(h.client.roomAudio.micNeedsGesture,true);assert.equal(h.client.micDesired,false);
 });
 test(`${action}: the same delayed accept starts capture when its original gesture remains valid`,async()=>{
  const h=delayedAcceptFixture();h.c.requestedAction=action;
  const actionTask=vm.runInContext('liveKaraokeAction(client,requestedAction,"turn")',h.c);
  await new Promise(resolve=>setImmediate(resolve));h.finish();await actionTask;
  assert.equal(h.captures,1);assert.equal(h.client.roomAudio.micNeedsGesture,false);
 });
}
