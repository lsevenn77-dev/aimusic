// Local, in-memory preview only. Never registered or bundled as a production route.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {sampleScript,options} from './dubbing-fixtures.mjs';
import {dubbingTimeline} from '../shared/dubbing.js';
const port=Number(process.env.PREVIEW_PORT||4186);
const cleanups=[],objects=new Map(),localBucket={async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async head(k){return objects.has(k)?{size:objects.get(k).length||1}:null;},async delete(k){objects.delete(k);}},
 featureEnv={DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',...(process.env.DUBBING_QA==='1'?{TRANSCODER_TOKEN:'local-preview-only'}:{}),BUCKET:localBucket},f=await fixture({after(fn){cleanups.push(fn);}},featureEnv);
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
// Seed only disposable SQLite/R2. Existing production handlers supply every response.
f.sql.exec("INSERT INTO follows VALUES('owner','producer','friend',0); UPDATE producers SET image_version='demo',image_type='image/png' WHERE id='friend'");objects.set('images/producer/friend/demo',nova);
f.sql.exec("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode,duet_parent_id) VALUES('preview-complete-duet','owner','artist','producer','함께 완성한 바람','Rock','',1,'wav',128,20,'published','cover','one',45,'duet','preview-duet')");
objects.set('stream/preview-complete-duet.m4a',wav);objects.set('preview/preview-complete-duet.m4a',wav);
const dubTitles=['마지막 우산','별 너머의 목소리','밤의 도서관','아직 못다 한 이야기'];
for(let i=0;i<4;i++){
 const pid='20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),script=sampleScript();script.title=dubTitles[i];
 if(i===0&&process.env.DUBBING_QA==='1'){
  script.lines=Array.from({length:4},(_,n)=>({...script.lines[n%2],id:'qa_line_'+n,order:n+1,durationSeconds:3,gapSeconds:2}));
  script.lines[2].text='잠깐. 발소리 들려요?';script.soundCues=[{...script.soundCues[0],kind:'sfx',id:'qa_steps',lineId:script.lines[2].id,anchor:'before',durationSeconds:2,generationSeconds:2,fadeInSeconds:0,fadeOutSeconds:.1}];
 }
 const who=i===3?'owner':'other',made=await f.call('/api/dubbing/projects','POST',{id:pid,options,script},who);if(made.status!==201)throw Error(JSON.stringify(made));
 if(i!==3)await f.call('/api/dubbing/projects/'+pid+'/publish','POST',{revision:1,rightsAccepted:true},who);
 const sk=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(pid).script_key;
 if(i!==3){f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES(?,?,?,'basic',?,'ready',?,0,0)").run(crypto.randomUUID(),pid,sk,JSON.stringify(dubbingTimeline(script)),'qa-dub-'+i);objects.set('qa-dub-'+i,wav);}
 if(i===0)await f.call('/api/dubbing/projects/'+pid+'/claims/role_2','POST',{revision:2},'other');
 if(i===1){f.sql.prepare("UPDATE dubbing_projects SET state='complete',updated=200 WHERE id=?").run(pid);f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,manifest_json,state,output_key,output_meta,created,updated) VALUES(?,?,?,'{}','ready',?,'{}',100,200)").run(crypto.randomUUID(),pid,sk,'qa-dub-final');objects.set('qa-dub-final',wav);}
}
// Optional stress data is confined to this disposable SQLite preview.
if(process.env.LIST_ACTIONS_QA==='1'){
 f.sql.prepare('UPDATE tracks SET title=? WHERE id IN (?,?,?)').run('아주 긴 곡 제목으로 목록의 말줄임과 버튼 정렬을 확인하는 로컬 검증 작품입니다 — 함께 부르는 목소리','one','preview-duet','preview-complete-duet');
 f.sql.prepare('UPDATE producers SET name=? WHERE id=?').run('아주 긴 닉네임을 사용하는 로컬 검증 음악가','friend');
 // Exact-parent, zero-count, multi-work and pagination cases stay in the local fixture.
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('qa-guest','qa-guest@example.test','참여자',0); INSERT INTO producers(id,user_id,name,image_version,image_type,created) VALUES('qa-guest-profile','qa-guest','다른 참여자','demo','image/png',0)");
 objects.set('images/producer/qa-guest-profile/demo',nova);
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode,duet_open,duet_part) VALUES('preview-empty-half','other','artist','friend',?,'Rock','',1,'wav',128,1,'published','cover','one',45,'duet',1,'male')").run('참여작 없는 반곡');
 objects.set('stream/preview-empty-half.m4a',wav);objects.set('preview/preview-empty-half.m4a',wav);
 for(let i=0;i<52;i++){
  const id='qa-child-'+i,guest=i===51;
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode,duet_parent_id) VALUES(? ,?,'artist',?,?,'Rock','',1,'wav',128,?,'published','cover','one',45,'duet','preview-duet')").run(id,guest?'qa-guest':'owner',guest?'qa-guest-profile':'producer','함께 완성한 참여 커버 '+(i+1),30+i);
  objects.set('stream/'+id+'.m4a',wav);objects.set('preview/'+id+'.m4a',wav);
 }
 const playlist=await f.call('/api/playlists','POST',{name:'목록 검증용 플레이리스트',track_ids:['one','two','preview-duet','preview-complete-duet']});
 console.log('Local QA playlist: #playlist/'+playlist.body.id);
 const now=Math.floor(Date.now()/1000);
 f.sql.prepare("INSERT INTO listens(id,track_id,listener,user_id,started,seconds,day,qualified) VALUES('qa-ai-listen','one','u:other','other',?,45,?,1)").run(now,'2026-10-28');
 f.sql.prepare("INSERT INTO listens(id,track_id,listener,user_id,started,seconds,day,qualified) VALUES('qa-ranking-listen','preview-complete-duet','u:qa-guest','qa-guest',?,45,?,1)").run(now,'2026-10-28');
 for(const [i,id] of ['one','preview-cover','preview-complete-duet'].entries())f.sql.prepare("INSERT INTO listens(id,track_id,listener,user_id,started,seconds,day,qualified) VALUES(?,?,?,'owner',?,45,?,1)").run('qa-listen-'+i,id,'u:owner',now-i,'2026-10-28');

}
const base=resolve('dist/client');
const qa=await readFile('tests/recording-qa-browser.js');
const env={...featureEnv,DB:f.DB,BUCKET:{async put(k,v){objects.set(k,v);},async delete(k){objects.delete(k);},async head(k){const b=objects.get(k);return b?{size:b.length,etag:k}:null;},async get(k){return {body:objects.get(k)};},async list(){return {objects:[],truncated:false};}},
 ASSETS:{async fetch(req){const url=new URL(req.url),file=resolve(base,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(base+sep))return new Response('',{status:404});try{let data=await readFile(file);if(file===resolve(base,'index.html'))data=Buffer.from(data.toString().replace('</body>','<div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1e544c;color:white;font:10px sans-serif;text-align:center;pointer-events:none">로컬 검증 · 샘플 데이터 · 운영 변경 없음</div>'+(url.searchParams.has('qa')?'<script src="/recording-qa.js"></script>':'')+'</body>'));return new Response(data,{headers:{'content-type':({'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=createServer(async(req,res)=>{
 try{if(['/qa/premium','/qa/free'].includes(req.url)){f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(req.url==='/qa/premium'?Math.floor(Date.now()/1000)+3600:0);res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}if(req.url==='/recording-qa.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(qa);return;}if(req.url==='/qa-mobile'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<body style="margin:20px;background:#151923;color:white;font-family:sans-serif"><p>390px 모바일 녹음 화면 검사</p><iframe title="모바일 녹음 화면" src="/#sing/one?mode=duet" style="width:390px;height:844px;border:1px solid #778"></iframe></body>');return;}const body=[];for await(const chunk of req)body.push(chunk);const url='http://127.0.0.1:'+port+req.url;
 const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+port+'/#sing/one?mode=duet'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(f=>f());process.exit(0);}));

