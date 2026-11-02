import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../dist/decorations.js',import.meta.url),'utf8');
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
test('collapsing restores the +more label',()=>{
 assert.ok(js.includes("button.textContent=expanded?'\uC811\uAE30':'+\uB354\uBCF4\uAE30';"));
});
test('expanded shelves use the available width and scroll after four rows', () => {
 const events = {addEventListener() {}};
 const columns = runInNewContext(js + '\nshopExpandedColumns', {document: events, window: events});
 assert.equal(columns(10, 1346, 158.86, 12.584), 7); // desktop: 7 + 3
 assert.equal(columns(10, 366, 130.125, 11.44), 3); // mobile: 4 rows with horizontal overflow
 assert.equal(columns(3, 1346, 343.1875, 18.876), 3);
 assert.equal(columns(3, 366, 175.84375, 14.3), 2);
 assert.equal(columns(65, 1346, 158.86, 12.584), 17);
 assert.equal(columns(2, 80, 130, 10), 1);
 assert.equal(columns(0, 366, 130, 10), 0);
});
