// Local-only home QA. Fixture writes stay in memory; --public proxies allowlisted GETs only.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const publicMode=process.argv.includes('--public'),port=publicMode?4321:4320,cleanups=[];
const f=await fixture({after(fn){cleanups.push(fn);}}),art=await Promise.all(['ocean','nova'].map(n=>readFile('dist/assets/'+n+'.png')));
const wav=Buffer.alloc(44+44100*2*45),v=new DataView(wav.buffer,wav.byteOffset,wav.length);
wav.write('RIFF');v.setUint32(4,wav.length-8,true);wav.write('WAVEfmt ',8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);wav.write('data',36);v.setUint32(40,wav.length-44,true);
for(let i=0;i<44100*45;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/44100)*500,true);
f.sql.exec("UPDATE producers SET name='로컬 미리보기 음악가',bio='테스트 데이터 · 운영 계정과 무관합니다.',image_version='qa',image_type='image/png'; UPDATE artists SET name='Preview Artist',image_version='qa'; UPDATE tracks SET status='hidden'");
for(let i=0;i<5;i++){
 f.sql.prepare("INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)").run('qa-user'+i,'qa'+i+'@example.test','미리보기 창작자 '+(i+1));
 f.sql.prepare("INSERT INTO producers(id,user_id,name,bio,image_version,image_type,created) VALUES(?,?,?,?,?,'image/png',?)").run('qa-person'+i,'qa-user'+i,i===0?'아주 긴 닉네임도 자연스럽게 줄어드는 음악가':'미리보기 창작자 '+(i+1),'좋아하는 음악과 목소리를 함께 나눠요.',i===4?'':'qa',i+1);
}
const titles=['바람이 머문 자리','우리의 작은 무대','새벽을 걷는 마음','오늘도 너에게','빛이 드는 창가','아주 긴 곡 제목은 화면 폭이 작아져도 안전하게 줄어들어요','다시 만난 계절','푸른 밤의 멜로디','어디든 떠나자','비가 그친 오후','길 위의 사운드트랙','조용한 마음'];
const now=Math.floor(Date.now()/1000);
for(let i=0;i<12;i++){
 const id='home-track-'+i;
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,duration,karaoke_at,has_cover,cover_version,cover_type,moods_json) VALUES(?,?,'artist',? ,?,'Indie Pop','QA',1,'wav',128,?,'published','original',45,1,?,'qa','image/png','[\"comfort\"]')").run(id,'qa-user'+i%5,'qa-person'+i%5,titles[i],now-i*100,i===10?0:1);
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES(?,?,'ready',1,'ready','[]',0,0)").run(id,'job'+i);
 f.sql.prepare("INSERT INTO listens(id,track_id,listener,day,started,qualified) VALUES(?,?,?,'2026-10-27',?,1)").run('qa-listen'+i,id,'user:owner',now-i*40);
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('owner',?,?)").run(id,now-i);
}
f.sql.exec("UPDATE tracks SET genre='Jazz',genres_json='[\"Jazz\"]' WHERE id IN ('home-track-2','home-track-3'); UPDATE tracks SET description='실제 데이터 필드를 연결하는 로컬 검증용 곡 소개입니다.' WHERE id LIKE 'home-track-%'");
for(let i=0;i<6;i++)f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration) VALUES(?,?,'artist',?,?,'Indie Pop','',1,'wav',128,?,'published','cover',?,45)").run('home-cover-'+i,'qa-user'+i%5,'qa-person'+i%5,titles[i]+' — 내 목소리로',now-i,'home-track-'+i);
for(let i=0;i<3;i++){
 f.sql.prepare("INSERT INTO playlists(id,user_id,name,description,is_public,created) VALUES(?,?,?,'로컬 테스트 플레이리스트',1,?)").run('home-list-'+i,i===0?'owner':'qa-user'+i,'내가 좋아하는 순간들 '+(i+1),now-i);
 for(let j=0;j<4;j++)f.sql.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES(?,?,?,?)').run('home-list-'+i,'home-track-'+((i+j)%12),j,now);
}
const root=resolve('dist/client'),env={DB:f.DB,BUCKET:{async head(key){const data=key.startsWith('images/')?art[key.length%2]:wav;return {size:data.length};},async get(key,options){const data=key.startsWith('images/')?art[key.length%2]:wav;const body=options?.range?data.subarray(options.range.offset,options.range.offset+options.range.length):data;return {body,size:body.length};}},ASSETS:{async fetch(req){const u=new URL(req.url),file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.txt':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
const publicCache=new Map();
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:'+port);
  if(u.pathname==='/qa-errors.js'){res.setHeader('content-type','text/javascript');res.end("addEventListener('error',e=>{if(e.error)document.documentElement.dataset.qaErrors=(document.documentElement.dataset.qaErrors||'')+' '+e.error.stack;});");return;}
  if(u.pathname==='/qa-metrics.js'){res.setHeader('content-type','text/javascript');res.end(await readFile('tests/home-qa.js'));return;}
  if(u.pathname==='/qa-layout'){
   const widths=[320,360,390,430,768,1024,1280,1440,1920],w=widths.includes(+u.searchParams.get('width'))?+u.searchParams.get('width'):1440,h=w>=1024?900:844,user=u.searchParams.get('user')==='guest'?'guest':'owner';
   res.setHeader('content-type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>AIFECT 홈 로컬 검증</title><body style="position:fixed;inset:0;overflow:hidden;margin:0;background:#0c121b;color:white;font:13px sans-serif"><p style="margin:10px">${publicMode?'공개 API 읽기 전용 · 로컬 클라이언트':'격리된 로컬 테스트 데이터'} · ${w}×${h} · ${user} ${widths.map(n=>`<a style="color:white" href="/qa-layout?width=${n}&user=${user}">${n}</a>`).join(' ')} <a style="color:white" href="/qa-layout?width=${w}&user=${user==='guest'?'owner':'guest'}">로그인 상태 전환</a></p><p style="margin:10px"><select id="qa-section" aria-label="섹션 이동"><option value="0">맨 위</option></select> <button id="qa-jump">섹션 보기</button> <button id="qa-scan">모든 섹션 불러오기</button> <button id="qa-bottom">맨 아래</button></p><output id="qa-metrics" style="display:block;font-size:11px;margin:4px 10px"></output><script src="/qa-metrics.js"></script><iframe title="AIFECT ${w}px" src="/?qa-user=${user}#home" style="width:${w}px;height:${h}px;border:0;transform-origin:top left;position:absolute;top:150px;left:10px"></iframe><script>function fit(){document.querySelector('iframe').style.transform='scale('+Math.min(1,(innerWidth-24)/${w},(innerHeight-150)/${h})+')'}addEventListener('resize',fit);fit();</script></body></html>`);return;
  }
  if(publicMode){
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end('Read-only preview');return;}
   if(u.pathname==='/api/me'){res.setHeader('content-type','application/json');res.end('{"user":null}');return;}
   if(/^\/(api|media)\//.test(u.pathname)){
    const allowed=u.pathname==='/api/decorations/avatars'||/^\/api\/(catalog|discovery|karaoke|playlists|community)$/.test(u.pathname)||/^\/media\/[\w/-]+$/.test(u.pathname);
    if(!allowed){res.writeHead(403);res.end('{"error":"Read-only public preview"}');return;}
    const key=u.pathname+u.search,stored=publicCache.get(key);if(stored){res.writeHead(stored.status,stored.headers);res.end(stored.body);return;}
    const remote=await fetch('https://aifect.co.kr'+key,{method:req.method,signal:AbortSignal.timeout(15000)}),item={status:remote.status,headers:{'content-type':remote.headers.get('content-type')||'application/octet-stream'},body:Buffer.from(await remote.arrayBuffer())};publicCache.set(key,item);res.writeHead(item.status,item.headers);res.end(item.body);return;
   }
  }
  const mode=u.searchParams.get('qa-user')||(/qa_home_identity=guest/.test(req.headers.cookie||'')?'guest':'owner');
  if(!publicMode&&u.searchParams.has('qa-user'))res.setHeader('set-cookie','qa_home_identity='+mode+'; Path=/; SameSite=Lax');
  const body=[];for await(const c of req)body.push(c);
  const response=await worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:mode==='guest'?'':'aifect_session=owner'},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
  const headers=Object.fromEntries(response.headers);let payload=Buffer.from(await response.arrayBuffer());if((headers['content-type']||'').includes('text/html')){payload=Buffer.from(payload.toString().replace('<head>','<head><script src="/qa-errors.js"></script>'));delete headers['content-length'];}res.writeHead(response.status,headers);res.end(payload);
 }catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}
}).listen(port,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+port+'/qa-layout?width=1440'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
