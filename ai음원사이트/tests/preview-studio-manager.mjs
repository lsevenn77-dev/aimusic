// Real app/handlers, disposable local SQLite only; never uses production data.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),port=4324;
f.sql.exec("UPDATE tracks SET title='검증 공개곡 '||id,duration=60; UPDATE tracks SET title='검증 비공개곡' WHERE id='hidden'");
for(const status of ['uploading','queued','processing','failed','removed'])f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,?,'original')").run(status,'검증 '+status,status);
f.sql.exec("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES('cover','owner','artist','producer','검증 커버곡','Rock','QA',1,'wav',128,0,'published','cover','one')");
const root=resolve('dist/client'),types={'.txt':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const env={DB:f.DB,ASSETS:{async fetch(req){const file=resolve(root,'.'+new URL(req.url).pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':types[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(url.pathname.includes('/stream')){res.writeHead(204);res.end();return;}
  const parts=[];for await(const part of req)parts.push(part);
  const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,origin:url.origin,cookie:'aifect_session=owner'},...(parts.length?{body:Buffer.concat(parts)}:{})}),env,{waitUntil(p){p.catch(()=>{});}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(String(error));}
});
server.listen(port,'127.0.0.1',()=>console.log('Local Studio preview: http://127.0.0.1:'+port+'/#studio'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
