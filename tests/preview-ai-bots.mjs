// Disposable SQLite and in-memory R2. No production credentials or outbound AI calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';
import {createAdminPasswordHash} from '../server/admin-session.js';
import {BOT_DEFAULTS} from '../shared/ai-bots.js';
import {runBotEngine} from '../server/ai-bots.js';
const objects=new Map(),cleanups=[],port=Number(process.env.PREVIEW_PORT||4197),base=resolve('dist/client');
const env={ADMIN_USER_IDS:'owner',ADMIN_PASSWORD_HASH:await createAdminPasswordHash('local-bot-review-only'),BUCKET:{async put(k,v){objects.set(k,v instanceof ReadableStream?new Uint8Array(await new Response(v).arrayBuffer()):v);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async head(k){return objects.has(k)?{size:objects.get(k).length}:null;},async delete(k){objects.delete(k);}},ASSETS:{async fetch(req){const u=new URL(req.url),p=resolve(base,'.'+(u.pathname==='/'?'/index.html':u.pathname==='/admin/dashboard'?'/admin/dashboard.html':decodeURIComponent(u.pathname)));if(!p.startsWith(base+sep))return new Response('',{status:404});try{let data=await readFile(p);if(extname(p)==='.html')data=Buffer.from(data.toString().replace('</body>','<p style="position:fixed;bottom:0;right:0;background:#11141d;color:#aeebdf;font:11px sans-serif;z-index:9999">로컬 검증 · 운영 변경 없음</p></body>'));return new Response(data,{headers:{'content-type':({'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'})[extname(p)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
const f=await fixture({after(fn){cleanups.push(fn);}},env);env.DB=f.DB;
if(process.env.AI_BOT_QA_SEED==='1'){
 const catalog=JSON.parse(await readFile('dist/assets/ai-bot-import/catalog.json','utf8'));
 for(let offset=0;offset<catalog.items.length;offset+=5){
  const items=[];
  for(const row of catalog.items.slice(offset,offset+5)){const data=await readFile('dist'+row.image);objects.set('images/ai-bot-staging/'+row.sha,data);f.sql.prepare('INSERT INTO ai_bot_assets VALUES(?,?,?,?)').run(row.sha,data.length,'owner',0);items.push({name:row.name,source_key:row.source_key,sha:row.sha});}
  const preview=await f.call('/api/admin/ai-bots/import/preview','POST',{items,owned_ai:true});
  const imported=await f.call('/api/admin/ai-bots/import/execute','POST',{items,owned_ai:true,preview_token:preview.body.preview_token});if(imported.status!==200||imported.body.results.some(i=>i.status!=='created'))throw new Error('Fixture import failed');
 }
 f.sql.prepare('UPDATE ai_bot_settings SET json=? WHERE id=1').run(JSON.stringify({...BOT_DEFAULTS,enabled:true,commentMin:0,commentMax:0,giftDelayMin:0,giftDelayMax:0}));
 f.sql.exec("UPDATE ai_bots SET active=1 WHERE number<=2;UPDATE tracks SET status='published',title='공식 AI 응원 검증 작품' WHERE id='hidden'");
 await runBotEngine(env);
 f.sql.prepare('UPDATE ai_bot_settings SET json=?,revision=revision+1 WHERE id=1').run(JSON.stringify(BOT_DEFAULTS));
 f.sql.exec('UPDATE ai_bots SET active=0');
 console.log('335 reviewed AI profiles, one fixture comment/gift; automation OFF. This database is disposable.');
}
const server=createServer(async(req,res)=>{try{const bytes=[];for await(const b of req)bytes.push(b);const response=await worker.fetch(new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:{...req.headers,cookie:(req.headers.cookie||'')+'; aifect_session=owner'},body:bytes.length?Buffer.concat(bytes):undefined}),env,{waitUntil(p){p.catch(console.error);}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Local fixture failed');}});
server.listen(port,'127.0.0.1',()=>console.log('Local bot review: http://127.0.0.1:'+port+'/admin/dashboard · password: local-bot-review-only'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(f=>f());process.exit(0);}));
