import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual,createHash} from 'node:crypto';
import sharp from 'sharp';
import {render} from './renderer.mjs';
const revision=(await readFile(new URL('./revision',import.meta.url),'utf8')).trim();
const shell=await readFile(new URL('./shell.html',import.meta.url),'utf8');
const renderer=await readFile(new URL('./renderer.mjs',import.meta.url));
const shells=new Map([[revision,shell]]);
let check, checkedAt=0;
async function shellFor(id){
 if(shells.has(id))return shells.get(id);
 if(!check && Date.now()-checkedAt>1500){
  checkedAt=Date.now();
  check=(async()=>{
   const r=await fetch('https://aifect.co.kr/aifect-shell.txt',{headers:{'user-agent':'Mozilla/5.0 AIFECT-Origin/1.0'},redirect:'error',signal:AbortSignal.timeout(1100)});
   if(!r.ok||!r.headers.get('content-type')?.startsWith('text/plain'))return;
   const chunks=[];let n=0;for await(const c of r.body){if((n+=c.length)>256*1024)return;chunks.push(c);}
   const b=Buffer.concat(chunks),key=createHash('sha256').update(renderer).update('\0').update(b).digest('hex');
   if(!shells.has(key)&&shells.size>=5)shells.delete([...shells.keys()][1]);
   shells.set(key,b.toString('utf8'));
  })().catch(()=>{}).finally(()=>{check=null;});
 }
 if(check)await check;
 return shells.get(id);
}
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
  if(req.url==='/aifect-origin/v1/webp'){
   if(images>=2)return end(503);images++;
   try{const b=await read(req,maxImage),img=sharp(b,{limitInputPixels:64_000_000,failOn:'error'});
    const meta=await img.metadata();if(!['jpeg','png'].includes(meta.format))return end(415);
    const out=await img.rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();
    if(out.length>maxImage)return end(413);
    res.writeHead(200,{'content-type':'image/webp','content-length':out.length,'cache-control':'no-store'});return res.end(out);
   }finally{images--;}
  }
  const id=/^\/aifect-origin\/([0-9a-f]{64})\/page$/.exec(req.url)?.[1];
  if(!id)return end(404);
  const matchedShell=await shellFor(id);
  if(!matchedShell)return end(404);
  const {target,data}=JSON.parse((await read(req,524288)).toString());
  if(typeof target!=='string'||!target.startsWith('/')||target.startsWith('//')||target.includes('\\')||target.length>2048)return end(400);
  const r=await render(target,data,matchedShell);if(!r)return end(404);
  // The TLS vhost is a transport endpoint, not the canonical browsing origin.
  res.writeHead(r.status,{...Object.fromEntries(r.headers),'x-aifect-rendered':'1'});res.end(await r.text());
 }catch(e){if(!res.headersSent)end(e.message==='size'?413:422);else res.destroy();}
});
server.headersTimeout=10000;server.requestTimeout=15000;
server.listen(Number(process.env.PORT||18421),'127.0.0.1');
