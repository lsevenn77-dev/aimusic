import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/web-ads.js',import.meta.url),'utf8');
function page({hostname='aifect.co.kr',hash='#home',content=true,native=false}={}){
 const scripts=[],children=[],events={},timers=[];
 const host={hidden:true,append:e=>children.push(e)};
 let intersect,mutation;
 const document={visibilityState:'visible',getElementById:id=>id==='web-ad'?host:null,querySelector:()=>content?{}:null,createElement:tag=>({tag,style:{},dataset:{},remove(){this.removed=true;}}),head:{append:s=>scripts.push(s)},addEventListener:(n,fn)=>events[n]=fn};
 const window={addEventListener:(n,fn)=>events[n]=fn,Capacitor:{isNativePlatform:()=>native}};
 const location={hostname,protocol:'https:',hash};
 vm.runInNewContext(source,{window,document,location,setTimeout:fn=>(timers.push(fn),timers.length),clearTimeout(){},IntersectionObserver:class{constructor(fn){intersect=fn;}observe(){}},MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){}}});
 return {host,scripts,children,window,location,events,timers,api:window.AifectWebAds,visible(){intersect([{isIntersecting:true}]);},status(value){children[0].dataset.adStatus=value;mutation();}};
}
test('web ads wait for known free membership, public content and proximity',()=>{
 const p=page();p.api.pageReady();p.visible();assert.equal(p.scripts.length,0);
 p.api.setMembership({plan:'free'});assert.equal(p.scripts.length,1);assert.equal(p.children.length,0);
 p.scripts[0].onload();assert.equal(p.window.adsbygoogle.length,1);assert.equal(p.children[0].dataset.adSlot,'9273951798');
 p.api.pageReady();p.visible();assert.equal(p.window.adsbygoogle.length,1);
 p.status('unfilled');assert.equal(p.host.hidden,true);
});
test('Premium, local previews, native shells, forms and empty pages never load ads',()=>{
 for(const options of [{premium:true},{hostname:'127.0.0.1'},{hostname:'wavv-music-design-lseve.sassy-auk-0975.chatgpt.site'},{native:true},{content:false},...['upload','manage/123','account','membership','gold','sing/123','library','search'].map(r=>({hash:'#'+r}))]){
  const p=page(options);p.api.setMembership({plan:options.premium?'premium':'free'});p.api.pageReady();p.visible();
  assert.equal(p.scripts.length,0,JSON.stringify(options));assert.equal(p.host.hidden,true);
 }
});
test('route changes and Premium activation during script load cannot leak an ad request',()=>{
 const p=page();p.api.setMembership({plan:'free'});p.api.pageReady();p.visible();
 p.location.hash='#upload';p.events.hashchange();p.scripts[0].onload();assert.equal(p.window.adsbygoogle,undefined);
 p.location.hash='#home';p.api.pageReady();assert.equal(p.window.adsbygoogle.length,1);
 p.api.setMembership({plan:'premium'});assert.equal(p.host.hidden,true);assert.equal(p.children[0].removed,true);
 p.api.setMembership({plan:'free'});p.api.pageReady();assert.equal(p.scripts.length,1);assert.equal(p.window.adsbygoogle.length,1);
 const q=page();q.api.setMembership({plan:'free'});q.api.pageReady();q.visible();q.api.setMembership({plan:'premium'});q.scripts[0].onload();assert.equal(q.window.adsbygoogle,undefined);
});
test('blocked ads collapse without retries or playback dependencies',()=>{
 const p=page();p.api.setMembership({plan:'free'});p.api.pageReady();p.visible();p.scripts[0].onerror();
 p.api.pageReady();p.visible();assert.equal(p.host.hidden,true);assert.equal(p.scripts.length,1);assert.equal(p.window.adsbygoogle,undefined);
});
