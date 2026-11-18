// Disposable localhost fixture. Only real catalog SKUs; no production requests/storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {WebSocketServer} from 'ws';
import {decorationsFixture} from './decorations-fixture.mjs';
import {DECORATIONS} from '../shared/decorations.js';
import {VoiceRoom} from '../realtime/worker-live-karaoke.js';
import worker from '../server/index.js';
const cleanup=[],t={after:fn=>cleanup.push(fn),mock:{method(obj,key,fn){obj[key]=fn;}}};
const f=await decorationsFixture(t,{voice:true,gold:10000}),root=resolve('dist/client'),port=4398;
f.sql.exec("UPDATE producers SET name='로컬 검증 회원' WHERE user_id='owner'");
for(const [i,p] of Object.values(DECORATIONS).entries()){
 const b=await f.buy(p.sku,i%2?'P1M':'P7D');
 if(i%2){await f.use(b.body.order.inventory_id);if(i===1)f.sql.prepare("UPDATE player_inventory SET expires_at=unixepoch()+3600 WHERE item_key=? AND source='decoration'").run(p.sku);}
}
await f.buy('theme_christmas');
const themes=(await f.call('/api/voice/options')).body.themes;
for(const mode of ['talk','karaoke']){
 const room=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:mode==='talk'?'테마 검증 토킹룸':'테마 검증 노래방',mode,background:'basic_dark'});
 if(room.status!==201)throw Error(JSON.stringify(room));
}
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html;charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png'};
const assets={async fetch(req){const file=resolve(root,'.'+new URL(req.url).pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':types[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}};
const env={DB:f.DB,VOICE_SERVICE_URL:'https://voice-fixture.test',VOICE_BRIDGE_SECRET:'local-decoration-bridge-secret-0001',ASSETS:assets,BUCKET:{get:async()=>null,head:async()=>null}};
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:'+port);
 if(u.pathname==='/qa-metrics'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({redemptions:f.sql.prepare('SELECT inventory_id,created,expires_at FROM decoration_redemptions').all(),rooms:[...f.rooms.values()].map(r=>r.data.config)}));return;}
 if(u.pathname==='/qa-frame'){
  const width=Number(u.searchParams.get('width')||390),height=Number(u.searchParams.get('height')||844);
  if(![320,390,768,1440].includes(width)||!Number.isInteger(height)||height<600||height>1024){res.writeHead(400);res.end();return;}
  res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>AIFECT '+width+'px local QA</title><style>body{margin:0;background:#0c121b}iframe{display:block;border:0;width:'+width+'px;height:'+height+'px}</style><iframe title="실제 인벤토리 검증" src="/#inventory"></iframe>');return;
 }
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const response=await worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){void p.catch(()=>{});}});
 const headers=new Headers(response.headers);
 if(u.pathname==='/'&&headers.get('content-type')?.includes('text/html')){headers.set('content-security-policy',(headers.get('content-security-policy')||'').replace(/frame-ancestors[^;]*/,"frame-ancestors 'self'"));headers.set('x-frame-options','SAMEORIGIN');}
 res.writeHead(response.status,Object.fromEntries(headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message);console.error(e);}});
const wss=new WebSocketServer({noServer:true}),peers=new Map();
server.on('upgrade',(req,socket,head)=>{
 const u=new URL(req.url,'http://127.0.0.1:'+port),id=u.pathname.match(/rooms\/([^/]+)\/socket$/)?.[1],room=f.rooms.get(id),generation=u.searchParams.get('generation'),member=room?.data.members.owner;
 if(!member||member.generation!==generation){socket.destroy();return;}
 if(!peers.has(id)){peers.set(id,new Set());room.ctx.getWebSockets=()=>[...peers.get(id)];room.notify=VoiceRoom.prototype.notify;}
 wss.handleUpgrade(req,socket,head,ws=>{ws.deserializeAttachment=()=>({id:'owner',generation});peers.get(id).add(ws);ws.on('close',()=>peers.get(id).delete(ws));ws.send(JSON.stringify({type:'state',state:room.snapshot(member)}));});
});
server.listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/#inventory'));
process.on('SIGINT',()=>{wss.close();server.close();cleanup.forEach(fn=>fn());process.exit(0);});
