import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './live-karaoke-fixture.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

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

test('same room and popup clicks keep membership; internal links, back and hash navigation leave',()=>{
 const handlers={},location=new URL('https://aifect.co.kr/#voice/room');let leaves=0;
 const client=()=>({id:'room',joined:true,leave(){leaves++;this.closed=true;}});
 const c=vm.createContext({URL,location,voiceController:client(),document:{addEventListener:(k,fn)=>handlers[k]=fn},window:{addEventListener:(k,fn)=>handlers[k]=fn}});
 vm.runInContext(readFileSync(new URL('../dist/room-layout.js',import.meta.url),'utf8'),c);
 const click=href=>handlers.click({button:0,target:{closest:()=>href?{href,target:'',hasAttribute:()=>false}:null}});
 click(null);click(location.href);assert.equal(leaves,0);
 click('https://aifect.co.kr/#home');assert.equal(leaves,1);
 c.voiceController=client();location.hash='#community';handlers.hashchange();assert.equal(leaves,2);
 c.voiceController=client();location.hash='#profile';handlers.popstate();assert.equal(leaves,3);
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
