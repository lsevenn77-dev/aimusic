import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
function context(extra={}){const c=vm.createContext({URLSearchParams,location:{hash:'#profile'},...extra});vm.runInContext(source('menu-integration.js'),c);return c;}

test('legacy menu routes preserve identifiers, repeated query parameters and canonical stability',()=>{
 const c=context(),cases={
  '#library':'#profile?view=library&section=likes',
  '#library/saved':'#profile?view=library&section=likes',
  '#gift-inventory':'#inventory',
  '#library/playlists':'#profile?view=library&section=playlists',
  '#library/history':'#profile?view=library&section=history',
  '#library/covers':'#profile?view=works&section=covers',
  '#library/originals':'#profile?view=works&section=originals',
  '#library/followers':'#community/following?people=followers',
  '#library/following':'#community/following?people=following',
  '#library/artists':'#community/following?people=following&kind=artists',
  '#library/producers':'#community/following?people=following&kind=producers',
  '#following':'#community/following','#payouts':'#studio/payouts','#rewards':'#gifts/rewards'
 };
 for(const [old,next] of Object.entries(cases)){assert.equal(c.menuAlias(old),next);assert.equal(c.menuAlias(next),null);}
 for(const old of Object.keys(cases)){const next=c.menuAlias(old+'?id=target-1&filter=saved&q=%ED%95%9C%EA%B8%80&tag=a&tag=b'),q=new URLSearchParams(next.split('?')[1]);assert.equal(q.get('id'),'target-1');assert.equal(q.get('filter'),'saved');assert.equal(q.get('q'),'한글');assert.deepEqual(q.getAll('tag'),['a','b']);assert.equal(c.menuAlias(next),null);}
 for(const route of ['#discover','#collections?sort=recent','#sing/one?duet=two','#dubbing/id','#relations','#notifications?filter=gifts','#admin/payouts','#producer/other?view=library'])assert.equal(c.menuAlias(route),null);
});

test('profile navigation carries filters and creates distinct, restorable tab destinations',()=>{
 const c=context();assert.equal(c.myTabHref('library','#profile?tag=keep&view=activity'),'#profile?tag=keep&view=library&section=likes');
 assert.equal(c.myTabHref('works','#profile?view=library&section=history&id=abc'),'#profile?view=works&id=abc');
});

test('login return survives an account-page reload and rejects unrelated or external destinations',()=>{
 const saved=new Map(),c=context({me:null,returnRoute:'#home',sessionStorage:{setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k),removeItem:k=>saved.delete(k)}});
 for(const hash of ['#profile?view=library&section=playlists&filter=saved','#community/following?type=duet','#studio/payouts?period=2026-09','#gifts/rewards']){
  c.location.hash=hash;c.rememberMenuLogin(hash.slice(1).split('/')[0]);
  c.location.hash='#account';c.returnRoute='#home';c.rememberMenuLogin('account');assert.equal(c.returnRoute,hash);
  c.me={id:'owner'};c.rememberMenuLogin('account');assert.equal(c.returnRoute,hash);
  c.location.hash=hash;c.rememberMenuLogin(hash.slice(1).split('/')[0]);assert.equal(saved.size,0);c.me=null;
 }
 saved.set('aifect-menu-return','https://other.test/');c.returnRoute='#home';c.rememberMenuLogin('account');assert.equal(c.returnRoute,'#home');
 c.location.hash='#discover';c.rememberMenuLogin('discover');assert.equal(saved.size,0);
});

test('only owners can render the private library; all three tabs share the profile and only the library replaces its aside',async()=>{
 const esc=s=>String(s??''),d={profile:{id:'p',user_id:'owner'},tracks:[],covers:[]};
 const c=context({me:{id:'owner'},document:{addEventListener(){}},window:{addEventListener(){}},api:async()=>({...d}),esc,heading:()=>'',gate:()=>'<p>LOGIN</p>'});
 vm.runInContext(source('mypage.js'),c);
 Object.assign(c,{myStudioBanner:()=>'<section>STUDIO</section>',myProfileHeader:()=>'<header>PROFILE</header>',myMoments:()=>'<div>GALLERY</div>',myWorksAside:()=>'<aside>COMMON</aside>',myWorksHTML:()=>'<p>WORKS</p>',myLibraryView:async()=>({html:'<p>PRIVATE MUSIC</p>',libraryAside:'<aside>LIBRARY ONLY</aside>',tracks:[{id:'liked'}]})});
 for(const tab of ['works','activity','library']){const v=await c.myPageView('profile',null,'profile?view='+tab);assert.match(v.html,/<header>PROFILE<\/header>/);assert.match(v.html,/<div>GALLERY<\/div>/);assert.match(v.html,tab==='library'?/<aside>LIBRARY ONLY<\/aside>/:tab==='activity'?/불러오는 중/:/<aside>COMMON<\/aside>/);assert.match(v.html,/mp-tab-library/);assert.equal((v.html.match(/<section>STUDIO<\/section>/g)||[]).length,1);if(tab==='library')assert.equal(v.tracks[0].id,'liked');}
 c.me={id:'visitor'};const visitor=await c.myPageView('producer','p','producer/p?view=library');assert.doesNotMatch(visitor.html,/PRIVATE MUSIC|mp-tab-library/);assert.match(visitor.html,/WORKS/);
 c.me=null;assert.match((await c.myPageView('profile',null,'profile?view=library')).html,/LOGIN/);
});

