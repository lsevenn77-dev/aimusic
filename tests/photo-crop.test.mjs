import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function editor(width=1600,height=900){
 const dialogs=[],draws=[],closed=[];
 const sandbox=vm.createContext({File,Blob,decodeUploadImage:async()=>({width,height,close:()=>closed.push(true)}),document:{addEventListener(){},body:{append(){}},createElement(){
  const nodes=new Map(),canvas={getContext:()=>({clearRect(){},drawImage(...args){draws.push(args.slice(1));}}),toBlob(cb){cb(new Blob(['encoded'],{type:'image/webp'}));},getBoundingClientRect:()=>({width:400}),setPointerCapture(){}};
  const dialog={showModal(){},close(){},remove(){},querySelector(sel){if(sel==='canvas')return canvas;if(!nodes.has(sel))nodes.set(sel,{});return nodes.get(sel);}};dialogs.push(dialog);return dialog;
 }}});
 vm.runInContext(readFileSync(new URL('../dist/image-crop.js',import.meta.url),'utf8'),sandbox);
 return {sandbox,dialogs,draws,closed,file:new File(['fixture'],'photo.png',{type:'image/png'})};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('round preview fits the entire rectangular photo inside the guide, supports further shrink and exports only the image',async()=>{
 const h=editor(),pending=h.sandbox.cropPhoto(h.file,{shape:'circle'});await flush();const dialog=h.dialogs[0];
 assert.match(dialog.innerHTML,/photo-crop-circle/);dialog.querySelector('[data-crop-fit]').onclick();
 const [x,y,w,height]=h.draws.at(-1);assert.ok(x>=0&&y>=0);assert.ok(Math.abs(Math.hypot(w,height)-800)<.01);
 const slider=dialog.querySelector('[type=range]');assert.ok(Number(slider.min)<1);slider.value=slider.min;slider.oninput();assert.ok(h.draws.at(-1)[2]<=w);
 dialog.querySelector('[data-crop-save]').onclick();const result=await pending;assert.equal(result.type,'image/webp');assert.equal(h.closed.length,1);
 assert.equal(await h.sandbox.cropPhoto(h.file,{shape:'circle'}),result);assert.equal(h.dialogs.length,1);
 const square=h.sandbox.cropPhoto(h.file);await flush();assert.equal(h.dialogs.length,2);assert.doesNotMatch(h.dialogs[1].innerHTML,/class="photo-crop-circle"/);
 h.dialogs[1].querySelector('[data-crop-cancel]').onclick();await assert.rejects(square,/취소/);
});
test('moving a zoomed-out image stays finite and keeps its full image inside the square',async()=>{
 const h=editor(800,800),pending=h.sandbox.cropPhoto(h.file,{shape:'circle'});await flush();const d=h.dialogs[0],slider=d.querySelector('[type=range]'),canvas=d.querySelector('canvas');
 slider.value=.5;slider.oninput();canvas.onpointerdown({pointerId:1,clientX:0,clientY:0});canvas.onpointermove({pointerId:1,clientX:40,clientY:20});
 const [x,y,w,height]=h.draws.at(-1);assert.equal(w,400);assert.equal(height,400);assert.ok(x>200&&x<=400);assert.ok(y>200&&y<=400);
 d.querySelector('[data-crop-cancel]').onclick();await assert.rejects(pending,/취소/);
});
