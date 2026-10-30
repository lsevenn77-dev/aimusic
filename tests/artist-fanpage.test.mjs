import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {artistImageDimensions} from '../server/artist-images.js';

const base='/api/artists/artist';
test('settings reject visitors, foreign photos, excess selection, stale revisions and invalid focus',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call(base+'/fanpage','PATCH',{revision:0},null)).status,401);
 assert.equal((await f.call(base+'/fanpage','PATCH',{revision:0},'other')).status,403);
 assert.equal((await f.call(base+'/fanpage','PATCH',{revision:0,carousel_ids:['foreign']})).status,400);
 for(let i=0;i<20;i++)f.sql.prepare('INSERT INTO artist_photos VALUES(?,?,?,?,?)').run('p'+i,'artist','v'+i,'image/png',i);
 assert.equal((await f.call(base+'/fanpage','PATCH',{revision:0,carousel_ids:Array.from({length:11},(_,i)=>'p'+i)})).status,400);
 assert.equal((await f.call(base+'/fanpage','PATCH',{revision:0,mobile_x:101})).status,400);
 const r=await f.call(base+'/fanpage','PATCH',{revision:0,carousel_ids:['p2','p1'],photo_order:['p2','p1'],intro:'소개',style:'팝',world:'세계관',desktop_x:30,mobile_y:70});assert.equal(r.status,200);
 assert.equal((await f.call(base+'/fanpage','PATCH',{revision:0,intro:'stale'})).status,409);
 const d=(await f.call(base)).body;assert.equal(d.gallery[0].id,'p2');assert.equal(d.gallery.length,20);assert.deepEqual(d.fanpage.carousel_ids,['p2','p1']);assert.equal(d.fanpage.mobile_y,70);
 f.sql.exec("INSERT INTO artist_operators VALUES('artist','other')");assert.equal((await f.call(base+'/fanpage','PATCH',{revision:1,intro:'approved'},'other')).status,200);
});
test('artist posts are separate from song comments and enforce authorship, official news, replies, pins, likes and reports',async t=>{
 const f=await fixture(t),url=base+'/posts',post={body:'응원합니다 <script>alert(1)</script>',request_id:'once'};
 assert.equal((await f.call(url,'POST',post,null)).status,401);
 assert.equal((await f.call(url,'POST',{...post,kind:'news',title:'무단 소식'},'other')).status,403);
 const created=await f.call(url,'POST',post,'other');assert.equal(created.status,201);const pid=created.body.id;
 assert.equal((await f.call(url,'POST',post,'other')).body.id,pid);
 assert.equal((await f.call(url,'POST',{...post,request_id:'duplicate'},'other')).status,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM comments').get().n,0);
 assert.equal((await f.call(url+'/'+pid,'PATCH',{body:'변경',revision:0})).status,403);
 assert.equal((await f.call(url+'/'+pid,'PATCH',{body:'변경',revision:0},'other')).status,200);
 assert.equal((await f.call(url+'/'+pid,'PATCH',{body:'충돌',revision:0},'other')).status,409);
 assert.equal((await f.call(url+'/'+pid+'/pin','PATCH',{pinned:true},'other')).status,403);
 assert.equal((await f.call(url+'/'+pid+'/pin','PATCH',{pinned:true})).status,200);
 await f.call(url+'/'+pid+'/like','PUT');await f.call(url+'/'+pid+'/like','PUT');assert.equal(f.sql.prepare('SELECT count(*) n FROM artist_fan_likes').get().n,1);
 const reply=await f.call(url,'POST',{body:'감사해요',request_id:'reply',parent_id:pid});assert.equal(reply.status,201);
 assert.equal((await f.call(url,'POST',{body:'잘못된 답글',request_id:'nested',parent_id:reply.body.id})).status,400);
 await f.call(url+'/'+pid+'/report','POST',{reason:'스팸'});await f.call(url+'/'+pid+'/report','POST',{reason:'스팸'});assert.equal(f.sql.prepare('SELECT count(*) n FROM artist_fan_reports').get().n,1);
 const news=await f.call(url,'POST',{kind:'news',title:'신곡 발매',body:'새 앨범을 소개합니다',request_id:'news'});assert.equal(news.status,201);
 const list=(await f.call(url+'?kind=news')).body.posts;assert.equal(list.length,1);assert.equal(list[0].official,1);
 f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('second','producer','Second',0)");assert.equal((await f.call('/api/artists/second/posts/'+pid,'DELETE')).status,404);
 assert.equal((await f.call(url+'/'+pid,'DELETE')).status,200);assert.equal((await f.call(url)).body.posts.length,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM artist_fan_likes').get().n,0);
});
test('posting is rate limited and blocking applies to posts and replies',async t=>{
 const f=await fixture(t);for(let i=0;i<6;i++)assert.equal((await f.call(base+'/posts','POST',{body:'응원 '+i,request_id:'r'+i},'other')).status,201);
 assert.equal((await f.call(base+'/posts','POST',{body:'도배',request_id:'spam'},'other')).status,429);
 f.sql.exec("INSERT INTO user_blocks VALUES('owner','other',0)");assert.equal((await f.call(base+'/posts','GET',null,'other')).status,403);
});
test('banner upload validates bytes/dimensions and enforces owner, delete, version and fallback contracts',async t=>{
 const objects=new Map(),BUCKET={put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),head:async k=>objects.has(k)?{size:objects.get(k).length,etag:k}:null,get:async k=>objects.has(k)?{body:objects.get(k)}:null},f=await fixture(t,{BUCKET});
 const png=readFileSync(new URL('../dist/assets/nova.png',import.meta.url));
 const send=async(who='owner',data=png)=>{const r=await worker.fetch(new Request('https://aifect.test'+base+'/banner',{method:'PUT',headers:{origin:'https://aifect.test','content-type':'image/png',...(who?{cookie:'aifect_session='+who}:{})},body:data}),{DB:f.DB,BUCKET},{waitUntil(){}});return {status:r.status,body:await r.json()};};
 assert.equal((await send(null)).status,401);assert.equal((await send('other')).status,403);assert.equal((await send('owner',new Uint8Array(12))).status,400);
 const tooBig=Buffer.from(png);tooBig.writeUInt32BE(9000,16);assert.equal((await send('owner',tooBig)).status,400);assert.equal(objects.size,0);
 const first=await send();assert.equal(first.status,200);const second=await send();assert.equal(objects.size,1);assert.notEqual(first.body.settings.banner_url,second.body.settings.banner_url);
 assert.equal((await f.call(base+'/banner','DELETE',null,'other')).status,403);assert.equal((await f.call(base+'/banner','DELETE')).status,200);assert.equal(objects.size,0);assert.equal((await f.call(base)).body.fanpage.banner_url,'');
 assert.deepEqual(artistImageDimensions(png,'image/png'),[1254,1254]);
});
test('fanpage rendering handles photo counts and escapes all authored content',()=>{
 const context={document:{addEventListener(){}},icon:()=>'',portrait:()=>'',esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),number:String,followed:()=>false,artistMusicList:()=>'',me:{id:'owner'}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/artist-fanpage.js',import.meta.url),'utf8'),context);
 for(const count of [0,1,3,10,20]){
  const photos=Array.from({length:count},(_,i)=>({id:'p'+i,url:'/media/p'+i})),d={profile:{name:'<img onerror=evil>',bio:'소개'},tracks:[],followers:0,gallery:photos,fanpage:{carousel_ids:photos.slice(0,10).map(p=>p.id)},lounge:[{id:'post',name:'<script>',body:'<script>alert(1)</script>',created:1,kind:'lounge'}]};
  const html=context.artistFanpageHTML(d,'artist','lounge');assert.equal((html.match(/class="fan-card"/g)||[]).length,Math.min(count,10));assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script>/);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  const gallery=context.artistFanpageHTML(d,'artist','gallery');assert.equal((gallery.match(/class="artist-photo"/g)||[]).length,count);
 }
});