test('following uses the current works API with paging/type/search and retains native binding metadata',async()=>{
 const paths=[],c=context({me:{id:'owner'},esc:String,heading:()=>'',communityNavigation:()=>'',playTypes:[['all','전체'],['duet','듀엣']],playToolbar:()=>'<input name="q">',playResults:()=>'<p>RESULT</p>',api:async path=>{paths.push(path);return {works:[{id:'solo',type:'solo'},{id:'dub',type:'dubbing'}],nextOffset:50,dubbingAvailable:true};}});
 const v=await c.integratedMenuView('community','following','community/following?type=duet&q=hello&offset=25');
 assert.equal(paths[0],'/api/play/works?tab=following&type=duet&q=hello&offset=25');assert.equal(v.tracks.length,1);assert.equal(v.nextOffset,50);assert.match(v.html,/팔로우 관리/);assert.match(v.html,/팔로워/);assert.match(v.html,/value="hello"/);
 c.me=null;c.gate=()=>'<p>LOGIN</p>';c.location.hash='#community/following?type=duet';const guest=await c.integratedMenuView('community','following','community/following?type=duet');assert.match(guest.html,/LOGIN/);assert.equal(paths.length,1);assert.equal(c.returnRoute,c.location.hash);
});

test('payout and reward integration reuse the existing protected handlers',async()=>{
 const calls=[],c=context({improvementsView:async(...args)=>{calls.push(args);return {html:'existing'};}});
 assert.match((await c.integratedMenuView('studio','payouts','studio/payouts?period=2026-09')).html,/existing/);
 assert.match((await c.integratedMenuView('gifts','rewards','gifts/rewards')).html,/existing/);
 assert.deepEqual(calls,[['payouts',null,'studio/payouts?period=2026-09'],['rewards',null,'gifts/rewards']]);
});

test('following lists, profile counts and follow mutations remain backed by the same records',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','Friend',0)");
 assert.equal((await f.call('/api/producers/friend/follow','PUT')).body.following,true);
 assert.equal((await f.call('/api/follows')).body.follows[0].target_id,'friend');
 const other=(await f.call('/api/me/profile','GET',null,'other')).body;assert.equal(other.follower_count,1);
 assert.equal((await f.call('/api/producers/friend/follow','DELETE')).body.following,false);
 assert.equal((await f.call('/api/follows')).body.follows.length,0);
});

test('library and payout reads enforce the existing account boundary; silver grants once under concurrency',async t=>{
 const f=await fixture(t);
 for(const path of ['/api/library','/api/history','/api/follows','/api/studio/earnings'])assert.equal((await f.call(path,'GET',null,null)).status,401,path);
 await f.call('/api/tracks/one/like','PUT');
 assert.equal((await f.call('/api/library','GET',null,'other')).body.likes.length,0);
 const before=f.sql.prepare('SELECT count(*) n FROM tracks').get().n;
 const results=await Promise.all(Array.from({length:8},()=>f.call('/api/gifts/free/claim','POST',{kind:'checkin'})));
 assert.ok(results.every(r=>r.status===200));
 const claims=f.sql.prepare("SELECT count(*) n,sum(amount) amount FROM free_gift_claims WHERE user_id='owner' AND kind='checkin'").get();
 assert.equal(claims.n,1);assert.equal(f.sql.prepare("SELECT balance FROM free_gift_wallets WHERE user_id='owner'").get().balance,claims.amount);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,before);
});

test('sidebar removes only the four approved entries, with protected navigation and mobile order intact',()=>{
 const html=source('index.html'),sidebar=html.match(/<aside[^>]*class="sidebar"[\s\S]*?<\/aside>/)?.[0]||html.split('<header')[0];
 for(const route of ['library','following','rewards','payouts'])assert.doesNotMatch(sidebar,new RegExp('data-view="'+route+'"'));
 for(const route of ['home','karaoke','community','gifts','dm','notifications','profile','studio','discover','collections'])assert.match(sidebar,new RegExp('href="#'+route+'"'));
 const mobile=html.match(/<nav[^>]*class="mobile-navigation[^"\n]*"[\s\S]*?<\/nav>/)[0];assert.deepEqual([...mobile.matchAll(/data-primary-view="(.*?)"/g)].map(m=>m[1]),['home','community','karaoke','dm','profile']);
});
