import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../dist/decorations.css',import.meta.url),'utf8');
const mobile=css.split('/* Mobile gift shop:')[1];

test('mobile gift balances keep coin, label and amount inline',()=>{
 assert.ok(mobile,'mobile shop layout rules exist');
 assert.match(mobile,/@media \(max-width:768px\)/);
 assert.match(mobile,/display:inline-flex;flex:0 1 auto;flex-wrap:nowrap/);
 assert.match(mobile,/\.shop-heading \.shop-balance\{[\s\S]*?display:inline-flex/);
});

test('mobile shelves show three full products and two full themes',()=>{
 assert.match(mobile,/@media \(max-width:768px\)\{\s*\.shop-page \.shop-track:not\(#shelf-themes\)/);
 assert.match(mobile,/--shop-card-width:calc\(\(100% - 2 \* var\(--shop-card-gap\)\) \/ 3\)/);
 assert.match(mobile,/scroll-snap-type:x mandatory/);
 assert.match(mobile,/\.shop-page #shelf-themes\{--shop-column-width:calc\(\(100% - 14\.3px\)\/2\)/);
});
