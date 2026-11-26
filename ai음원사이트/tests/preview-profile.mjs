// Local, in-memory preview only. Never registered or bundled as a production route.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),objects=new Map();
const ocean=await readFile('dist/assets/ocean.png'),nova=await readFile('dist/assets/nova.png');
const wav=new Uint8Array(44+44100*2*45),view=new DataView(wav.buffer);
wav.set(new TextEncoder().encode('RIFF'));view.setUint32(4,wav.length-8,true);wav.set(new TextEncoder().encode('WAVEfmt '),8);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,44100,true);view.setUint32(28,88200,true);view.setUint16(32,2,true);view.setUint16(34,16,true);wav.set(new TextEncoder().encode('data'),36);view.setUint32(40,wav.length-44,true);
const titles=['바람이 머문 자리','푸른 밤의 멜로디','우리의 작은 무대'];
f.sql.prepare("UPDATE producers SET name=?,bio=?,image_version='demo',image_type='image/png' WHERE id='producer'").run('미리보기 음악가','실제 데이터와 분리된 로컬 화면 테스트입니다.\n좋아하는 음악과 일상의 순간을 기록해요.');
f.sql.exec("INSERT INTO producers(id,user_id,name,bio,created) VALUES('friend','other','함께 부르는 친구','노래로 만나요.',0);INSERT INTO direct_messages(id,sender_id,recipient_id,body,created,request_id) VALUES('hello','other','owner','방금 올린 곡 잘 들었어요!',1,'hello')");
objects.set('images/producer/producer/demo',nova);
for(let i=0;i<3;i++){
 const tid=['one','two','three'][i];
 f.sql.prepare("UPDATE tracks SET title=?,has_cover=1,cover_version='demo',cover_type='image/png',duration=45,karaoke_at=1,lyrics_mode='synced',lyrics=?,description=?,created=? WHERE id=?").run(titles[i],'[00:01.000]처음 만난 이 순간\n[00:05.000]함께 노래를 불러요\n[00:10.000]우리의 작은 무대에서','미리보기 전용 곡입니다.',i+1,tid);
 const words=['처음 만난 이 순간','함께 노래를 불러요','우리의 작은 무대에서','다시 시작되는 멜로디'].map((t,j)=>({s:1+j*6,e:5+j*6,w:[{t,s:1+j*6,e:5+j*6}]}));
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,lyrics_text,words,words_state,created,updated) VALUES(?,?,'ready',1,'미리보기',?,'ready',0,0)").run(tid,'job'+i,JSON.stringify(words));
 objects.set('images/track/'+tid+'/demo',i%2?nova:ocean);objects.set('karaoke/'+tid+'/mr.m4a',wav);
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('owner',?,?)").run(tid,i);
}
// Include a real cover-shaped fixture so ranked social actions cannot hide behind empty-state QA.
f.sql.exec("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration) VALUES('preview-cover','other','artist','friend','바람이 머문 자리 — 함께 부른 커버','Rock','',1,'wav',128,0,'published','cover','one',45)");
for(let i=0;i<4;i++){
 f.sql.prepare('INSERT INTO profile_photos VALUES(?,?,?,?,?)').run('photo'+i,'producer','demo'+i,'image/png',i);
 objects.set('images/producer/producer/gallery/demo'+i,i%2?nova:ocean);
}
for(let i=0;i<16;i++){
 const tid='library-qa-'+i;
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,duration,has_cover,cover_version,cover_type) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,?,'published',45,1,'demo','image/png')").run(tid,i===15?'아주 긴 노래 제목도 화면 밖으로 밀려나지 않고 말줄임으로 확인할 수 있는 가을의 노래':'함께 듣는 음악 '+String(i+1).padStart(2,'0'),1792900000+i);
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('owner',?,?)").run(tid,1792900000+i);
 f.sql.prepare("INSERT INTO listens(id,listener,user_id,track_id,started,day) VALUES(?,'owner','owner',?,?,'2026-10-26')").run('listen-'+i,tid,1792900000+i);
 objects.set('images/track/'+tid+'/demo',i%2?nova:ocean);
}
// Isolated fixture records exercise real wallet, inventory and equipment APIs.
f.sql.exec("INSERT INTO crews(id,owner_id,name,description,created) VALUES('qa-crew','owner','ZERO','함께 만들고 노래하는 크루',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('qa-crew','owner','leader',0),('qa-crew','other','member',0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,created,status) VALUES('qa-paid','owner','web',2500,25000,825,2273,0,'paid'); INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',1280); INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,expires_at) VALUES('qa-active','owner','crew-outline','reward','qa-active',unixepoch()-86400,unixepoch()+86400*14),('qa-expired','owner','crew-outline','reward','qa-expired',unixepoch()-86400*30,unixepoch()-86400); INSERT OR REPLACE INTO player_equipment(user_id,frame_inventory_id) VALUES('owner','qa-active'); INSERT INTO free_gifts(id,sender_id,recipient_profile_id,request_id,created,gift_type,gift_name,silver,quantity) VALUES('qa-gift','other','producer','qa-gift',unixepoch(),'silver-letter','손편지',6,3)");
const qaBuy=await f.call('/api/me/gift-inventory/buy','POST',{gift_type:'silver-letter',quantity:2,request_id:crypto.randomUUID()});if(qaBuy.status!==201&&qaBuy.status!==200)throw Error(JSON.stringify(qaBuy));
for(const sku of ['frame_aurora_ring','theme_starlight_lounge']){
 const bought=await f.call('/api/decorations/buy','POST',{sku,period:'P7D',request_id:crypto.randomUUID()});if(bought.status!==201)throw Error(JSON.stringify(bought));
 if(sku.startsWith('theme_')){const used=await f.call('/api/decorations/inventory/'+bought.body.order.inventory_id+'/use','POST',{request_id:crypto.randomUUID()});if(used.status!==200)throw Error(JSON.stringify(used));}
}
const baseline=process.argv.includes('--baseline'),port=baseline?4207:4208;
const base=resolve(baseline?'work/profile-input/client':'dist/client');
await f.call('/api/producers/friend/follow','PUT');
await f.call('/api/producers/producer/follow','PUT',{},'other');
await f.call('/api/playlists','POST',{name:'로컬 테스트 플레이리스트',is_public:false,track_ids:['one','two']});
const AUTH_PEPPER='local-only-menu-qa',salt='local-fixture';
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('MenuQa-2026-only!'+AUTH_PEPPER),'PBKDF2',false,['deriveBits']);
const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
f.sql.prepare("UPDATE users SET password=?,provider='email' WHERE id='owner'").run(salt+':'+Buffer.from(bits).toString('hex'));
for(const {id} of f.sql.prepare('SELECT id FROM tracks').all()){objects.set('stream/'+id+'.m4a',wav);objects.set('preview/'+id+'.m4a',wav);}
const env={AUTH_PEPPER,DB:f.DB,BUCKET:{async put(k,v){objects.set(k,new Uint8Array(v));},async delete(k){objects.delete(k);},async head(k){const b=objects.get(k);return b?{size:b.length,etag:k}:null;},async get(k,opts){const v=objects.get(k);return v?{body:opts?.range?v.slice(opts.range.offset,opts.range.offset+opts.range.length):v}:null;},async list(){return {objects:[],truncated:false};}},
 ASSETS:{async fetch(req){const url=new URL(req.url),file=resolve(base,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(base+sep))return new Response('',{status:404});try{const data=await readFile(file);return new Response(data,{headers:{'content-type':({'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=createServer(async(req,res)=>{
 try{const body=[];for await(const chunk of req)body.push(chunk);const url='http://127.0.0.1:'+port+req.url;
 if(req.url.startsWith('/__qa/session/')){const user=req.url.split('/').pop();if(!['owner','other','guest'].includes(user)){res.writeHead(400);res.end();return;}res.writeHead(302,{'set-cookie':'aifect_session='+(user==='guest'?'':user)+'; Path=/; SameSite=Lax','location':'/#profile'});res.end();return;}
 const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+port+'/__qa/session/owner')); 
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(f=>f());process.exit(0);}));

