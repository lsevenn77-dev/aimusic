import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as core from '../shared/lyrics.js';
const source=readFileSync(new URL('../dist/lyrics.js',import.meta.url),'utf8');
function fixture({inline=false,native=false,userAgent=''}={}){
 let inserted=0,card=null,paused=0,focused=0;
 const button={dataset:{track:'song'},getAttribute(k){return this[k];},removeAttribute(k){delete this[k];},setAttribute(k,v){this[k]=v;},focus(options){focused++;this.focusOptions=options;}};
 const follow={setAttribute(k,v){this[k]=v;}},events={};
 const owner={scrollTop:0,clientHeight:900,scrollHeight:5000,scrollTo(o){this.scrollTop=Math.max(0,o.top);this.lastScroll=o;}};
 const doc={body:{},scrollingElement:owner,addEventListener(k,fn){events[k]=fn;},removeEventListener(k){delete events[k];},querySelectorAll:()=>[{getBoundingClientRect:()=>({top:780,bottom:900,height:120})}]};
 const makeLine=()=>({active:false,classList:{toggle(name,value){this.owner.active=value;}},setAttribute(){},removeAttribute(){}});
 function linesFromHTML(html){
  const lines=[...html.matchAll(/data-expanded-lyric="\d+"/g)].map((_,i)=>({...makeLine(),getBoundingClientRect:()=>({top:300+i*50-owner.scrollTop,height:44})}));
  lines.forEach(line=>line.classList.owner=line);
  return lines;
 }
 function makeCard(html){
  const section={isConnected:true,hidden:inline,html,lines:linesFromHTML(html),scrolls:0,scrollIntoView(){this.scrolls++;},remove(){this.isConnected=false;},close:{}};
  const body={
   set innerHTML(value){section.html=value;section.lines=linesFromHTML(value);},
   replaceChildren(){this.innerHTML='';}
  };
  section.querySelector=s=>s==='.expanded-lyrics-close'?section.close:s==='.song-detail-lyrics-lines'?body:s==='.expanded-lyrics-follow'?follow:null;
  section.querySelectorAll=()=>section.lines;
  section.contains=target=>target===section.close;
  return section;
 }
 if(inline)card=makeCard('');
 const column={insertAdjacentHTML(position,html){
  assert.equal(position,'afterbegin');inserted++;
  card=makeCard(html);
 }};
 const audio={currentTime:0,paused:false,pause(){paused++;},addEventListener(){}};
 const track={id:'song',title:'One little touch',producer:'AIFECT',genre:'K-POP',lyrics_mode:'synced',lyrics:'[00:00]First\n[00:10]Second',lyrics_access:'full',lyrics_access_until:9999999999};
 const select=selector=>{
  if(selector==='.song-main-column')return column;
  if(selector==='.song-main-column > .song-detail-lyrics')return inline?card:null;
  if(selector==='#expanded-song-lyrics')return card?.isConnected?card:null;
  return selector==='#lyrics-expand'?button:null;
 };
 const c=vm.createContext({document:doc,me:{id:'premium'},current:track,audio,trackMap:new Map([[track.id,track]]),inApp:native,window:{navigator:{userAgent}},location:{hash:'#song/song'},AifectLyrics:core,esc:String,time:()=>'',$:select});
 vm.runInContext(source,c);
 return {c,track,audio,events,owner,follow,button,get card(){return card;},get inserted(){return inserted;},get paused(){return paused;},get focused(){return focused;}};
}
test('the native header opens one existing popover without a sidebar panel',()=>{
 const f=fixture({native:true});assert.equal(f.c.songDetailLyricsHTML(),'');assert.equal(f.card,null);assert.equal(f.c.$('#song-lyrics'),null);
 f.c.bindLyricsPanel();assert.equal(typeof f.button.onclick,'function');
 f.button.onclick();assert.equal(f.inserted,1);assert.equal(f.button['aria-expanded'],'true');
 assert.match(f.card.html,/role="dialog" popover="manual"/);
 assert.match(f.card.html,/>First</);assert.doesNotMatch(f.card.html,/00:00|00:10|lyric-line-time/);
 f.button.onclick();assert.equal(f.inserted,1);assert.equal(f.card.scrolls,0);assert.doesNotMatch(f.card.html,/expanded-lyrics-track|expanded-lyrics-follow|album-art|K-POP|One little touch/);
});
test('the web transcript starts hidden and closes from the header and X without scrolling or pausing',()=>{
 const f=fixture({inline:true}),markup=f.c.songDetailLyricsHTML();
 assert.match(markup,/class="song-detail-lyrics" hidden/);
 assert.doesNotMatch(markup,/popover=|role="dialog"|expanded-lyrics-scroll/);
 assert.equal(f.card.hidden,true);
 f.c.bindLyricsPanel();
 f.audio.currentTime=12;
 f.button.onclick();
 assert.equal(f.card.hidden,false);assert.equal(f.button['aria-expanded'],'true');
 assert.match(f.card.html,/>Second</);assert.equal(f.card.lines[1].active,true);
 f.owner.scrollTop=230;
 f.button.onclick();
 assert.equal(f.card.hidden,true);assert.equal(f.button['aria-expanded'],'false');assert.equal(f.focused,0);
 f.button.onclick();f.c.document.activeElement=f.card.close;f.card.close.onclick();
 assert.equal(f.card.hidden,true);assert.equal(f.card.html,'');assert.equal(f.button.focusOptions.preventScroll,true);
 assert.equal(f.inserted,0);assert.equal(f.owner.scrollTop,230);assert.equal(f.audio.currentTime,12);assert.equal(f.paused,0);
 f.button.onclick();f.c.cleanupLyricsEditor();assert.equal(f.card.hidden,true);assert.deepEqual(Object.keys(f.events),[]);
});
test('Android and iOS in-app browser user agents skip the web transcript',()=>{
 for(const userAgent of ['Android WebView AIFECT-Mobile/1.0','iPhone AIFECT-Mobile/1.0']){
  assert.equal(fixture({userAgent}).c.songDetailLyricsHTML(),'');
 }
 assert.match(fixture({userAgent:'iPhone Mobile Safari'}).c.songDetailLyricsHTML(),/song-detail-lyrics/);
});
test('cancelled web lyric requests cannot reopen the reader or interfere with a newer request',async()=>{
 const f=fixture({inline:true}),requests=[];
 f.c.me=null;f.c.current=null;
 f.c.api=path=>{
  assert.equal(path,'/api/tracks/song/lyrics/text');
  return new Promise(resolve=>requests.push(resolve));
 };
 f.c.bindLyricsPanel();
 const cancelled=f.button.onclick();assert.equal(f.button['aria-busy'],'true');
 f.button.onclick();assert.equal(f.button['aria-busy'],undefined);
 const reopened=f.button.onclick();
 requests[0]({lines:['Old request']});await cancelled;
 assert.equal(f.card.hidden,true);assert.equal(f.button['aria-busy'],'true');
 requests[1]({lines:['New request']});await reopened;
 assert.equal(f.card.hidden,false);assert.match(f.card.html,/New request/);
 f.button.onclick();
 const navigated=f.button.onclick();
 f.c.location.hash='#song/other';
 requests[2]({lines:['Previous song']});await navigated;
 assert.equal(f.card.hidden,true);assert.equal(f.button['aria-busy'],undefined);
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
test('seeks and repeated opens keep the manual reading position',()=>{
 const f=fixture();f.c.bindLyricsPanel();f.button.onclick();f.owner.scrollTop=275;
 f.audio.currentTime=12;f.c.updateExpandedLyrics();f.button.onclick();
 assert.equal(f.owner.scrollTop,275);assert.equal(f.card.scrolls,0);assert.equal(f.card.lines[1].active,true);
});
test('free playback uses the server cue index for repeated text, never guessed timing',async()=>{
 const f=fixture();f.c.me={id:'free'};f.track.lyrics_access='line';f.track.duration=100;
 f.c.api=async()=>({lines:['Again','Again'],synced:true});
 await f.c.openExpandedLyrics(f.track);assert.deepEqual(f.card.lines.map(x=>x.active),[false,false]);
 vm.runInContext("lyricLines=[{id:'song',index:1,from:10,until:30}]",f.c);
 f.audio.currentTime=20;f.c.updateExpandedLyrics();assert.deepEqual(f.card.lines.map(x=>x.active),[false,true]);
 f.audio.currentTime=8;f.c.updateExpandedLyrics();assert.deepEqual(f.card.lines.map(x=>x.active),[false,false]);
});
test('player uses the current track and repeated requests on the same page do not navigate',()=>{
 const f=fixture();f.c.location.hash='#song/other';f.c.openPlayerLyrics();assert.equal(f.c.location.hash,'#song/song');f.c.bindLyricsPanel();assert.equal(f.inserted,1);
 f.c.location.hash='#song/song?covers=all';f.c.openPlayerLyrics();f.c.openPlayerLyrics();
 assert.equal(f.c.location.hash,'#song/song?covers=all');assert.equal(f.inserted,1);assert.equal(f.card.scrolls,0);assert.equal(f.paused,0);
});
