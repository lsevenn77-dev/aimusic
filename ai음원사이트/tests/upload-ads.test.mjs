import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {uploadAdsRoute} from '../server/upload-ads.js';

// Offline fixtures only. No Google ad requests are made by these tests.
const settings={enabled:true,client:'ca-pub-1234567890123456',slot:'1234567890'};
const env={WEB_UPLOAD_ADS_ENABLED:'true',WEB_UPLOAD_AD_CLIENT:settings.client,WEB_UPLOAD_AD_SLOT:settings.slot};
const source=readFileSync(new URL('../dist/upload-ads.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('server enables only configured display inventory for free Korean members',async()=>{
 const req={method:'GET',cf:{country:'KR'}},path='/api/ads/upload';
 for(const [request,config,user] of [[req,env,null],[req,env,{premium_until:Date.now()/1000+3600}],[req,{},{}],[{method:'GET'},env,{}],[{method:'GET',cf:{country:'US'}},env,{}],[req,{...env,WEB_UPLOAD_AD_CLIENT:'ca-app-pub-1234567890123456'},{}],[req,{...env,WEB_UPLOAD_AD_SLOT:'https://example.com'},{}]]){
  const r=uploadAdsRoute(request,config,path,user);assert.deepEqual(await r.json(),{enabled:false});assert.match(r.headers.get('cache-control'),/no-store/);
 }
 assert.deepEqual(await uploadAdsRoute(req,env,path,{}).json(),settings);
 assert.equal(uploadAdsRoute(req,env,'/api/ads/audio',{}),null);
});

function fixture({enabled=true,delayed=false,store=new Map()}={}){
 const scripts=[],panels=[],events={},observers=[],timers=new Map();let count=0,fetches=0,resolveConfig;
 const element=tag=>({tag,isConnected:true,style:{},children:[],attributes:{},dataset:{},
  append(...children){this.children.push(...children);if(tag==='main'||tag==='form')panels.push(...children);},
  remove(){this.isConnected=false;},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},hasAttribute(k){return k in this.attributes;},
  getBoundingClientRect(){return {width:340};}
 });
 const form=element('form'),main=element('main');main.id='main';main.dataset.route='upload';
 main.firstElementChild={after:p=>{main.append(p);}};
 const location={hash:'#upload'},window={addEventListener:(name,fn)=>events[name]=fn,adsbygoogle:[]};
 const ctx={window,location,inApp:false,AbortSignal,
  document:{createElement:element,head:{append:s=>scripts.push(s)},querySelector:s=>s==='#main'?main:null},
  fetch:async()=>{fetches++;const value=delayed?await new Promise(r=>resolveConfig=r):enabled;return {ok:true,json:async()=>({...settings,enabled:value})};},
  sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
  MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}},
  setTimeout:fn=>{timers.set(++count,fn);return count;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,ctx);const api=window.AifectUploadAds;
 api.setMembership({plan:'free'},'user');
 return {api,form,main,window,scripts,panels,observers,timers,location,events,store,
  get fetches(){return fetches;},resolve(value){resolveConfig(value);},
  async ready(){await flush();scripts.at(-1)?.onload();await flush();},
  studio(){location.hash='#studio';events.hashchange();main.dataset.route='studio';api.routeReady('studio');}
 };
}
test('original transfer starts without waiting for ads, with one request per upload',async()=>{
 const p=fixture();assert.equal(p.api.duringOriginalUpload('original',p.form),undefined);
 await p.ready();assert.equal(p.window.adsbygoogle.length,1);assert.equal(p.panels.length,1);
 p.api.duringOriginalUpload('original',p.form);await flush();assert.equal(p.fetches,1);
 // A new page instance in the same session still remembers the attempted upload.
 const reload=fixture({store:p.store});reload.api.duringOriginalUpload('original',reload.form);await flush();assert.equal(reload.fetches,0);
});
test('cover completion waits for a finished studio render and cannot be displayed twice',async()=>{
 const p=fixture();p.location.hash='#studio';p.api.afterCoverUpload('cover');await flush();assert.equal(p.fetches,0);
 p.main.attributes['aria-busy']='true';p.studio();await flush();assert.equal(p.fetches,0);
 delete p.main.attributes['aria-busy'];p.api.routeReady('studio');await p.ready();
 assert.equal(p.window.adsbygoogle.length,1);assert.equal(p.main.children.length,1);
 p.api.afterCoverUpload('cover');p.api.routeReady('studio');await flush();assert.equal(p.fetches,1);
});
test('missing inventory and Premium never load the SDK or show blank slots',async()=>{
 const p=fixture({enabled:false});p.api.duringOriginalUpload('one',p.form);await flush();assert.equal(p.scripts.length,0);assert.equal(p.panels.length,0);
 const paid=fixture();paid.api.setMembership({plan:'premium'},'user');paid.api.duringOriginalUpload('two',paid.form);paid.api.afterCoverUpload('three');paid.studio();await flush();assert.equal(paid.fetches,0);
});
test('navigation, logout and Premium while fetching discard stale placements',async()=>{
 for(const action of [p=>{p.location.hash='#home';p.events.hashchange();},p=>p.api.setMembership(null,null),p=>p.api.setMembership({plan:'premium'},'user')]){
  const p=fixture({delayed:true});p.api.duringOriginalUpload('one',p.form);await flush();action(p);p.resolve(true);await flush();assert.equal(p.scripts.length,0);assert.equal(p.panels.length,0);
 }
});
test('no fill, timeout and route changes remove the ad; failed SDK never blocks',async()=>{
 const p=fixture();p.api.duringOriginalUpload('one',p.form);await p.ready();
 const slot=p.panels[0].children[1];slot.setAttribute('data-ad-status','unfilled');p.observers[0].fn();assert.equal(p.panels[0].isConnected,false);
 p.api.duringOriginalUpload('two',p.form);await flush();for(const fn of [...p.timers.values()])fn();assert.equal(p.panels[1].isConnected,false);
 p.api.duringOriginalUpload('three',p.form);await flush();p.location.hash='#home';p.events.hashchange();assert.equal(p.panels[2].isConnected,false);
 const failed=fixture();failed.api.duringOriginalUpload('four',failed.form);await flush();failed.scripts[0].onerror();await flush();assert.equal(failed.panels.length,0);
});
