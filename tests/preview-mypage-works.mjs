// Disposable SQLite/R2 only. No production routes, cookies or user data.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}},{DUBBING_ENABLED:'true',BUCKET:memoryBucket()}),port=process.env.AIFECT_QA_BASELINE?'4320':4319;
const wav=Buffer.alloc(44+44100*2*45),v=new DataView(wav.buffer,wav.byteOffset,wav.length);
wav.write('RIFF');v.setUint32(4,wav.length-8,true);wav.write('WAVEfmt ',8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);wav.write('data',36);v.setUint32(40,wav.length-44,true);
for(let i=0;i<44100*45;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/44100)*600,true);
const art=await readFile('dist/assets/ocean.png');
f.sql.exec("UPDATE tracks SET title='바람이 머문 자리',karaoke_at=1,duration=45,has_cover=1,cover_version='qa',cover_type='image/png',description='로컬 검증용 곡과 참여작입니다. 운영 데이터와 무관합니다.' WHERE id='one'; INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','job','ready',1,'ready','[]',0,0); INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','함께 부르는 친구',0)");
const seed=(id,title,mode,parent,open,created)=>f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode,duet_parent_id,duet_open) VALUES(?,'other','artist','friend',?,'Indie Pop','',1,'wav',128,?,'published','cover','one',45,?,?,?)").run(id,title,created,mode,parent,open);
seed('invite','바람이 머문 자리 — 함께 부르는 듀엣','duet',null,1,100);
seed('empty-invite','우리의 다음 목소리를 기다려요','duet',null,1,200);
seed('solo','바람이 머문 자리 — 아주 긴 제목도 한 줄에서 자연스럽게 표시되는 솔로 커버','solo',null,0,300);
seed('joined','바람이 머문 자리 — 함께 완성한 노래','duet','invite',0,400);
seed('joined-two','바람이 머문 자리 — 또 다른 목소리','duet','invite',0,500);
f.sql.exec("UPDATE tracks SET user_id='owner',producer_id='producer' WHERE id IN ('joined','joined-two'); INSERT INTO listens(id,track_id,listener,day,started,qualified) VALUES('play','solo','person','2026-10-27',0,1)");
f.sql.exec("UPDATE tracks SET duet_part='male',original_key='C' WHERE duet_open=1");
const dubRoot=crypto.randomUUID(),dubChild=crypto.randomUUID(),script=sampleScript();
for(const [id,title,owner,root] of [[dubRoot,'비 오는 정류장 — 함께 더빙해요','other',null],[dubChild,'우리가 완성한 정류장 이야기','owner',dubRoot]]){
 await f.call('/api/dubbing/projects','POST',{id,options,script:{...script,title}},owner);
 f.sql.prepare("UPDATE dubbing_projects SET root_id=?,visibility='public',state='complete' WHERE id=?").run(root,id);
 const key=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(id).script_key;
 f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,manifest_json,state,output_key,created,updated) VALUES(?,?,?,'{}','ready','qa-final',0,0)").run(crypto.randomUUID(),id,key);
 f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES(?,?,?,'manual','{}','ready','qa-sound',0,0)").run(crypto.randomUUID(),id,key);
 f.sql.prepare('INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) VALUES(?,?,?,0)').run(id,script.roles[0].id,owner);
}
const root=resolve(process.env.AIFECT_QA_BASELINE||'dist/client'),env={DUBBING_ENABLED:'true',DB:f.DB,BUCKET:{async head(){return {size:wav.length};},async get(key){const body=key.startsWith('images/')?art:wav;return {body,size:body.length};}},ASSETS:{async fetch(req){const u=new URL(req.url),file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.txt':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:'+port);
  if(u.pathname==='/qa-metrics.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await readFile('tests/mypage-works-qa.js'));return;}
  if(u.pathname==='/qa-layout'){
   const w=[320,360,390,430,768,1440].includes(Number(u.searchParams.get('width')))?Number(u.searchParams.get('width')):1440,h=w===1440?900:844;
   res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>AIFECT 로컬 화면 검증</title><body style="overflow:hidden;margin:0;background:#0c121b;color:white;font:14px sans-serif"><p style="margin:12px">로컬 테스트 데이터 · ${w} × ${h} · <button onclick="document.querySelector('iframe').contentDocument.querySelector('.covers-panel')?.scrollIntoView({block:'start'})">작품 목록 보기</button> <a style="color:white" href="/qa-layout?width=1440">PC</a> <a style="color:white" href="/qa-layout?width=390">390</a> <a style="color:white" href="/qa-layout?width=320">320</a> <a style="color:white" href="/qa-layout?width=768">768</a></p><output id="qa-metrics" style="display:block;font-size:11px;margin:4px 12px"></output><script src="/qa-metrics.js"></script><iframe title="AIFECT ${w}px" src="/#producer/friend" style="width:${w}px;height:${h}px;border:0;transform-origin:top left;margin-left:12px"></iframe><script>function fit(){document.querySelector('iframe').style.transform='scale('+Math.min(1,(innerWidth-30)/${w},(innerHeight-85)/${h})+')'}addEventListener('resize',fit);fit();</script></body></html>`);return;
  }
  const body=[];for await(const c of req)body.push(c);
  const response=await worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}
}).listen(port,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+port+'/qa-layout?width=1440'));
process.on('SIGINT',()=>{cleanups.forEach(fn=>fn());process.exit(0);});

