import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const name='\uC0C1\uC810';
const old='\uC120\uBB3C\uD568';
const files=['dist/index.html','dist/views.js','dist/decorations.js','dist/gifts.js','dist/menu-integration.js','dist/voice-room-template.js'];

test('gift-shop navigation and page labels use Shop without changing #gifts routes',()=>{
 for(const file of files){
  const src=read(file);
  assert.ok(!src.includes(old),file+' still uses old gift-shop title');
 }
 assert.ok(read('dist/index.html').includes('data-view="gifts"'));
 assert.match(read('dist/index.html'),new RegExp('data-view="gifts"[\\s\\S]*?'+name+'<\\/a>'));
 assert.ok(read('dist/decorations.js').includes('<span>'+name+'</span></h1>'));
 assert.ok(read('dist/menu-integration.js').includes('href="#gifts"'));
 assert.ok(read('dist/views.js').includes('gifts:'+String.fromCharCode(39)+name+String.fromCharCode(39)));
});

test('storefront scopes its design and preserves management routes',()=>{
 const js=read('dist/decorations.js'),css=read('dist/shop.css');
 const view=js.slice(js.indexOf('async function finalGiftShopView('),js.indexOf('let shopLayoutCleanup'));
 assert.ok(view.indexOf('href="#gold"')<view.indexOf('href="#gifts/rewards"'));
 assert.ok(view.indexOf('href="#gifts/rewards"')<view.indexOf('href="#inventory"'));
 assert.ok(view.indexOf('class="shop-actions"')<view.indexOf('class="shop-balances"'));
 assert.match(css,/font-size:var\(--pc-font-page,25px\)/);
 assert.ok(!/\.sidebar|\.topbar|:root/.test(css));
 assert.ok(!read('dist/uiux-space.css').includes('#main[data-route="gifts"] .shop-heading>h1,'));
});
