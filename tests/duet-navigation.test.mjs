import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function context(extra={}){const c=nicknameContext({me:null,URLSearchParams,confirm:()=>true,window:{addEventListener(){}},document:{addEventListener(){}},...extra});vm.runInContext(readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),c);return c;}
test('blocked navigation and failed draft saving preserve the duet parent across reload',async()=>{
 for(const state of ['loading','review']){
  let restored='';const c=context({renderId:0,location:{hash:'#home'},setMobileMenu(){},toast(){},history:{pushState(a,b,href){restored=href;}},saveSingDraft:async()=>{throw Error('storage full');}});
  vm.runInContext(readFileSync(new URL('../dist/views.js',import.meta.url),'utf8'),c);
  vm.runInContext(`sing={id:'original',state:'${state}',mode:'duet',parent:'first-recording',part:'female',voice:{length:10},dirty:true}`,c);
  vm.runInContext("askSingExit=async s=>{try{await saveSingDraft(s);return true;}catch{return false;}}",c);
  await vm.runInContext('render()',c);assert.equal(restored,'#sing/original?duet=first-recording');
 }
});
test('join routes cannot silently fall back to a solo response; solo and first-duet routes still work',async()=>{
 let result={track:{id:'one'}},requested='';const c=context({api:async path=>(requested=path,result)});
 await assert.rejects(vm.runInContext("loadSingRoute('one',new URLSearchParams('duet=first'))",c),/참여할 듀엣/);
 result={track:{id:'one'},mr:'/media/first/stream',duet:{parent_id:'first',part:'female',partner:{producer:'친구'}}};
 const joined=await vm.runInContext("loadSingRoute('one',new URLSearchParams('duet=first'))",c);assert.equal(requested,'/api/duets/first');assert.equal(joined.chooseMode,false);assert.equal(joined.mode,'duet');assert.equal(joined.part,'female');assert.equal(joined.mr,'/media/first/stream');
 result={track:{id:'one'}};assert.equal((await vm.runInContext("loadSingRoute('one',new URLSearchParams())",c)).mode,'solo');assert.equal((await vm.runInContext("loadSingRoute('one',new URLSearchParams('mode=duet'))",c)).mode,'duet');
});

test('ordinary entry asks once; explicit modes, legacy drafts and joining paths bypass the chooser',async()=>{
 const c=context({api:async()=>({track:{id:'one'}}),esc:s=>s});
 for(const [query,choose,mode] of [['',true,'solo'],['mode=bad',true,'solo'],['mode=solo',false,'solo'],['mode=duet',false,'duet'],['draft=1',false,'solo'],['mode=duet&part=female&draft=1',false,'duet']]){c.query=new URLSearchParams(query);const d=await vm.runInContext("loadSingRoute('one',query)",c);assert.equal(d.chooseMode,choose,query);assert.equal(d.mode,mode,query);}
 c.d=await vm.runInContext("loadSingRoute('one',new URLSearchParams())",c);
 assert.equal(vm.runInContext('singHTML(d)',c),'');
 const html=vm.runInContext('singModeHTML(d)',c);assert.match(html,/data-sing-mode="solo"/);assert.match(html,/data-sing-mode="duet"/);assert.doesNotMatch(html,/data-sing-start|data-duet-editor/);
});
test('the empty recording route keeps the sign-in gate and skips song reads without changing explicit recording routes',async()=>{
 for(const [hash,me,mode] of [['#sing/',null,null],['#sing/',{id:'owner'},null],['#sing/one?mode=solo',{id:'owner'},'solo'],['#sing/one?mode=duet',{id:'owner'},'duet']]){
  const requests=[],main={dataset:{},innerHTML:'',classList:{remove(){},toggle(){}},querySelectorAll:()=>[],setAttribute(){},removeAttribute(){}};
  const c=context({
   me,renderId:0,apiRevision:0,accountReady:Promise.resolve(),socialTimer:null,socialCleanup:null,
   location:{hash},window:{addEventListener(){},scrollTo(){}},document:{addEventListener(){},querySelectorAll:()=>[]},$:selector=>selector==='#main'?main:null,
   api:async path=>{requests.push(path);return {track:{id:'one'}};},
   setMobileMenu(){},clearInterval(){},cleanupLyricsEditor(){},updateBrowseNavigation(){},
   notificationsView:()=>null,playerView:()=>null,improvementsView:()=>null,browseView:()=>null,explorerView:()=>null,
   remember:tracks=>tracks,heading:title=>'<h1>'+title+'</h1>',icon:()=>'<svg></svg>',gate:()=>'<p>SIGN_IN</p>',esc:String
  });
  vm.runInContext(readFileSync(new URL('../dist/views.js',import.meta.url),'utf8'),c);
  c.bindRenderedRoute=()=>{};
  c.singHTML=d=>'<section data-recording-mode="'+d.mode+'">'+d.track.id+'</section>';
  await vm.runInContext('render()',c);
  assert.deepEqual(requests,mode?['/api/karaoke/one']:[]);
  if(!me){assert.match(main.innerHTML,/SIGN_IN/);assert.equal(c.returnRoute,hash);assert.doesNotMatch(main.innerHTML,/부를 곡 고르기/);}
  else if(!mode){assert.match(main.innerHTML,/부를 곡을 먼저 골라주세요/);assert.match(main.innerHTML,/href="#karaoke"/);assert.match(main.innerHTML,/href="#karaoke\/drafts"/);}
  else assert.match(main.innerHTML,new RegExp('data-recording-mode="'+mode+'">one'));
 }
});
test('cancelled leaving preserves the current mode and never stops or saves the take',async()=>{
 for(const mode of ['solo','duet']){let restored='';const c=context({confirm:()=>false,renderId:0,location:{hash:'#sing/one?mode='+ (mode==='solo'?'duet':'solo')},setMobileMenu(){},history:{pushState(a,b,href){restored=href;}},finishSinging(){throw Error('must not stop');},saveSingDraft(){throw Error('must not save');}});vm.runInContext(readFileSync(new URL('../dist/views.js',import.meta.url),'utf8'),c);vm.runInContext(`sing={id:'one',mode:'${mode}',state:'singing',dirty:true};askSingExit=async()=>false`,c);await vm.runInContext('render()',c);assert.match(restored,new RegExp('mode='+mode));}
});

test('cancelled recording exit republishes its restored draft URL without replacing the recorder',async()=>{
 const main={dataset:{route:'sing/one?mode=solo&draft=1'},innerHTML:'LIVE RECORDER'};
 let published='';const c=context({confirm:()=>false,renderId:0,location:{hash:'#community'},$:()=>main,setMobileMenu(){},history:{pushState(a,b,href){c.location.hash=href;}},window:{AifectRender:{begin(){return 1;},syncTarget(){published=main.dataset.route;}},addEventListener(){}}});
 vm.runInContext(readFileSync(new URL('../dist/views.js',import.meta.url),'utf8'),c);vm.runInContext("sing={id:'one',mode:'solo',routeHash:'#sing/one?mode=solo&draft=1',state:'singing',dirty:true};askSingExit=async()=>false",c);
 await vm.runInContext('render()',c);assert.equal(main.innerHTML,'LIVE RECORDER');assert.equal(published,c.location.hash.slice(1));assert.match(published,/sing\/one/);
});
