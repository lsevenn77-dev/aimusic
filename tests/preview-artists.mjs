// Disposable in-memory preview for artist directories. No production endpoints or storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),objects=new Map(),port=4197;
const photo=await readFile('dist/assets/nova.png');
f.sql.exec("UPDATE producers SET name='로컬 제작자'; UPDATE artists SET name='로컬 아티스트 1',image_version='qa',image_type='image/png'; INSERT INTO producers(id,user_id,name,created) VALUES('visitor','other','다른 제작자',0)");
objects.set('images/artist/artist/qa',photo);
for(let i=2;i<=7;i++){
 const id='qa-artist-'+i,owner=i<=3?'producer':'visitor';
 f.sql.prepare('INSERT INTO artists(id,producer_id,name,image_version,image_type,created) VALUES(?,?,?,?,?,?)').run(id,owner,i===6?'긴 이름의 아티스트도 겹침 없이 표시하는 로컬 검증':('로컬 아티스트 '+i),i%2?'':'qa','image/png',i);
 if(i%2===0)objects.set('images/artist/'+id+'/qa',photo);
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,?,?,?,?,'Rock','QA',1,'wav',128,?,'published')").run('qa-track-'+i,owner==='producer'?'owner':'other',id,owner,'검증곡 '+i,i);
 if(i<5)f.sql.prepare("INSERT INTO follows VALUES('other','artist',?,0)").run(id);
}
const base=resolve('dist/client'),env={DB:f.DB,BUCKET:{async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async head(k){return objects.has(k)?{size:objects.get(k).length}:null;}},ASSETS:{async fetch(req){const url=new URL(req.url),file=resolve(base,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(base+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.js':'text/javascript','.txt':'text/plain','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const url='http://127.0.0.1:'+port+req.url;const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){p.catch(()=>{});}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}});
server.listen(port,'127.0.0.1',()=>console.log('Local artist QA (isolated fixture): http://127.0.0.1:'+port+'/#artists'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));

