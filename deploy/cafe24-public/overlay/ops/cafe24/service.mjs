import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import sharp from 'sharp';
import {render} from './renderer.mjs';
const revision=(await readFile(new URL('./revision',import.meta.url),'utf8')).trim();
const shell=await readFile(new URL('./shell.html',import.meta.url),'utf8');
const token=process.env.CAFE24_ORIGIN_KEY;
if(!/^[a-f0-9]{64}$/.test(revision)||!token||token.length<32)throw Error('Missing release identity');
const expected=Buffer.from('Bearer '+token);
let images=0;
const maxImage=5*1024*1024;
async function read(req,max){if(Number(req.headers['content-length'])>max)throw Error('size');let n=0;const parts=[];for await(const p of req){n+=p.length;if(n>max)throw Error('size');parts.push(p);}return Buffer.concat(parts);}
sharp.cache({memory:24,files:0,items:8});sharp.concurrency(1);
const server=http.createServer(async(req,res)=>{
 const end=(code,text='')=>{res.writeHead(code,{'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(text);};
 try{
  const sent=Buffer.from(req.headers.authorization||'');
  if(req.method!=='POST'||sent.length!==expected.length||!timingSafeEqual(expected,sent))return end(404);
  const base='/aifect-origin/'+revision+'/';
  if(req.url==='/aifect-origin/v1/webp'){
   if(images>=2)return end(503);images++;
   try{const b=await read(req,maxImage),img=sharp(b,{limitInputPixels:64_000_000,failOn:'error'});
    const meta=await img.metadata();if(!['jpeg','png'].includes(meta.format))return end(415);
    const out=await img.rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();
    if(out.length>maxImage)return end(413);
    res.writeHead(200,{'content-type':'image/webp','content-length':out.length,'cache-control':'no-store'});return res.end(out);
   }finally{images--;}
  }
  if(req.url!==base+'page')return end(404);
  const {target,data}=JSON.parse((await read(req,524288)).toString());
  if(typeof target!=='string'||!target.startsWith('/')||target.startsWith('//')||target.includes('\\')||target.length>2048)return end(400);
  const r=await render(target,data,shell);if(!r)return end(404);
  // The TLS vhost is a transport endpoint, not the canonical browsing origin.
  res.writeHead(r.status,{...Object.fromEntries(r.headers),'x-aifect-rendered':'1'});res.end(await r.text());
 }catch(e){if(!res.headersSent)end(e.message==='size'?413:422);else res.destroy();}
});
server.headersTimeout=10000;server.requestTimeout=15000;
server.listen(Number(process.env.PORT||18421),'127.0.0.1');
