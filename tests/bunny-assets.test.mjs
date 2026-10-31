import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {BUNNY_FRAMES} from '../shared/decorations.js';

test('ship exactly the referenced lightweight originals; space effect matches the static canvas and loops in four seconds',()=>{
 const files=BUNNY_FRAMES.flatMap(p=>[p.assetPaths.overlay,...(p.assetPaths.effect?[p.assetPaths.effect]:[])]);
 const directory='assets/products/bunnies-v1/';
 assert.deepEqual(readdirSync(directory).sort(),files.map(f=>f.split('/').pop()).sort());
 const png=path=>{
  const buf=readFileSync('.'+path);
  assert.equal(buf.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.ok([4,6].includes(buf[25])||buf.includes(Buffer.from('tRNS')),'PNG must retain transparency');
  return [buf.readUInt32BE(16),buf.readUInt32BE(20)];
 };
 for(const frame of BUNNY_FRAMES)png(frame.assetPaths.overlay);
 const space=BUNNY_FRAMES.find(p=>p.assetPaths.effect),fx=readFileSync('.'+space.assetPaths.effect);
 assert.equal(fx.toString('ascii',0,4),'RIFF');assert.equal(fx.toString('ascii',8,12),'WEBP');
 assert.equal(fx.readUInt32LE(4)+8,fx.length);assert.ok(fx.length<2_000_000);
 let canvas,repeat,frames=0,total=0;
 for(let i=12;i+8<=fx.length;){
  const kind=fx.toString('ascii',i,i+4),size=fx.readUInt32LE(i+4),body=i+8;
  assert.ok(body+size<=fx.length);
  if(kind==='VP8X')canvas=[1+fx.readUIntLE(body+4,3),1+fx.readUIntLE(body+7,3)];
  if(kind==='ANIM')repeat=fx.readUInt16LE(body+4);
  if(kind==='ANMF'){frames++;total+=fx.readUIntLE(body+12,3);}
  i=body+size+(size%2);
 }
 assert.deepEqual(canvas,png(space.assetPaths.overlay));assert.equal(repeat,0);assert.equal(frames,48);
 assert.equal(total,4000,'duration in ms');
});
