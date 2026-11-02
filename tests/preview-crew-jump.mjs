// Local-only disposable preview. Nothing here is imported by the production Worker.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';
import {seasonTime} from '../server/crew-jump.js';
const port=Number(process.env.JUMP_PREVIEW_PORT||4387),origin='http://127.0.0.1:'+port;
const dir=path.resolve('dist/client'),f=await fixture({after(){}});
f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('preview','owner','별빛 크루',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('preview','owner','leader',0)");
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const env={DB:f.DB,CREW_JUMP_START_MONDAY:seasonTime(Date.now(),{}).week};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:'+port||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403).end();return}
  const u=new URL(req.url,origin);
  if(u.pathname==='/preview'){res.writeHead(302,{'set-cookie':'aifect_session=owner; HttpOnly; SameSite=Strict; Path=/','location':'/#crew/preview'}).end();return}
  if(u.pathname.startsWith('/api/')){
   const buffers=[];for await(const b of req)buffers.push(b);
   const r=await worker.fetch(new Request(u,{method:req.method,headers:req.headers,body:buffers.length?Buffer.concat(buffers):undefined}),env,{waitUntil(p){p.catch(()=>{})}});
   res.writeHead(r.status,Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()));return;
  }
  const file=path.resolve(dir,'.'+(u.pathname==='/'?'/aifect-shell.txt':decodeURIComponent(u.pathname)));
  if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return}
  const data=await fs.readFile(file);res.writeHead(200,{'content-type':(u.pathname==='/'?'text/html':types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'}).end(data);
 }catch{res.writeHead(404).end()}
});
server.listen(port,'127.0.0.1',()=>console.log(origin+'/preview'));
