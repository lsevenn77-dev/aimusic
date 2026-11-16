import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {castingFixture} from './dubbing-casting-fixtures.mjs';
const context=vm.createContext({URLSearchParams,esc:x=>String(x).replaceAll('"','&quot;'),icon:()=>'',AifectDubbing:{dubbingGenreArtwork:()=>'/poster.webp'}});
vm.runInContext(readFileSync(new URL('../dist/dub-discovery.js',import.meta.url),'utf8'),context);
const work=(i)=>({id:'r'+i,rootId:'r'+i,title:'작품 '+i,ownerName:'작가 '+i,genres:i%2?['로맨스']:[],created:i,roleCount:2,duration:270,activeCount:i,weeklyActiveCount:i,beginnerRecommended:i===2});
function html(raw,projects,weekly=[]){return context.dubDiscoveryHTML({raw:'karaoke/dubbing?'+raw,discovery:{projects,weekly}});}
test('rank grids render only real published rows, cap at six and keep genuine destinations',()=>{
 for(const n of [1,2,4,6,8]){
  const projects=Array.from({length:n},(_,i)=>work(i+1)),page=html('period=all',projects);
  assert.equal((page.match(/class="dub-rank"/g)||[]).length,Math.min(n,6));
  assert.match(page,new RegExp('href="#dubbing/r'+n+'"'));
  assert.match(page,/href="#dubbing\/new"/);assert.match(page,/처음이라면 여기부터/);
  if(n===1)assert.match(page,/지정된 작품이 없어요/);
  const result=html('section=genre&genre=로맨스&q=작가+1',projects);
  assert.equal((result.match(/class="dub-row"/g)||[]).length,1);
  assert.match(result,/href="#dubbing\/r1"/);
 }
});
test('completed roots offer individual releases and preserve missing play counts',()=>{
 const root=work(1),versions=[{...root,id:'cut-a',plays:0},{...root,id:'cut-b',plays:12},{...work(2),id:'cut-c',plays:null}];
 const page=html('section=versions&view=complete&root=r1',versions);
 assert.match(page,/완성 더빙 2개/);assert.match(page,/재생 0회/);assert.match(page,/재생 12회/);assert.doesNotMatch(page,/cut-c/);
 assert.match(html('section=versions&view=complete&root=r2',versions),/재생 수 미집계/);
 const weekly=html('section=rank&view=complete',versions,[{id:'cut-b'}]);assert.equal((weekly.match(/class="dub-row"/g)||[]).length,1);
});
test('discovery counts use real participating combinations, group completed takes and preserve old responses',async t=>{
 const f=await castingFixture(t,2);await f.base();
 const open=()=>f.call('/api/dubbing/projects?tab=open&discovery=1');
 assert.equal((await open()).body.projects[0].activeCount,0);
 for(const user of ['actor2','actor3']){
  const draft=await f.draft('role_2',user);assert.equal((await f.submit(draft.pid,'role_2',user,draft.rev)).status,200);
 }
 const item=(await open()).body.projects[0];assert.equal(item.completedCount,2);assert.equal(item.plays,null);assert.equal(item.beginnerRecommended,false);
 const list=await f.call('/api/dubbing/projects?tab=popular&discovery=1');assert.equal(list.body.projects.length,2);
 assert.ok(list.body.projects.every(p=>p.rootId===f.root&&p.completedCount===2));
 assert.equal((await f.call('/api/dubbing/projects?tab=open')).body.projects[0].activeCount,undefined);
});
test('final audio counts one play across resume and seek, and a new play after ending',async()=>{
 const sent=[],player=new EventTarget();
 const ctx=vm.createContext({crypto,audio:player,current:{id:'take',kind:'dubbing',countPlay:true},
  window:{},api:async(...args)=>{sent.push(args);},setPlayerVisible(){}});
 const actions=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8');
 vm.runInContext(actions.slice(actions.indexOf("audio.addEventListener('playing',()=>{"),actions.indexOf('audio.ontimeupdate=')),ctx);
 vm.runInContext(actions.slice(actions.indexOf('audio.onended='),actions.indexOf('audio.onerror=')),ctx);
 ctx.repeatMode=0;
 for(const type of ['loadedmetadata','playing','pause','playing','seeking','playing'])player.dispatchEvent(new Event(type));
 player.onended();player.dispatchEvent(new Event('playing'));
 assert.equal(sent.length,2);assert.equal(sent[0][0],'/api/dubbing/projects/take/plays');assert.notEqual(sent[0][2].requestId,sent[1][2].requestId);
 ctx.current={id:'private',kind:'dubbing',countPlay:false};player.dispatchEvent(new Event('playing'));assert.equal(sent.length,2);
});
test('the original shelf uses official script roots and custom posters with real destinations',()=>{
 const original={...work(1),isOfficialOriginal:true,posterUrl:'/api/dubbing/projects/r1/poster?v=2'};
 const page=html('period=all',[work(2),original]);
 const shelf=page.match(/<section class="dub-originals".*?<\/section>/s)?.[0];
 assert.ok(shelf);
 assert.match(shelf,/href="#dubbing\/r1"/);
 assert.ok(shelf.includes(original.posterUrl));
 assert.doesNotMatch(shelf,/#dubbing\/r2/);
 assert.doesNotMatch(html('section=rank',[original]),/class="dub-originals"/);
});

test('desktop discovery filters playable script roots and keeps the writing and finished-work links last',()=>{
 const c=vm.createContext({URLSearchParams,esc:String,icon:()=>'',time:s=>String(s),AifectDubbing:{dubbingGenreArtwork:()=>'/poster.webp'},dubbingNewURL:()=>'#dubbing/new',playHref:(mode,tab,type)=>'#karaoke/'+mode+'?'+new URLSearchParams({tab,...(type?{type}:{})})});
 vm.runInContext(readFileSync(new URL('../dist/dub-discovery.js',import.meta.url),'utf8'),c);
 const projects=Array.from({length:13},(_,i)=>({...work(i),state:'recruiting',reusable:true,visibility:'public',availableRoles:['서연'],genres:['사극'],duration:null,activeCount:0,completedCount:i}));
 const unavailable=[{state:'complete'},{visibility:'private'},{availableRoles:[]}].map(update=>({...projects[0],id:'unavailable',...update}));
 const view={raw:'karaoke/dubbing?tab=discover',play:{mode:'dubbing',tab:'discover'},discovery:{desktop:true,projects:[...projects,...unavailable]}};
 const cards=html=>html.split('<section class="dub-desktop-section"><h2>신규 작품</h2>').at(-1).match(/class="dub-poster-card"/g)?.length;
 const home=c.desktopDubHTML(view);
 assert.equal(cards(home),10);assert.match(home,/data-dub-more/);assert.equal(cards(c.desktopDubHTML(view,20)),13);
 assert.doesNotMatch(home,/unavailable|NaN|undefined|data-dc-audio|data-dub-menu|dub-rank|완성작 리스트/);
 assert.match(home,/더빙이 처음이라면/);assert.match(home,/<footer class="dub-desktop-banners">.*#dubbing\/new.*type=dubbing.*<\/footer><\/div>$/s);
 const popular=c.desktopDubHTML({...view,raw:view.raw+'&sort=popular'});
 assert.ok(popular.indexOf('href="#dubbing/r12"')<popular.indexOf('href="#dubbing/r11"'));
 const join=c.desktopDubHTML({...view,raw:'karaoke/dubbing?tab=join&genre=사극&q=작가+12',play:{mode:'dubbing',tab:'join'}});
 assert.match(join,/시대극<\/a>/);assert.match(join,/project=r12/);assert.match(join,/참여 가능 · 서연/);
 assert.equal((join.match(/class="dub-poster-card"/g)||[]).length,1);
 assert.match(c.desktopDubHTML({...view,raw:view.raw+'&genre=SF&q=작가+12'}),/검색 조건에 맞는 작품이 없어요/);
});

test('desktop casting availability excludes the submitted owner role and leaves the legacy response intact',async t=>{
 const f=await castingFixture(t,2);
 const get=async suffix=>(await f.call('/api/dubbing/projects?tab=open&discovery=1'+suffix)).body.projects.find(p=>p.id===f.root);
 const original=await get('&castingRoles=1');assert.equal(original.availableRoles.length,2);
 await f.base();const seeded=await get('&castingRoles=1');
 assert.deepEqual(seeded.availableRoles,original.availableRoles.slice(1));
 assert.equal((await get('')).availableRoles,undefined);
});
