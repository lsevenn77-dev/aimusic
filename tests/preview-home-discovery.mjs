// Disposable local fixture. All names/content below are QA-only; never deployed.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),objects=new Map(),port=4208;
const photo=await readFile('dist/assets/nova.png');
f.sql.exec("UPDATE artists SET name='로컬 검수 아티스트',image_version='qa'; UPDATE tracks SET duration=30; UPDATE producers SET name='로컬 검수 작곡가'; INSERT INTO creator_partners VALUES('owner','special',1,0,'owner','local fixture')");
objects.set('images/artist/artist/qa',photo);
for(let i=1;i<=12;i++){
 const uid='local-user-'+i,pid='local-producer-'+i,aid='local-artist-'+i,tid='local-track-'+i;
 f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@example.test','로컬 검수 '+i);
 f.sql.prepare('INSERT INTO producers(id,user_id,name,image_version,created) VALUES(?,?,?,?,?)').run(pid,uid,i===3?'아주 긴 작곡가 이름의 말줄임 검수':'검수 작곡가 '+i,'qa',i);
 f.sql.prepare('INSERT INTO artists(id,producer_id,name,image_version,created) VALUES(?,?,?,?,?)').run(aid,pid,i===3?'아주 긴 AI 아티스트 이름의 말줄임 검수':'검수 아티스트 '+i,'qa',i);
 objects.set('images/artist/'+aid+'/qa',photo);objects.set('images/producer/'+pid+'/qa',photo);
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,duration) VALUES(?,?,?,?,?,'Rock','QA',1,'wav',128,?,'published',30)").run(tid,uid,aid,pid,'로컬 화면 검수곡 '+i,i);
 if(i<4)for(const kind of ['artist','producer'])f.sql.prepare('INSERT INTO follows VALUES(?,?,?,0)').run('owner',kind,kind==='artist'?aid:pid);
 if(i<=6){const playlist='local-playlist-'+i;f.sql.prepare('INSERT INTO playlists(id,user_id,name,description,is_public,created) VALUES(?,?,?,?,1,?)').run(playlist,uid,'로컬 검수 플레이리스트 '+i,'운영 데이터와 분리된 화면 검수용 소개',i);f.sql.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES(?,?,0,0)').run(playlist,tid);}
}
// Home recommendation QA: one through six tracks, including long metadata.
for(let i=1;i<=6;i++)for(let j=1;j<i;j++)f.sql.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES(?,?,?,0)').run('local-playlist-'+i,'local-track-'+j,j);
f.sql.exec("UPDATE tracks SET title='아주 긴 곡 제목이 한 줄 안에서 말줄임표로 표시되는지 확인하는 음악' WHERE id='local-track-3'");
const wav=Buffer.alloc(44+8000*2*30);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(const {id} of f.sql.prepare("SELECT id FROM tracks WHERE status='published'").all()){objects.set('preview/'+id+'.m4a',wav);objects.set('stream/'+id+'.m4a',wav);}
const base=resolve('dist/client'),env={DB:f.DB,BUCKET:{async get(k){return objects.has(k)?{body:objects.get(k),size:objects.get(k).length,httpMetadata:{contentType:k.includes('images/')?'image/png':'audio/wav'}}:null;},async head(k){return objects.has(k)?{size:objects.get(k).length}:null;}},ASSETS:{async fetch(req){const file=resolve(base,'.'+decodeURIComponent(new URL(req.url).pathname));if(!file.startsWith(base+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.js':'text/javascript','.txt':'text/plain','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const response=await worker.fetch(new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:{...req.headers,cookie:''},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){p.catch(()=>{});}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Local QA error');}});
server.listen(port,'127.0.0.1',()=>console.log('LOCAL FIXTURE ONLY: http://127.0.0.1:'+port+'/#home'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
