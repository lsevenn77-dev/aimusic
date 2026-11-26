// Disposable local SQLite/R2 preview. Never connects to production storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),objects=new Map();
f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','로컬 음악가',0);INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','빈 대화',0);INSERT INTO producers(id,user_id,name,created) VALUES('empty','third','빈 대화',0);INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','검증 크루',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0),('crew','other','member',0)");
for(let i=1;i<=125;i++)f.sql.prepare('INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)').run('m'+i,i%2?'other':'owner',i%2?'owner':'other',i===124?'긴 메시지 🎵 '.repeat(180):'로컬 대화 '+i,'r'+i,Math.floor(Date.now()/1000)-126+i);
const image=await readFile('dist/assets/nova.png');objects.set('qa-image',image);
f.sql.prepare("INSERT INTO chat_images(id,sender_id,recipient_id,object_key,created,expires) VALUES('qa-image','other','owner','qa-image',0,?)").run(Math.floor(Date.now()/1000)+86400);
f.sql.exec("UPDATE direct_messages SET image_id='qa-image' WHERE id='m123'");
f.sql.exec("UPDATE producers SET name='라온' WHERE id='friend'; UPDATE direct_messages SET read_at=1");
const now=Math.floor(Date.now()/1000),lines=['새로 만든 곡 들었어요. 멜로디가 오래 남네요 🎵','고마워요! 다음 곡은 조금 더 따뜻하게 만들어 보고 있어요.','후렴에 들어간 피아노가 특히 좋았어요.','[aifect:cat_basic_laugh] [aifect:cat_text_nice]','이번 주말에 크루에서 같이 들어볼까요?','좋아요. 토요일 저녁에 만나요!','[aifect:cat_hand_peace] [aifect:cat_prop_note]','새 버전 나오면 먼저 보내드릴게요.'];
lines.forEach((body,i)=>f.sql.prepare('INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)').run('qa-new-'+i,i<2||i===4?'other':'owner',i<2||i===4?'owner':'other',body,'qa-new-'+i,now-300+i*20));
for(const [id,name,body,at] of [['operator','AIFECT 운영팀','더 편해진 메시지 화면을 만나보세요.',now-7200],['sora','소라','오늘도 좋은 음악 고마워요 💜',now-600],['yoon','윤슬 · 늦은 밤의 멜로디','다음 작업도 함께해요.',now-900]]){f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(id,id+'@example.test',name);f.sql.prepare('INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)').run(id,id,name);f.sql.prepare('INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)').run('qa-'+id,id,'owner',body,'qa-'+id,at);}
let drop=false,offline=false;const streams=new Set();
const base=resolve('dist/client');
const env={ADMIN_USER_IDS:"operator",DB:f.DB,BUCKET:{async put(k,v){objects.set(k,new Uint8Array(v));},async delete(k){objects.delete(k);},async head(k){const b=objects.get(k);return b?{size:b.length,etag:k}:null;},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async list(){return {objects:[],truncated:false};}},ASSETS:{async fetch(req){const file=resolve(base,'.'+decodeURIComponent(new URL(req.url).pathname));if(!file.startsWith(base+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.txt':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
const server=createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/__qa/')){
   const action=req.url.split('/').pop();if(action==='drop')drop=true;
   if(action==='offline'){offline=true;for(const stream of streams)stream.end();}
   if(action==='online')offline=false;
   if(action==='receive')f.sql.prepare("INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,'other','owner','실시간 수신 복구 확인',?,?)").run(crypto.randomUUID(),crypto.randomUUID(),Math.floor(Date.now()/1000));
   res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<a href="/#dm/friend">125개 대화</a> <a href="/#dm/empty">빈 대화</a> <a href="/#dm/crew/crew">크루</a> <a href="/__qa/drop">다음 전송 응답 유실</a> <a href="/__qa/receive">수신 추가</a> <a href="/__qa/offline">로컬 통신 차단</a> <a href="/__qa/online">로컬 통신 복구</a><pre>'+JSON.stringify({offline,streams:streams.size,messages:f.sql.prepare('SELECT count(*) n FROM direct_messages').get().n,unread:f.sql.prepare("SELECT count(*) n FROM direct_messages WHERE recipient_id='owner' AND read_at=0").get().n})+'</pre>');return;
  }
  if(offline&&req.url.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'로컬 네트워크 연결 중단'}));return;}
  const body=[];for await(const chunk of req)body.push(chunk);
  const response=await worker.fetch(new Request('http://127.0.0.1:4208'+req.url,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
  if(drop&&req.method==='POST'&&req.url==='/api/dm/friend'){drop=false;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'로컬 전송 응답 유실'}));return;}
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.headers.get('content-type')?.includes('text/event-stream')){streams.add(res);const reader=response.body.getReader();res.on('close',()=>{streams.delete(res);void reader.cancel();});while(true){const {value,done}=await reader.read();if(done)break;res.write(value);}res.end();}
  else res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){if(!res.headersSent)res.writeHead(500);res.end(String(e));}
});
server.listen(4208,'127.0.0.1',()=>console.log('Local messages: http://127.0.0.1:4208/__qa/menu'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(f=>f());process.exit(0);}));
