import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {GIFT_CATALOG,SILVER_GIFT_CATALOG} from '../shared/gifts.js';
import {DECORATIONS,PERIOD_LABELS} from '../shared/decorations.js';
const source=readFileSync('dist/decorations.js','utf8');
function context(extra={}){const events={addEventListener(){}};const c=vm.createContext({window:events,document:events,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),number:n=>Number(n).toLocaleString('en-US'),icon:()=>'<svg></svg>',AifectGifts:{GIFT_SETTLEMENT_NOTICE:'정산 안내'},me:{id:'test-user'},AbortController,...extra});vm.runInContext(source,c);return c;}
function renderedBanners(html){
 const value=html.match(/data-shop-banners="([^\"]*)"/)?.[1];
 assert.ok(value,'shop view supplies its catalog-derived slides to the carousel');
 return JSON.parse(value.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&amp;','&'));
}
test('shop renders every API gift in gold then silver order with original IDs, names, prices and URLs',async()=>{
 const c=context(),calls=[],gifts=[...GIFT_CATALOG,{id:'new-server-id',name:'새 서버 상품',gold:123,image:'/server-new.webp'}];
 const api=async(path,...args)=>{calls.push([path,...args]);if(path==='/api/gold')return {balance:987,free:{balance:654}};if(path==='/api/decorations')return {products:Object.values(DECORATIONS),periods:PERIOD_LABELS};if(path==='/api/gifts/catalog')return {gifts,silver_gifts:SILVER_GIFT_CATALOG};throw Error(path);};
 const html=await c.finalGiftShopView('gifts',api),expected=[...gifts,...SILVER_GIFT_CATALOG];
 assert.equal((html.match(/data-shop-category="gifts"/g)||[]).length,expected.length);
 let previous=-1;for(const p of expected){const index=html.indexOf('data-shop-name="'+p.name+'"');assert.ok(index>previous);previous=index;assert.ok(html.includes('data-gift-buy="'+p.id+'"'));assert.ok(html.includes('src="'+p.image+'"'));assert.ok(html.includes('>'+Number(p.free?p.silver:p.gold).toLocaleString('en-US')+'</span>'));}
 assert.ok(!html.includes('data-gift-buy="note"'));assert.ok(!html.includes('data-gift-buy="star"'));
 assert.ok(html.includes('data-shop-gold>987 G'));assert.ok(html.includes('data-shop-silver>654 S'));
 assert.equal(calls.length,3);assert.equal(calls.find(x=>x[0]==='/api/gold')[3].fresh,true);
 assert.equal((html.match(/role="tab"/g)||[]).length,3);assert.ok(!/shop-shelf|shop-expand|data-shelf|골드 상품|실버 상품/.test(html));
});
test('anonymous shop skips wallet request and category deep links select the correct tab',async()=>{
 const c=context({me:null}),api=async path=>{assert.notEqual(path,'/api/gold');return path==='/api/decorations'?{products:Object.values(DECORATIONS),periods:PERIOD_LABELS}:{gifts:GIFT_CATALOG,silver_gifts:SILVER_GIFT_CATALOG};};
 const html=await c.finalGiftShopView('themes',api);assert.ok(html.includes('data-shop-active="themes"'));assert.ok(html.includes('data-shop-gold>0 G'));
 assert.equal((html.match(/data-shop-category="frames"/g)||[]).length,4);assert.equal((html.match(/data-shop-category="themes"/g)||[]).length,4);
});
test('search is category-scoped, Unicode/case/space tolerant, clearable and keyboard-operable',()=>{
 const element=dataset=>({dataset,listeners:{},hidden:false,attributes:{},addEventListener(t,fn){this.listeners[t]=fn;},setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;}});
 const tabs=['gifts','frames','themes'].map(shopTab=>element({shopTab}));
 const cards=[['gifts','반짝 스티커'],['gifts','AIFECT Gift'],['frames','별 프레임'],['themes','별 테마']].map(([shopCategory,shopName])=>element({shopCategory,shopName}));
 const input=Object.assign(element({}),{value:''}),panel=element({}),empty=element({});
 const root={dataset:{shopActive:'gifts'},querySelectorAll:s=>s==='[data-shop-tab]'?tabs:s==='.shop-card'?cards:[],querySelector:s=>s==='.shop-item-search input'?input:s==='#shop-products'?panel:s==='.shop-empty'?empty:null};
 const c=context({$:()=>root});c.bindShopShelves();const visible=()=>cards.filter(x=>!x.hidden).map(x=>x.dataset.shopName);
 assert.deepEqual(visible(),['반짝 스티커','AIFECT Gift']);input.value='반 짝스티커';input.listeners.input();assert.deepEqual(visible(),['반짝 스티커']);
 input.value='ａｉｆｅｃｔＧＩＦＴ';input.listeners.input();assert.deepEqual(visible(),['AIFECT Gift']);
 tabs[1].listeners.click();assert.deepEqual(visible(),[]);assert.equal(empty.hidden,false);input.value='별';input.listeners.input();assert.deepEqual(visible(),['별 프레임']);
 tabs[1].listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.deepEqual(visible(),['별 테마']);assert.equal(tabs[2].attributes['aria-selected'],'true');assert.equal(tabs[2].focused,true);
 input.value='';input.listeners.search();assert.deepEqual(visible(),['별 테마']);tabs[0].listeners.click();assert.deepEqual(visible(),['반짝 스티커','AIFECT Gift']);
});

