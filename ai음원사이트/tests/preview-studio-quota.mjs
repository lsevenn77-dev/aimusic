// Real app + real API handlers, disposable in-memory SQLite. Loopback only.
// POST /__quota-fixture is test setup and is never copied to dist/client.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),port=4325;
for(let i=0;i<10;i++)f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published','original')").run('quota-'+i,'로컬 검증 제작곡 '+(i+1));
let failQuota=false;
function setup({plan='free',used=0,error=false,expiresIn=3600}){
 if(!['free','premium'].includes(plan)||!Number.isInteger(used)||used<0||used>10)throw Error('Invalid local fixture');
 const at=Math.floor(Date.now()/1000);failQuota=error;
 f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(plan==='premium'?at+expiresIn:0);
 f.sql.exec("UPDATE tracks SET uploaded_at=0,created=0");
 for(let i=0;i<used;i++)f.sql.prepare('UPDATE tracks SET uploaded_at=? WHERE id=?').run(at,'quota-'+i);
}
setup({});
const root=resolve('dist/client'),types={'.txt':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const env={DB:f.DB,ASSETS:{async fetch(req){const file=resolve(root,'.'+new URL(req.url).pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':types[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port),parts=[];for await(const part of req)parts.push(part);
  if(url.pathname==='/__quota-fixture'&&req.method==='POST'){setup(JSON.parse(Buffer.concat(parts)));res.writeHead(200);res.end('Local fixture updated');return;}
  if(failQuota&&url.pathname==='/api/me'){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"Local quota failure scenario"}');return;}
  if(url.pathname.includes('/stream')){res.writeHead(204);res.end();return;}
  const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,origin:url.origin,cookie:'aifect_session=owner'},...(parts.length?{body:Buffer.concat(parts)}:{})}),env,{waitUntil(p){p.catch(()=>{});}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(String(error));}
});
server.listen(port,'127.0.0.1',()=>console.log('Local Studio quota QA: http://127.0.0.1:'+port+'/#studio'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
