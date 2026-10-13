import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../dist/'+f,import.meta.url),'utf8');
const esc=v=>String(v??'').replaceAll('<','&lt;').replaceAll('"','&quot;');
function fixture(api=async()=>({})){
 const listeners=[],paints=[],c=vm.createContext({me:{id:'self'},api,document:{hidden:false,addEventListener:(t,f)=>{if(t==='click')listeners.push(f);}},window:{addEventListener(){}},setInterval(){},esc,icon:()=>'',number:String,portrait:()=>'',heading:t=>'<h1>'+t+'</h1>',cover:()=>'',trackStats:()=>'',communityFeed:()=>'<div>feed</div>',communityNavigation:()=>'<nav>tabs</nav>'});
 for(const f of ['chat-features.js','social-chat.js','page-redesign.js','social-layouts.js','release-refinements.js'])vm.runInContext(read(f),c);
 c.paintMessageBadge=n=>paints.push(n);
 return {c,listeners,paints};
}
test('read refresh is queued behind an in-flight summary and stale unread is never repainted',async()=>{
 const requests=[],f=fixture((...args)=>new Promise(resolve=>requests.push({args,resolve})));
 const first=f.c.refreshMessageBadge();assert.equal(requests.length,1);
 await f.c.refreshMessageBadge();requests[0].resolve({unread:1});await first;
 assert.deepEqual(f.paints,[]);assert.equal(requests.length,2);assert.equal(requests[1].args[3].fresh,true);
 requests[1].resolve({unread:0});await new Promise(r=>setImmediate(r));assert.deepEqual(f.paints,[0]);
});
test('late unread response cannot paint a different account',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r)),p=f.c.refreshMessageBadge();f.c.me={id:'other'};resolve({unread:4});await p;assert.deepEqual(f.paints,[]);
});
test('a selected DM keeps the inbox and puts only one composer in the right pane',async()=>{
 const f=fixture(async()=>({conversations:[{id:'peer',name:'Peer',updated:1,unread:0}]}));
 const d=await f.c.dmWorkspaceView({html:'<form id="chat-compose"></form>',chat:{peer:{id:'peer'}}});
 assert.equal(d.inbox,true);assert.equal(d.selectedConversation,'peer');assert.match(d.html,/message-thread-pane/);assert.match(d.html,/conversation-row is-selected/);assert.equal((d.html.match(/id="chat-compose"/g)||[]).length,1);
});
test('blocked users can be unblocked without loading their prohibited history',async()=>{
 const calls=[],f=fixture(async p=>{calls.push(p);return p==='/api/blocks'?{blocks:[{id:'account',profile_id:'peer',name:'<Person>'}]}:{conversations:[]};});
 const d=await f.c.blockedPeopleView('peer');assert.match(d.html,/data-person-unblock="account"/);assert.match(d.html,/&lt;Person>/);assert.doesNotMatch(d.html,/chat-compose/);assert.deepEqual(calls,['/api/blocks','/api/dm']);
 assert.equal(await f.c.blockedPeopleView('not-blocked'),null);
});
test('block and unblock use account IDs, confirmation, and preserve the room route',async()=>{
 assert.match(fixture().c.dmThreadActions({id:'profile',user_id:'account',name:'Peer'}),/data-person-block="account"/);
 const f=fixture(),calls=[];Object.assign(f.c,{confirm:()=>true,render:async()=>{},toast(){},api:async(...args)=>calls.push(args)});f.c.refreshMessageBadge=()=>{};
 const handler=f.listeners.find(fn=>String(fn).includes('data-person-block'));
 for(const blocking of [true,false]){
  const b={dataset:blocking?{personBlock:'account',blockName:'Peer'}:{personUnblock:'account',blockName:'Peer'},isConnected:true};
  await handler({target:{closest:()=>b},preventDefault(){}});
 }
 assert.deepEqual(calls,[['/api/blocks/account','PUT'],['/api/blocks/account','DELETE']]);
 f.c.confirm=()=>false;await handler({target:{closest:()=>({dataset:{personBlock:'account'}})},preventDefault(){}});assert.equal(calls.length,2);
});
test('crew filters search, sort, genre, and time without mutating source tracks',()=>{
 const {c}=fixture(),now=Date.now(),tracks=[{id:'old',title:'Moon',genre:'Pop',created:now/1000-40*86400,plays:20},{id:'new',title:'Sun',producer:'Singer',genre:'Rock',created:now/1000-100,plays:2},{id:'newer',title:'Moonlight',genre:'Pop',created:now/1000,plays:4}];
 assert.deepEqual(Array.from(c.filterCrewMusic(tracks,{q:'moon',sort:'plays'}),t=>t.id),['old','newer']);
 assert.deepEqual(Array.from(c.filterCrewMusic(tracks,{genre:'Pop',period:'week'},now),t=>t.id),['newer']);
 assert.equal(tracks[0].id,'old');
});
test('community side cards use actual data, not mockup popularity counts',()=>{
 const {c}=fixture(),html=c.communityCrewSidebarHTML({crews:[{id:'c',name:'Real crew',members:4,level:1}],tracks:[]});
 assert.match(html,/Real crew/);assert.match(html,/4명/);assert.doesNotMatch(html,/1.2만|12.3만|49명/);
 const page=c.communityLandingHTML([],{});assert.match(page,/community-feed-column/);assert.match(page,/community-side-column/);assert.match(page,/community-crew-preview/);
});
test('frame image is excluded from photo sizing and payment CTA has content width',()=>{
 const css=read('page-redesign.css');assert.match(css,/social-profile-photo>img:not\(\.player-frame-artwork\)/);assert.match(css,/gift-shop-actions>\.primary-button\{width:auto/);
 assert.match(css,/main \.social-profile-square \.social-profile-main\{[^}]*flex-direction:row/);
 assert.match(css,/community-feed-column \.music-card-body\{[^}]*grid-row:2/);
 assert.match(read('index.html'),/social-layouts.js/);assert.match(readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8'),/social-layouts.js/);
});
test('crew ranking replaces the song shelf, uses server rankings and displays levels and XP',()=>{
 const {c}=fixture(),rankings=[{id:'second',name:'Second',level:3,xp:700,members:3},{id:'first',name:'<First>',level:4,xp:1500,members:5},{id:'third',name:'Third',level:3,xp:600,members:2}];
 const html=c.communityCrewSidebarHTML({crews:[],mine:'c',tracks:[{title:'Not a ranking'}],rankings});
 assert.match(html,/크루 랭킹/);assert.match(html,/LV 4/);assert.match(html,/1500 XP/);assert.match(html,/&lt;First>/);
 assert.ok(html.indexOf('#crew/first')<html.indexOf('#crew/second'));assert.ok(html.indexOf('#crew/second')<html.indexOf('#crew/third'));
 assert.doesNotMatch(html,/내 크루의 새 음악|Not a ranking/);assert.equal(rankings[0].id,'second');
 assert.match(c.crewRankingSidebarHTML([]),/아직 등록된 크루가 없어요/);
 assert.match(c.crewRankingSidebarHTML(),/불러오는 중/);
});
