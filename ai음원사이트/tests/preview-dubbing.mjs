// Disposable local-only preview. No remote DB, external AI, Gold charges or production users.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import {sampleScript,options,memoryBucket} from './dubbing-fixtures.mjs';
import worker from '../server/index.js';
import {createAdminPasswordHash} from '../server/admin-session.js';
import {hash} from '../server/auth.js';
import {encodeWav} from '../shared/karaoke-audio.js';
import {dubbingTimeline} from '../shared/dubbing.js';
const cleanups=[],BUCKET=memoryBucket(),env={DUBBING_ENABLED:'true',DUBBING_AI_ENABLED:'false',DUBBING_SOUND_ENABLED:'true',DUBBING_PAID_API_ENABLED:'false',TRANSCODER_TOKEN:'local-preview-only',BUCKET};
const goldFixture=process.argv.includes('--gold-fixture');
if(process.argv.includes('--community-fixture'))env.ADMIN_USER_IDS='owner';
if(goldFixture){
 Object.assign(env,{DUBBING_GOLD_ENABLED:'true',DUBBING_PAID_API_ENABLED:'true',PIKA_API_KEY:'local-ui-fixture-not-a-real-key'});
 // Local financial fixture only. Any accidental provider call fails before leaving this process.
 globalThis.fetch=async()=>{throw Error('External requests disabled in local Gold fixture');};
}
const f=await fixture({after(fn){cleanups.push(fn);}},env);env.DB=f.DB;
let localAdminCookie='';
if(process.argv.includes('--community-fixture')){
 env.ADMIN_PASSWORD_HASH=await createAdminPasswordHash('disposable-local-preview');
 const token='a'.repeat(64);localAdminCookie='; __Host-aifect_admin='+token;
 f.sql.prepare('INSERT INTO admin_sessions(token_hash,credential_version,created,expires) VALUES(?,?,?,?)').run(await hash(token),await hash(env.ADMIN_PASSWORD_HASH),Math.floor(Date.now()/1000),Math.floor(Date.now()/1000)+3600);
}
if(goldFixture)f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,status,created,paid_at) VALUES('local-demo-gold','owner','test',80,0,'paid',0,0)");
const works=[['마지막 우산',['일상','감동']],['오후 세 시의 비밀',['로맨스','코미디']],['불이 꺼진 도서관',['미스터리','판타지']]];
for(let i=0;i<works.length;i++){
 const script=sampleScript();script.title=works[i][0];const opt={...options,genres:works[i][1]};script.genres=opt.genres;
 const r=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options:opt,script},'other');
 if(r.status!==201)throw Error(JSON.stringify(r));
 await f.call('/api/dubbing/projects/'+r.body.project.id+'/publish','POST',{revision:1,rightsAccepted:true},'other');
 if(i===0)await f.call('/api/dubbing/projects/'+r.body.project.id+'/claims/role_2','POST',{revision:2},'other');
}
const own=sampleScript();own.title='[로컬 테스트] 내 배경 오디오';
if(process.argv.includes('--recording-fixture')){
 const texts=['아직 버스가 안 왔네요. 비가 더 세져요.','이쪽으로 와요. 여기 지붕 아래는 괜찮아요.','고마워요. 오늘따라 모든 일이 늦어지네요.','서두르지 않아도 되는 날도 있잖아요.','그렇게 생각하니까 마음이 조금 편해져요.','저도 누군가에게 그 말을 듣고 싶었거든요.','혹시 매일 이 시간에 버스를 타나요?','아니요. 오늘은 길을 조금 돌아왔어요.','돌아오는 길에 좋은 걸 발견했나요?','네. 비를 함께 기다려주는 사람을 만났죠.','그 말은 조금 부끄럽지만 고맙네요.','저기 버스가 오네요. 먼저 타세요.','우산이 하나뿐이면 같이 써도 돼요.','좋아요. 다음 정류장까지 같이 가요.','오늘 돌아온 길을 기억할 것 같아요.','저도요. 비가 와서 다행인 날이네요.'];
 own.lines=texts.map((text,i)=>({...own.lines[i%2],id:'line_'+(i+1),text,durationSeconds:7}));
 own.soundCues=[];
}

