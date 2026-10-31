import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(wraps=false){
 let mobile=true,resize,changes;
 const animations=[];
 const text={textContent:'long title',scrollWidth:340,animate(frames,options){const a={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(a);return a;}};
 const link={clientWidth:200,querySelector:()=>text};
 const button={};const artist={append(b){b.parentElement=this;}},actions={append(b){b.parentElement=this;}};button.parentElement=actions;
 const copy={querySelector:s=>s==='.home-feature-play'?button:s==='.home-feature-artist-row'?artist:s==='.home-feature-actions'?actions:link};
 const motion={matches:false,addEventListener(n,f){changes=f;},removeEventListener(){changes=null;}};
 const c=vm.createContext({document:{},getComputedStyle:()=>({whiteSpace:wraps?'normal':'nowrap',getPropertyValue:()=>mobile?'1':'0'}),ResizeObserver:class{constructor(f){resize=f;}observe(){}disconnect(){resize=null;}}});
 vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);
 const layout=c.mountHomeFeatureCopy({},copy,motion);
 return {c,layout,animations,text,link,button,artist,actions,motion,setMobile(v){mobile=v;resize();},resize(){resize();},reduce(){motion.matches=true;changes();}};
}
test('only overflowing mobile title scrolls at 24px/sec after 1.5s, and resets on song/width changes',()=>{
 const f=setup(),a=f.animations[0];assert.equal(f.button.parentElement,f.artist);
 assert.equal(a.frames[1].offset*a.options.duration,1500);
 assert.equal(a.frames[2].transform,'translateX(-140px)');
 assert.equal(Math.round((a.frames[2].offset-a.frames[1].offset)*a.options.duration),Math.round(140/24*1000));
 f.text.textContent='new long title';f.layout.update();assert.equal(a.cancelled,true);assert.equal(f.animations.length,2);
 f.link.clientWidth=400;f.resize();assert.equal(f.animations.at(-1).cancelled,true);assert.equal(f.animations.length,2);
 f.text.scrollWidth=80;f.layout.update();assert.equal(f.animations.length,2);f.layout.cleanup();
});
test('desktop restores same play button and static title; reduced motion cancels the title',()=>{
 const f=setup();f.setMobile(false);assert.equal(f.button.parentElement,f.actions);assert.equal(f.animations[0].cancelled,true);
 f.setMobile(true);assert.equal(f.button.parentElement,f.artist);assert.equal(f.animations.length,2);
 f.reduce();assert.equal(f.animations[1].cancelled,true);f.layout.cleanup();
});
test('wrapped mobile titles stay still even when line clamping reports horizontal overflow',()=>{
 const f=setup(true);assert.equal(f.button.parentElement,f.artist);assert.equal(f.animations.length,0);
 f.resize();assert.equal(f.animations.length,0);f.layout.cleanup();
});
test('desktop uses measured recommendation size without center enlargement and keeps arrow space',()=>{
 const f=setup();for(const [width,size] of [[500,198],[600,218],[800,240]]){
  const g=f.c.homeFloatGeometry(width,7,size);assert.equal(g.size,size);assert.match(f.c.homeFloatPose(0,g),/scale\(1\)/);
  const d=g.radius,projected=g.scales[d]*Math.cos(g.angles[d]*Math.PI/180)*1000/(1000-g.depth[d]);
  assert.ok((2*g.positions[d]+projected)*g.size<=width-88+.01);
 }f.layout.cleanup();
});
