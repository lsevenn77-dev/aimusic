import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNocFAAAAIkAOGVpLGLAAAAAElFTkSuQmCC','base64');
const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AI4AOff/2Q==','base64');

function galleryUpload({failAttempt=0}={}){
 const files=['portrait.jpg','landscape.jpg','square.png'].map(name=>new File([name.endsWith('.png')?png:jpeg],name,{type:name.endsWith('.png')?'image/png':'image/jpeg'}));
 const sizes=new Map(files.map((file,i)=>[file,[[2400,3200],[3200,1600],[600,600]][i]]));
 const listeners={},requests=[],saved=[],encodes=[],status={textContent:''},notices=[];
 let active=0,maxActive=0,decoded=0,released=0,closed=0,renders=0;
 const form={elements:{photos:{files}},querySelector:()=>status};
 class XHR{
  upload={};headers={};status=201;responseText='{}';
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(key,value){this.headers[key]=value;}
  send(file){
   const request={method:this.method,url:this.url,headers:this.headers,file};
   requests.push(request);const attempt=requests.length;maxActive=Math.max(maxActive,++active);
   queueMicrotask(()=>{active--;if(attempt===failAttempt)this.onerror();else{saved.push(request);this.onload();}this.onloadend();});
  }
 }
 const context=nicknameContext({
  Blob,File,XMLHttpRequest:XHR,setTimeout:()=>1,clearTimeout(){},invalidateReads(){},
  DataTransfer:class{files=[];items={add:file=>this.files.push(file)};},
  createImageBitmap:async file=>{decoded++;const [width,height]=sizes.get(file);return {width,height,close(){released++;}};},
  document:{addEventListener(type,fn){(listeners[type]??=[]).push(fn);},createElement(tag){
   assert.equal(tag,'canvas');
   return {getContext:()=>({drawImage(){}}),toBlob(resolve,type){encodes.push({type,width:this.width,height:this.height});resolve(new Blob([png],{type:'image/png'}));}};
  }},
  cropPhoto(){assert.fail('Artist gallery photos must keep their aspect ratio without a crop dialog.');},
  $:selector=>selector==='#gallery-upload-form'?form:{close(){closed++;}},
  dialog(){},busyForm:(_form,submit)=>submit,location:{hash:'#artist/artist'},
  render:async()=>{renders++;},toast:message=>notices.push(message)
 });
 vm.runInContext(source('image-upload.js'),context);
 const actions=source('actions.js'),start=actions.indexOf('async function uploadFile(');
 vm.runInContext(actions.slice(start,actions.indexOf('async function playlistDialog(',start)),context);
 vm.runInContext(source('artist-gallery.js'),context);
 const add={dataset:{galleryAdd:'artist',galleryCount:'0'},hasAttribute:()=>false};
 return {files,form,status,requests,saved,encodes,notices,
  open:()=>listeners.click[0]({target:{closest:()=>add},preventDefault(){}}),submit:()=>form.onsubmit(),
  stats:()=>({maxActive,decoded,released,closed,renders})};
}

test('artist gallery uploads three Safari PNG fallbacks sequentially with correct MIME, names and aspect ratios',async()=>{
 const ui=galleryUpload();await ui.open();await ui.submit();
 assert.equal(ui.saved.length,3);assert.equal(ui.stats().maxActive,1);
 assert.deepEqual(ui.saved.map(r=>r.file.name),['portrait.png','landscape.png','square.png']);
 assert.deepEqual(ui.encodes,[{type:'image/webp',width:1200,height:1600},{type:'image/webp',width:1600,height:800},{type:'image/webp',width:600,height:600}]);
 for(const request of ui.saved){
  assert.equal(request.method,'PUT');assert.equal(request.url,'/api/artists/artist/gallery');
  assert.equal(request.headers['Content-Type'],'image/png');assert.equal(request.file.type,'image/png');
  assert.deepEqual(Buffer.from(await request.file.arrayBuffer()),png);
 }
 assert.deepEqual(ui.stats(),{maxActive:1,decoded:3,released:3,closed:1,renders:1});
 assert.equal(ui.notices.length,1);
});

test('a failed gallery upload retains only unsent photos and reuses the PNG conversion on retry',async()=>{
 const ui=galleryUpload({failAttempt:2});await ui.open();
 await assert.rejects(ui.submit(),/연결이 끊어졌습니다/);
 assert.equal(ui.saved.length,1);assert.equal(ui.stats().closed,0);assert.equal(ui.stats().renders,0);
 assert.deepEqual(ui.form.elements.photos.files,ui.files.slice(1));assert.match(ui.status.textContent,/1장 업로드 완료/);
 await ui.submit();
 assert.deepEqual(ui.requests.map(r=>r.file.name),['portrait.png','landscape.png','landscape.png','square.png']);
 assert.deepEqual(ui.saved.map(r=>r.file.name),['portrait.png','landscape.png','square.png']);
 assert.equal(ui.requests[1].file,ui.requests[2].file,'Retry should reuse the successfully encoded file.');
 assert.deepEqual(ui.stats(),{maxActive:1,decoded:3,released:3,closed:1,renders:1});
});
