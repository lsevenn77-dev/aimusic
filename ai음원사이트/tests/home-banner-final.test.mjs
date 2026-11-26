import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function geometry(){
 const c=nicknameContext({});
 vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);
 return c;
}
test('fan carousel geometry fits the supplied cover size and keeps arrow space',()=>{
 const c=geometry();for(const [width,size] of [[500,198],[600,218],[800,240]]){
  const g=c.homeFloatGeometry(width,7,size);assert.equal(g.size,size);assert.match(c.homeFloatPose(0,g),/scale\(1\)/);
  const d=g.radius,projected=g.scales[d]*Math.cos(g.angles[d]*Math.PI/180)*1000/(1000-g.depth[d]);
  assert.ok((2*g.positions[d]+projected)*g.size<=width-88+.01);
 }
});

test('geometry fits seven/five/three projected covers symmetrically with 12% overlap',()=>{
 const c=geometry();for(const [width,radius] of [[900,3],[540,3],[500,2],[360,2],[300,1],[220,1]]){
  const g=c.homeFloatGeometry(width,7);assert.equal(g.radius,radius);
  const projected=i=>g.scales[i]*Math.cos(g.angles[i]*Math.PI/180)*1000/(1000-g.depth[i]);
  assert.ok((2*g.positions[radius]+projected(radius))*g.size<=width);
  for(let i=1;i<=radius;i++)assert.ok(Math.abs((g.positions[i]-g.positions[i-1])/(.5*(projected(i)+projected(i-1)))-.88)<1e-10);
 }
});
