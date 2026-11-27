import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readImage} from '../server/images.js';

const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNocFAAAAIkAOGVpLGLAAAAAElFTkSuQmCC','base64');
const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');

function mobileUpload({failEncodingOnce=false}={}){
 const audio=new File(['unchanged audio bytes'],'song.mp3',{type:'audio/mpeg'}),cover=new File([png],'커버.png',{type:'image/png'});
 const events=[],requests=[],statuses=[],form={_draft:{id:'mobile-draft',fingerprint:'unchanged'},title:'입력한 곡 제목'},location={hash:'#upload'};
 let encodes=0,closed=0;
 class XHR{
  upload={};headers={};status=201;responseText='{}';
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(name,value){this.headers[name]=value;}
  send(file){
   requests.push({url:this.url,method:this.method,headers:this.headers,file});events.push(this.url);
   queueMicrotask(()=>{this.upload.onprogress?.({lengthComputable:true,loaded:file.size,total:file.size});this.onload();this.onloadend();});
  }
 }
 const c=vm.createContext({
  Blob,File,XMLHttpRequest:XHR,setTimeout:()=>1,clearTimeout(){},invalidateReads(){},location,
  window:{},toast(){},uploadStage(_form,label,value,state){statuses.push({label,value,state});},
  uploadRequest:async(url,method)=>{assert.equal(method,'POST');events.push(url);return {};},
  createImageBitmap:async()=>({width:2400,height:1600,close(){closed++;}}),
  document:{createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:resolve=>resolve(new Blob([png],{type:'image/png'}))})},
  cropPhoto(){assert.fail('A song cover must not prompt for profile cropping.');}
 });
 vm.runInContext(source('image-upload.js'),c);
 c.encodeUploadCanvasWebp=async canvas=>{
  encodes++;events.push('encode');assert.equal(canvas.width,1600);assert.equal(canvas.height,1067);
  if(failEncodingOnce&&encodes===1)throw Error('Temporary encoder fetch failure');
  return new Blob([webp],{type:'image/webp'});
 };
 const actions=source('actions.js'),sendStart=actions.indexOf('async function sendUploadFiles('),uploadStart=actions.indexOf('async function uploadFile(');
 vm.runInContext(actions.slice(sendStart,actions.indexOf('function deleteTrackDialog(',sendStart)),c);
 vm.runInContext(actions.slice(uploadStart,actions.indexOf('async function playlistDialog(',uploadStart)),c);
 return {audio,cover,events,requests,statuses,form,location,submit:()=>c.sendUploadFiles(form,form._draft.id,audio,cover),stats:()=>({encodes,closed})};
}

test('mobile music upload sends unchanged audio and server-valid WebP cover before completing the same draft',async()=>{
 const ui=mobileUpload();await ui.submit();
 assert.deepEqual(ui.events,['/api/uploads/mobile-draft/audio','encode','/api/uploads/mobile-draft/cover','/api/uploads/mobile-draft/complete']);
 assert.equal(ui.requests[0].file,ui.audio);assert.equal(ui.requests[0].headers['Content-Type'],'audio/mpeg');
 const image=ui.requests[1];assert.equal(image.method,'PUT');assert.equal(image.file.name,'커버.webp');assert.equal(image.headers['Content-Type'],'image/webp');
 assert.deepEqual(Buffer.from(await image.file.arrayBuffer()),webp);
 const accepted=await readImage(new Request('https://aifect.test'+image.url,{method:'PUT',headers:image.headers,body:image.file}));
 assert.equal(accepted.type,'image/webp');assert.deepEqual(Buffer.from(accepted.data),webp);
 assert.equal(ui.location.hash,'studio');assert.equal(ui.statuses.at(-1).state,'done');assert.deepEqual(ui.stats(),{encodes:1,closed:1});
});

test('mobile image conversion failure never completes a partial upload and the same selected files and draft can retry',async()=>{
 const ui=mobileUpload({failEncodingOnce:true}),draft=ui.form._draft;
 await assert.rejects(ui.submit(),error=>{assert.match(error.message,/변환/);assert.doesNotMatch(error.message,/Chrome|Edge/);return true;});
 assert.deepEqual(ui.events,['/api/uploads/mobile-draft/audio','encode']);assert.equal(ui.location.hash,'#upload');
 assert.equal(ui.form._draft,draft);assert.equal(ui.form.title,'입력한 곡 제목');assert.equal(ui.requests.length,1);assert.equal(ui.stats().closed,1);
 await ui.submit();
 assert.equal(ui.requests[0].file,ui.audio);assert.equal(ui.requests[1].file,ui.audio);
 assert.equal(ui.requests[2].file.type,'image/webp');assert.equal(ui.form._draft,draft);
 assert.equal(ui.events.filter(path=>path.endsWith('/complete')).length,1);assert.equal(ui.location.hash,'studio');assert.deepEqual(ui.stats(),{encodes:2,closed:2});
});