test('banner categories use the supplied live artwork, omit unavailable categories, and escape catalog text',async()=>{
 const frame={sku:'server-frame',kind:'PROFILE_FRAME',name:'새 "프레임" <서버> & 선택',assetPaths:{overlay:'/catalog/frame.webp?a=1&b=2'},periodPrices:{P7D:123}};
 const theme={sku:'server-theme',kind:'TALKING_ROOM_THEME',name:'서버 테마',assetPaths:{roomCard:'/catalog/theme.webp',roomMobile:'/catalog/theme-mobile.webp'},periodPrices:{P7D:234}};
 const excluded={sku:'not-on-these-shelves',kind:'PROFILE_BADGE',name:'다른 종류',assetPaths:{overlay:'/catalog/badge.webp'}};
 const c=context({me:null}),calls=[];
 const api=async path=>{calls.push(path);return path==='/api/decorations'?{products:[theme,excluded,frame],periods:PERIOD_LABELS}:{gifts:[],silver_gifts:[]};};
 const html=await c.finalGiftShopView('themes',api),slides=renderedBanners(html);
 assert.deepEqual(slides.map(b=>b.id),['gifts','frames','themes']);
 assert.deepEqual(slides[1].art,[{src:frame.assetPaths.overlay,name:frame.name}]);
 assert.deepEqual(slides[2].art,[{src:theme.assetPaths.roomCard,name:theme.name}]);
 assert.ok(!html.includes(excluded.assetPaths.overlay));
 assert.ok(html.includes('data-shop-active="themes"'));
 assert.deepEqual(calls,['/api/decorations','/api/gifts/catalog'],'banner content needs no additional API or purchase call');
 for(const slide of slides){
  const rendered=c.shopBannerHTML(slide);
  assert.ok(rendered.includes('href="#gifts/'+slide.id+'"'));
  assert.ok(rendered.includes('data-shop-banner="'+slide.id+'"'));
  assert.ok(rendered.includes('aria-label="'));
  assert.ok(!/data-gift-buy|data-decoration=|<button/.test(rendered),'banner navigation must not select or purchase an item');
 }
 assert.ok(c.shopBannerHTML(slides[1]).includes('src="/catalog/frame.webp?a=1&amp;b=2"'));
 for(const [products,ids] of [[[],['gifts']],[[frame],['gifts','frames']],[[theme],['gifts','themes']]]){
  const partial=await c.finalGiftShopView('gifts',async path=>path==='/api/decorations'?{products,periods:PERIOD_LABELS}:{gifts:[],silver_gifts:[]});
  assert.deepEqual(renderedBanners(partial).map(b=>b.id),ids);
 }
});

