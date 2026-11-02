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
 assert.ok(read('dist/decorations.js').includes('<h1 class="shop-title">'+name+'</h1>'));
 assert.ok(read('dist/menu-integration.js').includes('href="#gifts"'));
 assert.ok(read('dist/views.js').includes('gifts:'+String.fromCharCode(39)+name+String.fromCharCode(39)));
});

test('mobile shop title and right-aligned wallet share the first row; actions stay on row two',()=>{
 const css=read('dist/decorations.css');
 const layout=css.split('/* Gift shop header/title layout: 2026-11-02')[1];
 assert.ok(layout,'shop mobile header CSS exists');
 assert.match(layout,/grid-template-columns:max-content minmax\(0,1fr\)/);
 assert.ok(layout.includes('shop-heading>.shop-title'));
 assert.ok(layout.includes('shop-heading>.shop-balances'));
 assert.match(layout,/grid-column:2;grid-row:1;justify-self:end/);
 assert.match(layout,/grid-column:1\/-1;grid-row:2/);
 assert.ok(!read('dist/uiux-space.css').includes('#main[data-route="gifts"] .shop-heading>h1,'),'mobile title should be visible');
});
