import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('music play slots remain hollow while legacy navigation/player artwork is isolated',()=>{
 const c=vm.createContext({});vm.runInContext(read('dist/icons.js'),c);
 const render=n=>vm.runInContext(`icon(${JSON.stringify(n)})`,c);
 for(const name of ['play','minus','plus','menu']){
  const html=render('ui-'+name+'-action');assert.match(html,/outline-gradient-action/);
  assert.match(html,/fill="none"/);assert.doesNotMatch(html,/<image|fill="url|fill="currentColor"/);
 }
 assert.match(render('ui-plays'),/metric-inline-icon/);assert.doesNotMatch(render('ui-plays'),/outline-gradient-action/);
 assert.match(render('ui-play-action'),/d="m8 4 12 8-12 8z"/);
 assert.match(render('ui-menu-action'),/d="M5 6h14M5 12h14M5 18h14"/);
 assert.doesNotMatch(render('play'),/aifect-control-icon|outline-gradient-action/);
 assert.match(render('audio-play'),/assets\/card-play.svg/);
});
test('dropdown opening changes ARIA and visibility without replacing the reference V path',()=>{
 const c=vm.createContext({});vm.runInContext(read('dist/song-covers.js'),c);
 const attrs={},arrow={innerHTML:'<svg><path d="m6 9 6 6 6-6"/></svg>'};
 const button={setAttribute(k,v){attrs[k]=v;},querySelector(){return arrow;}},target={hidden:true};
 const original=arrow.innerHTML;
 c.setSongCoverExpanded(button,target,true);assert.equal(target.hidden,false);assert.equal(attrs['aria-expanded'],'true');
 c.setSongCoverExpanded(button,target,false);assert.equal(target.hidden,true);assert.equal(attrs['aria-expanded'],'false');
 assert.equal(arrow.innerHTML,original);
 assert.match(read('dist/icon-style-lock.css'),/count-dropdown\[aria-expanded=true\].*\{transform:rotate\(180deg\)\}/);
});
