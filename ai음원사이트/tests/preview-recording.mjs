// Local, in-memory preview only. Never registered or bundled as a production route.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const port=Number(process.env.PREVIEW_PORT||4179);
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
// Additional in-memory tracks exercise both rows of home recommendations.
for(let i=4;i<=6;i++){
 const tid='preview-'+i;
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,duration,has_cover,cover_version,cover_type,karaoke_at) VALUES(?,'owner','artist','producer',?,'Indie Pop','QA',1,'wav',128,?,'published','original',225,1,'demo','image/webp',1)").run(tid,['다시 만나는 계절','별이 흐르는 시간','내일의 우리'][i-4],i);
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES(?,?,'ready',1,'ready',0,0)").run(tid,'job'+i);
 objects.set('images/track/'+tid+'/demo',await readFile('dist/assets/genres/'+['14','22','47'][i-4]+'.webp'));objects.set('karaoke/'+tid+'/mr.m4a',wav);
}
f.sql.exec("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode) VALUES('preview-duet','other','artist','friend','바람이 머문 자리 — 듀엣','Rock','',1,'wav',128,0,'published','cover','one',45,'duet')");
f.sql.exec("UPDATE tracks SET duet_open=1,duet_part='male' WHERE id='preview-duet'");
// Sample activity is local to this in-memory preview, never production.
f.sql.exec("UPDATE tracks SET status='processing' WHERE id='preview-cover'; UPDATE tracks SET status='published' WHERE id='preview-cover'; INSERT INTO free_gift_wallets(user_id,balance) VALUES('other',100)");
await f.call('/api/producers/producer/gifts','POST',{gift_type:'silver-letter',quantity:3,request_id:crypto.randomUUID()},'other');
// The preview's crew rows and silent audio never reach production.
for(const t of f.sql.prepare('SELECT id FROM tracks').all()){objects.set('stream/'+t.id+'.m4a',wav);objects.set('preview/'+t.id+'.m4a',wav);}
await f.call('/api/crews','POST',{name:'미리보기 크루',description:'노래와 이야기가 만나는 곳',interests:'K-POP, Indie Pop'});
f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',10000); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('preview-gold','owner','web',10000,110000,4400,'paid',1,1)");
const base=resolve('dist/client');
const qa=await readFile('tests/recording-qa-browser.js');
const env={DB:f.DB,BUCKET:{async put(k,v){objects.set(k,new Uint8Array(v));},async delete(k){objects.delete(k);},async head(k){const b=objects.get(k);return b?{size:b.length,etag:k}:null;},async get(k){return {body:objects.get(k)};},async list(){return {objects:[],truncated:false};}},
 ASSETS:{async fetch(req){const url=new URL(req.url),file=resolve(base,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(base+sep))return new Response('',{status:404});try{let data=await readFile(file);if(file===resolve(base,'index.html'))data=Buffer.from(data.toString().replace('</body>','<script src="/recording-qa.js"></script></body>'));return new Response(data,{headers:{'content-type':({'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=createServer(async(req,res)=>{
 try{if(['/qa/premium','/qa/free'].includes(req.url)){f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(req.url==='/qa/premium'?Math.floor(Date.now()/1000)+3600:0);res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}if(req.url==='/recording-qa.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(qa);return;}if(req.url==='/qa-mobile'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<body style="margin:20px;background:#151923;color:white;font-family:sans-serif"><p>390px 모바일 녹음 화면 검사</p><iframe title="모바일 녹음 화면" src="/#sing/one?mode=duet" style="width:390px;height:844px;border:1px solid #778"></iframe></body>');return;}const body=[];for await(const chunk of req)body.push(chunk);const url='http://127.0.0.1:'+port+req.url;
 const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+port+'/#sing/one?mode=duet'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(f=>f());process.exit(0);}));

