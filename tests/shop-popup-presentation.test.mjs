import * as currency from '../shared/currency.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const js=readFileSync('dist/decorations.js','utf8');
function context(hash='#gifts'){
 const ctx=vm.createContext({AifectGifts:currency,location:{hash},number:n=>Number(n).toLocaleString('en-US'),esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
 vm.runInContext(js.slice(js.indexOf('function shopCoin('),js.indexOf('function shopIcon(')),ctx);return ctx;
}
test('shop currency presentation keeps wallet values and escapes contextual messages',()=>{
 const c=context();assert.match(c.shopPrice(12345,'S'),/silver-coin\.svg/);assert.match(c.shopPrice(12345,'S'),/12,345/);assert.match(c.shopPrice(0,'G'),/gold-coin\.svg/);
 const text=c.shopCurrencyText('<img onerror=bad> 총 1,000 G · 보낸 뒤 20 S');
 assert.ok(text.includes('&lt;img onerror=bad&gt;'));assert.ok(text.includes('gold-coin.svg'));assert.ok(text.includes('silver-coin.svg'));assert.ok(!text.includes('<img onerror'));
});
test('shop popup opt-in does not alter unrelated dialogs or gifts launched from music pages',()=>{
 const c=context(),calls=[],modal={classList:{toggle:(name,on)=>calls.push([name,!!on])}};
 const content=selector=>({querySelector:s=>s.split(',').includes(selector)?{}:null});
 c.prepareShopPopup(modal,content('.gift-dialog'));assert.deepEqual(calls.pop(),['shop-dialog',true]);
 c.prepareShopPopup(modal,content('.ordinary-confirmation'));assert.deepEqual(calls.pop(),['shop-dialog',false]);
 c.location.hash='#home';c.prepareShopPopup(modal,content('.gift-dialog'));assert.deepEqual(calls.pop(),['shop-dialog',false]);
 c.prepareShopPopup(modal,content('.shop-checkout'));assert.deepEqual(calls.pop(),['shop-dialog',true]);
 c.location.hash='#inventory';c.prepareShopPopup(modal,content('.gift-success'));assert.deepEqual(calls.pop(),['shop-dialog',true]);
});
