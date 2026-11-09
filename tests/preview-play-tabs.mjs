// Disposable browser QA served only by the managed Sites preview daemon.
// All identities, music, requests and changes below stay in memory. No .dev.vars
// or production bindings are read, and this file is not part of the build.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {sampleScript,options} from './dubbing-fixtures.mjs';
import {dubbingTimeline} from '../shared/dubbing.js';
import worker from '../server/index.js';

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(checkout);
const args=process.argv.slice(2);
function argument(name,fallback){
 const equal=args.find(value=>value.startsWith(name+'='));
 if(equal)return equal.slice(name.length+1);
 const at=args.lastIndexOf(name);return at>=0?args[at+1]:fallback;
}
const host=argument('--host','127.0.0.1'),port=Number(argument('--port',process.env.PORT||'4186'));
if(!host||!Number.isInteger(port)||port<1||port>65535)throw Error('Expected a valid --host and --port.');
const cleanups=[],pending=new Set(),objects=new Map();
const bucket={
 async put(key,value,metadata={}){const bytes=new Uint8Array(await new Response(value).arrayBuffer());objects.set(key,{bytes,httpMetadata:metadata.httpMetadata});return {key,size:bytes.length};},
 async head(key){const value=objects.get(key);return value?{key,size:value.bytes.length,etag:key,httpMetadata:value.httpMetadata}:null;},
 async get(key,{range}={}){const value=objects.get(key);if(!value)return null;return {body:range?value.bytes.subarray(range.offset,range.offset+range.length):value.bytes,size:value.bytes.length,httpMetadata:value.httpMetadata};},
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);},
 async list({prefix=''}={}){return {objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false};}
};
const featureEnv={DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',BUCKET:bucket};
const f=await fixture({after(fn){cleanups.push(fn);}},featureEnv);
const sampleRate=22050,duration=180,wav=new Uint8Array(44+sampleRate*2*duration),wave=new DataView(wav.buffer);
const ascii=(offset,text)=>wav.set(new TextEncoder().encode(text),offset);
ascii(0,'RIFF');wave.setUint32(4,wav.length-8,true);ascii(8,'WAVEfmt ');wave.setUint32(16,16,true);wave.setUint16(20,1,true);wave.setUint16(22,1,true);wave.setUint32(24,sampleRate,true);wave.setUint32(28,sampleRate*2,true);wave.setUint16(32,2,true);wave.setUint16(34,16,true);ascii(36,'data');wave.setUint32(40,wav.length-44,true);
const rememberAudio=key=>objects.set(key,{bytes:wav,httpMetadata:{contentType:'audio/wav'}});
const artworks=await Promise.all(['14','22','47'].map(id=>readFile('dist/assets/genres/'+id+'.webp')));
f.sql.exec("UPDATE users SET name='로컬 테스트 음악가' WHERE id='owner'; UPDATE users SET name='함께 부르는 친구' WHERE id='other'; UPDATE producers SET name='로컬 테스트 음악가',nickname_confirmed=1 WHERE id='producer'; UPDATE artists SET name='미리보기 보컬' WHERE id='artist'; INSERT INTO producers(id,user_id,name,nickname_confirmed,created) VALUES('friend','other','함께 부르는 친구',1,0); INSERT INTO follows VALUES('owner','producer','friend',0)");
const originalIds=Array.from({length:30},(_,i)=>i<3?['one','two','three'][i]:'qa-song-'+String(i+1).padStart(2,'0'));
const titleParts=['바람이 머문 자리','푸른 밤의 멜로디','우리의 작은 무대','다시 만나는 계절','별이 흐르는 시간','내일의 우리'];
for(const [i,id] of originalIds.entries()){
 if(i>=3)f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,?,'published')").run(id,id,i+1);
 f.sql.prepare("UPDATE tracks SET title=?,duration=?,has_cover=1,cover_version='qa',cover_type='image/webp',karaoke_at=1,lyrics_mode='synced',lyrics=?,description='로컬 탭 전환 검증용 샘플입니다.',created=? WHERE id=?").run(titleParts[i%titleParts.length]+' '+String(i+1).padStart(2,'0'),duration,'[00:01.000]처음 만난 이 순간\n[00:05.000]함께 노래를 불러요\n[00:10.000]우리의 작은 무대에서',i+1,id);
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,lyrics_text,words,words_state,created,updated) VALUES(?,?,'ready',1,'로컬 테스트',?,'ready',0,0)").run(id,'qa-job-'+id,JSON.stringify([{s:1,e:5,w:[{t:'함께 노래를 불러요',s:1,e:5}]}]));
 objects.set('images/track/'+id+'/qa',{bytes:artworks[i%artworks.length],httpMetadata:{contentType:'image/webp'}});
 rememberAudio('karaoke/'+id+'/mr.m4a');
}
f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('owner','one',1),('other','one',2),('owner','two',3)");
for(let i=1;i<=3;i++){
 const id='qa-duet-'+i,parent=originalIds[i-1];
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode,duet_open,duet_part) VALUES(?,'other','artist','friend',?,'Rock','',1,'wav',128,?,'published','cover',?,?,'duet',1,'male')").run(id,titleParts[i-1]+' — 듀엣 모집',40+i,parent,duration);
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode,duet_parent_id) VALUES(?,'owner','artist','producer',?,'Rock','',1,'wav',128,?,'published','cover',?,?,'duet',?)").run('qa-complete-'+i,titleParts[i-1]+' — 함께 부른 듀엣',50+i,parent,duration,id);
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration,cover_mode) VALUES(?,'other','artist','friend',?,'Rock','',1,'wav',128,?,'published','cover',?,?,'solo')").run('qa-solo-'+i,titleParts[i-1]+' — 솔로 커버',60+i,parent,duration);
}
for(const {id} of f.sql.prepare("SELECT id FROM tracks WHERE status='published'").all()){
 rememberAudio('stream/'+id+'.m4a');rememberAudio('preview/'+id+'.m4a');
}
const dubbingIds=[];
for(let i=0;i<3;i++){
 const id='30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),script=sampleScript();
 script.title=['마지막 우산','별 너머의 목소리','밤의 도서관'][i];
 const made=await f.call('/api/dubbing/projects','POST',{id,options,script},i===2?'owner':'other');
 assert.equal(made.status,201,JSON.stringify(made));dubbingIds.push(id);
 const {script_key:scriptKey}=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(id);
 if(i<2){
  f.sql.prepare("UPDATE dubbing_projects SET state=?,visibility='public',created=?,updated=? WHERE id=?").run(i===1?'complete':'recruiting',80+i,80+i,id);
  f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES(?,?,?,'basic',?,'ready',?,0,0)").run('qa-sound-'+i,id,scriptKey,JSON.stringify(dubbingTimeline(script)),'qa-dubbing-sound-'+i);
  rememberAudio('qa-dubbing-sound-'+i);
 }
 if(i===1){
  f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,manifest_json,state,output_key,output_meta,created,updated) VALUES(?,?,?,'{}','ready',?,'{}',80,81)").run('qa-final',id,scriptKey,'qa-dubbing-final');
  rememberAudio('qa-dubbing-final');
 }
}

// Community samples use the same real Worker/SQLite routes as the Play fixture.
// The signed-in preview user remains outside a crew so its discovery UI is tested.
const communityNow=Math.floor(Date.now()/1000),crewIds=[];
for(let i=1;i<=6;i++){
 const user='qa-crew-owner-'+i,id='qa-crew-'+i;crewIds.push(id);
 f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,?)').run(user,user+'@example.test','샘플 크루장 '+i,communityNow);
 f.sql.prepare('INSERT INTO producers(id,user_id,name,nickname_confirmed,created) VALUES(?,?,?,1,?)').run('qa-crew-producer-'+i,user,'샘플 크루장 '+i,communityNow);
 f.sql.prepare('INSERT INTO crews(id,owner_id,name,description,interests,created) VALUES(?,?,?,?,?,?)').run(id,user,['밤하늘 합창단','멜로디 산책','우리의 작은 무대','별빛 보이스','푸른 밤 크루','다시 노래하는 날'][i-1],'함께 노래하고 음악을 나누는 로컬 검증용 크루예요.','Rock',communityNow-i);
 f.sql.prepare("INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES(?,?,'owner',?)").run(id,user,communityNow);
 f.sql.prepare('INSERT INTO crew_xp(id,crew_id,user_id,amount,created) VALUES(?,?,?,?,?)').run('qa-weekly-xp-'+i,id,user,70-i*5,communityNow);
}
f.sql.prepare("UPDATE likes SET created=? WHERE user_id='other' AND track_id='one'").run(communityNow);
f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)').run('other','qa-complete-1',communityNow);
f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)').run('owner','qa-solo-1',communityNow);

