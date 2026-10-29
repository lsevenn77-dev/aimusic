import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {regionTokenCSS} from '../scripts/ui-region-tokens.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('region compilation preserves cascade, fluid/user typography and large artwork',()=>{
 const css='@media(min-width:801px){.sample{font-size:16px!important;padding:8px 12px;gap:1rem;margin:0 auto;width:100px;color:red}.large{font-size:40px}.fluid{font-size:clamp(12px,2vw,24px)}.setting{font-size:var(--lyric-size)}}';
 const result=regionTokenCSS(css);
 assert.match(result,/font-size:calc\(16px \* var\(--ui-type-scale, 1\)\)!important/);
 assert.match(result,/padding:calc\(8px \* var\(--ui-space-scale, 1\)\) calc\(12px \* var\(--ui-space-scale, 1\)\)/);
 assert.match(result,/margin:0 auto;width:100px;color:red/);
 for(const declaration of ['font-size:40px','font-size:clamp(12px,2vw,24px)','font-size:var(--lyric-size)'])assert.ok(result.includes(declaration));
 assert.equal(regionTokenCSS(result),result,'repeat compilation must not compound');
});

test('regional opt-in never changes root/player tokens and mobile stays at baseline',()=>{
 const css=read('dist/ui-region-scale.css');
 assert.doesNotMatch(css,/(?:^|})\s*(?:body|:root|\*)\s*\{/);
 assert.doesNotMatch(css,/\bzoom\s*:|transform\s*:\s*scale/);
 assert.match(css,/@media\(max-width:800px\)[\s\S]*--ui-type-scale:1;/);
 assert.match(css,/#sing\.web-studio[^}]*--ui-type-scale:1;/);
 const c=vm.createContext({});vm.runInContext(read('dist/icons.js'),c);
 const render=n=>vm.runInContext(`icon(${JSON.stringify(n)})`,c);
 assert.match(render('ui-heart'),/viewBox="-4 -4 32 32"/);
 assert.match(render('ui-comment'),/viewBox="-4 -4 32 32"/);
 assert.match(render('ui-plays'),/viewBox="0 0 24 24"/);
 for(const n of ['ui-heart','ui-comment','ui-plays','ui-play-action','ui-pause-action'])assert.match(render(n),/vector-effect="non-scaling-stroke"/);
 for(const n of ['player-play','player-pause','heart','menu'])assert.doesNotMatch(render(n),/aifect-control-icon|non-scaling-stroke/);
});
