import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {GIFT_CATALOG,SILVER_GIFT_CATALOG} from '../shared/gifts.js';
import {DECORATIONS,PERIOD_LABELS} from '../shared/decorations.js';
const source=readFileSync('dist/decorations.js','utf8');
function context(extra={}){const events={addEventListener(){}};const c=vm.createContext({window:events,document:events,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),number:n=>Number(n).toLocaleString('en-US'),icon:()=>'<svg></svg>',AifectGifts:{GIFT_SETTLEMENT_NOTICE:'정산 안내'},me:{id:'test-user'},AbortController,...extra});vm.runInContext(source,c);return c;}
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
 assert.equal((html.match(/data-shop-category="frames"/g)||[]).length,4);assert.equal((html.match(/data-shop-category="themes"/g)||[]).length,3);
});
test('search is category-scoped, Unicode/case/space tolerant, clearable and keyboard-operable',()=>{
 const element=dataset=>({dataset,listeners:{},hidden:false,attributes:{},addEventListener(t,fn){this.listeners[t]=fn;},setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;}});
 const tabs=['gifts','frames','themes'].map(shopTab=>element({shopTab}));
 const cards=[['gifts','반짝 스티커'],['gifts','AIFECT Gift'],['frames','별 프레임'],['themes','별 테마']].map(([shopCategory,shopName])=>element({shopCategory,shopName}));
 const input=Object.assign(element({}),{value:''}),panel=element({}),empty=element({});
 const root={dataset:{shopActive:'gifts'},querySelectorAll:s=>s==='[data-shop-tab]'?tabs:cards,querySelector:s=>s==='.shop-item-search input'?input:s==='#shop-products'?panel:empty};
 const c=context({$:()=>root});c.bindShopShelves();const visible=()=>cards.filter(x=>!x.hidden).map(x=>x.dataset.shopName);
 assert.deepEqual(visible(),['반짝 스티커','AIFECT Gift']);input.value='반 짝스티커';input.listeners.input();assert.deepEqual(visible(),['반짝 스티커']);
 input.value='ａｉｆｅｃｔＧＩＦＴ';input.listeners.input();assert.deepEqual(visible(),['AIFECT Gift']);
 tabs[1].listeners.click();assert.deepEqual(visible(),[]);assert.equal(empty.hidden,false);input.value='별';input.listeners.input();assert.deepEqual(visible(),['별 프레임']);
 tabs[1].listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.deepEqual(visible(),['별 테마']);assert.equal(tabs[2].attributes['aria-selected'],'true');assert.equal(tabs[2].focused,true);
 input.value='';input.listeners.search();assert.deepEqual(visible(),['별 테마']);tabs[0].listeners.click();assert.deepEqual(visible(),['반짝 스티커','AIFECT Gift']);
});