const ownResponse=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:own});
if(ownResponse.status!==201)throw Error('Local test work could not be created');
let recordURL='';
if(process.argv.includes('--recording-fixture')){
 env.DUBBING_RECORDING_ENABLED='true';
 const pid=ownResponse.body.project.id,script=ownResponse.body.project.script,soundId=crypto.randomUUID();
 await f.call('/api/dubbing/projects/'+pid+'/publish','POST',{revision:1,rightsAccepted:true});
 await f.call('/api/dubbing/projects/'+pid+'/claims/role_1','POST',{revision:2});
 await f.call('/api/dubbing/projects/'+pid+'/claims/role_2','POST',{revision:3},'other');
 const key='local-recording-background',voice='local-recording-voice',timeline=dubbingTimeline(script),scriptKey=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(pid).script_key;
 await BUCKET.put(key,encodeWav([new Float32Array(Math.ceil(timeline.duration*48000))],48000));
 await BUCKET.put(voice,encodeWav([Float32Array.from({length:48000},(_,i)=>.015*Math.sin(i*.03))],48000));
 f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES(?,?,?,'basic',?,'ready',?,0,0)").run(soundId,pid,scriptKey,JSON.stringify(timeline),key);
 const rid=crypto.randomUUID();
 f.sql.prepare("INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,write_token,created,updated) VALUES(?,?,'role_2','other',?,'submitted','fixture',0,0)").run(rid,pid,scriptKey);
 f.sql.prepare('INSERT INTO dubbing_recording_lines(recording_id,line_id,take_id,audio_key,audio_hash,duration,bytes,updated) VALUES(?,?,?,?,?,1,96044,0)').run(rid,script.lines[1].id,crypto.randomUUID(),voice,'fixture');
 recordURL='http://127.0.0.1:4182/#dubbing/'+pid+'?record=1';
}
if(goldFixture){const s=sampleScript();s.title='[로컬 테스트] 두 번째 음향';await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:s});}
if(process.argv.includes('--community-fixture')){
 const projects=f.sql.prepare("SELECT id FROM dubbing_projects WHERE visibility='public' AND owner_id='other' ORDER BY created,id").all();
 await f.call('/api/dubbing/projects/'+projects[0].id+'/like','PUT');
 await f.call('/api/dubbing/projects/'+projects[0].id+'/comments','POST',{id:crypto.randomUUID(),body:'빗소리와 두 사람의 대사가 잘 어울려요. 다음 장면도 기대할게요!'});
 await f.call('/api/dubbing/projects/'+projects[0].id+'/comments','POST',{id:crypto.randomUUID(),body:'각자의 목소리로 이 장면을 채워보세요.'},'other');
 await f.call('/api/dubbing/projects/'+projects[1].id+'/report','POST',{rightsholder:'로컬 검증 권리자',contact:'rights@example.test',details:'샘플 신고입니다. 실제 작품이나 계정에 영향을 주지 않습니다.',evidence:['https://example.test/license'],confirmed:true});
 recordURL||='http://127.0.0.1:4182/#dubbing/'+projects[0].id;
}
const base=resolve('dist/client');
env.ASSETS={async fetch(req){
 const u=new URL(req.url),file=resolve(base,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!file.startsWith(base+sep))return new Response('',{status:404});
 try{
  let data=await readFile(file);
  if(file.endsWith('.html'))data=Buffer.from(data.toString().replace('</body>','<div style="position:fixed;left:0;right:0;top:0;z-index:9999;background:#1e544c;color:white;text-align:center;font:11px sans-serif;padding:4px;pointer-events:none">로컬 테스트 · 샘플 작품 · 실제 계정·AI 호출·결제 없음</div></body>'));
  return new Response(data,{headers:{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});
 }catch{return new Response('Not found',{status:404});}
}};
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const c of req)chunks.push(c);
  const response=await worker.fetch(new Request('http://127.0.0.1:4182'+req.url,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'+localAdminCookie},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Local preview error');}
});
server.listen(4182,'127.0.0.1',()=>console.log('Dubbing preview: '+(recordURL||'http://127.0.0.1:4182/#dubbing')));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{cleanups.forEach(fn=>fn());process.exit(0);}));
