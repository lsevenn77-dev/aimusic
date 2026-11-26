// Loopback-only disposable SQLite fixture. Never bundled or deployed.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {decorationsFixture} from './decorations-fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],t={after:fn=>cleanups.push(fn),mock:{method(target,key,fn){const old=target[key];target[key]=fn;cleanups.push(()=>target[key]=old);}}};
const f=await decorationsFixture(t,{voice:true}),base=resolve('dist/client'),port=4190;
f.sql.exec("UPDATE producers SET name=CASE id WHEN 'producer' THEN '로컬 테스트 방장' ELSE '로컬 테스트 친구' END,nickname_confirmed=1; UPDATE users SET premium_until=0,apple_premium_until=0; UPDATE sessions SET expires=unixepoch()+86400; INSERT OR IGNORE INTO follows(user_id,kind,target_id,created) VALUES('owner','producer','friend',0);");
// Starter stock and active themes are visibly local QA records only.
await f.buy('frame_aurora_ring');for(const sku of ['theme_starlight_lounge','theme_cherry_blossom','theme_aurora_night'])await f.buyUse(sku);
const created=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'로컬 테마 검증 룸',background:'theme_starlight_lounge'}),rid=created.body.room.id;
const env={DB:f.DB,AUTH_PEPPER:'local-decoration-preview',VOICE_SERVICE_URL:'https://voice-fixture.test',VOICE_BRIDGE_SECRET:f.voiceEnv.VOICE_BRIDGE_SECRET,BUCKET:{get:async()=>null,head:async()=>null},ASSETS:{async fetch(req){
 const path=resolve(base,'.'+(new URL(req.url).pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url).pathname)));if(!path.startsWith(base+sep))return new Response('',{status:404});
 try{return new Response(await readFile(path),{headers:{'content-type':({'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}
}}};
// Keep only fixture membership alive while screenshots are taken.
const keepalive=setInterval(()=>{for(const room of f.rooms.values())for(const p of Object.values(room.data?.members||{}))p.expires=Date.now()+75000;},20000);
const server=createServer(async(req,res)=>{try{
 if(req.url.startsWith('/__qa/session/')){const uid=req.url.split('/').pop();if(!['owner','other','guest'].includes(uid)){res.writeHead(400);return res.end();}res.writeHead(302,{'set-cookie':'aifect_session='+(uid==='guest'?'':uid)+'; Path=/; SameSite=Lax',location:'/#gifts/frames'});return res.end();}
 if(req.url==='/__qa/expire'&&req.method==='POST'){f.sql.exec("UPDATE player_inventory SET expires_at=unixepoch()+5 WHERE source='decoration'");res.writeHead(303,{location:'/__qa'});return res.end();}
 if(req.url==='/__qa'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});return res.end(`<h1>로컬 QA 도구</h1><p>운영 데이터와 무관한 임시 계정</p><a href="/__qa/session/owner">방장 계정</a> <a href="/__qa/session/other">친구 계정</a><p><a href="/#voice/${rid}">테스트 룸</a> <a href="/#community">토킹룸 목록</a></p><form method="POST" action="/__qa/expire"><button>사용 중 아이템을 5초 후 만료</button></form><p>선물함에서 구매 → 인벤토리의 구입한 상품에서 선물하기 → 로컬 테스트 친구 선택 → 친구 계정으로 전환 → 인벤토리에서 사용 시작</p>`);}
 const chunks=[];for await(const part of req)chunks.push(part);const response=await worker.fetch(new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil:p=>p.catch(()=>{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e.message);res.writeHead(500);res.end('Local fixture error');}});
server.listen(port,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+port+'/__qa/session/owner\nQA: http://127.0.0.1:'+port+'/__qa'));
process.on('SIGINT',()=>{clearInterval(keepalive);server.close(()=>{for(const fn of cleanups)fn();process.exit(0);});});
