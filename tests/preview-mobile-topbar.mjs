import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}});
f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','로컬 검증 상대',0);UPDATE tracks SET duration=60;");
for(let i=0;i<90;i++) f.sql.prepare("INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,'other','owner',?,?,?)").run('qa-'+i,'검증 메시지 '+i+' — 읽던 위치를 보존합니다.','qa-'+i,Math.floor(Date.now()/1000)-100+i);
f.sql.prepare("INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,target_kind,created) VALUES('qa-note','owner','other','comment','one','song',?)").run(Math.floor(Date.now()/1000));
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const root=resolve('dist/client');
const server=createServer(async(req,res)=>{
 try {
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){
   // Exercise the real handlers with isolated SQLite. SSE stays disconnected
   // here; its reconnect behavior is covered by the repository suite.
   if(pathname.includes('/stream')){res.writeHead(204);res.end();return;}
   const parts=[];for await(const p of req)parts.push(p);
   const r=await worker.fetch(new Request('http://127.0.0.1:4195'+req.url,{method:req.method,headers:{...req.headers,origin:'http://127.0.0.1:4195'},...(parts.length?{body:Buffer.concat(parts)}:{})}),{DB:f.DB},{waitUntil(p){p.catch(()=>{});}});
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  const path=pathname==='/'?resolve(root,'aifect-shell.txt'):resolve(root,'.'+pathname);
  if(!path.startsWith(root))throw Error('Invalid path');
  const data=await readFile(path);res.writeHead(200,{'Content-Type':pathname==='/'?'text/html':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(e){res.writeHead(404);res.end(String(e));}
});
server.listen(4195,'127.0.0.1',()=>console.log('Local fixture preview: http://127.0.0.1:4195/#home'));
