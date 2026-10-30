// Disposable in-memory preview for artist directories. No production endpoints or storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),objects=new Map(),port=Number(process.env.PORT)||4198;
const photo=await readFile('dist/assets/nova.png');
f.sql.exec("UPDATE producers SET name='로컬 제작자'; UPDATE artists SET name='로컬 아티스트 1',image_version='qa',image_type='image/png'; INSERT INTO producers(id,user_id,name,created) VALUES('visitor','other','다른 제작자',0)");
objects.set('images/artist/artist/qa',photo);
for(let i=2;i<=7;i++){
 const id='qa-artist-'+i,owner=i<=(Number(process.env.OWNED_ARTISTS)||3)?'producer':'visitor';
 f.sql.prepare('INSERT INTO artists(id,producer_id,name,image_version,image_type,created) VALUES(?,?,?,?,?,?)').run(id,owner,i===6?'긴 이름의 아티스트도 겹침 없이 표시하는 로컬 검증':('로컬 아티스트 '+i),i%2?'':'qa','image/png',i);
 if(i%2===0)objects.set('images/artist/'+id+'/qa',photo);
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,?,?,?,?,'Rock','QA',1,'wav',128,?,'published')").run('qa-track-'+i,owner==='producer'?'owner':'other',id,owner,'검증곡 '+i,i);
 if(i<5)f.sql.prepare("INSERT INTO follows VALUES('other','artist',?,0)").run(id);
}
for(const count of [0,1,3,10,20]){
 const aid='photos-'+count;f.sql.prepare('INSERT INTO artists(id,producer_id,name,bio,image_version,image_type,created) VALUES(?,?,?,?,?,?,0)').run(aid,'producer','사진 '+count+'장 검증','한 줄 소개 · 로컬 검증용 아티스트','qa','image/png');objects.set('images/artist/'+aid+'/qa',photo);
 const ids=[];for(let i=0;i<count;i++){const pid=aid+'-'+i;ids.push(pid);f.sql.prepare('INSERT INTO artist_photos VALUES(?,?,?,?,?)').run(pid,aid,pid,'image/png',i);objects.set('images/artist/'+aid+'/gallery/'+pid,photo);}
 f.sql.prepare('INSERT INTO artist_fanpages(artist_id,carousel_ids,photo_order,intro,style,world) VALUES(?,?,?,?,?,?)').run(aid,JSON.stringify(ids.slice(0,10)),JSON.stringify(ids),'사진과 음악으로 만나는 아티스트','몽환적인 멜로디와 일렉트로닉 팝','음악으로 연결되는 세계');
 for(let i=0;i<3;i++)f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner',?,'producer',?,'Rock','QA',1,'wav',128,?,'published')").run(aid+'-song-'+i,aid,i===1?'아주 긴 곡명이 모든 음악 행에서 가수와 제작자의 시작 위치를 밀어내지 않는지 확인합니다':'로컬 검증곡 '+(i+1),i);
 f.sql.prepare("INSERT INTO artist_fan_posts(id,artist_id,user_id,kind,title,body,request_id,created,updated) VALUES(?,?,'owner','news','첫 공식 소식','새로운 음악 소식을 전해드립니다.','preview',1,1)").run(aid+'-news',aid);
 f.sql.prepare("INSERT INTO artist_fan_posts(id,artist_id,user_id,kind,body,request_id,created,updated) VALUES(?,?,'other','lounge','다음 음악도 기다리고 있어요!','preview',2,2)").run(aid+'-lounge',aid);
}
f.sql.exec("UPDATE producers SET name='시작 위치 정렬을 검증하는 아주 긴 제작자명'");
const base=resolve('dist/client'),env={DB:f.DB,BUCKET:{async put(k,v){objects.set(k,v);},async delete(k){objects.delete(k);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async head(k){return objects.has(k)?{size:objects.get(k).length}:null;}},ASSETS:{async fetch(req){const url=new URL(req.url),file=resolve(base,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(base+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.js':'text/javascript','.txt':'text/plain','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const url='http://127.0.0.1:'+port+req.url;const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,cookie:req.headers.cookie||'aifect_session=owner'},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){p.catch(()=>{});}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}});
server.listen(port,'127.0.0.1',()=>console.log('Local artist QA (isolated fixture): http://127.0.0.1:'+port+'/#artist/photos-10'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
