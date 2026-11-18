import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DECORATIONS,PERIOD_LABELS} from '../shared/decorations.js';

const source=readFileSync('dist/decorations.js','utf8');
const context=vm.createContext({window:{addEventListener(){}},document:{addEventListener(){}},
 esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
 number:n=>Number(n).toLocaleString('en-US'),icon:()=>''});
vm.runInContext(source,context);

test('registered theme duration prices stay within one SKU card, without merging same-name products',()=>{
 const theme=DECORATIONS.theme_starlight_lounge,other={...theme,sku:'distinct_registered_sku'};
 const products=context.shopThemeProducts([theme,theme,DECORATIONS.frame_aurora_ring,other]);
 assert.deepEqual(Array.from(products,p=>p.sku),[theme.sku,other.sku]);
 const html=context.shopCards(products,PERIOD_LABELS);
 assert.equal((html.match(/data-shop-category="themes"/g)||[]).length,2);
 assert.ok(html.includes('class="shop-price-value">100</span>')&&!html.includes('class="shop-price-period"'));
 assert.ok(!html.includes('data-product-gift='));
 assert.ok(html.includes('data-theme-sku="'+theme.sku+'"'));
 assert.ok(html.includes('data-theme-preview="'+theme.assetPaths.roomMobile+'"'));
 assert.equal((html.match(/data-decoration="/g)||[]).length,4);
 assert.deepEqual(theme.periodPrices,{P7D:100,P1M:300,P3M:790});
});

test('theme card uses the actual lowest price even when the shortest period costs more',()=>{
 const theme={...DECORATIONS.theme_starlight_lounge,periodPrices:{P7D:500,P1M:300,P3M:790}};
 assert.ok(context.shopCards([theme],PERIOD_LABELS).includes('class="shop-price-value">300</span>'));
 const periods=context.shopProductPeriods({...theme,periodPrices:{P1M:300,P3M:790}},PERIOD_LABELS);
 assert.deepEqual(Array.from(periods,([key,label])=>[key,label]),[['P1M','1개월'],['P3M','3개월']]);
});

test('ordinary gifts retain their IDs, prices and purchase controls, with no theme preview',()=>{
 const html=context.shopCards([{id:'heart',name:'하트',image:'/registered.png',gold:50}]);
 assert.ok(html.includes('data-gift-buy="heart"'));
 assert.ok(html.includes('50</span>')&&html.includes('coin-g.svg'));
 assert.ok(!html.includes('data-theme-preview'));
 assert.ok(!html.includes('data-shop-category="themes"'));
});

test('Christmas is a single purchasable catalog card with its registered room preview',async()=>{
 const p=DECORATIONS.theme_christmas;
 const read=async path=>path==='/api/decorations'?{products:Object.values(DECORATIONS),periods:PERIOD_LABELS}:{gifts:[],silver_gifts:[]};
 context.me=null;
 const html=await context.finalGiftShopView('themes',read);
 assert.equal((html.match(/data-shop-name="크리스마스 테마"/g)||[]).length,1);
 assert.ok(!html.includes('기본 방에 시즌 적용'));
 const card=context.shopCards([p],PERIOD_LABELS);
 assert.equal((card.match(/data-decoration="theme_christmas"/g)||[]).length,2);
 assert.ok(card.includes('class="shop-price-value">100</span>'));
 assert.ok(card.includes('data-theme-preview="'+p.assetPaths.roomDesktop+'"'));
 assert.ok(card.includes('data-theme-layout="landscape"'));
});
