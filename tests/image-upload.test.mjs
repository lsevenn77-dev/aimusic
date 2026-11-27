import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNocFAAAAIkAOGVpLGLAAAAAElFTkSuQmCC','base64');

function encoder({width=3200,height=1600,type='image/webp',nativeMode='blob',software}={}){
 let decoded=0,closed=0,drawn=null,nativeCalls=0,softwareCalls=0;
 const canvases=[],softwareSizes=[];
 const c=vm.createContext({Blob,File,createImageBitmap:async()=>{decoded++;return {width,height,close(){closed++;}};},document:{createElement(){
  const canvas={getContext:()=>({drawImage(...args){drawn=args.slice(3);}}),toBlob(resolve){
   nativeCalls++;
   if(nativeMode==='throw')throw Error('Native encoder unavailable');
   resolve(nativeMode==='null'?null:new Blob(nativeMode==='empty'?[]:[type==='image/webp'?webp:png],{type}));
  }};canvases.push(canvas);return canvas;
 }}});
 vm.runInContext(readFileSync(new URL('../dist/image-upload.js',import.meta.url),'utf8'),c);
 c.encodeUploadCanvasWebp=async canvas=>{
  softwareCalls++;softwareSizes.push([canvas.width,canvas.height]);
  return software?software(canvas,softwareCalls):new Blob([webp],{type:'image/webp'});
 };
 return {convert:c.optimizeUploadImage,canvases,softwareSizes,stats:()=>({decoded,closed,drawn,nativeCalls,softwareCalls})};
}
test('all image uploads become bounded WebP files; retries reuse the same conversion and audio is untouched',async()=>{
 const e=encoder(),file=new File(['png'],'앨범.png',{type:'image/png'});
 const [a,b]=await Promise.all([e.convert(file),e.convert(file)]);
 assert.equal(a,b);assert.equal(a.type,'image/webp');assert.equal(a.name,'앨범.webp');assert.equal(e.stats().decoded,1);assert.equal(e.stats().closed,1);assert.deepEqual(e.stats().drawn,[1600,800]);
 assert.equal(e.stats().softwareCalls,0);
 const audio=new File(['wav'],'song.wav',{type:'audio/wav'});assert.equal(await e.convert(audio),audio);
});
test('Safari PNG export uses real WebP output at resized dimensions and shares one conversion on retry',async()=>{
 const e=encoder({type:'image/png'}),file=new File([png],'album.png',{type:'image/png',lastModified:123});
 const [a,b]=await Promise.all([e.convert(file),e.convert(file)]);
 assert.equal(a,b);assert.equal(a.type,'image/webp');assert.equal(a.name,'album.webp');assert.equal(a.lastModified,123);
 assert.deepEqual(Buffer.from(await a.arrayBuffer()),webp,'PNG bytes must never be relabeled as WebP.');
 assert.deepEqual(e.softwareSizes,[[1600,800]]);
 assert.deepEqual(e.stats(),{decoded:1,closed:1,drawn:[1600,800],nativeCalls:1,softwareCalls:1});
 assert.equal(e.canvases[0].width,1);assert.equal(e.canvases[0].height,1);
});
for(const nativeMode of ['null','empty','throw'])test('software WebP export recovers from native canvas '+nativeMode,async()=>{
 const e=encoder({nativeMode}),file=new File([png],'album.png',{type:'image/png'});
 const result=await e.convert(file);
 assert.equal(result.type,'image/webp');assert.deepEqual(Buffer.from(await result.arrayBuffer()),webp);
 assert.equal(e.stats().softwareCalls,1);assert.equal(e.stats().closed,1);
 assert.equal(e.canvases[0].width,1);assert.equal(e.canvases[0].height,1);
});
test('a failed software encoder leaves the file retryable, releases decoded memory and does not suggest changing browsers',async()=>{
 const e=encoder({type:'image/png',software(_canvas,attempt){if(attempt===1)throw Error('temporary module load failure');return new Blob([webp],{type:'image/webp'});}});
 const file=new File([png],'album.png',{type:'image/png'});
 await assert.rejects(e.convert(file),error=>{assert.match(error.message,/변환/);assert.doesNotMatch(error.message,/Chrome|Edge/);return true;});
 assert.equal(e.stats().closed,1);assert.equal(e.canvases[0].width,1);assert.equal(e.canvases[0].height,1);
 const result=await e.convert(file);
 assert.equal(result.type,'image/webp');assert.equal(e.stats().decoded,2);assert.equal(e.stats().softwareCalls,2);assert.equal(e.stats().closed,2);
});
test('invalid software outputs are rejected before upload and remain retryable',async()=>{
 for(const blob of [null,new Blob([],{type:'image/webp'}),new Blob([png],{type:'image/png'})]){
  const e=encoder({type:'image/png',software:()=>blob}),file=new File([png],'album.png',{type:'image/png'});
  await assert.rejects(e.convert(file),/변환/);await assert.rejects(e.convert(file),/변환/);
  assert.equal(e.stats().softwareCalls,2);assert.equal(e.stats().closed,2);
 }
});
test('image pixel and file limits apply to software exports while small images are not enlarged',async()=>{
 const file=new File([png],'album.png',{type:'image/png'});
 const huge=encoder({width:10000,height:10000});await assert.rejects(huge.convert(file),/너무 큽니다/);assert.equal(huge.stats().closed,1);
 const largeFile=encoder();await assert.rejects(largeFile.convert(new File([new Uint8Array(5*1024*1024+1)],'album.png',{type:'image/png'})),/5MB/);assert.equal(largeFile.stats().decoded,0);
 const largeOutput=encoder({type:'image/png',software:()=>new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/webp'})});
 await assert.rejects(largeOutput.convert(file),/너무 큽니다/);assert.equal(largeOutput.stats().closed,1);assert.equal(largeOutput.canvases[0].width,1);
 const small=encoder({width:240,height:120,type:'image/png'});await small.convert(file);assert.deepEqual(small.stats().drawn,[240,120]);assert.deepEqual(small.softwareSizes,[[240,120]]);
});
test('album artwork can opt into a correctly labeled PNG fallback without weakening strict uploads',async()=>{
 const e=encoder({type:'image/png'}),file=new File(['png'],'album.jpg',{type:'image/jpeg'});
 const a=await e.convert(file,{allowFallback:true});
 assert.equal(a.type,'image/png');assert.equal(a.name,'album.png');
 assert.equal(e.stats().softwareCalls,0);
 assert.equal(await e.convert(file,{allowFallback:true}),a);
 const strict=await e.convert(file);assert.equal(strict.type,'image/webp');assert.equal(strict.name,'album.webp');
 assert.equal(e.stats().decoded,2);assert.equal(e.stats().softwareCalls,1);
});
test('gallery decoding falls back to Image when ImageBitmap fails and releases its object URL',async()=>{
 const released=[];
 const c=vm.createContext({Blob,File,createImageBitmap:async()=>{throw Error('unsupported');},URL:{createObjectURL:()=> 'blob:photo',revokeObjectURL:url=>released.push(url)},Image:class {naturalWidth=400;naturalHeight=300;set src(value){this.onload();}},document:{createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:resolve=>resolve(new Blob(['encoded'],{type:'image/webp'}))})}});
 vm.runInContext(readFileSync(new URL('../dist/image-upload.js',import.meta.url),'utf8'),c);
 const result=await c.optimizeUploadImage(new File(['png'],'album.png',{type:'image/png'}));
 assert.equal(result.type,'image/webp');assert.deepEqual(released,['blob:photo']);
});
