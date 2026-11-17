import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/home.js',import.meta.url),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tracks=Array.from({length:4},(_,i)=>({id:'song-'+(i+1),title:'Title '+(i+1),artist:'Artist '+(i+1),description:'Description '+(i+1),chart_rank:i+1,cover_version:'art-'+(i+1)}));

function setup(items=tracks,{reduced=false,initialId}={}){
 const events=new Map(),documentEvents=new Map(),motionEvents=new Map(),timers=new Map(),fades=new Map(),outgoing=[];let serial=0,audioCalls=0;
 const document={hidden:false,activeElement:null,addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:(name,fn)=>{if(documentEvents.get(name)===fn)documentEvents.delete(name);},createElement:()=>({attributes:{},setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,fn){this[name]=fn;},remove(){const index=outgoing.indexOf(this);if(index>=0)outgoing.splice(index,1);}})};
 const motion={matches:reduced,addEventListener:(name,fn)=>motionEvents.set(name,fn),removeEventListener:(name,fn)=>{if(motionEvents.get(name)===fn)motionEvents.delete(name);}};
 const classes=new Set(),stage={innerHTML:'',classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},append:node=>outgoing.push(node)};
 let dots=[];
 const feature={isConnected:true,matches:()=>false,querySelector:()=>stage,querySelectorAll:()=>dots,contains:node=>node===feature||dots.includes(node),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}};
 const root={isConnected:true,querySelector:()=>feature};
 const c=vm.createContext({document,window:{matchMedia:()=>motion},AbortController,homeBrowseObserver:null,esc,icon:name=>'<svg data-icon="'+name+'"></svg>',trackArtworkPath:track=>'/media/'+track.id+'/cover?v='+track.cover_version,credits:track=>'<a href="#artist/'+track.id+'">'+esc(track.artist)+'</a>',cover:()=>'',songTable:rows=>'<div class="song-table-chart">'+rows.map(track=>'<article data-song-row="'+track.id+'"></article>').join('')+'</div>',audio:{paused:false,play(){audioCalls++;},pause(){audioCalls++;},addEventListener(){audioCalls++;}},current:{id:'already-playing'},setTimeout:(fn,delay)=>{assert.ok(delay===6000||delay===400);(delay===6000?timers:fades).set(++serial,fn);return serial;},clearTimeout:id=>{timers.delete(id);fades.delete(id);}});
 vm.runInContext(source,c);
 function paint(list,id){
  root.innerHTML=c.homeChartHTML(list,{initialId:id});
  const featured=c.homeChartFeatureTracks(list),index=Math.max(0,featured.findIndex(item=>item.track.id===id));
  stage.innerHTML=featured.length?c.homeChartSlideHTML(featured[index]):'';
  dots=featured.length>1?featured.map((_,i)=>({dataset:{homeChartSlide:String(i)},'aria-pressed':String(i===index),setAttribute(name,value){this[name]=value;},closest:()=>dots[i],focus(){document.activeElement=this;events.get('focusin')?.({target:this});}})):[];
 }
 paint(items,initialId);
 const controller=new AbortController(),mount=(list=items,id=initialId)=>c.mountHomeChartCarousel(root,list,{signal:controller.signal,initialId:id});
 const fire=(name,event={})=>events.get(name)?.(event),advance=()=>{const fn=[...timers.values()][0];timers.clear();fn?.();};
 const select=index=>fire('click',{target:dots[index]});
 return {c,root,feature,stage,classes,get dots(){return dots;},outgoing,document,motion,events,documentEvents,motionEvents,timers,fades,controller,mount,paint,fire,advance,select,get audioCalls(){return audioCalls;}};
}