// Private MyPage samples share this disposable account, never production data.
// Keep its crew membership empty so the existing Community discovery QA remains valid.
f.sql.prepare("UPDATE producers SET bio=? WHERE id='producer'").run('노래와 일상의 순간을 기록하는 로컬 검증용 프로필이에요.');
for(const [i,id] of originalIds.slice(2,17).entries())f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)').run('owner',id,communityNow-i);
for(const [i,id] of originalIds.slice(0,6).entries())f.sql.prepare('INSERT INTO listens(id,track_id,listener,user_id,started,seconds,day,qualified) VALUES(?,?,?,?,?,?,?,1)').run('qa-history-'+i,id,'qa-owner','owner',communityNow-i*60,45,new Date().toISOString().slice(0,10));
for(let i=1;i<=3;i++){
 const id='qa-playlist-'+i;f.sql.prepare('INSERT INTO playlists(id,user_id,name,created) VALUES(?,?,?,?)').run(id,'owner',['다시 듣고 싶은 노래','함께 부르는 저녁','나의 작은 무대'][i-1],communityNow-i);
 for(const [j,track] of originalIds.slice(i-1,i+3).entries())f.sql.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,created) VALUES(?,?,?)').run(id,track,communityNow-j);
}
for(let i=0;i<2;i++){
 const version='qa-moment-'+i;f.sql.prepare('INSERT INTO profile_photos(id,producer_id,image_version,image_type,created) VALUES(?,?,?,?,?)').run(version,'producer',version,'image/webp',communityNow-i);
 objects.set('images/producer/producer/gallery/'+version,{bytes:artworks[i],httpMetadata:{contentType:'image/webp'}});
}
f.sql.prepare('INSERT INTO free_gift_wallets(user_id,balance) VALUES(?,?)').run('owner',1280);
f.sql.prepare('INSERT INTO free_gifts(id,sender_id,recipient_profile_id,request_id,created,gift_type,gift_name,silver,quantity) VALUES(?,?,?,?,?,?,?,?,?)').run('qa-profile-gift','other','producer','qa-profile-gift',communityNow,'silver-letter','손편지',6,3);

