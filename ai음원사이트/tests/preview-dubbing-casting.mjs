// Disposable local API-backed fixtures only; no production reads/writes or paid APIs.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {castingFixture} from './dubbing-casting-fixtures.mjs';
import {sampleScript,options} from './dubbing-fixtures.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await castingFixture({after(fn){cleanups.push(fn);}},6),env=f.env;
const previewUser=process.env.DUBBING_PREVIEW_USER||'actor7';
await f.base();
for(const count of [2,2,3,5,6]){
 let target;
 for(let i=2;i<=count;i++){const d=await f.draft('role_'+i,'actor'+i,target);const r=await f.submit(d.pid,'role_'+i,'actor'+i,d.rev);if(r.status!==200)throw Error(JSON.stringify(r));target=r.body.casting.combinationId;}
}
for(const [i,uid] of ['owner','actor2','actor3','actor4','actor5','actor6','actor7'].entries()){
 const names=['테스트 원작자','배우 하린','배우 지훈','배우 서연','배우 민준','배우 소라','테스트 참여자'];
 const pid=uid==='owner'?'producer':'profile-'+uid;
 if(uid!=='owner')f.sql.prepare('INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)').run(pid,uid,names[i]);
 f.sql.prepare("UPDATE producers SET name=?,image_version=1,image_type='image/svg+xml' WHERE id=?").run(names[i],pid);
 f.sql.prepare('UPDATE users SET name=? WHERE id=?').run(names[i],uid);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="64" fill="'+['#63567f','#386874','#785a7e','#5e617e','#456858','#786150','#50697d'][i]+'"/><circle cx="64" cy="44" r="23" fill="#e3d9ee"/><path d="M24 116a40 42 0 0 1 80 0" fill="#e3d9ee"/></svg>';
 await env.BUCKET.put('images/producer/'+pid+'/1',svg,{httpMetadata:{contentType:'image/svg+xml'}});
}
for(const [title,genres] of [['누구를 부르는 신호',['SF']],['불 꺼진 도서관',['미스터리']],['먹빛 속의 어명',['사극']],['마지막 페이지',['일상']],['벚꽃이 지는 자리에서',['로맨스']]]){
 const script=sampleScript();script.title=title;script.genres=genres;
 const r=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options:{...options,genres},script},'other');
 if(r.status!==201)throw Error(JSON.stringify(r));await f.call('/api/dubbing/projects/'+r.body.project.id+'/publish','POST',{revision:1,rightsAccepted:true},'other');
}
f.sql.prepare('UPDATE dubbing_projects SET created=? WHERE id=?').run(Math.floor(Date.now()/1000)+1,f.root);
console.log('Preview root '+f.root+'; user '+previewUser);
const base=resolve('dist/client');
env.ASSETS={async fetch(req){
 const u=new URL(req.url),file=resolve(base,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!file.startsWith(base+sep))return new Response('',{status:404});
 try{
  let data=await readFile(file);
  if(file.endsWith('.html'))data=Buffer.from(data.toString().replace('</body>','<div style="position:fixed;left:0;right:0;top:0;z-index:9999;background:#1e544c;color:white;text-align:center;font:11px sans-serif;padding:4px;pointer-events:none">로컬 테스트 · 샘플 작품 · 실제 계정·AI 호출·결제 없음</div></body>'));
  return new Response(data,{headers:{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});
 }catch{return new Response('Not found',{status:404});}
}};
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const c of req)chunks.push(c);
  const response=await worker.fetch(new Request('http://127.0.0.1:4182'+req.url,{method:req.method,headers:{...req.headers,cookie:'aifect_session='+previewUser},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Local preview error');}
});
server.listen(4182,'127.0.0.1',()=>console.log('Dubbing preview: '+'http://127.0.0.1:4182/#/karaoke/dubbing?tab=discover&project='+f.root));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
