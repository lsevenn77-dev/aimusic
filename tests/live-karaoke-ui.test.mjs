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
 const host={isConnected:true,querySelector:sel=>{if(!nodes.has(sel))nodes.set(sel,node());return nodes.get(sel);},querySelectorAll:()=>[]};
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

test('live entry preserves the listening user gesture without requesting a microphone',()=>{
 const {c,calls,events}=context();const event={button:0,target:{closest:()=>({href:'https://aifect.co.kr/#live/one',hasAttribute:()=>false,target:''})}};
 events.get('click')(event);assert.deepEqual(calls,[['listen','one']]);
 calls.length=0;events.get('click')({...event,ctrlKey:true});assert.deepEqual(calls,[]);
 c.me=null;events.get('click')(event);assert.deepEqual(calls,[]);
});

test('listener clients never warm microphone and outgoing live routes release room resources',async()=>{
 const {c,calls}=context();vm.runInContext('voiceController=new VoiceRoomClient("one");voiceController.liveMode=true;voiceController.joined=true;voiceController.state={self:"listener",karaoke:{active:{user_id:"singer"}}};voiceController.warmMicrophone()',c);
 assert.equal(c.voiceController.warmCount,0);
 vm.runInContext('voiceController.state.self="singer";voiceController.warmMicrophone()',c);assert.equal(c.voiceController.warmCount,1);
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
