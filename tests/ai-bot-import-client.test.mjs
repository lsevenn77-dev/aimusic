import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readImage} from '../server/images.js';

test('catalogue imports keep WebP bytes when the hosting server returns octet-stream',async()=>{
 const source=readFileSync(new URL('../dist/admin-ai-bots.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function catalogueImage('),source.indexOf(' function parseCSV('));
 const item=JSON.parse(readFileSync(new URL('../dist/assets/ai-bot-import/catalog.json',import.meta.url))).items[0];
 const data=readFileSync(new URL('../dist'+item.image,import.meta.url));let calls=0;
 const c=vm.createContext({Blob,fetch:async path=>{assert.equal(path,item.image);calls++;return new Response(data,{headers:{'content-type':'application/octet-stream'}});}});
 vm.runInContext(code,c);const blob=await c.catalogueImage(item);
 assert.equal(blob.type,'image/webp');assert.equal(blob.size,data.length);
 const image=await readImage(new Request('https://aifect.test/api/admin/ai-bots/assets',{method:'POST',body:blob}));
 assert.equal(image.type,'image/webp');assert.deepEqual(Buffer.from(image.data),data);
 await assert.rejects(c.catalogueImage({image:'https://other.test/image.webp'}),/허용된/);assert.equal(calls,1);
});
