import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from '../shared/lyrics.js';
const source=readFileSync(new URL('../dist/lyrics.js',import.meta.url),'utf8');
function player(api,clock=Date){
 const hud={},calls=[],events={},audio={currentTime:0,paused:false,addEventListener(name,fn){events[name]=fn;}},track={id:'song',duration:90,lyrics_mode:'synced',lyrics_access:'line',lyrics:''};
 const context=vm.createContext({window:{},playSerial:0,current:track,me:{id:'listener'},audio,trackMap:new Map([[track.id,track]]),AifectLyrics:core,api:async path=>{calls.push(path);return api(path);},$:sel=>sel==='#player-lyric'?hud:null,Date:clock,esc:String,icon:()=>'',time:String});
 vm.runInContext(source,context);return {context,hud,calls,audio,events,run:s=>vm.runInContext(s,context)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('one-line client prefetches before boundaries and reuses nearby lines after seeks',async()=>{
 const p=player(path=>{const at=Number(path.split('=')[1]);return {line:at<12.25?{text:'첫 줄',from:0,until:12.25}:{text:'둘째 줄',from:12.25,until:90}};});
 p.run('setCurrentLyrics(current)');await flush();assert.equal(p.hud.textContent,'첫 줄');assert.equal(p.calls.length,1);
 for(const at of [1,4,9]){p.audio.currentTime=at;p.run('updateSyncedLyrics()');}await flush();assert.equal(p.calls.length,1);
 p.audio.currentTime=9.25;p.run('updateSyncedLyrics()');await flush();assert.equal(p.calls.length,2);assert.match(p.calls[1],/at=12\.25$/);assert.equal(p.hud.textContent,'첫 줄');
 p.audio.currentTime=12.25;p.run('updateSyncedLyrics()');assert.equal(p.hud.textContent,'둘째 줄');assert.equal(p.calls.length,2);
 p.audio.currentTime=12.2499;p.events.seeking();assert.equal(p.hud.textContent,'첫 줄');assert.equal(p.calls.length,2);
});
test('slow next-line requests do not flash a loading message or duplicate requests',async()=>{
 let resolveNext;const p=player(path=>Number(path.split('=')[1])<12?{line:{text:'첫 줄',from:0,until:12}}:new Promise(resolve=>{resolveNext=resolve;}));
 p.run('setCurrentLyrics(current)');await flush();p.audio.currentTime=10;p.events.timeupdate();
 for(const at of [11,12,12.5]){p.audio.currentTime=at;p.events.timeupdate();assert.equal(p.hud.textContent,'첫 줄');}assert.equal(p.calls.length,2);
 resolveNext({line:{text:'둘째 줄',from:12,until:90}});await flush();assert.equal(p.hud.textContent,'둘째 줄');
});
test('seeks prioritize the requested position and discard pending prefetch responses',async()=>{
 const pending=[];const p=player(path=>Number(path.split('=')[1])===0?{line:{text:'처음',from:0,until:12}}:new Promise(resolve=>pending.push(resolve)));
 p.run('setCurrentLyrics(current)');await flush();p.audio.currentTime=10;p.events.timeupdate();assert.equal(p.calls.length,2);
 p.audio.currentTime=45;p.events.seeking();assert.equal(p.calls.length,3);assert.match(p.calls[2],/at=45$/);assert.equal(p.hud.textContent,'♪');
 pending[1]({line:{text:'이동한 구간',from:40,until:90}});await flush();assert.equal(p.hud.textContent,'이동한 구간');
 pending[0]({line:{text:'다음 줄',from:12,until:20}});await flush();assert.equal(p.hud.textContent,'이동한 구간');assert.equal(p.calls.length,3);
});
test('failed prefetch retries with backoff and never retains an expired line indefinitely',async()=>{
 let now=100000,fail=true;const p=player(path=>{if(Number(path.split('=')[1])<12)return {line:{text:'첫 줄',from:0,until:12}};if(fail)throw new Error('offline');return {line:{text:'복구한 줄',from:12,until:90}};},class extends Date{static now(){return now;}});
 p.run('setCurrentLyrics(current)');await flush();p.audio.currentTime=10;p.events.timeupdate();await flush();assert.equal(p.hud.textContent,'첫 줄');
 p.audio.currentTime=12;p.events.timeupdate();assert.equal(p.hud.textContent,'첫 줄');assert.equal(p.calls.length,2);
 p.audio.currentTime=14;p.events.timeupdate();assert.equal(p.hud.textContent,'♪');assert.equal(p.calls.length,2);
 fail=false;now+=5001;p.events.timeupdate();await flush();assert.equal(p.hud.textContent,'복구한 줄');assert.equal(p.calls.length,3);
});
test('prefetch does not cross the guest preview limit or fetch while paused',async()=>{
 const p=player(()=>({line:{text:'마지막 미리 듣기',from:0,until:60}}));p.context.me=null;p.audio.currentTime=58;p.run('setCurrentLyrics(current)');await flush();assert.equal(p.calls.length,1);
 p.audio.currentTime=60;p.events.timeupdate();assert.match(p.hud.textContent,/로그인/);assert.equal(p.calls.length,1);
 const paused=player(()=>({line:{text:'첫 줄',from:0,until:12}}));paused.audio.paused=true;paused.audio.currentTime=10;paused.run('setCurrentLyrics(current)');await flush();assert.equal(paused.calls.length,1);
});
test('precise cue boundaries do not round backwards and repeated playback keeps a bounded cache',async()=>{
 const precise=player(path=>Number(path.split('=')[1])<1.001?{line:{text:'첫 줄',from:0,until:1.001}}:{line:{text:'다음 줄',from:1.001,until:90}});
 precise.audio.currentTime=1.001;precise.run('setCurrentLyrics(current)');await flush();assert.equal(precise.hud.textContent,'다음 줄');assert.equal(precise.calls.length,1);assert.match(precise.calls[0],/at=1\.001$/);
 const p=player(path=>{const from=Math.floor(Number(path.split('=')[1])/5)*5;return {line:{text:String(from),from,until:from+5}};});
 p.run('setCurrentLyrics(current)');await flush();for(let at=0;at<=40;at++){p.audio.currentTime=at;p.events.timeupdate();await flush();assert.equal(p.hud.textContent,String(Math.floor(at/5)*5));assert.ok(p.run('lyricLines.length')<=3);}assert.equal(p.calls.length,9);
});
test('track changes discard pending lyric responses and guest preview stops at 60 seconds',async()=>{
 const pending=[];const p=player(()=>new Promise(resolve=>pending.push(resolve)));
 p.run('setCurrentLyrics(current)');p.run("current={...current,id:'next'};setCurrentLyrics(current)");assert.equal(p.calls.length,2);
 pending[0]({line:{text:'이전 곡',from:0,until:90}});await flush();assert.notEqual(p.hud.textContent,'이전 곡');
 pending[1]({line:{text:'현재 곡',from:0,until:90}});await flush();assert.equal(p.hud.textContent,'현재 곡');
 p.context.me=null;p.audio.currentTime=60;p.run('updateSyncedLyrics()');assert.match(p.hud.textContent,/로그인/);assert.equal(p.calls.length,2);
});
test('premium expiry removes full text from current and cached tracks',async()=>{
 const p=player(()=>({line:{text:'무료 한 줄',from:0,until:90}}));
 p.run("current={...current,lyrics:'[00:00]전체 가사',lyrics_access:'full',lyrics_access_until:Date.now()/1000+1000};trackMap.set(current.id,current);setCurrentLyrics(current)");
 assert.equal(p.hud.textContent,'전체 가사');assert.equal(p.calls.length,0);
 p.run('current.lyrics_access_until=1;updateSyncedLyrics()');await flush();
 assert.equal(p.context.current.lyrics,'');assert.equal(p.context.trackMap.get('song').lyrics,'');assert.equal(p.hud.textContent,'무료 한 줄');
});