test('legacy migration preserves 30 photos and selects only ten without overriding saved settings',async t=>{
 const f=await fixture(t);for(let i=0;i<30;i++)f.sql.prepare('INSERT INTO artist_photos VALUES(?,?,?,?,?)').run('p'+i,'artist','v'+i,'image/png',i);
 const migration=readFileSync(new URL('../drizzle/0081_artist_fanpage_photo_defaults.sql',import.meta.url),'utf8');f.sql.exec(migration);
 const s=(await f.call(base)).body;assert.equal(s.gallery.length,30);assert.equal(s.fanpage.carousel_ids.length,10);assert.equal(s.fanpage.carousel_ids[0],'p29');
 f.sql.exec("UPDATE artist_fanpages SET carousel_ids='[]',intro='custom'");f.sql.exec(migration);assert.equal((await f.call(base)).body.fanpage.intro,'custom');assert.equal((await f.call(base)).body.fanpage.carousel_ids.length,0);
});

test('carousel advances one card, loops, pauses for interaction/reduced motion, and cleans up each route',()=>{
 class Target{constructor(){this.events=new Map();}addEventListener(k,fn){if(!this.events.has(k))this.events.set(k,new Set());this.events.get(k).add(fn);}removeEventListener(k,fn){this.events.get(k)?.delete(fn);}fire(k,e={}){for(const fn of this.events.get(k)||[])fn(e);}}
 const document=new Target(),carousel=new Target(),reduced=new Target(),timers=new Map(),cleanups=[];let serial=0;
 const count={textContent:''},cards=Array.from({length:3},()=>({style:{setProperty(){}},dataset:{},setAttribute(){}}));
 carousel.querySelectorAll=()=>cards;carousel.querySelector=s=>s==='[data-fan-count]'?count:null;carousel.contains=()=>false;
 const root={dataset:{fanArtist:'artist'},querySelector:s=>s==='.fan-carousel'?carousel:null,querySelectorAll:()=>[]};document.querySelector=()=>root;reduced.matches=false;document.hidden=false;
 const context={document,matchMedia:()=>reduced,registerRouteCleanup:fn=>cleanups.push(fn),setInterval:(fn,ms)=>{assert.equal(ms,5000);timers.set(++serial,fn);return serial;},clearInterval:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/artist-fanpage.js',import.meta.url),'utf8'),context);vm.runInContext("artistFanData={aid:'artist'}",context);context.bindArtistFanpage();
 assert.equal(timers.size,1);assert.equal(count.textContent,'01 / 03');
 [...timers.values()][0]();assert.equal(count.textContent,'02 / 03');[...timers.values()][0]();[...timers.values()][0]();assert.equal(count.textContent,'01 / 03');assert.equal(timers.size,1);
 carousel.fire('mouseenter');assert.equal(timers.size,0);carousel.fire('mouseleave');assert.equal(timers.size,1);
 carousel.fire('focusin');assert.equal(timers.size,0);carousel.fire('focusout');assert.equal(timers.size,1);
 carousel.fire('pointerdown',{pointerType:'touch',clientX:150,clientY:100});assert.equal(timers.size,0);document.fire('pointerup',{clientX:50,clientY:102});assert.equal(count.textContent,'02 / 03');assert.equal(timers.size,1);
 reduced.matches=true;reduced.fire('change');assert.equal(timers.size,0);reduced.matches=false;reduced.fire('change');assert.equal(timers.size,1);
 document.hidden=true;document.fire('visibilitychange');assert.equal(timers.size,0);document.hidden=false;document.fire('visibilitychange');assert.equal(timers.size,1);
 cleanups.pop()();assert.equal(timers.size,0);assert.equal(document.events.get('pointerup').size,0);
 cards.splice(1);context.bindArtistFanpage();assert.equal(timers.size,0);cleanups.pop()();assert.equal(carousel.events.get('mouseenter').size,0);
});
