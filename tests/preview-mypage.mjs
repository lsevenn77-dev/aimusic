// Local, in-memory preview only. Never registered or bundled as a production route.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {options,sampleScript} from './dubbing-fixtures.mjs';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}}),objects=new Map();
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
for(let i=0;i<6;i++){
 f.sql.prepare('INSERT INTO profile_photos VALUES(?,?,?,?,?)').run('photo'+i,'producer','demo'+i,'image/png',i);
 objects.set('images/producer/producer/gallery/demo'+i,i%2?nova:ocean);
}

// Fixtures are isolated in memory and never included in the client build.
const at=Math.floor(Date.now()/1000);
f.sql.exec("UPDATE tracks SET title='아직 다듬고 있는 노래' WHERE id='hidden'; UPDATE artists SET name='NOVA',image_version='demo',image_type='image/png' WHERE id='artist'; INSERT INTO artists(id,producer_id,name,created,image_version,image_type) VALUES('artist2','producer','OCEAN',0,'demo','image/png'),('artist3','producer','LUMI',0,'demo','image/png'); INSERT INTO crews(id,owner_id,name,description,created) VALUES('qa-crew','owner','ZERO','함께 만들고, 함께 노래하는 공간',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('qa-crew','owner','leader',0),('qa-crew','other','member',0); INSERT INTO player_xp(user_id,source_key,kind,amount,created) VALUES('owner','preview','publish',1800,0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,created,status) VALUES('qa-paid','owner','web',2500,25000,825,2273,0,'paid'); INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',1280); INSERT INTO personal_relations(id,first_user,second_user,requested_by,state,first_public,second_public,created,updated) VALUES('qa-relation','other','owner','owner','accepted',1,1,0,0); INSERT INTO relation_xp VALUES('qa-relation','preview','message',230,0); INSERT INTO follows(user_id,kind,target_id,created) VALUES('other','producer','producer',unixepoch()),('owner','producer','friend',unixepoch()); INSERT INTO comments(id,track_id,user_id,body,created) VALUES('qa-comment','one','other','좋은 음악 잘 들었어요.',unixepoch()); INSERT INTO free_gifts(id,sender_id,recipient_profile_id,request_id,created,gift_type,gift_name,silver,quantity) VALUES('qa-gift','other','producer','qa-gift',unixepoch(),'silver-letter','손편지',6,3)");
objects.set('images/artist/artist/demo',nova);objects.set('images/artist/artist2/demo',ocean);objects.set('images/artist/artist3/demo',nova);
for(let i=0;i<6;i++){
 const tid='qa-cover-'+i;
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duration) VALUES(?,'owner','artist','producer',?,'Rock','',1,'wav',128,?,?,'cover','one',?,45)").run(tid,['별빛에 기대어 (Cover)','여름 끝자락 (Duet)','함께 걷는 길 (Cover)','밤하늘 아래 (Duet)','오늘도 너에게 (Cover)','우리의 멜로디 (Cover)'][i],at-i*60,i===5?'hidden':'published',i%2?'duet':'solo');
 objects.set('stream/'+tid+'.m4a',wav);
}
f.sql.exec("UPDATE tracks SET cover_mode='duet',duet_open=1,duet_part='male' WHERE id='preview-cover'");
for(const id of ['one','two','three','preview-cover'])objects.set('stream/'+id+'.m4a',wav);
for(const [id,owner,state,visibility,title] of [['11111111-1111-4111-8111-111111111111','owner','complete','public','비 오는 정류장'],['11111111-1111-4111-8111-111111111112','owner','script_ready','private','다음 이야기'],['11111111-1111-4111-8111-111111111113','other','recruiting','public','함께 읽는 마지막 우산']]){
 const script=sampleScript();script.title=title;
 f.sql.prepare("INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,state,visibility,role_count,duration,write_token,created,updated) VALUES(?,?,?,?,?,?,?,?,?,2,30,?,?,?)").run(id,owner,title,JSON.stringify(options),JSON.stringify(script),'dubbing/'+owner+'/'+id+'/script.json','qa',state,visibility,'qa',at,at);
 objects.set('dubbing/'+owner+'/'+id+'/script.json',new TextEncoder().encode(JSON.stringify(script)));
 if(state==='complete'){f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,state,manifest_json,output_key,created,updated) VALUES(?,?,?,'ready','{}',?,?,?)").run('qa-final',id,'dubbing/'+owner+'/'+id+'/script.json','qa-final.wav',at,at);objects.set('qa-final.wav',wav);}
}
if(process.argv.includes('--follow-qa'))(await import('./follow-preview-fixture.mjs')).seedFollowPreview(f.sql);
const port=Number(process.env.AIFECT_PREVIEW_PORT||4188),origin='http://127.0.0.1:'+port;
const base=resolve('dist/client');
f.sql.prepare('UPDATE likes SET created=?').run(at-3600);
for(const [i,role] of sampleScript().roles.entries())f.sql.prepare("INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,write_token,created,updated) VALUES(?,'11111111-1111-4111-8111-111111111111',?,?,'dubbing/owner/11111111-1111-4111-8111-111111111111/script.json','submitted','qa',?,?)").run('qa-record-'+i,role.id,i?'other':'owner',at,at);
const env={DUBBING_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',ADMIN_USER_IDS:'owner',DB:f.DB,BUCKET:{async put(k,v){objects.set(k,new Uint8Array(v));},async delete(k){objects.delete(k);},async head(k){const b=objects.get(k);return b?{size:b.length,etag:k}:null;},async get(k,opts){const v=objects.get(k);return v?{body:opts?.range?v.slice(opts.range.offset,opts.range.offset+opts.range.length):v}:null;},async list(){return {objects:[],truncated:false};}},
 ASSETS:{async fetch(req){const url=new URL(req.url),file=resolve(base,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(base+sep))return new Response('',{status:404});try{const data=await readFile(file);return new Response(data,{headers:{'content-type':({'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
for(const type of ['heart','lollipop','silver-letter']){
 const response=await worker.fetch(new Request(origin+'/api/admin/gift-inventory/grant',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'aifect_session=owner'},body:JSON.stringify({user_id:'owner',gift_type:type,quantity:3,reason:'Isolated local QA only',request_id:crypto.randomUUID()})}),env,{});if(!response.ok)throw Error(await response.text());
}
const server=createServer(async(req,res)=>{
 if(process.argv.includes('--follow-navigation-qa')&&req.url==='/__qa/follow-diagnostics.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await readFile('tests/follow-navigation-diagnostics.js'));return;}
 try{if(req.url.startsWith('/__qa/viewer/')){const who=req.url.split('/').pop();res.writeHead(302,{'Set-Cookie':'qa_viewer='+(['owner','other','guest'].includes(who)?who:'owner')+'; Path=/; SameSite=Lax',Location:who==='owner'?'/#profile':'/#producer/producer'});res.end();return;}const body=[];for await(const chunk of req)body.push(chunk);const url=origin+req.url;
 const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,cookie:'aifect_session='+(/qa_viewer=(owner|other|guest)/.exec(req.headers.cookie||'')?.[1]||'owner')},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
 const payload=Buffer.from(await response.arrayBuffer());
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(process.argv.includes('--follow-navigation-qa')&&response.headers.get('content-type')?.includes('text/html')?payload.toString().replace('<head>','<head><script src="/__qa/follow-diagnostics.js"></script>'):payload);
 }catch(e){console.error(e);res.writeHead(500);res.end('Local preview error');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local preview: '+origin+'/#profile'));
process.on('SIGINT',()=>server.close(()=>{cleanups.forEach(f=>f());process.exit(0);}));