const counts=new Map(),requests=[];let rules=[],previewUser='owner';
const stats=()=>({fixture:true,user:previewUser,songs:originalIds.length,duets:3,dubbings:dubbingIds,crews:crewIds.length,myPage:{playlists:3,history:6,gallery:2},liveDirectory:'service-disabled fixture',counts:Object.fromEntries(counts),requests:requests.slice(-300),rules});
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const probeJS=String.raw`(()=>{
 const selectors={main:'#main',page:'.play-page',banner:'#play-banner',mainTabs:'.play-main-tabs',categoryTabs:'.play-category-tabs',search:'#play-search',content:'.play-content',results:'#play-results',header:'.topbar',sidebar:'.sidebar',player:'.player'};
 const refs=()=>Object.fromEntries(Object.entries(selectors).map(([name,selector])=>[name,document.querySelector(selector)]));
 const playerAudio=()=>typeof audio==='undefined'?null:audio;
 let baseline=null,measure=null,frame=0,suite=null;
 const snapshot=()=>{
  const current=refs(),sound=playerAudio();
  return {hash:location.hash,width:innerWidth,height:innerHeight,scrollY,renderState:document.documentElement.dataset.renderState,mainDisplay:current.main?getComputedStyle(current.main).display:null,mainInert:current.main?.inert,selected:[...document.querySelectorAll('.play-tabs [aria-selected="true"]')].map(el=>el.textContent.trim()),rows:document.querySelectorAll('.play-song-row,.album-card,.dc-project-card,.play-project-row,.play-draft-row').length,resultsBusy:current.results?.getAttribute('aria-busy'),sameNodes:baseline?Object.fromEntries(Object.keys(selectors).map(key=>[key,current[key]===baseline.nodes[key]])):null,audio:{sameInstance:baseline?sound===baseline.audio:null,paused:sound?.paused,currentTime:sound?.currentTime,duration:sound?.duration,readyState:sound?.readyState,source:sound?.getAttribute('src'),error:sound?.error?.message||null},measure,suite};
 };
 const send=()=>parent.postMessage({type:'aifect-play-qa',snapshot:snapshot()},location.origin);
 const observe=()=>{
  if(!baseline)return;measure.frames++;
  const main=document.querySelector('#main');if(!main||getComputedStyle(main).display==='none')measure.hiddenFrames++;
  if(main?.inert)measure.inertFrames++;
  if(document.documentElement.dataset.renderState!=='ready')measure.nonReadyFrames++;
  measure.minScroll=Math.min(measure.minScroll,scrollY);measure.maxScroll=Math.max(measure.maxScroll,scrollY);
  frame=requestAnimationFrame(observe);
 };
 function reset(){
  cancelAnimationFrame(frame);if(baseline?.audio)for(const [name,handler] of baseline.handlers)baseline.audio.removeEventListener(name,handler);
  baseline={nodes:refs(),audio:playerAudio(),handlers:[]};measure={frames:0,hiddenFrames:0,inertFrames:0,nonReadyFrames:0,minScroll:scrollY,maxScroll:scrollY,audioEvents:{},startedAt:Date.now()};
  if(baseline.audio)for(const name of ['pause','play','emptied','abort','ended']){const handler=()=>{measure.audioEvents[name]=(measure.audioEvents[name]||0)+1;};baseline.handlers.push([name,handler]);baseline.audio.addEventListener(name,handler);}
  frame=requestAnimationFrame(observe);send();
 }
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const ensure=(condition,message)=>{if(!condition)throw Error(message);};
 async function waitFor(predicate,label,timeout=7000){
  const until=performance.now()+timeout;
  while(performance.now()<until){if(predicate())return;await delay(25);}
  throw Error('Timeout: '+label+' ('+location.hash+')');
 }
 const ready=()=>document.documentElement.dataset.renderState==='ready'&&document.querySelector('#main')?.dataset.route===location.hash.slice(1)&&document.querySelector('.play-page')&&!document.querySelector('#play-results[aria-busy="true"]')&&!document.querySelector('#play-results .route-loading');
 const apiStats=()=>fetch('/__qa/stats').then(response=>response.json());
 const qaControl=payload=>fetch('/__qa/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).then(response=>response.json());
 const count=(stats,path)=>stats.counts['GET '+path]||0;
 function link(hash,level){
  const selector=level==='main'?'.play-main-tabs a':'.play-category-tabs a';
  const element=[...document.querySelectorAll(selector)].find(element=>element.getAttribute('href')===hash);
  ensure(element,'Missing actual tab link: '+hash);return element;
 }
 async function navigate(hash,level='category'){
  const before=scrollY;link(hash,level).click();
  await waitFor(()=>location.hash===hash&&ready(),'tab '+hash);await delay(60);
  return {before,after:scrollY};
 }
 function assertShell(expectedHash,startScroll,lower=false,lowerRefs){
  const nodes=refs(),sound=playerAudio();
  for(const name of ['main','page','banner','mainTabs','content','results','header','sidebar','player'])ensure(nodes[name]===baseline.nodes[name],'Replaced persistent node: '+name);
  if(lower)for(const name of ['categoryTabs','search'])ensure(nodes[name]===lowerRefs[name],'Replaced lower-tab common node: '+name);
  ensure(location.hash===expectedHash,'URL differs from selected tab');
  const selected=[...document.querySelectorAll('.play-tabs [aria-selected="true"]')];ensure(selected.length===2,'Expected one selected tab at each level');
  ensure(document.querySelector('.play-category-tabs [aria-selected="true"]')?.getAttribute('href')===expectedHash,'Selected subtab and URL differ');
  ensure(Math.abs(scrollY-startScroll)<=2,'Scroll moved from '+startScroll+' to '+scrollY);
  ensure(sound===baseline.audio,'Global Audio instance was replaced');ensure(!sound.paused,'Global audio paused');
  ensure(sound.currentTime>=suite.audioStartedAt-.05,'Global audio playback position restarted');
  return {hash:location.hash,scrollBefore:startScroll,scrollAfter:scrollY,audioTime:sound.currentTime,selected:selected.map(element=>element.textContent.trim())};
 }
 async function runSuite(){
  if(suite?.running)return;
  suite={running:true,width:innerWidth,height:innerHeight,startedAt:Date.now(),cases:[]};send();
  const record=async(name,run)=>{
   suite.current=name;send();
   try{suite.cases.push({name,passed:true,...await run()});}
   catch(error){suite.cases.push({name,passed:false,error:error.message,hash:location.hash,scrollY});}
   send();
  };
  try{
   await qaControl({rules:[],reset:true});await waitFor(ready,'initial Play page');
   await navigate('#karaoke','main');await navigate('#karaoke/duets');
   const sound=playerAudio();ensure(sound,'Global Audio was not initialized');
   if(sound.paused){const button=document.querySelector('.play-duet-play[data-play]');ensure(button,'No real duet playback button');button.click();}
   await waitFor(()=>!sound.paused&&sound.readyState>=2&&sound.currentTime>0,'real duet playback',10000);
   await navigate('#karaoke');window.scrollTo({top:120,left:0,behavior:'instant'});await delay(80);
   ensure(scrollY>=100,'Fixture did not provide enough height for the 120px scroll check');
   suite.startScroll=scrollY;suite.audioStartedAt=sound.currentTime;reset();
   const lowerRefs=refs();
   for(const [name,hash] of [['하단 듀엣참여','#karaoke/duets'],['하단 최신곡','#karaoke/latest'],['하단 내 초안','#karaoke/drafts'],['초안에서 추천곡 복귀','#karaoke']]){
    await record(name,async()=>{const position=await navigate(hash);return assertShell(hash,position.before,true,lowerRefs);});
   }
   await record('즉시 왕복 시 캐시 재사용',async()=>{
    const before=await apiStats(),position=scrollY;
    await navigate('#karaoke/duets');await navigate('#karaoke');
    const after=await apiStats(),paths=['/api/play/songs?tab=recommended','/api/play/songs?tab=duets'];
    const reads=Object.fromEntries(paths.map(path=>[path,{before:count(before,path),after:count(after,path)}]));
    for(const path of paths)ensure(count(before,path)===count(after,path),'Cached tab requested data again: '+path);
    return {...assertShell('#karaoke',position,true,lowerRefs),reads};
   });
   for(const [name,hash] of [['상단 더빙','#karaoke/dubbing?tab=discover'],['상단 둘러보기','#karaoke/browse?tab=recommended&type=all'],['상단 노래 복귀','#karaoke']]){
    await record(name,async()=>{const position=await navigate(hash,'main');return assertShell(hash,position.before);});
   }
   await record('브라우저 뒤로가기·앞으로가기',async()=>{
    await navigate('#karaoke/latest');await navigate('#karaoke/duets');const position=scrollY;
    history.back();await waitFor(()=>location.hash==='#karaoke/latest'&&ready(),'history.back');await delay(80);
    const backward=assertShell('#karaoke/latest',position);
    history.forward();await waitFor(()=>location.hash==='#karaoke/duets'&&ready(),'history.forward');await delay(80);
    return {backward,forward:assertShell('#karaoke/duets',position)};
   });
   async function invalidateThroughRealLike(){
    const button=document.querySelector('.player [data-like]');ensure(button,'Player like action is missing');
    const before=button.getAttribute('aria-pressed');button.click();
    await waitFor(()=>!button.disabled&&button.getAttribute('aria-pressed')!==before,'local like API completion');
   }
   await record('지연된 최신곡 요청 도중 듀엣참여로 이동',async()=>{
    await navigate('#karaoke');await invalidateThroughRealLike();
    await qaControl({rules:[{match:'/api/play/songs?tab=latest',delayMs:1200}]});
    const before=await apiStats(),position=scrollY;link('#karaoke/latest').click();
    await waitFor(()=>location.hash==='#karaoke/latest'&&document.querySelector('#play-results[aria-busy="true"]'),'local latest loading');
    await delay(80);await navigate('#karaoke/duets');await delay(1350);
    const after=await apiStats();ensure(count(after,'/api/play/songs?tab=latest')>count(before,'/api/play/songs?tab=latest'),'Delayed request was not exercised');
    ensure(document.querySelectorAll('.play-duet-row').length===3,'Late latest response replaced the duet list');
    await qaControl({rules:[]});return assertShell('#karaoke/duets',position);
   });
   await record('콘텐츠 오류 후 같은 영역에서 재시도',async()=>{
    await qaControl({rules:[]});await invalidateThroughRealLike();
    await qaControl({rules:[{match:'/api/play/songs?tab=latest',failures:1,status:503}]});
    const position=scrollY;await navigate('#karaoke/latest');
    const retry=document.querySelector('#play-results [data-play-retry]');ensure(retry,'Content retry button was not shown');
    assertShell('#karaoke/latest',position);retry.click();
    await waitFor(()=>ready()&&!document.querySelector('#play-results [data-play-retry]')&&document.querySelectorAll('.play-song-row').length>0,'list retry');await delay(60);
    await qaControl({rules:[]});return assertShell('#karaoke/latest',position);
   });
   await record('전체 화면·재생 연속성',async()=>{
    await delay(150);
    ensure(measure.frames>0,'No visible animation frames were sampled');
    ensure(measure.hiddenFrames===0,'Main was hidden for '+measure.hiddenFrames+' frames');
    ensure(measure.inertFrames===0,'Main became inert');ensure(measure.nonReadyFrames===0,'Global loading state was shown');
    for(const event of ['pause','emptied','abort','ended'])ensure(!measure.audioEvents[event],'Unexpected global audio event: '+event);
    ensure(playerAudio().currentTime>suite.audioStartedAt,'Playback time did not advance');
    ensure(Math.abs(measure.minScroll-suite.startScroll)<=2,'Scroll dropped from '+suite.startScroll+' to '+measure.minScroll);
    return {frames:measure.frames,hiddenFrames:measure.hiddenFrames,inertFrames:measure.inertFrames,nonReadyFrames:measure.nonReadyFrames,scrollRange:[measure.minScroll,measure.maxScroll],audioEvents:{...measure.audioEvents},audioFrom:suite.audioStartedAt,audioTo:playerAudio().currentTime};
   });
  }catch(error){suite.error=error.message;}
  finally{
   await qaControl({rules:[]}).catch(()=>{});suite.running=false;suite.finishedAt=Date.now();suite.passed=suite.cases.filter(result=>result.passed).length;suite.failed=suite.cases.filter(result=>!result.passed).length+(suite.error?1:0);suite.current=null;send();
  }
 }
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='aifect-play-qa-control')return;
  if(event.data.command==='reset')reset();
  else if(event.data.command==='snapshot')send();
  else if(event.data.command==='suite')void runSuite();
  else if(event.data.command==='back'){history.back();setTimeout(send,150);}
  else if(event.data.command==='forward'){history.forward();setTimeout(send,150);}
  else if(event.data.command==='seed-draft'){
   try{if(typeof draftOp!=='function'||!me?.id)throw Error('Account is not ready');const id='one',owner=me.id,key=owner+':'+id;await draftOp('put',key,{key,id,owner,title:'로컬 저장 초안',artist:'미리보기 보컬',mode:'solo',samples:new Float32Array(32000),rate:32000,updated:Date.now()});send();}catch(error){parent.postMessage({type:'aifect-play-qa',error:error.message},location.origin);}
  }
 });
 window.addEventListener('hashchange',()=>setTimeout(send,100));
 window.AifectPlayQA={snapshot,reset,runSuite};
})();`;
const communityProbeJS=String.raw`(()=>{
 if(window.name!=='aifect-community-qa')return;
 const selectors={main:'#main',tabs:'.music-community-tabs[aria-label="커뮤니티"]',header:'.topbar',sidebar:'.sidebar',player:'.player'};
 const refs=()=>Object.fromEntries(Object.entries(selectors).map(([name,selector])=>[name,document.querySelector(selector)]));
 const playerAudio=()=>typeof audio==='undefined'?null:audio;
 const labels={live:'라이브',crews:'크루',rankings:'랭킹'};
 const area=()=>{const [base,param]=location.hash.slice(1).split('?')[0].split('/');return base==='crew'||base==='community'&&param==='crews'?'crews':base==='community'&&param==='rankings'?'rankings':['live','voice','community'].includes(base)&&(!param||param==='voice')?'live':null;};
 const finalContent=()=>area()==='live'?document.querySelector('.talk-directory'):area()==='crews'?document.querySelector('.crew-discovery-layout,.crew-page'):area()==='rankings'?document.querySelector('.weekly-rankings'):null;
 const ready=()=>!!(document.documentElement.dataset.renderState==='ready'&&document.querySelector('#main')?.dataset.route===location.hash.slice(1)&&document.querySelector(selectors.tabs)&&finalContent()&&!document.querySelector('.v3-room-grid[aria-busy="true"]'));
 const fonts=()=>[...document.querySelectorAll(selectors.tabs+' a')].map(element=>{const style=getComputedStyle(element);let zoom=1;for(let node=element;node;node=node.parentElement)zoom*=parseFloat(getComputedStyle(node).zoom)||1;return {label:element.textContent.trim(),fontSize:style.fontSize,lineHeight:style.lineHeight,fontWeight:style.fontWeight,effectiveSize:Math.round(parseFloat(style.fontSize)*zoom*1000)/1000};});
 const position=()=>({window:scrollY,livePane:document.querySelector('.talk-scroll')?.scrollTop??null});
 let baseline=null,measure=null,frame=0,suite=null;
 function snapshot(){const nodes=refs(),sound=playerAudio();return {ready:ready(),hash:location.hash,area:area(),width:innerWidth,height:innerHeight,position:position(),renderState:document.documentElement.dataset.renderState,mainDisplay:nodes.main?getComputedStyle(nodes.main).display:null,mainInert:nodes.main?.inert,selected:[...document.querySelectorAll(selectors.tabs+' [aria-current="page"]')].map(element=>({label:element.textContent.trim(),href:element.getAttribute('href')})),fonts:fonts(),sameNodes:baseline?Object.fromEntries(Object.keys(selectors).map(key=>[key,nodes[key]===baseline.nodes[key]])):null,audio:{sameInstance:baseline?sound===baseline.audio:null,paused:sound?.paused,currentTime:sound?.currentTime,readyState:sound?.readyState,source:sound?.getAttribute('src'),error:sound?.error?.message||null},measure,suite};}
 const send=()=>parent.postMessage({type:'aifect-community-qa',snapshot:snapshot()},location.origin);
 function observe(){
  if(!baseline)return;measure.frames++;const nodes=refs();
  if(!nodes.main||getComputedStyle(nodes.main).display==='none')measure.hiddenFrames++;
  if(nodes.main?.inert)measure.inertFrames++;
  if(document.documentElement.dataset.renderState!=='ready')measure.nonReadyFrames++;
  for(const key of Object.keys(selectors))if(nodes[key]!==baseline.nodes[key])measure.changedNodeFrames[key]++;
  measure.minScroll=Math.min(measure.minScroll,scrollY);measure.maxScroll=Math.max(measure.maxScroll,scrollY);
  frame=requestAnimationFrame(observe);
 }
 function reset(){
  cancelAnimationFrame(frame);if(baseline?.audio)for(const [name,handler] of baseline.handlers)baseline.audio.removeEventListener(name,handler);
  baseline={nodes:refs(),audio:playerAudio(),handlers:[]};measure={frames:0,hiddenFrames:0,inertFrames:0,nonReadyFrames:0,changedNodeFrames:Object.fromEntries(Object.keys(selectors).map(key=>[key,0])),minScroll:scrollY,maxScroll:scrollY,audioEvents:{},startedAt:Date.now()};
  if(baseline.audio)for(const name of ['pause','play','emptied','abort','ended']){const handler=()=>{measure.audioEvents[name]=(measure.audioEvents[name]||0)+1;};baseline.handlers.push([name,handler]);baseline.audio.addEventListener(name,handler);}
  frame=requestAnimationFrame(observe);send();
 }
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const ensure=(condition,message)=>{if(!condition)throw Error(message);};
 async function waitFor(predicate,label,timeout=8000){const until=performance.now()+timeout;while(performance.now()<until){if(await predicate())return;await delay(25);}throw Error('Timeout: '+label+' ('+location.hash+')');}
 const apiStats=()=>fetch('/__qa/stats').then(response=>response.json());
 const qaControl=payload=>fetch('/__qa/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).then(response=>response.json());
 const rankReads=stats=>Object.entries(stats.counts).filter(([key])=>key.startsWith('GET /api/community/rankings?')).reduce((sum,[,count])=>sum+count,0);
 function link(tab){const element=[...document.querySelectorAll(selectors.tabs+' a')].find(element=>element.textContent.trim()===labels[tab]);ensure(element,'Missing actual Community tab: '+tab);return element;}
 async function navigate(tab){const before=position();link(tab).click();await waitFor(()=>area()===tab&&ready(),'Community '+tab);await delay(80);return {before,after:position()};}
 function assertShell(tab,before){
  const nodes=refs(),sound=playerAudio();for(const name of Object.keys(selectors))ensure(nodes[name]===baseline.nodes[name],'Replaced persistent node: '+name);
  ensure(area()===tab,'URL does not match '+tab);const selected=[...document.querySelectorAll(selectors.tabs+' [aria-current="page"]')];ensure(selected.length===1&&selected[0].textContent.trim()===labels[tab],'Selected Community tab and URL differ');
  ensure(sound===baseline.audio,'Global Audio instance was replaced');ensure(!sound.paused,'Global audio paused');ensure(sound.currentTime>=suite.audioStartedAt-.05,'Global playback position restarted');
  if(before)ensure(Math.abs(scrollY-before.window)<=2,'Window scroll moved from '+before.window+' to '+scrollY);
  return {hash:location.hash,selected:selected[0].textContent.trim(),before,after:position(),audioTime:sound.currentTime,fonts:fonts()};
 }
 async function ensureMusic(){
  const playLink=document.querySelector('.sidebar a[href="#karaoke"]');ensure(playLink,'Actual Play navigation is missing');playLink.click();
  await waitFor(()=>location.hash==='#karaoke'&&document.documentElement.dataset.renderState==='ready'&&document.querySelector('.play-category-tabs'),'Play initial page');
  const duet=[...document.querySelectorAll('.play-category-tabs a')].find(element=>element.getAttribute('href')==='#karaoke/duets');ensure(duet,'Actual duet tab is missing');duet.click();
  await waitFor(()=>location.hash==='#karaoke/duets'&&document.querySelector('.play-duet-play[data-play]')&&!document.querySelector('#play-results[aria-busy="true"]'),'Play duet list');
  const sound=playerAudio();ensure(sound,'Global Audio was not initialized');if(sound.paused)document.querySelector('.play-duet-play[data-play]').click();
  await waitFor(()=>!sound.paused&&sound.readyState>=2&&sound.currentTime>0,'real duet playback',10000);
  const communityLink=document.querySelector('.sidebar a[href="#community"]');ensure(communityLink,'Actual Community navigation is missing');communityLink.click();await waitFor(()=>area()==='live'&&ready(),'Community return');await delay(80);
 }
 async function invalidateThroughRealLike(){const button=document.querySelector('.player [data-like]');ensure(button,'Player like action is missing');const before=button.getAttribute('aria-pressed');button.click();await waitFor(()=>!button.disabled&&button.getAttribute('aria-pressed')!==before,'local like API completion');}
 async function runSuite(){
  if(suite?.running)return;suite={running:true,width:innerWidth,height:innerHeight,startedAt:Date.now(),cases:[]};send();
  const record=async(name,run)=>{suite.current=name;send();try{suite.cases.push({name,passed:true,...await run()});}catch(error){suite.cases.push({name,passed:false,error:error.message,hash:location.hash,position:position()});}send();};
  try{
   await qaControl({rules:[],reset:true});await waitFor(ready,'initial Community');await ensureMusic();suite.audioStartedAt=playerAudio().currentTime;reset();
   const fontSamples={live:fonts()};suite.startPosition=position();
   for(const [name,tab] of [['라이브에서 크루 탐색','crews'],['크루에서 랭킹','rankings'],['랭킹에서 라이브 복귀','live']])await record(name,async()=>{const moved=await navigate(tab);fontSamples[tab]=fonts();return assertShell(tab,moved.before);});
   await record('세 화면의 공통 탭 글자 크기',async()=>{for(const tab of ['live','crews','rankings']){ensure(fontSamples[tab]?.length===3,'Missing font samples for '+tab);for(let i=0;i<3;i++)ensure(Math.abs(fontSamples[tab][i].effectiveSize-fontSamples.live[i].effectiveSize)<.1,'Community tab font differs on '+tab+': '+fontSamples[tab][i].effectiveSize+' / '+fontSamples.live[i].effectiveSize);}return {fontSamples};});
   await record('랭킹 왕복 시 캐시 재사용',async()=>{await navigate('rankings');const before=await apiStats();await navigate('crews');const moved=await navigate('rankings'),after=await apiStats();ensure(rankReads(before)===rankReads(after),'Cached ranking requested data again');return {...assertShell('rankings',moved.before),rankingReads:{before:rankReads(before),after:rankReads(after)}};});
   await record('브라우저 뒤로가기·앞으로가기',async()=>{await navigate('crews');const crewHash=location.hash;await navigate('rankings');const rankingHash=location.hash,before=position();history.back();await waitFor(()=>location.hash===crewHash&&ready(),'history.back');await delay(80);const backward=assertShell('crews',before);history.forward();await waitFor(()=>location.hash===rankingHash&&ready(),'history.forward');await delay(80);return {backward,forward:assertShell('rankings',before)};});
   await record('크루와 랭킹 왕복 시 스크롤 유지',async()=>{await navigate('crews');window.scrollTo({top:120,left:0,behavior:'instant'});await delay(80);const before=position();ensure(before.window>=100,'Crew fixture did not provide height for scroll check');await navigate('rankings');const ranking=assertShell('rankings',before);await navigate('crews');return {ranking,crew:assertShell('crews',before)};});
   await record('지연된 랭킹 요청 도중 크루로 이동',async()=>{
    await navigate('crews');await invalidateThroughRealLike();await qaControl({rules:[{match:'/api/community/rankings',delayMs:1200}]});const before=await apiStats(),start=position();link('rankings').click();
    await waitFor(async()=>rankReads(await apiStats())>rankReads(before),'delayed ranking request');await delay(80);
    ensure(document.documentElement.dataset.renderState==='ready','Ranking request used global loading');ensure(document.querySelector(selectors.tabs)===baseline.nodes.tabs,'Loading replaced Community navigation');ensure(document.querySelector('[data-community-content][aria-busy="true"]'),'Ranking loading status was not scoped to its content');
    const loading={hash:location.hash,mainInert:document.querySelector('#main').inert,localStatus:[...document.querySelectorAll('#main [role="status"],#main [aria-busy="true"]')].filter(element=>!element.closest(selectors.tabs)).map(element=>({text:element.textContent.trim().slice(0,100),busy:element.getAttribute('aria-busy')}))};
    await navigate('crews');await delay(1350);ensure(document.querySelector('.crew-discovery-layout'),'Late ranking response replaced crew discovery');await qaControl({rules:[]});return {...assertShell('crews',start),loading,rankingReads:{before:rankReads(before),after:rankReads(await apiStats())}};
   });
   await record('랭킹 콘텐츠 오류와 재시도',async()=>{
    await qaControl({rules:[]});await invalidateThroughRealLike();await qaControl({rules:[{match:'/api/community/rankings',failures:1,status:503}]});const start=position();await navigate('rankings');
    const retry=document.querySelector('[data-ranking-retry],[data-community-retry]');ensure(retry,'Ranking content retry button was not shown');assertShell('rankings',start);retry.click();
    await waitFor(()=>ready()&&!document.querySelector('[data-ranking-retry],[data-community-retry]')&&document.querySelector('.ranking-results'),'ranking retry');await delay(80);await qaControl({rules:[]});return assertShell('rankings',start);
   });
   await record('전체 화면과 음악 재생 연속성',async()=>{await delay(150);ensure(measure.frames>0,'No visible frames sampled');ensure(measure.hiddenFrames===0,'Main was hidden');ensure(measure.inertFrames===0,'Main became inert');ensure(measure.nonReadyFrames===0,'Global loading was shown');for(const [name,count] of Object.entries(measure.changedNodeFrames))ensure(!count,'Persistent '+name+' changed during '+count+' frames');for(const event of ['pause','emptied','abort','ended'])ensure(!measure.audioEvents[event],'Unexpected global audio event: '+event);ensure(playerAudio().currentTime>suite.audioStartedAt,'Playback time did not advance');return {...measure,audioFrom:suite.audioStartedAt,audioTo:playerAudio().currentTime};});
  }catch(error){suite.error=error.message;}
  finally{await qaControl({rules:[]}).catch(()=>{});suite.running=false;suite.finishedAt=Date.now();suite.passed=suite.cases.filter(result=>result.passed).length;suite.failed=suite.cases.filter(result=>!result.passed).length+(suite.error?1:0);suite.current=null;send();}
 }
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='aifect-community-qa-control')return;
  if(event.data.command==='reset')reset();else if(event.data.command==='snapshot')send();else if(event.data.command==='suite')void runSuite();else if(event.data.command==='back'){history.back();setTimeout(send,150);}else if(event.data.command==='forward'){history.forward();setTimeout(send,150);}else if(event.data.command==='seed-draft'){try{await ensureMusic();reset();}catch(error){parent.postMessage({type:'aifect-community-qa',error:error.message},location.origin);}}
 });
 window.addEventListener('hashchange',()=>setTimeout(send,100));window.AifectCommunityQA={snapshot,reset,runSuite};
 void waitFor(ready,'Community bootstrap',20000).then(send).catch(error=>parent.postMessage({type:'aifect-community-qa',error:error.message},location.origin));
})();`;
const myPageProbeJS=String.raw`(()=>{
 if(window.name!=='aifect-mypage-qa')return;
 const selectors={main:'#main',page:'.mp-dashboard',profile:'.mp-profile-area',collections:'.mp-profile-collections',tabs:'.mp-segment',banner:'.mp-works-banner',content:'#mp-content',aside:'#mp-aside-content',header:'.topbar',sidebar:'.sidebar',player:'.player'};
 const refs=()=>Object.fromEntries(Object.entries(selectors).map(([name,selector])=>[name,document.querySelector(selector)]));
 const playerAudio=()=>typeof audio==='undefined'?null:audio;
 function selection(){const params=new URLSearchParams(location.hash.split('?')[1]||'');return {tab:['library','activity'].includes(params.get('view'))?params.get('view'):'works',section:['history','playlists'].includes(params.get('section'))?params.get('section'):'likes'};}
 const ready=()=>!!(/^#profile(?:\?|$)/.test(location.hash)&&document.documentElement.dataset.renderState==='ready'&&document.querySelector('#main')?.dataset.route===location.hash.slice(1)&&document.querySelector('.mp-dashboard.mp-own')&&document.querySelector('.mp-segment [aria-selected="true"]')?.dataset.mpTab===selection().tab&&!document.querySelector('#mp-content[aria-busy="true"],#mp-aside-content[aria-busy="true"],#ml-panel[aria-busy="true"]'));
 let baseline=null,measure=null,frame=0,suite=null;
 function snapshot(){const nodes=refs(),sound=playerAudio();return {ready:ready(),hash:location.hash,width:innerWidth,height:innerHeight,scrollY,renderState:document.documentElement.dataset.renderState,mainDisplay:nodes.main?getComputedStyle(nodes.main).display:null,mainInert:nodes.main?.inert,selection:selection(),selected:[...document.querySelectorAll('.mp-segment [aria-selected="true"],.ml-tabs [aria-selected="true"]')].map(element=>({label:element.textContent.trim(),tab:element.dataset.mpTab||element.dataset.libraryTab})),banner:nodes.banner?.textContent.trim(),contentBusy:nodes.content?.getAttribute('aria-busy'),libraryBusy:document.querySelector('#ml-panel')?.getAttribute('aria-busy'),sameNodes:baseline?Object.fromEntries(Object.keys(selectors).map(key=>[key,nodes[key]===baseline.nodes[key]])):null,audio:{sameInstance:baseline?sound===baseline.audio:null,paused:sound?.paused,currentTime:sound?.currentTime,readyState:sound?.readyState,error:sound?.error?.message||null},measure,suite};}
 const send=()=>parent.postMessage({type:'aifect-mypage-qa',snapshot:snapshot()},location.origin);
 function observe(){
  if(!baseline)return;measure.frames++;const nodes=refs();
  if(!nodes.main||getComputedStyle(nodes.main).display==='none')measure.hiddenFrames++;
  if(nodes.main?.inert)measure.inertFrames++;
  if(document.documentElement.dataset.renderState!=='ready')measure.nonReadyFrames++;
  for(const key of Object.keys(selectors))if(nodes[key]!==baseline.nodes[key])measure.changedNodeFrames[key]++;
  measure.minScroll=Math.min(measure.minScroll,scrollY);measure.maxScroll=Math.max(measure.maxScroll,scrollY);frame=requestAnimationFrame(observe);
 }
 function reset(){
  cancelAnimationFrame(frame);if(baseline?.audio)for(const [name,handler] of baseline.handlers)baseline.audio.removeEventListener(name,handler);
  baseline={nodes:refs(),audio:playerAudio(),handlers:[]};measure={frames:0,hiddenFrames:0,inertFrames:0,nonReadyFrames:0,changedNodeFrames:Object.fromEntries(Object.keys(selectors).map(key=>[key,0])),minScroll:scrollY,maxScroll:scrollY,audioEvents:{},startedAt:Date.now()};
  if(baseline.audio)for(const name of ['pause','play','emptied','abort','ended']){const handler=()=>{measure.audioEvents[name]=(measure.audioEvents[name]||0)+1;};baseline.handlers.push([name,handler]);baseline.audio.addEventListener(name,handler);}
  frame=requestAnimationFrame(observe);send();
 }
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ensure=(condition,message)=>{if(!condition)throw Error(message);};
 async function waitFor(predicate,label,timeout=8000){const until=performance.now()+timeout;while(performance.now()<until){if(await predicate())return;await delay(25);}throw Error('Timeout: '+label+' ('+location.hash+')');}
 const apiStats=()=>fetch('/__qa/stats').then(response=>response.json());
 const qaControl=payload=>fetch('/__qa/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).then(response=>response.json());
 const readCount=(stats,path)=>Object.entries(stats.counts).filter(([key])=>key.startsWith('GET '+path)).reduce((sum,[,count])=>sum+count,0);
 const libraryReads=(stats,section)=>Object.entries(stats.counts).filter(([key])=>key.startsWith('GET /api/me/music-library?')&&(!section||new URL(key.slice(4),location.origin).searchParams.get('section')===section)).reduce((sum,[,count])=>sum+count,0);
 const dashboardReads=stats=>readCount(stats,'/api/producers/producer?dashboard=1&work_list=1');
 function tabButton(tab){const button=document.querySelector('.mp-segment [data-mp-tab="'+tab+'"]');ensure(button,'Missing actual MyPage tab: '+tab);return button;}
 function categoryButton(section){const button=document.querySelector('#music-library [data-library-tab="'+section+'"]');ensure(button,'Missing actual library category: '+section);return button;}
 async function navigate(tab){const before=scrollY;tabButton(tab).click();await waitFor(()=>selection().tab===tab&&ready(),'MyPage '+tab);await delay(80);return before;}
 async function category(section){const before=scrollY;categoryButton(section).click();await waitFor(()=>selection().tab==='library'&&selection().section===section&&ready()&&document.querySelector('.ml-tabs [aria-selected="true"]')?.dataset.libraryTab===section,'library '+section);await delay(80);return before;}
 function assertShell(tab,before){
  const nodes=refs(),sound=playerAudio();for(const name of Object.keys(selectors)){ensure(baseline.nodes[name],'Missing baseline node: '+name);ensure(nodes[name]===baseline.nodes[name],'Replaced persistent node: '+name);}
  const selected=[...document.querySelectorAll('.mp-segment [aria-selected="true"]')];ensure(selected.length===1&&selected[0].dataset.mpTab===tab&&selection().tab===tab,'Selected MyPage tab and URL differ');
  ensure(nodes.page.dataset.mpView===tab&&nodes.tabs.dataset.active===tab,'Dashboard selection state differs');ensure(nodes.content.getAttribute('aria-labelledby')==='mp-tab-'+tab,'Panel accessibility label differs');
  ensure(Math.abs(scrollY-before)<=2,'Window scroll moved from '+before+' to '+scrollY);ensure(sound===baseline.audio,'Global Audio instance was replaced');ensure(!sound.paused,'Global audio paused');ensure(sound.currentTime>=suite.audioStartedAt-.05,'Global playback position restarted');
  return {hash:location.hash,selected:tab,scrollBefore:before,scrollAfter:scrollY,banner:nodes.banner.textContent.trim(),audioTime:sound.currentTime};
 }
 function assertLibrary(section,common,before){
  const result=assertShell('library',before);ensure(document.querySelector('#music-library')===common.root,'Library container was remounted');ensure(document.querySelector('#music-library .ml-tabs')===common.tabs,'Library tab bar was remounted');
  ensure(document.querySelector('.ml-tabs [aria-selected="true"]')?.dataset.libraryTab===section&&selection().section===section,'Nested library selection and URL differ');
  ensure(document.querySelector('#ml-panel')?.getAttribute('aria-labelledby')==='ml-tab-'+section,'Nested panel accessibility label differs');return {...result,section};
 }
 async function ensureMusic(){
  const play=document.querySelector('.sidebar a[href="#karaoke"]');ensure(play,'Actual Play navigation is missing');play.click();await waitFor(()=>location.hash==='#karaoke'&&document.documentElement.dataset.renderState==='ready'&&document.querySelector('.play-category-tabs'),'Play initial page');
  const duet=[...document.querySelectorAll('.play-category-tabs a')].find(element=>element.getAttribute('href')==='#karaoke/duets');ensure(duet,'Actual duet tab is missing');duet.click();await waitFor(()=>location.hash==='#karaoke/duets'&&document.querySelector('.play-duet-play[data-play]')&&!document.querySelector('#play-results[aria-busy="true"]'),'Play duet list');
  const sound=playerAudio();ensure(sound,'Global Audio was not initialized');if(sound.paused)document.querySelector('.play-duet-play[data-play]').click();await waitFor(()=>!sound.paused&&sound.readyState>=2&&sound.currentTime>0,'real duet playback',10000);
  const profile=document.querySelector('.sidebar a[href="#profile"]');ensure(profile,'Actual MyPage navigation is missing');profile.click();await waitFor(()=>ready()&&selection().tab==='works','MyPage return');await delay(100);
 }
 async function invalidateThroughRealLike(){const button=document.querySelector('.player [data-like]');ensure(button,'Player like action is missing');const before=button.getAttribute('aria-pressed');button.click();await waitFor(()=>!button.disabled&&button.getAttribute('aria-pressed')!==before,'local like API completion');}
 function assertLocalLoading(selector){ensure(document.querySelector(selector),'Loading status is missing from its content');ensure(document.documentElement.dataset.renderState==='ready','Request used global loading');ensure(!document.querySelector('#main').inert,'Request made main inert');for(const [name,node] of Object.entries(baseline.nodes))ensure(refs()[name]===node,'Loading replaced '+name);return {hash:location.hash,contentBusy:document.querySelector('#mp-content')?.getAttribute('aria-busy'),panelBusy:document.querySelector('#ml-panel')?.getAttribute('aria-busy')};}
 async function runSuite(){
  if(suite?.running)return;suite={running:true,width:innerWidth,height:innerHeight,startedAt:Date.now(),cases:[]};send();
  const record=async(name,run)=>{suite.current=name;send();try{suite.cases.push({name,passed:true,...await run()});}catch(error){suite.cases.push({name,passed:false,error:error.message,hash:location.hash,scrollY});}send();};
  try{
   await qaControl({rules:[],reset:true});await waitFor(ready,'initial MyPage');await ensureMusic();window.scrollTo({top:120,left:0,behavior:'instant'});await delay(100);ensure(scrollY>=100,'MyPage fixture did not provide height for scroll check');suite.startScroll=scrollY;suite.audioStartedAt=playerAudio().currentTime;reset();const initialReads=await apiStats();
   for(const [name,tab] of [['내 작품에서 내 보관함','library'],['내 보관함에서 내 활동','activity'],['내 활동에서 내 작품 복귀','works']])await record(name,async()=>{const before=await navigate(tab),after=await apiStats();ensure(dashboardReads(after)===dashboardReads(initialReads),'Tab switch re-requested profile dashboard');if(tab==='library')ensure(document.querySelector('#music-library .ml-song'),'Library fixture did not render liked songs');if(tab==='activity')ensure(document.querySelector('.mp-activity-grid'),'Activity content did not render');return assertShell(tab,before);});
   await record('보관함 좋아요·최근 감상·플레이리스트',async()=>{await navigate('library');const common={root:document.querySelector('#music-library'),tabs:document.querySelector('#music-library .ml-tabs')},results=[];for(const section of ['history','playlists','likes']){const before=await category(section);ensure(document.querySelector('#ml-items')?.children.length,'Nested library content is empty');results.push(assertLibrary(section,common,before));}return {results};});
   await record('짧은 보관함 왕복 캐시와 활동 최신 조회',async()=>{
    await navigate('library');const before=await apiStats();await navigate('works');await navigate('library');await category('history');await category('likes');const after=await apiStats();ensure(libraryReads(after,'likes')===libraryReads(before,'likes'),'Fresh liked-song data was requested again');ensure(dashboardReads(after)===dashboardReads(before),'Short tab return re-requested profile dashboard');
    await navigate('activity');const first=await apiStats();await navigate('works');await navigate('activity');const second=await apiStats(),paths=['/api/gold/balance','/api/me/player','/api/me/profile?section=activity','/api/me/gift-inventory'];for(const path of paths)ensure(readCount(second,path)>readCount(first,path),'Activity must refresh '+path);
    return {...assertShell('activity',suite.startScroll),libraryReads:{before:libraryReads(before,'likes'),after:libraryReads(after,'likes')},activityReads:Object.fromEntries(paths.map(path=>[path,{before:readCount(first,path),after:readCount(second,path)}]))};
   });
   await record('브라우저 뒤로가기·앞으로가기',async()=>{await navigate('works');const worksHash=location.hash;await navigate('activity');const activityHash=location.hash,before=scrollY;history.back();await waitFor(()=>location.hash===worksHash&&ready(),'history.back');await delay(80);const backward=assertShell('works',before);history.forward();await waitFor(()=>location.hash===activityHash&&ready(),'history.forward');await delay(80);const forward=assertShell('activity',before);await navigate('library');const likesHash=location.hash;await category('history');const historyHash=location.hash;history.back();await waitFor(()=>location.hash===likesHash&&ready(),'library history.back');await delay(80);ensure(document.querySelector('.ml-tabs [aria-selected="true"]')?.dataset.libraryTab==='likes','Back navigation selected the wrong library category');history.forward();await waitFor(()=>location.hash===historyHash&&ready(),'library history.forward');await delay(80);ensure(document.querySelector('.ml-tabs [aria-selected="true"]')?.dataset.libraryTab==='history','Forward navigation selected the wrong library category');return {backward,forward,nested:assertShell('library',before)};});
   await record('이미 선택한 탭 재클릭',async()=>{await navigate('works');const before=await apiStats(),position=scrollY;tabButton('works').click();await delay(160);ensure(ready(),'Selected tab stopped being ready');const after=await apiStats();ensure(dashboardReads(after)===dashboardReads(before),'Selected tab re-requested profile');return assertShell('works',position);});
   await record('지연된 보관함 요청 중 내 활동 이동',async()=>{
    await navigate('works');await invalidateThroughRealLike();await qaControl({rules:[{match:'/api/me/music-library?',delayMs:1200}]});const before=await apiStats(),position=scrollY;tabButton('library').click();await waitFor(async()=>libraryReads(await apiStats())>libraryReads(before),'delayed library request');await delay(60);const loading=assertLocalLoading('#mp-content[aria-busy="true"]');await navigate('activity');await delay(1350);ensure(document.querySelector('.mp-activity-grid')&&!document.querySelector('#music-library'),'Late library result overwrote activity');await qaControl({rules:[]});return {...assertShell('activity',position),loading};
   });
   await record('보관함 콘텐츠 오류와 재시도',async()=>{
    await navigate('works');await invalidateThroughRealLike();await qaControl({rules:[{match:'/api/me/music-library?',failures:1,status:503}]});const position=scrollY;await navigate('library');const retry=document.querySelector('#mp-content [data-mp-tab-retry]');ensure(retry,'MyPage content retry button was not shown');assertShell('library',position);retry.click();await waitFor(()=>ready()&&!document.querySelector('[data-mp-tab-retry]')&&document.querySelector('#music-library .ml-song'),'MyPage library retry');await delay(80);await qaControl({rules:[]});return assertShell('library',position);
   });
   await record('지연된 보관함 하위 요청 중 다른 카테고리 이동',async()=>{
    await invalidateThroughRealLike();await qaControl({rules:[{match:'/api/me/music-library?section=history',delayMs:1200}]});const common={root:document.querySelector('#music-library'),tabs:document.querySelector('#music-library .ml-tabs')},before=await apiStats(),position=scrollY;categoryButton('history').click();await waitFor(async()=>libraryReads(await apiStats(),'history')>libraryReads(before,'history'),'delayed nested history request');await delay(60);const loading=assertLocalLoading('#ml-panel[aria-busy="true"]');await category('playlists');await delay(1350);ensure(document.querySelector('#ml-items .ml-playlists'),'Late history result overwrote playlists');await qaControl({rules:[]});return {...assertLibrary('playlists',common,position),loading};
   });
   await record('보관함 하위 카테고리 오류와 재시도',async()=>{
    await invalidateThroughRealLike();await qaControl({rules:[{match:'/api/me/music-library?section=likes',failures:1,status:503}]});const common={root:document.querySelector('#music-library'),tabs:document.querySelector('#music-library .ml-tabs')},position=scrollY;categoryButton('likes').click();await waitFor(()=>document.querySelector('#ml-retry')&&ready(),'nested library error');assertShell('library',position);document.querySelector('#ml-retry').click();await waitFor(()=>ready()&&!document.querySelector('#ml-retry')&&document.querySelector('#ml-items .ml-song'),'nested library retry');await delay(80);await qaControl({rules:[]});return assertLibrary('likes',common,position);
   });
   await record('공통 화면·스크롤·음악 재생 연속성',async()=>{await delay(150);ensure(measure.frames>0,'No visible frames sampled');ensure(!measure.hiddenFrames&&!measure.inertFrames&&!measure.nonReadyFrames,'Global loading, hidden or inert main was observed');for(const [name,count] of Object.entries(measure.changedNodeFrames))ensure(!count,'Persistent '+name+' changed during '+count+' frames');for(const event of ['pause','emptied','abort','ended'])ensure(!measure.audioEvents[event],'Unexpected global audio event: '+event);ensure(playerAudio().currentTime>suite.audioStartedAt,'Playback time did not advance');ensure(Math.abs(measure.minScroll-suite.startScroll)<=2&&Math.abs(measure.maxScroll-suite.startScroll)<=2,'Window scroll changed during tab navigation');return {...measure,audioFrom:suite.audioStartedAt,audioTo:playerAudio().currentTime};});
  }catch(error){suite.error=error.message;}
  finally{await qaControl({rules:[]}).catch(()=>{});suite.running=false;suite.finishedAt=Date.now();suite.passed=suite.cases.filter(result=>result.passed).length;suite.failed=suite.cases.filter(result=>!result.passed).length+(suite.error?1:0);suite.current=null;send();}
 }
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='aifect-mypage-qa-control')return;
  if(event.data.command==='reset')reset();else if(event.data.command==='snapshot')send();else if(event.data.command==='suite')void runSuite();else if(event.data.command==='back'){history.back();setTimeout(send,150);}else if(event.data.command==='forward'){history.forward();setTimeout(send,150);}else if(event.data.command==='seed-draft'){try{await ensureMusic();reset();}catch(error){parent.postMessage({type:'aifect-mypage-qa',error:error.message},location.origin);}}
 });
 window.addEventListener('hashchange',()=>setTimeout(send,100));window.AifectMyPageQA={snapshot,reset,runSuite};void waitFor(ready,'MyPage bootstrap',20000).then(send).catch(error=>parent.postMessage({type:'aifect-mypage-qa',error:error.message},location.origin));
})();`;
const qaHTML=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIFECT 탭 전환 로컬 QA</title>
<style>body{margin:16px;background:#111722;color:#f0f1f7;font:14px system-ui,sans-serif}h1{font-size:20px}button,a{font:inherit;margin:3px;padding:9px;color:inherit;background:#253046;border:1px solid #59647c;border-radius:6px}a{display:inline-block}#viewport{overflow:auto;margin-top:12px}iframe{display:block;border:1px solid #59647c;background:#0c121b;width:1440px;height:900px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#1b2332;padding:12px;max-height:460px;overflow:auto}.controls{position:sticky;top:0;z-index:10;display:flex;gap:4px;flex-wrap:wrap;align-items:center;background:#111722;padding-block:6px}#suite-state{display:block;min-width:160px;padding:8px;color:#c6d7f8}</style></head><body>
<h1>AIFECT 플레이 탭 · 로컬 샘플 검증</h1><p>실제 앱과 메모리 샘플 데이터로 검사해. 회귀 테스트는 실제 탭 링크를 클릭하며, 스크롤 120px에서 시작해.</p>
<div class="controls"><button data-size="1440,900">PC 1440×900</button><button data-size="390,844">모바일 390×844</button><button data-size="320,844">모바일 320px</button><button data-size="768,900">태블릿 768px</button><button id="suite">탭 회귀 테스트</button><button id="back">브라우저 뒤로</button><button id="forward">브라우저 앞으로</button><button id="reset">계측 시작·초기화</button><button id="inspect">현재 상태 읽기</button><button id="draft">로컬 초안 추가</button><button id="delay">목록 1.5초 지연</button><button id="fail">다음 목록 요청 실패</button><button id="normal">정상 응답 복원</button><a href="/#karaoke" target="_blank">실제 앱만 열기</a><output id="suite-state" aria-live="polite">테스트 대기</output></div>
<div id="viewport"><iframe id="app" title="AIFECT 실제 앱" src="/#karaoke" allow="autoplay"></iframe></div><h2>검증 결과</h2><pre id="report" aria-live="polite">앱이 준비되면 탭 회귀 테스트 또는 계측 시작을 눌러줘.</pre>
<script>
const app=document.getElementById('app'),report=document.getElementById('report'),suiteState=document.getElementById('suite-state');let client=null;
const command=name=>app.contentWindow.postMessage({type:'aifect-play-qa-control',command:name},location.origin);
const control=async payload=>fetch('/__qa/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
const show=async()=>{const server=await fetch('/__qa/stats').then(response=>response.json());report.textContent=JSON.stringify({client,server},null,2);};
document.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>{const [width,height]=button.dataset.size.split(',');app.style.width=width+'px';app.style.height=height+'px';});
document.getElementById('suite').onclick=()=>{suiteState.textContent='회귀 테스트 시작 중…';command('suite');};
document.getElementById('back').onclick=()=>command('back');document.getElementById('forward').onclick=()=>command('forward');
document.getElementById('reset').onclick=async()=>{await control({reset:true});command('reset');};
document.getElementById('inspect').onclick=()=>command('snapshot');document.getElementById('draft').onclick=()=>command('seed-draft');
document.getElementById('delay').onclick=async()=>{await control({rules:[{match:'/api/play/',delayMs:1500},{match:'/api/dubbing/projects',delayMs:1500}]});show();};
document.getElementById('fail').onclick=async()=>{await control({rules:[{match:'/api/play/',failures:1,status:503}]});show();};
document.getElementById('normal').onclick=async()=>{await control({rules:[]});show();};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==app.contentWindow||event.data?.type!=='aifect-play-qa')return;
 client=event.data.snapshot||{error:event.data.error};
 if(client.suite){const suite=client.suite;suiteState.textContent=suite.running?'검사 중 · '+(suite.current||'준비'):'완료 · 통과 '+suite.passed+' / 실패 '+suite.failed;document.getElementById('suite').disabled=!!suite.running;}
 show();
});
</script></body></html>`;
const communityHTML=qaHTML
 .replaceAll('AIFECT 플레이 탭','AIFECT 커뮤니티 탭')
 .replace('실제 앱과 메모리 샘플 데이터로 검사해. 회귀 테스트는 실제 탭 링크를 클릭하며, 스크롤 120px에서 시작해.','실제 앱의 라이브·크루·랭킹 링크, URL 기록, 공통 탭 글자 크기와 음악 재생을 검사해. 크루·랭킹 왕복에서는 스크롤 120px 유지도 확인해. 라이브는 서비스 미연결 빈 목록으로 검사해.')
 .replaceAll('aifect-play-qa','aifect-community-qa')
 .replaceAll('/#karaoke','/#community')
 .replace('<iframe id="app"','<iframe name="aifect-community-qa" id="app"')
 .replace('<button id="suite">','<button id="suite" disabled>')
 .replace('로컬 초안 추가','샘플 음악 재생')
 .replace("{match:'/api/play/',delayMs:1500},{match:'/api/dubbing/projects',delayMs:1500}","{match:'/api/community/rankings',delayMs:1500},{match:'/api/crews',delayMs:1500}")
 .replace("{match:'/api/play/',failures:1,status:503}","{match:'/api/community/rankings',failures:1,status:503}")
 .replace(' if(client.suite){',' if(!client.suite){document.getElementById(\'suite\').disabled=!client.ready;suiteState.textContent=client.ready?\'테스트 준비 완료\':\'앱 준비 중…\';}\n if(client.suite){');
const myPageReportJS=String.raw`let serverSnapshot=null,statsError=null,statsFetchedAt=null,statsPending=false,statsQueued=false;
const paintReport=()=>{
 const suite=client?.suite,summary={hash:client?.hash,ready:client?.ready,running:suite?.running,current:suite?.current,passed:suite?.passed,failed:suite?.failed,error:client?.error||suite?.error||null,failures:(suite?.cases||[]).filter(result=>!result.passed).map(({name,error,hash})=>({name,error,hash})),statsPending,statsError};
 document.getElementById('client-summary').textContent=JSON.stringify(summary,null,2);
 report.textContent=JSON.stringify({client,server:serverSnapshot,stats:{pending:statsPending,error:statsError,fetchedAt:statsFetchedAt}},null,2);
};
const show=()=>{
 // Always publish the latest client outcome before any network work. Slow or
 // failed statistics reads must not hide completed cases or their actual errors.
 paintReport();if(statsPending){statsQueued=true;return;}
 statsPending=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
 fetch('/__qa/stats',{signal:controller.signal,cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Stats HTTP '+response.status);return response.json();}).then(server=>{serverSnapshot=server;statsFetchedAt=Date.now();statsError=null;}).catch(error=>{statsError=error.name==='AbortError'?'통계 요청이 3초 안에 완료되지 않았어요.':error.message;}).finally(()=>{
  clearTimeout(timer);statsPending=false;paintReport();if(statsQueued){statsQueued=false;queueMicrotask(show);}
 });
};`;
const myPageHTML=qaHTML
 .replaceAll('AIFECT 플레이 탭','AIFECT 마이페이지 탭')
 .replace('실제 앱과 메모리 샘플 데이터로 검사해. 회귀 테스트는 실제 탭 링크를 클릭하며, 스크롤 120px에서 시작해.','실제 내 작품·내 보관함·내 활동 버튼과 보관함 하위 카테고리를 검사해. 스크롤 120px, 프로필·배너·탭·플레이어 유지, URL 기록, 로컬 오류·지연을 확인해.')
 .replaceAll('aifect-play-qa','aifect-mypage-qa')
 .replaceAll('/#karaoke','/#profile')
 .replace('<iframe id="app"','<iframe name="aifect-mypage-qa" id="app"')
 .replace('<button id="suite">','<button id="suite" disabled>')
 .replace('<div id="viewport">','<pre id="client-summary" aria-live="polite" style="max-height:220px">클라이언트 검사 결과를 기다리는 중…</pre><div id="viewport">')
 .replace('로컬 초안 추가','샘플 음악 재생')
 .replace("{match:'/api/play/',delayMs:1500},{match:'/api/dubbing/projects',delayMs:1500}","{match:'/api/me/music-library',delayMs:1500},{match:'/api/me/profile?section=activity',delayMs:1500}")
 .replace("{match:'/api/play/',failures:1,status:503}","{match:'/api/me/music-library',failures:1,status:503}")
 .replace("const show=async()=>{const server=await fetch('/__qa/stats').then(response=>response.json());report.textContent=JSON.stringify({client,server},null,2);};",myPageReportJS)
 .replace(' if(client.suite){',' if(!client.suite){document.getElementById(\'suite\').disabled=!client.ready;suiteState.textContent=client.ready?\'테스트 준비 완료\':\'앱 준비 중…\';}\n if(client.suite){');
const staticRoot=resolve('dist/client');
const env={...featureEnv,DB:f.DB,ASSETS:{async fetch(req){
 const url=new URL(req.url),pathname=decodeURIComponent(url.pathname),file=resolve(staticRoot,'.'+(pathname==='/'?'/aifect-shell.txt':pathname));
 if(!file.startsWith(staticRoot+sep))return new Response('Not found',{status:404});
 try{
  let data=await readFile(file);const shell=/aifect-(?:profile-)?shell\.txt$/.test(file);
  if(shell)data=Buffer.from(data.toString().replace('</body>','<script defer src="/__qa/probe.js"></script><script defer src="/__qa/community-probe.js"></script><script defer src="/__qa/mypage-probe.js"></script></body>'));
  const mime={'.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'}[extname(file)]||'application/octet-stream';
  return new Response(req.method==='HEAD'?null:data,{headers:{'content-type':mime,'cache-control':'no-store'}});
 }catch{return new Response('Build assets first: npm run build',{status:404});}
}}};
const context={waitUntil(p){pending.add(p);p.catch(()=>{}).finally(()=>pending.delete(p));}};
async function handle(req){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/qa')return new Response(qaHTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
 if(path==='/qa-community')return new Response(communityHTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
 if(path==='/qa-mypage')return new Response(myPageHTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
 if(path==='/__qa/probe.js')return new Response(probeJS,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
 if(path==='/__qa/community-probe.js')return new Response(communityProbeJS,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
 if(path==='/__qa/mypage-probe.js')return new Response(myPageProbeJS,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
 if(path==='/__qa/stats'||path==='/__qa/health')return json(stats());
 if(path==='/__qa/control'&&req.method==='POST'){
  const control=await req.json();
  if(control.reset){counts.clear();requests.length=0;}
  if(['owner','other','guest'].includes(control.user))previewUser=control.user;
  if(Array.isArray(control.rules))rules=control.rules.filter(rule=>typeof rule.match==='string'&&rule.match.startsWith('/api/')).map(rule=>({match:rule.match,delayMs:Math.max(0,Math.min(10000,Number(rule.delayMs)||0)),failures:Math.max(0,Math.min(20,Number(rule.failures)||0)),status:[429,500,503].includes(rule.status)?rule.status:503}));
  return json(stats());
 }
 const tracked=path.startsWith('/api/'),key=req.method+' '+path+url.search,entry={path:path+url.search,method:req.method,started:Date.now()};
 if(tracked){counts.set(key,(counts.get(key)||0)+1);requests.push(entry);if(requests.length>500)requests.shift();}
 const rule=req.method==='GET'?rules.find(rule=>(path+url.search).includes(rule.match)):null;
 if(rule?.delayMs)await new Promise(done=>setTimeout(done,rule.delayMs));
 if(rule?.failures>0){rule.failures--;entry.status=rule.status;entry.completed=Date.now();return new Response(JSON.stringify({error:'로컬 QA에서 한 번 실패시킨 목록 요청입니다.'}),{status:rule.status,headers:{'content-type':'application/json','cache-control':'no-store'}});}
 const headers=new Headers(req.headers);headers.set('origin',url.origin);headers.set('sec-fetch-site','same-origin');
 if(previewUser==='guest')headers.delete('cookie');else headers.set('cookie','aifect_session='+previewUser);
 const response=await worker.fetch(new Request(req,{headers}),env,context),resultHeaders=new Headers(response.headers);
 // Only this fixture may be embedded by its own /qa controller.
 resultHeaders.set('content-security-policy',"frame-ancestors 'self'");resultHeaders.delete('content-security-policy-report-only');
 if(/^\/media\/[\w-]+\/(stream|preview)$/.test(path))resultHeaders.set('content-type','audio/wav');
 if(tracked){entry.status=response.status;entry.completed=Date.now();}
 return new Response(response.body,{status:response.status,headers:resultHeaders});
}

if(args.includes('--check')){
 for(const [name,source] of [['play-probe',probeJS],['community-probe',communityProbeJS],['mypage-probe',myPageProbeJS],['play-controller',qaHTML],['community-controller',communityHTML],['mypage-controller',myPageHTML]])new Script(name.endsWith('controller')?source.match(/<script>([\s\S]*?)<\/script>/)[1]:source,{filename:name+'.js'});
 const read=async path=>{const response=await handle(new Request('http://127.0.0.1:'+port+path));assert.equal(response.status,200,path);return response.json();};
 assert.equal((await read('/api/play/songs?tab=recommended')).tracks.length,25);
 assert.equal((await read('/api/play/songs?tab=latest&offset=25')).tracks.length,5);
 assert.equal((await read('/api/play/songs?tab=duets')).tracks.length,3);
 assert.ok((await read('/api/play/works?tab=latest&type=all')).works.length>=7);
 assert.ok((await read('/api/dubbing/projects?tab=open')).projects.length);
 assert.ok((await read('/api/dubbing/casting/mine?kind=original')).projects.length);
 assert.equal((await read('/api/crews?q=&summary=1&home=1')).crews.length,6);
 assert.ok((await read('/api/community/rankings?category=aiArtist&period=week&workKind=solo&limit=20')).rows.length);
 assert.equal((await read('/api/community/rankings?category=crew&period=week&workKind=solo&limit=20')).rows.length,6);
 assert.equal((await read('/api/voice/public-rooms?limit=24&mode=all')).enabled,false);
 const profile=await read('/api/producers/producer?dashboard=1&work_list=1');assert.equal(profile.profile.user_id,'owner');assert.equal(profile.gallery.length,2);
 const libraryPath='/api/me/music-library?section=';assert.equal((await read(libraryPath+'likes')).items.length,12);assert.equal((await read(libraryPath+'history')).total,6);assert.equal((await read(libraryPath+'playlists')).total,3);
 assert.ok((await read('/api/me/profile?section=activity')).received.length);assert.equal(typeof (await read('/api/gold/balance')).balance,'number');assert.ok((await read('/api/me/player')).player);assert.ok(Array.isArray((await read('/api/me/gift-inventory')).items));
 previewUser='other';assert.equal((await read(libraryPath+'playlists')).total,0,'private MyPage collections must stay account scoped');previewUser='owner';
 const communityPage=await handle(new Request('http://127.0.0.1:'+port+'/qa-community'));assert.equal(communityPage.status,200);assert.match(await communityPage.text(),/name="aifect-community-qa"[^>]*src="\/#community"/);
 const myPage=await handle(new Request('http://127.0.0.1:'+port+'/qa-mypage'));assert.equal(myPage.status,200);assert.match(await myPage.text(),/name="aifect-mypage-qa"[^>]*src="\/#profile"/);
 const stream=await handle(new Request('http://127.0.0.1:'+port+'/media/one/stream',{headers:{range:'bytes=0-43'}}));assert.equal(stream.status,206);assert.equal((await stream.arrayBuffer()).byteLength,44);assert.equal(stream.headers.get('content-type'),'audio/wav');
 await Promise.allSettled([...pending]);for(const cleanup of cleanups)await cleanup();
 console.log('Tab fixtures verified: Play /qa + Community /qa-community + MyPage /qa-mypage, 30 songs, 3 duet halves, 3 dubbings, 6 crews, 3 private playlists, weekly rankings, account isolation and WAV range streaming.');
}else{
 const server=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const origin='http://'+(req.headers.host||'127.0.0.1:'+port),method=req.method||'GET';
   const response=await handle(new Request(origin+req.url,{method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'Local preview error: '+error.message}));}
 });
 server.listen(port,host,()=>console.log('AIFECT local tab QA listening at http://'+host+':'+port+'/qa, /qa-community and /qa-mypage'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await Promise.allSettled([...pending]);for(const cleanup of cleanups)await cleanup();process.exit(0);}));
}
