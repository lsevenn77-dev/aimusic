// Disposable, loopback-only UI QA. No production bindings or member data.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after:fn=>cleanups.push(fn)});
f.sql.exec("UPDATE producers SET name='로컬테스트',nickname_confirmed=1; UPDATE tracks SET duration=180; UPDATE sessions SET expires=unixepoch()+86400");
const base=resolve('dist/client'),port=4197;
const env={DB:f.DB,AUTH_PEPPER:'isolated-preview-only',ASSETS:{async fetch(req){
 const pathname=decodeURIComponent(new URL(req.url).pathname),path=resolve(base,'.'+pathname);
 if(!path.startsWith(base+sep))return new Response('',{status:404});
 try{return new Response(await readFile(path),{headers:{'content-type':({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}
}}};
const server=createServer(async(req,res)=>{try{
 if(req.url==='/__qa/owner'){res.writeHead(302,{'set-cookie':'aifect_session=owner; Path=/; SameSite=Lax',location:'/#profile'});return res.end();}
 if(req.url==='/__qa/guest'){res.writeHead(302,{'set-cookie':'aifect_session=; Path=/; Max-Age=0',location:'/#login'});return res.end();}
 const chunks=[];for await(const part of req)chunks.push(part);
 const response=await worker.fetch(new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil:p=>p.catch(()=>{})});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){res.writeHead(500);res.end(e.message);}});
server.listen(port,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+port+'/__qa/owner'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
