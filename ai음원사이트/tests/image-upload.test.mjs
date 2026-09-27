import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function encoder({width=3200,height=1600,type='image/webp'}={}){
 let decoded=0,closed=0,drawn=null;
 const c=vm.createContext({Blob,File,createImageBitmap:async()=>{decoded++;return {width,height,close(){closed++;}};},document:{createElement(){const canvas={getContext:()=>({drawImage(...args){drawn=args.slice(3);}}),toBlob(resolve){resolve(new Blob(['encoded'],{type}));}};return canvas;}}});
 vm.runInContext(readFileSync(new URL('../dist/image-upload.js',import.meta.url),'utf8'),c);
 return {convert:c.optimizeUploadImage,stats:()=>({decoded,closed,drawn})};
}
test('all image uploads become bounded WebP files; retries reuse the same conversion and audio is untouched',async()=>{
 const e=encoder(),file=new File(['png'],'앨범.png',{type:'image/png'});
 const [a,b]=await Promise.all([e.convert(file),e.convert(file)]);
 assert.equal(a,b);assert.equal(a.type,'image/webp');assert.equal(a.name,'앨범.webp');assert.equal(e.stats().decoded,1);assert.equal(e.stats().closed,1);assert.deepEqual(e.stats().drawn,[1600,800]);
 const audio=new File(['wav'],'song.wav',{type:'audio/wav'});assert.equal(await e.convert(audio),audio);
});
test('unsupported encoder fallback and oversized images fail explicitly without uploading mislabeled PNG',async()=>{
 const file=new File(['png'],'album.png',{type:'image/png'}),fallback=encoder({type:'image/png'});
 await assert.rejects(fallback.convert(file),/WebP/);await assert.rejects(fallback.convert(file),/WebP/);assert.equal(fallback.stats().decoded,2);assert.equal(fallback.stats().closed,2);
 const huge=encoder({width:10000,height:10000});await assert.rejects(huge.convert(file),/너무 커요/);assert.equal(huge.stats().closed,1);
 const small=encoder({width:240,height:120});await small.convert(file);assert.deepEqual(small.stats().drawn,[240,120]);
});
