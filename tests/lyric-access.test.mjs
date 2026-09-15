import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from '../shared/lyrics.js';
const source=readFileSync(new URL('../dist/lyrics.js',import.meta.url),'utf8');
function player(api){
 const hud={},calls=[],audio={currentTime:0,addEventListener(){}},track={id:'song',duration:90,lyrics_mode:'synced',lyrics_access:'line',lyrics:''};
 const context=vm.createContext({current:track,me:{id:'listener'},audio,trackMap:new Map([[track.id,track]]),AifectLyrics:core,api:async path=>{calls.push(path);return api(path);},$:sel=>sel==='#player-lyric'?hud:null,Date,esc:String,icon:()=>'',time:String});
 vm.runInContext(source,context);return {context,hud,calls,audio,run:s=>vm.runInContext(s,context)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('one-line client caches the interval and handles exact boundaries and backwards seeks',async()=>{
 const p=player(path=>{const at=Number(path.split('=')[1]);return {line:at<12.25?{text:'첫 줄',from:0,until:12.25}:{text:'둘째 줄',from:12.25,until:90}};});
 p.run('setCurrentLyrics(current)');await flush();assert.equal(p.hud.textContent,'첫 줄');assert.equal(p.calls.length,1);
 for(const at of [1,4,12.2499]){p.audio.currentTime=at;p.run('updateSyncedLyrics()');}await flush();assert.equal(p.calls.length,1);
 p.audio.currentTime=12.25;p.run('updateSyncedLyrics()');await flush();assert.equal(p.hud.textContent,'둘째 줄');assert.equal(p.calls.length,2);
 p.audio.currentTime=12.2499;p.run('updateSyncedLyrics()');await flush();assert.equal(p.hud.textContent,'첫 줄');assert.equal(p.calls.length,3);assert.match(p.calls[2],/at=12\.249$/);
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