test('chart features keep table order and real ranks, with only hollow four-point rank sparkles',()=>{
 const f=setup(),ordered=[tracks[1],tracks[0],tracks[2],tracks[3]];
 assert.deepEqual(Array.from(f.c.homeChartFeatureTracks(ordered),item=>item.rank),[2,1,3]);
 const html=f.c.homeChartHTML(ordered),feature=html.slice(html.indexOf('<aside'));
 assert.match(feature,/data-home-chart-id="song-2"/);assert.equal((feature.match(/class="home-chart-sparkle"/g)||[]).length,2);
 assert.match(feature,/home-chart-rank-label">인기차트 2위/);assert.match(feature,/fill="none" stroke="currentColor"/);
 assert.equal((feature.match(/data-home-chart-slide=/g)||[]).length,3);
 assert.doesNotMatch(feature,/song-4|crown|ribbon|<[^>]+>\s*[123]위\s*</);
 assert.equal((html.match(/data-song-row=/g)||[]).length,4);
 const emptyDescription=f.c.homeChartSlideHTML({track:{...tracks[0],description:''},rank:1});
 assert.match(emptyDescription,/<p><\/p>/);
 const escaped=f.c.homeChartSlideHTML({track:{...tracks[0],title:'<unsafe>',description:'<script>bad</script>'},rank:1});
 assert.match(escaped,/&lt;unsafe&gt;/);assert.match(escaped,/&lt;script&gt;bad&lt;\/script&gt;/);assert.doesNotMatch(escaped,/<script>/);
});

test('six-second rotation changes artwork, song details, rank and playback target together without playing audio',()=>{
 const f=setup();f.mount();assert.equal(f.timers.size,1);
 for(const number of [2,3,1]){
  f.advance();const html=f.stage.innerHTML;
  assert.match(html,new RegExp('data-home-chart-id="song-'+number+'"'));
  assert.match(html,new RegExp('Title '+number));assert.match(html,new RegExp('Artist '+number));assert.match(html,new RegExp('Description '+number));
  assert.match(html,new RegExp('data-play="song-'+number+'"'));
  assert.equal((html.match(new RegExp('/media/song-'+number+'/cover\\?v=art-'+number,'g'))||[]).length,2);
  assert.equal((html.match(/class="home-chart-sparkle"/g)||[]).length,4-number);
  assert.equal(f.dots[number-1]['aria-pressed'],'true');assert.equal(f.outgoing.length,1);assert.equal(f.outgoing[0].inert,true);assert.equal(f.outgoing[0].attributes['aria-hidden'],'true');
  assert.equal(f.timers.size,1);assert.equal(f.fades.size,1);
 }
 assert.equal(f.audioCalls,0);assert.equal(f.c.audio.paused,false);assert.equal(f.c.current.id,'already-playing');
});

test('dot selection and keyboard navigation preserve focusable controls and do not hijack song or play clicks',()=>{
 const f=setup();f.mount();const originalDot=f.dots[0];f.select(2);
 assert.match(f.stage.innerHTML,/data-play="song-3"/);assert.equal(f.dots[0],originalDot);
 let prevented=0;
 f.fire('keydown',{target:f.dots[2],key:'ArrowLeft',preventDefault(){prevented++;}});
 assert.match(f.stage.innerHTML,/data-play="song-2"/);assert.equal(f.document.activeElement,f.dots[1]);assert.equal(f.timers.size,0);
 f.fire('keydown',{target:f.dots[1],key:'Home',preventDefault(){prevented++;}});assert.match(f.stage.innerHTML,/data-play="song-1"/);
 f.fire('keydown',{target:f.dots[0],key:'ArrowLeft',preventDefault(){prevented++;}});assert.match(f.stage.innerHTML,/data-play="song-3"/);
 f.fire('keydown',{target:f.dots[2],key:'End',preventDefault(){prevented++;}});assert.equal(f.document.activeElement,f.dots[2]);
 const before=f.stage.innerHTML,other={closest:()=>null};
 f.fire('click',{target:other});f.fire('keydown',{target:other,key:'ArrowRight',preventDefault(){assert.fail('Song links must keep their own keyboard behavior');}});
 assert.equal(f.stage.innerHTML,before);assert.equal(prevented,4);assert.equal(f.audioCalls,0);
});

test('hover, focus, visibility and reduced motion pause and resume without duplicate timers',()=>{
 const f=setup();f.mount();
 f.fire('pointerenter',{pointerType:'touch'});assert.equal(f.timers.size,1);
 f.fire('pointerenter',{pointerType:'mouse'});assert.equal(f.timers.size,0);f.fire('pointerleave');assert.equal(f.timers.size,1);
 f.fire('focusin');assert.equal(f.timers.size,0);f.fire('focusout',{relatedTarget:f.dots[0]});assert.equal(f.timers.size,0);f.fire('focusout',{relatedTarget:null});assert.equal(f.timers.size,1);
 f.document.hidden=true;f.documentEvents.get('visibilitychange')();assert.equal(f.timers.size,0);
 f.document.hidden=false;f.documentEvents.get('visibilitychange')();f.documentEvents.get('visibilitychange')();assert.equal(f.timers.size,1);
 f.advance();assert.equal(f.outgoing.length,1);f.motion.matches=true;f.motionEvents.get('change')();
 assert.equal(f.timers.size,0);assert.equal(f.fades.size,0);assert.equal(f.outgoing.length,0);
 f.select(2);assert.match(f.stage.innerHTML,/song-3/);assert.equal(f.outgoing.length,0);assert.equal(f.timers.size,0);
 f.motion.matches=false;f.motionEvents.get('change')();assert.equal(f.timers.size,1);
});

test('abort and home cleanup dispose timers, transitions and listeners, including stale callbacks',()=>{
 const f=setup(),cleanup=f.mount();f.advance();
 const staleTimer=[...f.timers.values()][0],staleFade=[...f.fades.values()][0],staleVisibility=f.documentEvents.get('visibilitychange');
 f.controller.abort();cleanup();
 assert.equal(f.timers.size,0);assert.equal(f.fades.size,0);assert.equal(f.outgoing.length,0);assert.equal(f.events.size,0);assert.equal(f.documentEvents.size,0);assert.equal(f.motionEvents.size,0);
 const html=f.stage.innerHTML;staleTimer();staleFade();staleVisibility();assert.equal(f.timers.size,0);assert.equal(f.stage.innerHTML,html);
 const next=setup();next.c.ownedCleanup=next.mount();next.c.controller=next.controller;
 vm.runInContext('homeChartCarouselCleanup=ownedCleanup;homeRequestController=controller;cleanupHome();',next.c);
 assert.equal(next.controller.signal.aborted,true);assert.equal(next.timers.size,0);assert.equal(next.events.size,0);assert.equal(next.documentEvents.size,0);
});

test('zero, one and two results are safe, preserve partial ranks and retain the selected song on repaint',()=>{
 const empty=setup([]);assert.equal(empty.mount(),undefined);assert.doesNotMatch(empty.root.innerHTML,/home-chart-feature/);
 const lower=setup([tracks[3]]);assert.equal(lower.mount(),undefined);assert.doesNotMatch(lower.root.innerHTML,/home-chart-feature/);
 const one=setup([tracks[1]]);one.mount();assert.equal(one.timers.size,0);assert.doesNotMatch(one.root.innerHTML,/home-chart-dots/);assert.equal((one.stage.innerHTML.match(/class="home-chart-sparkle"/g)||[]).length,2);
 const two=setup(tracks.slice(0,2));let cleanup=two.mount();assert.equal(two.dots.length,2);two.advance();assert.equal(cleanup.currentId(),'song-2');two.advance();assert.equal(cleanup.currentId(),'song-1');
 two.select(1);const selected=cleanup.currentId();cleanup();const fresh=[{...tracks[1],chart_rank:1,description:'Fresh description'},{...tracks[0],chart_rank:2}];
 two.paint(fresh,selected);cleanup=two.mount(fresh,selected);assert.equal(two.timers.size,1);assert.equal(cleanup.currentId(),'song-2');assert.match(two.stage.innerHTML,/Fresh description/);assert.equal((two.stage.innerHTML.match(/class="home-chart-sparkle"/g)||[]).length,3);
 cleanup();two.paint([tracks[0]],'removed-song');cleanup=two.mount([tracks[0]],'removed-song');assert.equal(cleanup.currentId(),'song-1');assert.equal(two.timers.size,0);
 const reduced=setup(tracks,{reduced:true});reduced.mount();assert.equal(reduced.timers.size,0);
});

test('rapid changes keep only the newest fade, and a disconnected card cannot keep rotating',()=>{
 const f=setup();f.mount();f.advance();const old=f.outgoing[0],oldFallback=[...f.fades.values()][0];
 f.select(2);const latest=f.outgoing[0];assert.notEqual(latest,old);assert.equal(f.outgoing.length,1);assert.equal(f.fades.size,1);
 old.animationend({target:old});oldFallback();latest.animationend({target:{}});assert.equal(f.outgoing.length,1);
 latest.animationend({target:latest});assert.equal(f.outgoing.length,0);assert.equal(f.fades.size,0);assert.equal(f.classes.has('is-transitioning'),false);
 f.feature.isConnected=false;f.advance();assert.equal(f.timers.size,0);assert.equal(f.events.size,0);assert.equal(f.documentEvents.size,0);
});

test('only the other two featured covers are preloaded and image fallback covers both artwork layers',()=>{
 const f=setup(tracks,{initialId:'song-2'}),preloaded=[];
 f.c.Image=class{set src(value){preloaded.push(value);}};f.mount();
 assert.deepEqual(preloaded,['/media/song-1/cover?v=art-1','/media/song-3/cover?v=art-3']);
 f.c.bindHomeImages(f.feature);let writes=0;
 for(const wrapper of ['home-track-art','home-chart-backdrop']){
  let src='/broken-cover.webp';const img={tagName:'IMG',closest:selector=>selector.includes('.'+wrapper)?{}:null,getAttribute:()=>src,set src(value){writes++;src=value;}};
  f.fire('error',{target:img});assert.equal(src,'/assets/brand/20261117/aifect-icon-512.png');
  const after=writes;f.fire('error',{target:img});assert.equal(writes,after,'A broken fallback must not create an error loop');
 }
 assert.equal(writes,2);f.fire('error',{target:{tagName:'IMG',closest:()=>null,set src(_){assert.fail('Unrelated images must keep their own fallback');}}});
});
