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
test('fanpage uploads preserve portrait originals while other photo uploads keep their crop flow',async()=>{
 const source=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8'),start=source.indexOf('async function uploadFile('),end=source.indexOf('async function playlistDialog(',start),crops=[],sent=[];
 class XHR{constructor(){this.upload={};this.status=201;this.responseText='{}';}open(){}setRequestHeader(){}send(file){sent.push(file);this.onload();this.onloadend();}}
 const context={cropPhoto:async(file,options)=>{crops.push(options.shape);return {...file,cropped:true};},optimizeUploadImage:async file=>file,invalidateReads(){},XMLHttpRequest:XHR,setTimeout:()=>1,clearTimeout(){}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);const file={type:'image/webp',width:900,height:1200};
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
test('carousel timer pauses for hover, focus, touch and reduced motion; loops once and cleans up',()=>{
 const animations=[];const finishAnimations=()=>{for(const animation of animations.splice(0))if(!animation.paused)animation.finish();else animations.push(animation);};
 class Element extends EventTarget{
  constructor(){super();this.dataset={};this.style={};this.attrs={};}
  setAttribute(k,v){this.attrs[k]=v;}
  contains(){return false;}
  hasAttribute(k){return k==='data-offset'?this.dataset.offset!==undefined:k in this.attrs;}
  animate(frames,options){assert.equal(options.duration,850);assert.equal(options.easing,'cubic-bezier(0.22, 1, 0.36, 1)');assert.ok(frames.every(f=>!f.transform.includes('rotate')&&!f.transform.includes('translateZ')));const animation={paused:false,pause(){this.paused=true;},play(){this.paused=false;},cancel(){},finish(){this.onfinish?.();}};animations.push(animation);return animation;}
 }
 const root=new Element(),carousel=new Element(),prev=new Element(),next=new Element(),pause=new Element(),counter=new Element(),doc=new Element(),media=new Element(),cards=Array.from({length:3},()=>new Element()),timers=new Map(),cleanups=[];
 root.dataset.fanpage=JSON.stringify({aid:'artist',tab:'gallery',photos:[],settings:{},tracks:[]});root.isConnected=true;root.contains=()=>false;
 root.querySelector=selector=>({'[data-fan-carousel]':carousel,'[data-fan-prev]':prev,'[data-fan-next]':next,'[data-fan-pause]':pause,'[data-fan-counter]':counter})[selector]||null;
 root.querySelectorAll=selector=>selector==='[data-card-index]'?cards:[];doc.querySelector=()=>root;doc.hidden=false;media.matches=false;
 let serial=0,clock=0;const context={document:doc,performance:{now:()=>clock},getComputedStyle:()=>({transform:'none',opacity:'1'}),icon:()=>'',AbortController,matchMedia:()=>media,registerRouteCleanup:fn=>{cleanups.push(fn);return fn;},setTimeout(fn,ms){assert.equal(ms,8000);const key=++serial;timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key),requestAnimationFrame:fn=>fn(),queueMicrotask:fn=>fn()};vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/artist-fanpage.js',import.meta.url),'utf8'),context);context.bindArtistFanpage();
 const fire=(element,type,props={})=>{clock+=1000;finishAnimations();return element.dispatchEvent(Object.assign(new Event(type),props));},tick=()=>{clock+=8000;finishAnimations();const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());};
 assert.equal(timers.size,1);assert.equal(counter.textContent,'01 / 03');tick();assert.equal(counter.textContent,'02 / 03');tick();tick();assert.equal(counter.textContent,'01 / 03');
 fire(carousel,'pointerenter',{pointerType:'mouse'});assert.equal(timers.size,0);fire(carousel,'pointerleave');assert.equal(timers.size,1);
 carousel.matches=()=>true;fire(carousel,'focusin');assert.equal(timers.size,0);fire(carousel,'focusout');assert.equal(timers.size,1);
 fire(carousel,'pointerdown',{clientX:150,clientY:100});assert.equal(timers.size,0);fire(carousel,'pointerup',{clientX:40,clientY:110});assert.equal(counter.textContent,'02 / 03');
 fire(prev,'click');assert.equal(counter.textContent,'01 / 03');next.dispatchEvent(new Event('click'));assert.equal(counter.textContent,'01 / 03','ignore competing input during the transition');fire(next,'click');assert.equal(counter.textContent,'02 / 03');
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));clock+=10000;doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));const held=counter.textContent;next.dispatchEvent(new Event('click'));assert.equal(counter.textContent,held,'a paused rear transition still owns its slot after tab restoration');finishAnimations();
 fire(pause,'click');assert.equal(timers.size,0);fire(pause,'click');assert.equal(timers.size,1);
 media.matches=true;fire(media,'change');assert.equal(timers.size,0);media.matches=false;fire(media,'change');assert.equal(timers.size,1);
 context.bindArtistFanpage();assert.equal(timers.size,1,'cached root replacement must dispose its previous timer');cleanups.forEach(fn=>fn());assert.equal(timers.size,0);context.bindArtistFanpage();assert.equal(timers.size,1);cleanups.at(-1)();assert.equal(timers.size,0);
});
test('photo counts, six tabs, XSS escaping and page-only compact music renderer',()=>{
 const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const context={document:{addEventListener(){}},esc:escape,number:String,portrait:()=>'',followed:()=>false,icon:()=>'',list:()=>'',remember(){},liked:()=>false,cover:()=>''};vm.createContext(context);
 for(const file of ['artist-gallery.js','artist-fanpage.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),context);
 for(const count of [0,1,3,10,20]){
  const d={profile:{name:'<script>x</script>',bio:'소개'},tracks:[],followers:2,gallery:Array.from({length:count},(_,i)=>({id:'p'+i,url:'/photo/'+i,carousel:i<10}))};
  const home=context.artistPageHTML(d,'artist');assert.equal((home.match(/data-card-index=/g)||[]).length,Math.min(count,10));assert.equal((home.match(/class="fan-card-float"/g)||[]).length,Math.min(count,10));assert.equal((home.match(/aria-current="page"/g)||[]).length,1);assert.doesNotMatch(home,/<script>x/);assert.match(home,/fan-home-columns/);assert.match(home,/fan-home-music/);assert.match(home,/fan-home-updates/);
  const gallery=context.artistPageHTML(d,'artist','gallery');assert.equal((gallery.match(/class="artist-photo"/g)||[]).length,count);
 }
 const css=readFileSync(new URL('../dist/list-actions.css',import.meta.url),'utf8');assert.match(css,/minmax\(0,220px\) 90px 110px/);
});