test('shop binding passes Play timing and silent playback options, preserves shelf state, and disposes on navigation',()=>{
 const element=dataset=>({dataset,listeners:{},hidden:false,attributes:{},signals:[],addEventListener(type,fn,options={}){this.listeners[type]=fn;if(options.signal){this.signals.push(options.signal);options.signal.addEventListener('abort',()=>{if(this.listeners[type]===fn)delete this.listeners[type];},{once:true});}},setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;}});
 const tabs=['gifts','frames','themes'].map(shopTab=>element({shopTab}));
 const cards=[['gifts','별 선물'],['frames','별 프레임'],['frames','달 프레임'],['themes','별 테마']].map(([shopCategory,shopName])=>element({shopCategory,shopName}));
 const input=Object.assign(element({}),{value:'별'}),panel=element({}),empty=element({}),banner=element({shopBanners:'[]'});
 const root={dataset:{shopActive:'frames'},querySelectorAll:s=>s==='[data-shop-tab]'?tabs:s==='.shop-card'?cards:[],querySelector:s=>s==='.shop-item-search input'?input:s==='#shop-products'?panel:s==='.shop-empty'?empty:s==='#shop-banner'?banner:null};
 const mounts=[],active=new Set(),routeCleanups=new Set(),audio={paused:false};let page=root;
 const c=context({$:()=>page,audio,
  mountFeatureCarousel(target,slides,options){const mount={target,slides,options};mounts.push(mount);active.add(mount);return ()=>active.delete(mount);},
  registerRouteCleanup(cleanup){const release=()=>{routeCleanups.delete(release);cleanup();};routeCleanups.add(release);return release;}
 });
 banner.dataset.shopBanners=JSON.stringify(c.shopBannerSlides(Object.values(DECORATIONS)));
 c.bindShopShelves();
 assert.equal(mounts.length,1);assert.equal(active.size,1);assert.equal(routeCleanups.size,1);
 const mount=mounts[0];assert.equal(mount.target,banner);
 assert.equal(mount.options.intervalMs,4000);assert.equal(mount.options.syncAudio,false);assert.equal(mount.options.pauseForDialogs,true);assert.equal(mount.options.initialId,'frames');
 const shelfState=()=>({category:root.dataset.shopActive,query:input.value,visible:cards.filter(x=>!x.hidden).map(x=>x.dataset.shopName),selected:tabs.map(t=>t.attributes['aria-selected']),panel:panel.attributes['aria-labelledby'],audioPaused:audio.paused});
 const before=shelfState();assert.deepEqual(before.visible,['별 프레임']);
 // Exercise the supplied slide renderer at the engine boundary, not a second carousel implementation.
 for(const slide of mount.slides){banner.innerHTML=mount.options.renderSlide(slide);assert.deepEqual(shelfState(),before);}
 c.bindShopShelves();assert.equal(mounts.length,2);assert.equal(active.size,1);assert.ok(!active.has(mount));assert.equal(routeCleanups.size,1);
 const currentSignals=[...input.signals,...banner.signals,...tabs.flatMap(t=>t.signals)];
 for(const cleanup of [...routeCleanups])cleanup();
 assert.equal(active.size,0);assert.equal(routeCleanups.size,0);assert.ok(currentSignals.every(signal=>signal.aborted));assert.deepEqual(input.listeners,{});assert.deepEqual(banner.listeners,{});
 page=null;c.bindShopShelves();assert.equal(mounts.length,2,'leaving the shop must not start another carousel');assert.equal(active.size,0);
});

test('same-hash banner clicks select the category while modified clicks, swipes and other routes remain native',()=>{
 const element=dataset=>({dataset,listeners:{},hidden:false,attributes:{},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(k,v){this.attributes[k]=v;},focus(){}});
 const tabs=['gifts','frames','themes'].map(shopTab=>element({shopTab}));
 const cards=[['frames','별 프레임'],['frames','달 프레임'],['themes','별 테마']].map(([shopCategory,shopName])=>element({shopCategory,shopName}));
 const input=Object.assign(element({}),{value:'별'}),panel=element({}),empty=element({}),banner=element({shopBanners:'[]'}),location={hash:'#gifts/frames'};
 const root={dataset:{shopActive:'frames'},querySelectorAll:s=>s==='[data-shop-tab]'?tabs:s==='.shop-card'?cards:[],querySelector:s=>s==='.shop-item-search input'?input:s==='#shop-products'?panel:s==='.shop-empty'?empty:s==='#shop-banner'?banner:null};
 const c=context({$:()=>root,location,mountFeatureCarousel:()=>()=>{}});c.bindShopShelves();
 tabs[2].listeners.click();
 const state=()=>({category:root.dataset.shopActive,query:input.value,visible:cards.filter(x=>!x.hidden).map(x=>x.dataset.shopName),selected:tabs.map(t=>t.attributes['aria-selected'])});
 const before=state();assert.equal(before.category,'themes');assert.equal(location.hash,'#gifts/frames');
 const click=(id='frames',extra={})=>{
  let prevented=0;
  const link={dataset:{shopBanner:id},getAttribute:name=>name==='href'?'#gifts/'+id:null};
  banner.listeners.click({button:0,target:{closest:selector=>selector==='a[data-shop-banner]'?link:null},preventDefault(){prevented++;},...extra});
  return prevented;
 };
 for(const flags of [{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2},{defaultPrevented:true}]){
  assert.equal(click('frames',flags),0);assert.deepEqual(state(),before);
 }
 assert.equal(click('themes'),0,'a different hash must continue through the existing router');assert.deepEqual(state(),before);
 assert.equal(click('frames',{target:{closest:()=>null}}),0,'carousel controls are not category links');assert.deepEqual(state(),before);
 assert.equal(click(),1);assert.equal(root.dataset.shopActive,'frames');assert.equal(input.value,'');
 assert.deepEqual(state().visible,['별 프레임','달 프레임']);assert.equal(tabs[1].attributes['aria-selected'],'true');assert.equal(panel.attributes['aria-labelledby'],'shop-tab-frames');
 tabs[2].listeners.click();input.value='별';input.listeners.input();
 assert.equal(click('frames',{button:undefined,detail:0}),1,'keyboard activation also selects a same-hash category');
 assert.equal(root.dataset.shopActive,'frames');assert.equal(input.value,'');
});
