import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './fixture.mjs';
import {validateArtistBanner} from '../server/artist-banner-image.js';
import worker from '../server/index.js';
const base='/api/artists/artist/fanpage';
test('fan feeds hide blocked authors and reject blocked reply targets and invalid offsets',async t=>{
 const f=await fixture(t);
 const p=await f.call(base+'/posts','POST',{kind:'lounge',body:'응원합니다',request_id:'blocked-post'},'other');assert.equal(p.status,201);
 assert.equal((await f.call(base+'/posts')).body.items.length,1);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',0)");
 assert.equal((await f.call(base+'/posts')).body.items.length,0);
 assert.equal((await f.call(base+'/posts','POST',{kind:'lounge',body:'차단한 글에 답글',parent_id:p.body.id,request_id:'blocked-reply'})).status,403);
 for(const query of ['offset=0.5','offset=-1','offset=NaN','offset=100001','kind=invalid'])assert.equal((await f.call(base+'/posts?'+query)).status,400);
});
test('fan thread author can delete another reply but cannot edit it',async t=>{
 const f=await fixture(t),posts=base+'/posts';
 const root=(await f.call(posts,'POST',{body:'Thread',request_id:'root'},'other')).body.id;
 const child=(await f.call(posts,'POST',{body:'Reply',request_id:'child',parent_id:root},'owner')).body.id;
 const replies=posts+'/'+root+'/replies';
 for(const [who,allowed] of [[null,0],['other',1],['owner',1]]){
  assert.equal((await f.call(replies,'GET',null,who)).body.items[0].can_delete,allowed);
 }
 assert.equal((await f.call(posts+'/'+child,'DELETE',null,null)).status,401);
 assert.equal((await f.call(posts+'/'+child,'PUT',{body:'foreign'},'other')).status,403);
 assert.equal((await f.call(posts+'/'+root,'DELETE',null,'owner')).status,403);
 assert.equal((await f.call(posts+'/'+child,'DELETE',null,'other')).status,200);
 const after=(await f.call(replies)).body;
 assert.equal(after.parent_replies,0);assert.deepEqual(after.items,[]);
 assert.equal((await f.call(posts)).body.items[0].replies,0);
});
test('fanpage uploads preserve portrait originals while other photo uploads keep their crop flow',async()=>{
 const source=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8'),start=source.indexOf('async function uploadFile('),end=source.indexOf('async function playlistDialog(',start),crops=[],sent=[];
 class XHR{constructor(){this.upload={};this.status=201;this.responseText='{}';}open(){}setRequestHeader(){}send(file){sent.push(file);this.onload();this.onloadend();}}
 const context={cropPhoto:async(file,options)=>{crops.push(options.shape);return {...file,cropped:true};},optimizeUploadImage:async file=>file,invalidateReads(){},XMLHttpRequest:XHR,setTimeout:()=>1,clearTimeout(){}};
 nicknameContext(context);vm.runInContext(source.slice(start,end),context);const file={type:'image/webp',width:900,height:1200};
 await context.uploadFile('/api/artists/artist/gallery',file,undefined,{preserveAspectRatio:true});assert.equal(sent[0],file);assert.equal(crops.length,0);
 await context.uploadFile('/api/producers/producer/gallery',file);assert.equal(crops[0],'square');
 await context.uploadFile('/api/studio/artists/artist/image',file);assert.equal(crops[1],'circle');
});
test('fanpage owner settings, bounds, cross-artist access and legacy data preservation',async t=>{
 const f=await fixture(t),settings={focus_x:25,focus_y:65,mobile_x:80,mobile_y:30,introduction:'소개',concept:'Pop',world:'세계관'};
 assert.equal((await f.call(base,'PUT',settings,null)).status,401);assert.equal((await f.call(base,'PUT',settings,'other')).status,403);
 assert.equal((await f.call(base,'PUT',{...settings,focus_x:101})).status,400);
 assert.equal((await f.call(base,'PUT',settings)).status,200);
 const d=(await f.call('/api/artists/artist','GET',null,null)).body;
 assert.equal(d.fanpage.settings.mobile_x,80);assert.equal(d.fanpage.producer.id,'producer');assert.equal(d.tracks.length,3);assert.equal(d.can_manage,false);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,4);
});
test('gallery order and selection survive reload; ten selected maximum; legacy 30 photos kept',async t=>{
 const f=await fixture(t);for(let i=0;i<30;i++)f.sql.prepare('INSERT INTO artist_photos VALUES(?,?,?,?,?)').run('p'+i,'artist','v'+i,'image/webp',i);
 let gallery=(await f.call('/api/artists/artist')).body.gallery;assert.equal(gallery.length,30);assert.equal(gallery.filter(p=>p.carousel).length,10);
 const photos=[...gallery].reverse().map((p,i)=>({id:p.id,carousel:i<3}));
 assert.equal((await f.call(base+'/photos','PUT',{photos},'other')).status,403);
 assert.equal((await f.call(base+'/photos','PUT',{photos:photos.map(p=>({...p,carousel:true}))})).status,400);
 assert.equal((await f.call(base+'/photos','PUT',{photos:photos.slice(1)})).status,400);
 assert.equal((await f.call(base+'/photos','PUT',{photos})).status,200);
 gallery=(await f.call('/api/artists/artist')).body.gallery;assert.deepEqual(gallery.map(p=>p.id),photos.map(p=>p.id));assert.equal(gallery.filter(p=>p.carousel).length,3);
 assert.equal((await f.call('/api/artists/artist/gallery')).body.limit,20);
});
test('lounge permissions, retry idempotency, duplicate prevention, replies, likes and reports',async t=>{
 const f=await fixture(t),body={body:'<script>alert(1)</script>',request_id:'once',kind:'lounge'};
 assert.equal((await f.call(base+'/posts','POST',body,null)).status,401);
 const p=await f.call(base+'/posts','POST',body,'other');assert.equal(p.status,201);const pid=p.body.id;
 assert.equal((await f.call(base+'/posts','POST',body,'other')).body.id,pid);
 assert.equal((await f.call(base+'/posts','POST',{...body,request_id:'again'},'other')).status,409);
 assert.equal((await f.call(base+'/posts/'+pid,'PUT',{body:'hijack'})).status,403);
 assert.equal((await f.call(base+'/posts/'+pid+'/pin','PUT',{pinned:true},'other')).status,403);
 assert.equal((await f.call(base+'/posts/'+pid+'/pin','PUT',{pinned:true})).status,200);
 assert.equal((await f.call(base+'/posts/'+pid+'/like','PUT',{},'owner')).status,200);
 assert.equal((await f.call(base+'/posts/'+pid+'/like','PUT',{},'owner')).status,200);
 assert.equal((await f.call(base+'/posts/'+pid+'/report','POST',{reason:'spam'})).status,200);
 assert.equal((await f.call(base+'/posts/'+pid+'/report','POST',{reason:'spam'})).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM artist_fan_reports').get().n,1);
 assert.equal((await f.call(base+'/posts','POST',{kind:'lounge',body:'응원합니다',parent_id:pid,request_id:'reply'})).status,201);
 let feed=(await f.call(base+'/posts')).body;assert.equal(feed.items.length,1);assert.equal(feed.items[0].likes,1);assert.equal(feed.items[0].replies,1);assert.equal(feed.items[0].pinned,1);
 const replies=(await f.call(base+'/posts/'+pid+'/replies')).body;assert.equal(replies.items[0].official,1);
 assert.equal((await f.call(base+'/posts/'+pid,'DELETE',null,'other')).status,200);
 feed=(await f.call(base+'/posts')).body;assert.equal(feed.items[0].body,'');assert.equal(feed.items[0].deleted,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM comments').get().n,0);
 assert.equal((await f.call(base+'/posts/'+pid+'/like','PUT',{})).status,409);
});
test('official news ownership, pagination and cross-artist reply validation',async t=>{
 const f=await fixture(t),news={kind:'news',title:'신곡',body:'발매 소식',request_id:'news'};
 assert.equal((await f.call(base+'/posts','POST',news,'other')).status,403);
 assert.equal((await f.call(base+'/posts','POST',news)).status,201);
 assert.equal((await f.call(base+'/posts?kind=news')).body.items[0].official,1);
 f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('second','producer','Second',0)");
 const parent=(await f.call(base+'/posts?kind=news')).body.items[0].id;
 assert.equal((await f.call('/api/artists/second/fanpage/posts','POST',{body:'cross',kind:'news',parent_id:parent,request_id:'cross'})).status,400);
 for(let i=0;i<25;i++)f.sql.prepare("INSERT INTO artist_fan_posts(id,artist_id,user_id,kind,body,request_id,created) VALUES(?,'artist','other','lounge','page',?,?)").run('page'+i,'page'+i,i);
 const page=(await f.call(base+'/posts')).body;assert.equal(page.items.length,20);assert.equal(page.next,20);assert.equal((await f.call(base+'/posts?offset=20')).body.items.length,5);
});
test('server validates banner dimensions, not just MIME or filename',()=>{
 const png=new Uint8Array(45),v=new DataView(png.buffer);v.setUint32(16,1200);v.setUint32(20,800);assert.doesNotThrow(()=>validateArtistBanner(png,'image/png'));
 v.setUint32(16,9000);assert.throws(()=>validateArtistBanner(png,'image/png'),/320~8000/);assert.throws(()=>validateArtistBanner(new Uint8Array(24),'image/webp'));
});
test('banner upload uses existing R2 storage, enforces ownership, versions and deletion',async t=>{
 const objects=new Map(),BUCKET={put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),head:async k=>objects.has(k)?{size:objects.get(k).length}:null,get:async k=>({body:objects.get(k)})};
 const f=await fixture(t,{BUCKET}),photo=readFileSync(new URL('../dist/assets/nova.png',import.meta.url));
 const upload=async(who,bytes=photo,type='image/png')=>worker.fetch(new Request('https://aifect.test'+base+'/banner',{method:'PUT',headers:{Origin:'https://aifect.test',...(who?{Cookie:'aifect_session='+who}:{}),'content-type':type},body:bytes}),{DB:f.DB,BUCKET},{waitUntil(){}});
 assert.equal((await upload(null)).status,401);assert.equal((await upload('other')).status,403);assert.equal(objects.size,0);
 assert.equal((await upload('owner',new Uint8Array(24),'image/webp')).status,400);assert.equal(objects.size,0);
 assert.equal((await upload('owner')).status,200);const first=(await f.call(base)).body.settings.banner_version;assert.ok(first);
 const image=await worker.fetch(new Request('https://aifect.test/media/artist-banner/artist?v='+first),{DB:f.DB,BUCKET},{waitUntil(){}});assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/immutable/);
 assert.equal((await f.call(base+'/banner','DELETE',null,'other')).status,403);assert.equal((await f.call(base+'/banner','DELETE')).status,200);
 assert.equal((await f.call(base)).body.settings.banner_version,'');
});
test('creator approves operators, badges and delegated rights; operators cannot grant rights',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('operator-profile','other','Operator',0)");
 assert.equal((await f.call(base+'/operators','PUT',{producer_id:'operator-profile'},'other')).status,403);
 assert.equal((await f.call(base+'/operators','PUT',{producer_id:'operator-profile'})).status,200);
 const page=(await f.call('/api/artists/artist','GET',null,'other')).body;assert.equal(page.can_manage,true);assert.equal(page.can_edit_portrait,false);assert.equal(page.fanpage.operators[0].name,'Operator');
 assert.equal((await f.call(base+'/posts','POST',{kind:'news',title:'공식 소식',body:'공식 운영자 소식',request_id:'operator'},'other')).status,201);
 assert.equal((await f.call(base+'/posts?kind=news')).body.items[0].operator,1);
 assert.equal((await f.call(base+'/operators','DELETE',{producer_id:'operator-profile'})).status,200);
 assert.equal((await f.call(base+'/posts','POST',{kind:'news',body:'권한 만료',request_id:'revoked'},'other')).status,403);
 assert.equal((await f.call('/api/artists/artist','GET',null,'other')).body.can_manage,false);
});
function fanCarouselFixture({reduced=false,count=3}={}){
 const animations=[];const finishAnimations=()=>{for(const animation of animations.splice(0)){if(animation.cancelled||animation.finished)continue;if(animation.paused)animations.push(animation);else animation.finish();}};
 class Element extends EventTarget{
  constructor(tag='div',parent=null){
   super();this.tagName=tag.toUpperCase();this.parentElement=parent;this.dataset={};this.attrs={};this.captured=new Set();this.clientWidth=600;
   this.style={transform:'',transition:'',setProperty(k,v){this[k]=String(v);},removeProperty(k){const previous=this[k]||'';delete this[k];return previous;}};
   const classes=new Set();this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name),toggle(name,force){const add=force??!classes.has(name);if(add)classes.add(name);else classes.delete(name);return add;}};
  }
  setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  removeAttribute(k){delete this.attrs[k];if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())];}
  contains(el){return !!el&&(el===this||this.contains(el.parentElement));}
  hasAttribute(k){return k==='data-offset'?this.dataset.offset!==undefined:k in this.attrs;}
  matches(selector){return selector.split(',').some(part=>{const s=part.trim();if(s.startsWith('.'))return this.classList.contains(s.slice(1));if(s.startsWith('['))return this.hasAttribute(s.slice(1,-1));return this.tagName===s.toUpperCase();});}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){if(this.captured.delete(id)){const event=new Event('lostpointercapture');Object.defineProperty(event,'pointerId',{value:id});this.dispatchEvent(event);}}
  querySelector(){return null;}
  querySelectorAll(){return [];}
  animate(frames,options){assert.equal(options.duration,750);assert.equal(options.easing,'cubic-bezier(0.22, 1, 0.36, 1)');assert.ok(frames.every(f=>!f.transform.includes('rotate')&&!f.transform.includes('translateZ')));const animation={paused:false,cancelled:false,finished:false,pause(){this.paused=true;},play(){this.paused=false;},cancel(){this.cancelled=true;},finish(){if(this.finished||this.cancelled)return;this.finished=true;this.onfinish?.();}};animations.push(animation);return animation;}
 }
 const root=new Element(),carousel=new Element('section',root),stage=new Element('div',carousel),prev=new Element('button',carousel),next=new Element('button',carousel),pause=new Element('button',carousel),counter=new Element(),doc=new Element(),win=new Element(),media=new Element(),cards=Array.from({length:count},()=>new Element('button',stage)),dots=Array.from({length:count},()=>new Element('button',carousel)),timers=new Map(),cleanups=[];
 stage.classList.add('fan-card-stage');carousel.classList.add('fan-carousel');cards.forEach((card,i)=>{card.classList.add('fan-photocard');card.setAttribute('data-card-index',i);});dots.forEach((dot,i)=>dot.setAttribute('data-fan-dot',i));
 for(const [el,name] of [[carousel,'data-fan-carousel'],[prev,'data-fan-prev'],[next,'data-fan-next'],[pause,'data-fan-pause']])el.setAttribute(name,'');
 root.dataset.fanpage=JSON.stringify({aid:'artist',tab:'gallery',photos:[],settings:{},tracks:[]});root.isConnected=true;
 const elements={'[data-fan-carousel]':carousel,'.fan-card-stage':stage,'[data-fan-prev]':prev,'[data-fan-next]':next,'[data-fan-pause]':pause,'[data-fan-counter]':counter};
 root.querySelector=selector=>elements[selector]||null;carousel.querySelector=selector=>elements[selector]||null;
 root.querySelectorAll=selector=>selector==='[data-card-index]'?cards:selector==='[data-fan-dot]'?dots:[];doc.querySelector=()=>root;doc.hidden=false;doc.defaultView=win;media.matches=reduced;
 let serial=0,clock=0;class ClockDate extends Date{static now(){return clock;}}
 const context={URLSearchParams,location:{hash:'#artist/artist?tab=gallery'},document:doc,window:win,Date:ClockDate,performance:{now:()=>clock},getComputedStyle:el=>({transform:el.style.transform||'none',opacity:el.style.opacity||'1',filter:el.style.filter||'none',lineHeight:'20px'}),icon:()=>'',AbortController,matchMedia:()=>media,registerRouteCleanup:fn=>{cleanups.push(fn);return fn;},setTimeout(fn,ms){assert.equal(ms,7000);const key=++serial;timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key),requestAnimationFrame:fn=>{fn();return ++serial;},cancelAnimationFrame(){},queueMicrotask:fn=>fn()};nicknameContext(context);vm.runInContext(readFileSync(new URL('../dist/artist-fanpage.js',import.meta.url),'utf8'),context);context.bindArtistFanpage();
 const fire=(element,type,props={},elapsed=1000)=>{
  clock+=elapsed;if(elapsed>=750)finishAnimations();const event=new Event(type,{cancelable:true});
  const defaults=type.startsWith('pointer')?{pointerId:1,pointerType:'touch',button:0,isPrimary:true}:type==='click'?{detail:1}:{};
  for(const [key,value] of Object.entries({...defaults,target:element,...props}))Object.defineProperty(event,key,{value});
  element.dispatchEvent(event);
  // Pointer completion bubbles to the document even after capture leaves a card.
  if(element!==doc&&['pointerup','pointercancel'].includes(type))doc.dispatchEvent(event);
  return event;
 };
 const tick=()=>{clock+=7000;finishAnimations();const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());};
 const shift=()=>Number(/translateX\((-?[\d.]+)px\)/.exec(stage.style.transform||'')?.[1]||0);
 const cleanup=()=>cleanups.forEach(fn=>fn());
 return {context,root,carousel,stage,prev,next,pause,counter,doc,win,media,cards,dots,timers,cleanups,fire,tick,shift,finishAnimations,cleanup};
}
test('carousel timer pauses for hover, focus, touch and reduced motion; loops once and cleans up',()=>{
 const {context,carousel,stage,prev,next,pause,counter,doc,media,timers,cleanups,fire,tick,finishAnimations}=fanCarouselFixture();
 assert.equal(timers.size,1);assert.equal(counter.textContent,'01 / 03');tick();assert.equal(counter.textContent,'02 / 03');tick();tick();assert.equal(counter.textContent,'01 / 03');
 fire(carousel,'pointerenter',{pointerType:'mouse'});assert.equal(timers.size,0);fire(carousel,'pointerleave');assert.equal(timers.size,1);
 fire(carousel,'focusin');assert.equal(timers.size,0);fire(carousel,'focusout');assert.equal(timers.size,1);
 fire(carousel,'pointerdown',{target:stage,clientX:150,clientY:100});assert.equal(timers.size,0);fire(carousel,'pointermove',{clientX:40,clientY:110});fire(carousel,'pointerup',{clientX:40,clientY:110});assert.equal(counter.textContent,'02 / 03');
 fire(prev,'click');assert.equal(counter.textContent,'01 / 03');next.dispatchEvent(new Event('click'));assert.equal(counter.textContent,'01 / 03','ignore competing input during the transition');fire(next,'click');assert.equal(counter.textContent,'02 / 03');
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));fire(doc,'visibilitychange',{},10000);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));const held=counter.textContent;next.dispatchEvent(new Event('click'));assert.equal(counter.textContent,held,'a paused rear transition still owns its slot after tab restoration');finishAnimations();
 fire(pause,'click');assert.equal(timers.size,0);fire(pause,'click');assert.equal(timers.size,1);
 media.matches=true;fire(media,'change');assert.equal(timers.size,0);media.matches=false;fire(media,'change');assert.equal(timers.size,1);
 context.bindArtistFanpage();assert.equal(timers.size,1,'cached root replacement must dispose its previous timer');cleanups.forEach(fn=>fn());assert.equal(timers.size,0);context.bindArtistFanpage();assert.equal(timers.size,1);cleanups.at(-1)();assert.equal(timers.size,0);
});
test('mouse and touch drags follow the pointer, change one photo and suppress only the drag click',t=>{
 for(const pointerType of ['mouse','touch']){
  const f=fanCarouselFixture();t.after(f.cleanup);const {carousel,stage,cards,counter,fire}=f;
  fire(carousel,'pointerdown',{target:cards[0],pointerType,clientX:180,clientY:40});assert.equal(f.timers.size,0);assert.equal(carousel.hasPointerCapture(1),false);
  fire(carousel,'pointermove',{pointerType,clientX:100,clientY:43},16);assert.ok(f.shift()<0,'photos should follow a left drag before release');assert.equal(counter.textContent,'01 / 03');assert.equal(carousel.hasPointerCapture(1),true);
  fire(carousel,'pointerup',{pointerType,clientX:100,clientY:43},16);assert.equal(counter.textContent,'02 / 03');assert.equal(f.shift(),0);assert.equal(carousel.hasPointerCapture(1),false);
  assert.equal(fire(carousel,'click',{target:cards[0]},0).defaultPrevented,true,'release must not open the photo lightbox');
  fire(carousel,'pointerdown',{target:stage,pointerType,clientX:100,clientY:40});fire(carousel,'pointerup',{pointerType,clientX:102,clientY:41},20);
  assert.equal(fire(carousel,'click',{target:cards[1]},0).defaultPrevented,false,'a normal tap must remain usable');
 }
});
test('carousel controls do not start a drag and remain clickable',t=>{
 const f=fanCarouselFixture();t.after(f.cleanup);const {carousel,prev,next,pause,dots,counter,fire}=f;
 for(const target of [prev,next,pause,dots[1]]){
  fire(carousel,'pointerdown',{target,clientX:180,clientY:40});assert.equal(f.timers.size,1);
  fire(carousel,'pointermove',{clientX:90,clientY:40},16);fire(carousel,'pointerup',{clientX:90,clientY:40},16);
  assert.equal(counter.textContent,'01 / 03');assert.equal(f.shift(),0);assert.equal(carousel.hasPointerCapture(1),false);
 }
 fire(prev,'click');assert.equal(counter.textContent,'03 / 03');fire(next,'click');assert.equal(counter.textContent,'01 / 03');fire(dots[1],'click');assert.equal(counter.textContent,'02 / 03');fire(pause,'click');assert.equal(f.timers.size,0);
});
test('short horizontal drags return without opening a photo while vertical gestures allow scrolling',t=>{
 const f=fanCarouselFixture();t.after(f.cleanup);const {carousel,stage,counter,fire}=f;
 fire(carousel,'pointerdown',{target:stage,clientX:180,clientY:40});fire(carousel,'pointermove',{clientX:156,clientY:41},16);assert.ok(f.shift()<0);
 fire(carousel,'pointerup',{clientX:156,clientY:41},16);assert.equal(counter.textContent,'01 / 03');assert.equal(f.shift(),0);assert.equal(fire(carousel,'click',{},0).defaultPrevented,true);
 fire(carousel,'pointerdown',{target:stage,clientX:180,clientY:40});const vertical=fire(carousel,'pointermove',{clientX:175,clientY:110},16);
 assert.equal(vertical.defaultPrevented,false);assert.equal(f.shift(),0);assert.equal(carousel.hasPointerCapture(1),false);
 fire(carousel,'pointerup',{clientX:90,clientY:115},16);assert.equal(counter.textContent,'01 / 03','an established vertical gesture must not become a photo swipe');
});
test('another pointer and descendant capture loss cannot finish the active photo drag',t=>{
 const f=fanCarouselFixture();t.after(f.cleanup);const {carousel,stage,cards,counter,fire}=f;
 fire(carousel,'pointerdown',{target:stage,clientX:180,clientY:40});
 fire(carousel,'pointermove',{pointerId:2,clientX:90,clientY:40},16);fire(carousel,'pointerup',{pointerId:2,clientX:90,clientY:40},16);fire(carousel,'pointercancel',{pointerId:2},16);
 assert.equal(f.shift(),0);assert.equal(f.timers.size,0);assert.equal(counter.textContent,'01 / 03');
 fire(carousel,'pointermove',{clientX:90,clientY:40},16);assert.ok(f.shift()<0);
 fire(carousel,'lostpointercapture',{target:cards[0],pointerId:1},0);assert.ok(f.shift()<0,'implicit capture lost by a child must not cancel carousel capture');
 fire(carousel,'pointerup',{clientX:90,clientY:40},16);assert.equal(counter.textContent,'02 / 03');assert.equal(f.shift(),0);
});
test('cancelled photo drags recover without overriding manual pause or reduced motion',t=>{
 for(const reduced of [false,true])for(const paused of [false,true])for(const ending of ['pointercancel','lostpointercapture','blur']){
  const f=fanCarouselFixture({reduced});t.after(f.cleanup);const {carousel,stage,pause,counter,fire}=f;if(paused)fire(pause,'click');
  fire(carousel,'pointerdown',{target:stage,clientX:180,clientY:40});fire(carousel,'pointermove',{clientX:90,clientY:40},16);assert.ok(f.shift()<0);assert.equal(f.timers.size,0);
  if(ending==='blur')fire(f.win,'blur',{},16);else fire(carousel,ending,{pointerId:1},16);
  assert.equal(counter.textContent,'01 / 03');assert.equal(f.shift(),0);assert.equal(carousel.hasPointerCapture(1),false);assert.equal(f.timers.size,paused||reduced?0:1);
 }
});
test('artist introduction keeps escaped paragraphs and exposes its collapsed toggle',()=>{
 const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const context={esc:escape,number:String,portrait:()=>'',followed:()=>false,icon:()=>'',artistMusicList:()=>''};nicknameContext(context);vm.runInContext(readFileSync(new URL('../dist/artist-fanpage.js',import.meta.url),'utf8'),context);
 const bio='첫 번째 소개입니다.\n두 번째 줄 & 새로운 이야기.\n<script>소개 원문</script>';
 const html=context.artistFanpageHTML({profile:{name:'Artist',bio},tracks:[],gallery:[]},'artist');
 assert.ok(html.includes(escape(bio)),'expanding must be able to reveal every original paragraph');assert.doesNotMatch(html,/<script>소개 원문/);assert.match(html,/data-fan-bio(?:\s|>)/);
 const toggle=html.match(/<button\b[^>]*data-fan-bio-toggle[^>]*>/)?.[0];assert.ok(toggle);assert.match(toggle,/aria-expanded="false"/);assert.match(toggle,/aria-controls="[^"]+"/);assert.match(html,/\+더보기/);
});
test('photo counts, six tabs, XSS escaping and page-only compact music renderer',()=>{
 const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const context={document:{addEventListener(){}},esc:escape,number:String,portrait:()=>'',followed:()=>false,icon:()=>'',list:()=>'',remember(){},liked:()=>false,cover:()=>''};nicknameContext(context);
 for(const file of ['artist-gallery.js','artist-fanpage.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),context);
 for(const count of [0,1,3,10,20]){
  const d={profile:{name:'<script>x</script>',bio:'소개'},tracks:[],followers:2,gallery:Array.from({length:count},(_,i)=>({id:'p'+i,url:'/photo/'+i,carousel:i<10}))};
  const home=context.artistPageHTML(d,'artist');assert.equal((home.match(/data-card-index=/g)||[]).length,Math.min(count,10));assert.equal((home.match(/class="fan-card-float"/g)||[]).length,Math.min(count,10));assert.equal((home.match(/aria-current="page"/g)||[]).length,1);assert.doesNotMatch(home,/<script>x/);assert.match(home,/fan-home-columns/);assert.match(home,/fan-home-music/);assert.match(home,/fan-home-updates/);
  const gallery=context.artistPageHTML(d,'artist','gallery');assert.equal((gallery.match(/class="artist-photo"/g)||[]).length,count);
 }
 const css=readFileSync(new URL('../dist/list-actions.css',import.meta.url),'utf8');assert.match(css,/minmax\(0,220px\) 90px 110px/);
});

test('gallery file selection keeps its original aspect ratio before upload',async()=>{
 const handlers={};
 const context={document:{addEventListener(type,fn){handlers[type]=fn;}}};
 nicknameContext(context);vm.runInContext(readFileSync(new URL('../dist/image-crop.js',import.meta.url),'utf8'),context);
 const files=[{name:'portrait.png',type:'image/png',size:100}],input={files,isConnected:true,matches(selector){return selector.split(',').includes('#gallery-upload-form input[type=file]');}};
 await handlers.change({target:input});
 assert.equal(input.files,files,'gallery selection must not invoke the square crop editor or replace the original files');
});

test('header shares one action row and restricts settings without widening portrait permissions',()=>{
 const c={esc:v=>String(v??''),number:String,portrait:()=>'<div class="artist-portrait"></div>',followed:()=>true,icon:name=>name,artistMusicList:()=>''};nicknameContext(c);vm.runInContext(readFileSync(new URL('../dist/artist-fanpage.js',import.meta.url),'utf8'),c);
 const data={profile:{name:'Artist'},tracks:[],gallery:[]};
 const visitor=c.artistFanpageHTML(data,'artist');assert.doesNotMatch(visitor,/data-fan-menu-toggle/);assert.match(visitor,/aria-pressed="true"><span data-follow-label>팔로우중<\/span><\/button>/);assert.doesNotMatch(visitor,/팔로잉/);
 const owner=c.artistFanpageHTML({...data,can_manage:true},'artist');assert.equal((owner.match(/data-follow=/g)||[]).length,1);assert.equal((owner.match(/data-share /g)||[]).length,1);assert.match(owner,/data-fan-menu-toggle/);assert.match(owner,/id="fan-header-menu"[^>]+hidden/);assert.doesNotMatch(owner,/fan-photo-entry|fan-manage-actions|artist-image-change/);
 const operator=c.artistFanpageHTML({...data,can_manage:true,can_edit_portrait:false},'artist');assert.match(operator,/data-artist-image-pick disabled/);assert.doesNotMatch(operator,/data-artist-image="/);assert.match(operator,/data-fan-banner/);
});

test('fan post and reply APIs expose only public avatar metadata and refresh versions',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE producers SET image_version='photo-v1' WHERE id='producer'");
 const post=await f.call(base+'/posts','POST',{kind:'lounge',body:'사진 메타데이터',request_id:'avatar-post'});
 await f.call(base+'/posts','POST',{kind:'lounge',body:'사진 답글',parent_id:post.body.id,request_id:'avatar-reply'});
 for(const path of [base+'/posts',base+'/posts/'+post.body.id+'/replies']){
  const res=(await f.call(path)).body,p=res.items[0];
  assert.equal(p.profile_id,'producer');assert.equal(p.image_version,'photo-v1');
  assert.equal('email' in p,false);assert.equal('image_type' in p,false);
  if(path.endsWith('replies'))assert.equal(res.parent_replies,1);
 }
 f.sql.exec("UPDATE producers SET image_version='photo-v2' WHERE id='producer'");
 assert.equal((await f.call(base+'/posts')).body.items[0].image_version,'photo-v2');
 const other=await f.call(base+'/posts','POST',{kind:'lounge',body:'프로필 없음',request_id:'no-avatar'},'other');
 assert.equal((await f.call(base+'/posts')).body.items.find(p=>p.id===other.body.id).profile_id,null);
});

test('header prioritizes custom banner, returns to versioned portrait and then aurora',()=>{
 const c={esc:v=>String(v).replaceAll('"','&quot;')};nicknameContext(c);
 vm.runInContext(readFileSync(new URL('../dist/artist-fanpage.js',import.meta.url),'utf8'),c);
 const p={image_version:'v1'};
 const custom=c.fanHeaderBackground(p,{banner_version:'banner'},'artist');
 assert.match(custom,/\/media\/artist-banner\/artist\?v=banner/);assert.doesNotMatch(custom,/fan-header-profile/);
 const fallback=c.fanHeaderBackground(p,{},'artist');
 assert.match(fallback,/fan-background-blur/);assert.doesNotMatch(fallback,/fan-background-person/);
 assert.equal((fallback.match(/\/media\/artist\/artist\?v=v1/g)||[]).length,1);
 p.image_version='v2';assert.match(c.fanHeaderBackground(p,{},'artist'),/v=v2/);
 p.image_version='';assert.equal(c.fanHeaderBackground(p,{},'artist'),'');
});
