import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../dist/decorations.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/decorations.css',import.meta.url),'utf8');
test('all gift shelves render the +more button',()=>{
 const start=js.indexOf('function shopShelf(');
 const end=js.indexOf('// The registered portrait',start);
 assert.ok(start>=0 && end>start);
 const shopShelf=runInNewContext(js.slice(start,end)+'\nshopShelf',{
  esc:value=>String(value),number:value=>String(value),icon:()=>'',decorationProductImage:()=>'',shopStartingPrice:()=>'',
 });
 const html=shopShelf('gold','gold products',[{id:'test',name:'test',gold:1,image:'/test.png'}]);
 assert.ok(html.includes('>+\uB354\uBCF4\uAE30</button>'));
 assert.ok(html.includes('aria-label="gold products +\uB354\uBCF4\uAE30"'));
 assert.ok(html.includes('aria-expanded="false"'));
 assert.ok(html.includes('data-gift-buy="test"'));
});
test('toggling returns +more and expanded state uses four rows',()=>{
 assert.ok(js.includes("button.textContent=expanded?'\uC811\uAE30':'+\uB354\uBCF4\uAE30';"));
 assert.ok(css.includes('.shop-shelf.is-expanded .shop-track{grid-template-rows:repeat(4,auto)}'));
 assert.ok(!css.includes('.shop-shelf.is-expanded .shop-track{grid-template-rows:repeat(2,auto)}'));
});
