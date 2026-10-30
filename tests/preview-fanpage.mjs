// Disposable in-memory preview for artist directories. No production endpoints or storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),objects=new Map(),port=Number(process.env.PORT)||4198;
const photo=await readFile('dist/assets/nova.png');
// Display/equipment QA remains entirely inside this disposable SQLite fixture.
f.sql.exec("INSERT INTO player_xp(user_id,source_key,kind,amount,created) VALUES('owner','qa-frame','publish',50000,0); INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES('qa-forest','owner','player-level-10','reward','qa-forest',0); INSERT INTO player_equipment(user_id,frame_inventory_id) VALUES('owner','qa-forest') ON CONFLICT(user_id) DO UPDATE SET frame_inventory_id='qa-forest';");
f.sql.exec("UPDATE producers SET name='로컬 제작자'; UPDATE artists SET name='로컬 아티스트 1',image_version='qa',image_type='image/png'; INSERT INTO producers(id,user_id,name,created) VALUES('visitor','other','다른 제작자',0)");
objects.set('images/artist/artist/qa',photo);

for(const count of [0,1,3,10,20]){
 const aid='photos-'+count;f.sql.prepare("INSERT INTO artists(id,producer_id,name,bio,image_version,image_type,created) VALUES(?,'producer',?,?,'qa','image/png',0)").run(aid,'로컬 팬페이지 · '+count+'장','로컬 검증용 사진과 음악입니다.');objects.set('images/artist/'+aid+'/qa',photo);
 for(let i=0;i<count;i++){const pid=aid+'-'+i;f.sql.prepare('INSERT INTO artist_photos VALUES(?,?,?,?,?)').run(pid,aid,pid,'image/png',i);objects.set('images/artist/'+aid+'/gallery/'+pid,photo);}
 f.sql.prepare("UPDATE tracks SET title=?,artist_id=?,duration=60 WHERE id='one'").run('아주 긴 곡명과 가수명 및 제작자명이 서로 겹치지 않는지 확인하는 로컬 검증곡',aid);
}
f.sql.exec("UPDATE tracks SET artist_id='photos-10'; UPDATE producers SET name='아주 긴 제작자 이름의 말줄임 검증'; UPDATE artists SET name='아주 긴 아티스트 이름의 말줄임 검증' WHERE id='photos-10'");
f.sql.prepare("INSERT INTO artist_fan_settings(artist_id,banner_version,banner_type,introduction,concept,world) VALUES('photos-10','banner','image/png','상세 소개를 검증합니다.','Pop · Electronic','아티스트 세계관')").run();objects.set('images/artist/photos-10/banner/banner',await readFile('dist/assets/ocean.png'));
f.sql.exec("INSERT INTO artist_fan_posts(id,artist_id,user_id,kind,title,body,request_id,created,pinned) VALUES('notice','photos-10','owner','news','첫 번째 소식','신곡 소식과 공식 표시를 확인합니다.','qa-news',1,1),('cheer','photos-10','other','lounge','','멋진 음악을 응원합니다!','qa-lounge',2,0)");
const base=resolve('dist/client'),env={DB:f.DB,BUCKET:{async put(k,v){objects.set(k,v);},async delete(k){objects.delete(k);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async head(k){return objects.has(k)?{size:objects.get(k).length}:null;}},ASSETS:{async fetch(req){const url=new URL(req.url),file=resolve(base,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(base+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.js':'text/javascript','.txt':'text/plain','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const url='http://127.0.0.1:'+port+req.url;const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){p.catch(()=>{});}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}});
server.listen(port,'127.0.0.1',()=>console.log('Local artist QA (isolated fixture): http://127.0.0.1:'+port+'/#artist/photos-10'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
