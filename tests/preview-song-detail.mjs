// Disposable local SQLite/R2. This server never proxies production mutations.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const baseline=process.argv.includes('--baseline'),port=baseline?4427:4428,cleanups=[],requests=[];
const f=await fixture({after(fn){cleanups.push(fn);}}),art=await readFile('dist/assets/ocean.png');
const descriptions=JSON.parse(await readFile('tests/fixtures/song-detail-descriptions.json','utf8'));
const authored='첫 번째 줄은 제작자가 직접 남긴 곡 소개입니다.\n이 줄바꿈도 그대로 표시합니다.\n\n다음 문단에서는 곡을 만들며 담은 마음을 소개합니다.';
f.sql.exec("UPDATE producers SET name='로컬 감상자'; INSERT INTO producers(id,user_id,name,bio,created) VALUES('friend','other','소개글 검증 음악가','로컬 검증 데이터입니다.',0); INSERT INTO artists(id,producer_id,name,created) VALUES('friend-artist','friend','Preview Artist',0)");
for(const [i,tid] of ['one','two','three'].entries()){
 f.sql.prepare("UPDATE tracks SET user_id='other',producer_id='friend',artist_id='friend-artist',title=?,genre='Indie Pop',genres_json='[\"Indie Pop\",\"Pop\",\"Acoustic\"]',duration=45,karaoke_at=1,has_cover=1,cover_version='qa',cover_type='image/png',created=unixepoch(),description=? WHERE id=?").run(['바람이 머문 자리','소개글이 없는 곡','기존 자동 안내문이 있는 곡'][i],[authored,'',descriptions.legacy_auto[0].description][i],tid);
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES(?,?,'ready',1,'ready','[]',0,0)").run(tid,'job-'+tid);
}
f.sql.exec("INSERT INTO tracks(id,user_id,producer_id,artist_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode,duet_open,description) VALUES('invitation','other','friend','friend-artist','함께 부르는 듀엣','Indie Pop','',1,'wav',128,100,'published','cover','one',45,'duet',1,''),('own-cover','owner','producer','artist','내 목소리로 완성한 곡','Indie Pop','',1,'wav',128,200,'published','cover','one',45,'solo',0,''),('not-ready','other','friend','friend-artist','부르기 준비 전인 곡','Indie Pop','QA',1,'wav',128,100,'published','original',NULL,45,'solo',0,'')");
f.sql.exec("INSERT INTO playlists(id,user_id,name,is_public,created) VALUES('qa-playlist','owner','로컬 저장 검증 목록',1,0); INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES('qa-playlist','two',0,0); INSERT INTO comments(id,track_id,user_id,body,created) VALUES('qa-comment','one','other','기존 댓글 기능 검증용입니다.',0)");
const wav=Buffer.alloc(44+44100*2*45),v=new DataView(wav.buffer,wav.byteOffset,wav.length);
wav.write('RIFF');v.setUint32(4,wav.length-8,true);wav.write('WAVEfmt ',8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);wav.write('data',36);v.setUint32(40,wav.length-44,true);
for(let i=0;i<44100*45;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/44100)*400,true);
f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('long-user','long@example.test','Long fixture',0); INSERT INTO producers(id,user_id,name,bio,created) VALUES('long-producer','long-user','매우긴제작자이름매우긴제작자이름매우긴제작자이름매우긴제작자이름','',0); INSERT INTO tracks(id,user_id,producer_id,artist_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,description) SELECT 'long','other','long-producer','friend-artist',title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,description FROM tracks WHERE id='one'");
f.sql.prepare("UPDATE tracks SET title=?,description=? WHERE id='long'").run('긴곡제목'.repeat(30),'첫 문단\n\n'+'긴소개글과공백없는문장'.repeat(180)+'\n마지막 줄');
const root=resolve(baseline?'work/song-detail-ui/baseline-client':'dist/client');
if(process.argv.includes('--cover-actions')){
 f.sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");
 f.sql.prepare("UPDATE tracks SET lyrics_mode='synced',lyrics=? WHERE id='one'").run('[00:00.000]첫 소절\n[00:05.000]두 번째 소절');
}
const photos=new Map(),object=key=>photos.get(key)||(key.startsWith('images/')?art:wav);
const BUCKET={
 async put(key,bytes){photos.set(key,Buffer.from(bytes));},
 async head(key){return {size:object(key).length};},
 async get(key,options){const data=object(key),body=options?.range?data.subarray(options.range.offset,options.range.offset+options.range.length):data;return {body,size:data.length};}
};
const env={DB:f.DB,BUCKET,ASSETS:{async fetch(req){const u=new URL(req.url),file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.txt':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
const widths=[320,360,375,390,430,768,1024,1440,1920],tracks=['one','long','two','three','invitation','own-cover','not-ready'];
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:'+port);
  if(u.pathname==='/qa-runtime.js'){res.setHeader('content-type','text/javascript');res.end("addEventListener('error',e=>{if(e.error)document.documentElement.dataset.qaErrors=(document.documentElement.dataset.qaErrors||'')+' '+e.error.message;});");return;}
  if(u.pathname==='/qa-metrics.js'){res.setHeader('content-type','text/javascript');res.end(await readFile('tests/song-detail-qa.js'));return;}
  if(u.pathname==='/qa-requests'){res.setHeader('content-type','application/json');res.end(JSON.stringify(requests.slice(-200)));return;}
  if(u.pathname==='/qa-layout'){
   const width=widths.includes(+u.searchParams.get('width'))?+u.searchParams.get('width'):1440,height=width>=1024?900:844;
   const tid=tracks.includes(u.searchParams.get('track'))?u.searchParams.get('track'):'one',user=['owner','other','guest'].includes(u.searchParams.get('user'))?u.searchParams.get('user'):'owner';
   res.setHeader('set-cookie','qa_song_user='+user+'; Path=/; SameSite=Lax');
   res.setHeader('content-type','text/html;charset=utf-8');
   const links=widths.map(w=>'<a href="/qa-layout?width='+w+'&track='+tid+'&user='+user+'">'+w+'</a>').join(' ');
   const songs=tracks.map(id=>'<a href="/qa-layout?width='+width+'&track='+id+'&user='+user+'">'+id+'</a>').join(' ');
   res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>AIFECT 곡 이야기 로컬 검증</title><body style="position:fixed;inset:0;overflow:hidden;margin:0;background:#0c121b;color:#e5e7ef;font:12px sans-serif"><style>a{color:#d6baff}p{margin:8px 12px}</style><p>격리된 로컬 검증 데이터 · '+(baseline?'변경 전':'수정 후')+' · '+width+'×'+height+' · '+user+' '+links+'</p><p>'+songs+' · <a href="/qa-layout?width='+width+'&track='+tid+'&user='+(user==='guest'?'owner':'guest')+'">로그인 상태 전환</a></p><output id="qa-metrics" style="display:block;max-height:42px;overflow:auto;margin:4px 12px;font-size:10px"></output><script src="/qa-metrics.js"></script><iframe title="검증 앱" src="/#song/'+tid+'" style="position:absolute;top:112px;left:12px;width:'+width+'px;height:'+height+'px;border:0;transform-origin:top left"></iframe><script>function fit(){document.querySelector("iframe").style.transform="scale("+Math.min(1,(innerWidth-24)/'+width+',(innerHeight-112)/'+height+')+")"}addEventListener("resize",fit);fit();</script></body></html>');return;
  }
  const user=/qa_song_user=(owner|other|guest)/.exec(req.headers.cookie||'')?.[1]||'owner',body=[];
  for await(const chunk of req)body.push(chunk);
  const response=await worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:user==='guest'?'':'aifect_session='+user},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
  requests.push({method:req.method,path:u.pathname,status:response.status});let payload=Buffer.from(await response.arrayBuffer()),headers=Object.fromEntries(response.headers);
  if((headers['content-type']||'').includes('text/html')){payload=Buffer.from(payload.toString().replace('<head>','<head><script src="/qa-runtime.js"></script>'));delete headers['content-length'];}
  res.writeHead(response.status,headers);res.end(payload);
 }catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}
}).listen(port,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+port+'/qa-layout?width=1440'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
