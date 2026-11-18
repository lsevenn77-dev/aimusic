import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DECORATIONS} from '../shared/decorations.js';
import {decorationsFixture} from './decorations-fixture.mjs';

test('Christmas purchase charges once, stays stored until use, equips and expires back to a free skin',async t=>{
 const f=await decorationsFixture(t,{voice:true,gold:100}),sku='theme_christmas';
 const create=()=>f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'크리스마스 방',background:sku});
 assert.equal((await create()).status,403);
 const request_id=crypto.randomUUID(),buy=()=>f.buy(sku,'P7D',{request_id,gold:1});
 const bought=await buy();assert.equal(bought.status,201);
 assert.equal(bought.body.order.gold,100);assert.equal((await buy()).body.order.id,bought.body.order.id);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,100);
 assert.equal((await create()).status,403,'storage is not an active entitlement');
 assert.equal((await f.use(bought.body.order.inventory_id)).status,200);
 const created=await create();assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.room.id;
 const active=(await f.call('/api/voice/rooms/'+id+'/theme')).body.theme;
 assert.equal(active.sku,sku);assert.deepEqual(active.assets,DECORATIONS[sku].assetPaths);
 assert.equal((await f.call('/api/voice/public-rooms','GET',null,null)).body.rooms[0].theme.sku,sku);
 f.sql.prepare("UPDATE player_inventory SET expires_at=unixepoch()-1 WHERE item_key=? AND source='decoration'").run(sku);
 assert.equal((await f.call('/api/voice/rooms/'+id+'/theme')).body.theme.sku,'basic_dark');
 assert.equal((await create()).status,403);
});

test('seasonal artwork is limited to the paid SKU and observes resolved theme expiry/switches',()=>{
 const observers=[];
 const ctx=vm.createContext({window:{addEventListener(){}},document:{addEventListener(){}},
  matchMedia:media=>({media,matches:false,addEventListener(){}}),AbortController,
  requestAnimationFrame:()=>0,cancelAnimationFrame(){},
  ResizeObserver:class{observe(){}disconnect(){}},
  MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(host,options){this.host=host;this.options=options;}disconnect(){this.disconnected=true;}}
 });
 vm.runInContext(readFileSync('dist/christmas-review.js','utf8'),ctx);
 const theme=ctx.AifectChristmasReview;
 for(const sku of ['basic_dark','basic_light','theme_starlight_lounge'])assert.equal(theme.roomArt({theme:{sku}}),'');
 assert.ok(theme.roomArt({theme:{sku:'theme_christmas'}}).includes('christmas-tree-card-'));
 const controller=new AbortController(),host={dataset:{themeSku:'theme_christmas'},querySelectorAll:()=>[],addEventListener(){}};
 theme.bindRoom(host,controller.signal,{theme:{sku:'theme_christmas'}});
 assert.deepEqual(Array.from(observers[0].options.attributeFilter),['data-theme-sku']);
 host.dataset.christmasReview='active';host.dataset.themeSku='basic_dark';observers[0].fn();
 assert.equal(host.dataset.christmasReview,undefined,'expired or removed paid theme clears the animation');
 controller.abort();assert.equal(observers[0].disconnected,true);
});
