// Disposable local SQLite/voice fixture; never calls production APIs.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {decorationsFixture} from './decorations-fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],t={after:fn=>cleanups.push(fn),mock:{method(object,key,fn){object[key]=fn;}}};
const f=await decorationsFixture(t,{voice:true}),port=4214;
f.sql.exec("UPDATE producers SET name='로컬 검증 방장' WHERE id='producer'; INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',1000)");
await f.call('/api/producers/friend/follow','PUT');
let qaRoom;
for(const sku of ['theme_starlight_lounge','theme_cherry_blossom','theme_aurora_night']){
 await f.buyUse(sku);
 const room=await f.call('/api/voice/rooms','POST',{title:'로컬 검증 · '+sku,visibility:'public',background:sku,max_members:30,request_id:crypto.randomUUID()});
 if(room.status!==201&&room.status!==200)throw Error(JSON.stringify(room));
 const joined=await f.call('/api/voice/rooms/'+room.body.room.id+'/join','POST',{request_id:crypto.randomUUID()});
 if(!qaRoom)qaRoom=room.body.room.id;
 setInterval(()=>void f.call('/api/voice/rooms/'+room.body.room.id+'/state?generation='+joined.body.generation),15000).unref();
}
const root=resolve('dist/client');
const env={DB:f.DB,...{VOICE_SERVICE_URL:'https://voice-fixture.test',VOICE_BRIDGE_SECRET:'local-decoration-bridge-secret-0001'},ASSETS:{async fetch(req){const u=new URL(req.url),file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.txt':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:'+port);
 if(u.pathname==='/qa-metrics.js'){res.setHeader('content-type','text/javascript');res.end(await readFile('tests/community-final-metrics.js'));return;} if(u.pathname==='/qa'){
  const width=Number(u.searchParams.get('w'))||1440,height=Number(u.searchParams.get('h'))||900,route=u.searchParams.get('route')==='room'?'voice/'+qaRoom:u.searchParams.get('route')||'gifts';
  res.setHeader('content-type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>격리된 로컬 QA</title><style>body{margin:0;background:#0c121b;color:white;font:12px sans-serif}iframe{border:0;transform-origin:top left;position:absolute;top:40px;left:0}</style><p>${width}×${height} · 격리된 로컬 테스트 데이터</p><iframe title="검증 앱" width="${width}" height="${height}" src="/#${route.replace(/[^\w/-]/g,'')}"></iframe><script src="/qa-metrics.js"></script><script>const f=document.querySelector('iframe');function fit(){f.style.transform='scale('+Math.min(1,innerWidth/${width},(innerHeight-40)/${height})+')'}fit();addEventListener('resize',fit);</script>`);return;
 }
 const chunks=[];for await(const c of req)chunks.push(c);
 const response=await worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
 res.writeHead(response.status,{...Object.fromEntries(response.headers),'cache-control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}}).listen(port,'127.0.0.1',()=>console.log('Local QA: http://127.0.0.1:'+port+'/qa?w=1440&h=900'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
