import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as core from '../shared/lyrics.js';
const source=readFileSync(new URL('../dist/lyrics.js',import.meta.url),'utf8');
function fixture(){
 let inserted=0,card=null,paused=0,focused=0;
 const button={dataset:{track:'song'},getAttribute(k){return this[k];},removeAttribute(k){delete this[k];},setAttribute(k,v){this[k]=v;},focus(){focused++;}};
 const follow={setAttribute(k,v){this[k]=v;}},events={};
 const owner={scrollTop:0,clientHeight:900,scrollHeight:5000,scrollTo(o){this.scrollTop=Math.max(0,o.top);this.lastScroll=o;}};
 const doc={body:{},scrollingElement:owner,addEventListener(k,fn){events[k]=fn;},removeEventListener(k){delete events[k];},querySelectorAll:()=>[{getBoundingClientRect:()=>({top:780,bottom:900,height:120})}]};
 const makeLine=()=>({active:false,classList:{toggle(name,value){this.owner.active=value;}},setAttribute(){},removeAttribute(){}});
 const column={insertAdjacentHTML(position,html){
  assert.equal(position,'afterbegin');inserted++;
  const lines=[...html.matchAll(/data-expanded-lyric="\d+"/g)].map((_,i)=>({...makeLine(),getBoundingClientRect:()=>({top:300+i*50-owner.scrollTop,height:44})}));
  lines.forEach(line=>line.classList.owner=line);
  card={isConnected:true,html,lines,parentElement:doc.body,addEventListener(k,fn){this[k]=fn;},scrolls:0,scrollIntoView(){this.scrolls++;},remove(){this.isConnected=false;},querySelector:s=>s==='.expanded-lyrics-close'?card.close:s==='.expanded-lyrics-follow'?follow:s==='header'?{getBoundingClientRect:()=>({height:60})}:null,querySelectorAll:()=>lines,close:{}};
 }};
 const audio={currentTime:0,paused:false,pause(){paused++;},addEventListener(){}};
 const track={id:'song',title:'One little touch',producer:'AIFECT',genre:'K-POP',lyrics_mode:'synced',lyrics:'[00:00]First\n[00:10]Second',lyrics_access:'full',lyrics_access_until:9999999999};
 const c=vm.createContext({document:doc,innerHeight:900,getComputedStyle:()=>({display:'block'}),matchMedia:()=>({matches:false}),me:{id:'premium'},current:track,audio,trackMap:new Map([[track.id,track]]),window:{},location:{hash:'#song/song'},AifectLyrics:core,esc:String,cover:()=>'<div class="album-art"></div>',icon:()=>'',time:()=>'',$:s=>s==='.song-main-column'?column:s==='#expanded-song-lyrics'&&card?.isConnected?card:s==='#lyrics-expand'?button:null});
 vm.runInContext(source,c);
 return {c,track,audio,events,owner,follow,button,get card(){return card;},get inserted(){return inserted;},get paused(){return paused;},get focused(){return focused;}};
}
test('the header lyrics button opens one full transcript without a sidebar panel',()=>{
 const f=fixture();assert.equal(f.card,null);assert.equal(f.c.$('#song-lyrics'),null);
 f.c.bindLyricsPanel();assert.equal(typeof f.button.onclick,'function');
 f.button.onclick();assert.equal(f.inserted,1);assert.equal(f.button['aria-expanded'],'true');
 assert.match(f.card.html,/>First</);assert.doesNotMatch(f.card.html,/00:00|00:10|lyric-line-time/);
 f.button.onclick();assert.equal(f.inserted,1);assert.equal(f.card.scrolls,2);
});
test('closing restores header focus and route cleanup removes listeners without pausing playback',()=>{
 const f=fixture();f.audio.currentTime=12;f.c.bindLyricsPanel();f.button.onclick();
 f.card.close.onclick();assert.equal(f.card.isConnected,false);assert.equal(f.focused,1);assert.equal(f.button['aria-expanded'],'false');
 assert.deepEqual(Object.keys(f.events),[]);assert.equal(f.audio.currentTime,12);assert.equal(f.paused,0);
 f.button.onclick();f.c.cleanupLyricsEditor();assert.equal(f.card.isConnected,false);assert.equal(f.button['aria-expanded'],'false');
 assert.deepEqual(Object.keys(f.events),[]);assert.equal(f.audio.currentTime,12);assert.equal(f.paused,0);
});
test('player lyric updates work without a sidebar and clear the highlight for another track',()=>{
 const f=fixture();f.c.bindLyricsPanel();f.button.onclick();
 assert.deepEqual(f.card.lines.map(x=>x.active),[true,false]);
 f.audio.currentTime=12;f.c.updateSyncedLyrics();assert.deepEqual(f.card.lines.map(x=>x.active),[false,true]);
 f.c.current={id:'other'};f.c.updateSyncedLyrics();assert.deepEqual(f.card.lines.map(x=>x.active),[false,false]);
});
test('guests and free listeners read every line on the song page without Premium controls',async()=>{
 for(const user of [null,{id:'free'}]){
  const f=fixture();f.c.me=user;
  f.c.trackMap.set(f.track.id,{...f.track,lyrics_access:'line',lyrics_access_until:null,lyrics:''});
  f.c.api=async path=>{assert.equal(path,'/api/tracks/song/lyrics/text');return {lines:['First','Last']};};
  f.c.bindLyricsPanel();await f.button.onclick();f.c.clearFullLyrics();f.c.updateExpandedLyrics();
  assert.equal(f.c.location.hash,'#song/song');assert.ok(f.card.isConnected);assert.match(f.card.html,/>Last<\/p>/);
  assert.doesNotMatch(f.card.html,/data-seek|expanded-lyrics-follow/);assert.equal(f.button['aria-expanded'],'true');
 }
});
test('a late text response cannot open lyrics on another song',async()=>{
 const f=fixture();f.c.me=null;let finish;
 f.c.api=()=>new Promise(resolve=>{finish=resolve;});
 f.c.bindLyricsPanel();const opening=f.button.onclick();
 const previous=f.c.$;f.c.$=s=>s==='#lyrics-expand'?null:previous(s);
 finish({lines:['Previous song']});await opening;assert.equal(f.inserted,0);
});
test('expanded transcript retains every line and uses the existing Premium seek action',()=>{
 const f=fixture();f.track.lyrics=Array.from({length:80},(_,i)=>'['+String(Math.floor(i*5/60)).padStart(2,'0')+':'+String(i*5%60).padStart(2,'0')+']Line '+(i+1)).join('\n');
 f.c.openExpandedLyrics(f.track);assert.equal(f.card.lines.length,80);assert.match(f.card.html,/data-expanded-lyric="79" data-lyric-index="79" data-seek="395" data-track="song"/);assert.match(f.card.html,/Line 80/);
});
test('follow starts without a sidebar, pauses on manual scroll and resumes from its own control',()=>{
 const f=fixture();f.track.lyrics=Array.from({length:30},(_,i)=>'['+String(Math.floor(i*5/60)).padStart(2,'0')+':'+String(i*5%60).padStart(2,'0')+']Line '+(i+1)).join('\n');f.audio.currentTime=100;
 f.c.bindLyricsPanel();f.button.onclick();assert.ok(f.owner.scrollTop>0);assert.equal(f.owner.lastScroll.behavior,'smooth');
 const position=f.owner.scrollTop;f.events.wheel();f.audio.currentTime=105;f.c.updateExpandedLyrics();assert.equal(f.owner.scrollTop,position);assert.equal(f.follow['aria-pressed'],'false');
 f.follow.onclick();assert.equal(f.follow['aria-pressed'],'true');assert.ok(f.owner.scrollTop>position);
 f.c.closeExpandedLyrics();assert.deepEqual(Object.keys(f.events),[]);assert.equal(f.paused,0);
});
