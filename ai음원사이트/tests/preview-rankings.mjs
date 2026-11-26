// Disposable SQLite fixture, real app shell. Never forwards production writes.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanup=[],f=await fixture({after(fn){cleanup.push(fn);}}),at=Math.floor(Date.now()/1000),requests=[];
f.sql.exec("UPDATE tracks SET karaoke_at=1;UPDATE artists SET name='로컬 검증 아티스트'");
for(let i=0;i<24;i++){
 const id='ranking-'+String(i).padStart(2,'0'),name=i===4?'아주긴아티스트이름으로모바일말줄임과가로넘침확인':'검증 아티스트 '+(i+1);
 f.sql.prepare("INSERT INTO artists(id,producer_id,name,created) VALUES(?,'producer',?,0)").run(id,name);
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,duration) VALUES(?,'owner',?,'producer',?,'Rock','QA',1,'wav',128,0,'published',100)").run(id,id,name);
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('other',?,?)").run(id,at);
}
f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','검증 크루',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0)");
f.sql.prepare("INSERT INTO crew_xp(id,crew_id,user_id,amount,created) VALUES('qa','crew','owner',30,?)").run(at);
const root=resolve('dist/client'),env={DB:f.DB,ASSETS:{async fetch(req){const file=resolve(root,'.'+new URL(req.url).pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.txt':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:4430');
  if(req.method!=='GET'){res.writeHead(405);res.end('Read-only preview');return;}
  if(u.pathname==='/qa-requests'){res.setHeader('content-type','application/json');res.end(JSON.stringify(requests));return;}
  if(u.pathname==='/qa'){
   const width=[320,390,768,1440].includes(+u.searchParams.get('width'))?+u.searchParams.get('width'):1440,height=width===1440?900:844;
   const sample=['all','one','two','empty','error'].includes(u.searchParams.get('sample'))?u.searchParams.get('sample'):'all';
   res.setHeader('set-cookie','ranking_sample='+sample+'; Path=/; SameSite=Lax');res.setHeader('content-type','text/html;charset=utf-8');
   res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>랭킹 로컬 검증</title><body style="margin:0;background:#0c121b;color:#ddd;font:12px sans-serif"><p style="margin:8px">격리된 로컬 검증 데이터 · '+width+'×'+height+' · '+sample+'</p><iframe title="검증 앱" src="/#community/rankings?period=month" style="position:absolute;top:32px;left:0;border:0;width:'+width+'px;height:'+height+'px;transform-origin:top left"></iframe><script>function fit(){document.querySelector("iframe").style.transform="scale("+Math.min(1,innerWidth/'+width+',(innerHeight-32)/'+height+')+")"}addEventListener("resize",fit);fit()</script></body></html>');return;
  }
  const response=await worker.fetch(new Request(u,{headers:{...req.headers,cookie:''}}),env,{waitUntil(p){p.catch(()=>{});}});
  requests.push({path:u.pathname+u.search,status:response.status});
  if(u.pathname==='/api/community/rankings'){
   const d=await response.json(),sample=/ranking_sample=(\w+)/.exec(req.headers.cookie||'')?.[1];
   if(sample==='error'){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'로컬 오류 검증'}));return;}
   if(['empty','one','two'].includes(sample)){d.rows=d.rows.slice(0,{empty:0,one:1,two:2}[sample]);d.total=d.rows.length;d.next_offset=null;}
   res.writeHead(response.status,{'content-type':'application/json'});res.end(JSON.stringify(d));return;
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Local QA error');}
}).listen(4430,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4430/qa?width=1440'));
