// Disposable localhost fixture using the production router, client and room coordinator.
// Synthetic members/catalogue stay here; no paid operations or external SFU requests.
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {WebSocketServer} from 'ws';
import {liveFixture} from './live-karaoke-fixture.mjs';
import {VoiceRoom} from '../realtime/worker-live-karaoke.js';
import worker from '../server/index.js';
import {hash} from '../server/auth.js';
const cleanup=[],t={after:fn=>cleanup.push(fn),mock:{method(obj,key,fn){obj[key]=fn;}}};
const args=process.argv.slice(2),option=(name,fallback)=>{const inline=args.find(value=>value.startsWith(name+'='));if(inline)return inline.slice(name.length+1);const index=args.indexOf(name),value=args[index+1];return index>=0&&value&&!value.startsWith('--')?value:fallback;};
const port=Number(option('--port','4331')),host=option('--host','127.0.0.1');
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Preview --port must be an integer from 1 to 65535');
const f=await liveFixture(t),root=resolve('dist/client'),sockets=new Map();
const qaUser=value=>value==='other'?'other':'owner';
// Identity belongs to the tab, not an origin-wide cookie. The fixture alone
// consumes this header/query; production bundles and authentication stay intact.
function installQAIdentity(){
 // Managed preview hostnames can lack randomUUID while getRandomValues remains
 // available. Repair only this test harness API; microphone/security checks stay real.
 if(typeof crypto.randomUUID!=='function'&&typeof crypto.getRandomValues==='function'){
  crypto.randomUUID=()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);};
 }
 const key='aifect.room-qa-user',selected=new URLSearchParams(location.search).get('qa-user');
 if(selected==='owner'||selected==='other')sessionStorage.setItem(key,selected);
 const user=()=>sessionStorage.getItem(key)==='other'?'other':'owner';
 const originalFetch=window.fetch.bind(window);
 window.fetch=(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,init);
  const headers=new Headers(request.headers);headers.set('x-qa-user',user());
  return originalFetch(new Request(request,{headers}));
 };
 const OriginalWebSocket=window.WebSocket;
 window.WebSocket=class extends OriginalWebSocket{
  constructor(url,protocols){
   const target=new URL(url,location.href);
   if(target.host===location.host&&target.pathname.startsWith('/api/voice/'))target.searchParams.set('qa_user',user());
   super(target.href,protocols);
  }
 };
}
const identityScript='<script>('+installQAIdentity.toString()+')();</script>';
for(const sku of ['theme_cherry_blossom','theme_aurora_night'])f.sql.prepare("INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,expires_at) VALUES(?,'owner',?,'decoration',?,unixepoch(),unixepoch()+36000)").run(sku,sku,sku);
const portraits=(await readdir('dist/assets/ai-bot-import')).filter(p=>p.endsWith('.webp')).slice(0,8),images=new Map();
for(let i=0;i<8;i++){
 const uid=i===0?'owner':i===1?'other':'guest-'+i,pid=i===0?'producer':i===1?'friend':'guest-profile-'+i,name=i===0?'검증 방장':i===3?'긴닉네임도중앙정렬':'참여자 '+i;
 if(i>1){f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@example.test',name);f.sql.prepare('INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)').run(pid,uid,name);f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash(uid),uid,Math.floor(Date.now()/1000)+36000);}
 f.sql.prepare("UPDATE producers SET name=?,image_version='local-preview' WHERE id=?").run(name,pid);f.sql.prepare('UPDATE users SET name=? WHERE id=?').run(name,uid);images.set('/media/producer/'+pid,portraits[i%portraits.length]);
}
for(let i=0;i<35;i++){f.addSong('qa-song-'+i);f.sql.prepare('UPDATE tracks SET title=? WHERE id=?').run('검증 노래 '+String(i+1).padStart(2,'0'),'qa-song-'+i);}
const rooms={};
for(const mode of ['talk','karaoke']){
 const r=rooms[mode]=await f.create({title:mode==='talk'?'함께 이야기하는 밤':'함께 부르는 밤',mode,seating_mode:'free',background:'night',announcement:'로컬 검증 데이터 · 운영 서비스와 분리되어 있습니다.'});
 r.guests=[];
 const peers=new Set();sockets.set(r.state.room.id,peers);r.room.ctx.getWebSockets=()=>[...peers];r.room.notify=VoiceRoom.prototype.notify;
 const command=r.room.command,notify=r.room.notify;let timing;
 r.room.notify=function(...args){const t=performance.now();if(timing)timing.stateMs=t-timing.start;const result=notify.apply(this,args);if(timing)timing.broadcastEnqueueMs=performance.now()-t;return result;};
 r.room.command=async function(action,...args){if(action!=='request-mic')return command.call(this,action,...args);timing={start:performance.now()};try{const result=await command.call(this,action,...args);result.commandTiming={...result.commandTiming,stateMs:timing.stateMs,broadcastEnqueueMs:timing.broadcastEnqueueMs,processingMs:performance.now()-timing.start};return result;}finally{timing=null;}};
 for(let i=1;i<8;i++){const uid=i===1?'other':'guest-'+i,state=await f.join(r,uid);r.guests.push({uid,state});}
}
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html;charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png'};
const assets={async fetch(req){const u=new URL(req.url),file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':types[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}};
// Optional generated tone exercises real media range requests without external audio.
const tone=await readFile('work/qa-tone.m4a').catch(()=>null),audioKey=key=>/^(stream|karaoke)\//.test(key)&&key.endsWith('.m4a');
const env={...f.siteEnv,ASSETS:assets,BUCKET:{async get(key,options){if(!tone||!audioKey(key))return null;const r=options?.range;return {body:r?tone.subarray(r.offset,r.offset+r.length):tone};},async head(key){return tone&&audioKey(key)?{size:tone.length}:null;}}};
f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,status,created,paid_at) VALUES('qa-zero-value','owner','admin_test',1000,0,0,0,'paid',0,0)");
f.sql.exec("INSERT INTO voice_music_permissions(track_id,owner_id,terms,accepted_at) SELECT id,user_id,'2026-10-20-room-listening',1 FROM tracks WHERE user_id='owner'");
async function scenario(mode,name){
 const r=rooms[mode],d=r.room.data;
 if(!d.members.owner)r.state=await f.join(r,'owner');
 d.config.host_id='owner';for(const p of Object.values(d.members))p.role=p.id==='owner'?'host':'member';
 const count=name==='few'?2:8;r.guests=[];
 for(let i=1;i<8;i++){
  const uid=i===1?'other':'guest-'+i,member=d.members[uid];
  if(i>=count){if(member)await f.call(r.root+'leave','POST',{generation:member.generation},uid);continue;}
  const state=member?r.room.snapshot(member):await f.join(r,uid);r.guests.push({uid,state});
 }
 if(mode==='talk'){
  for(const p of Object.values(d.members)){p.seat=null;p.muted=true;p.pub=null;}
  d.members.owner.seat=0;
  if(name==='full')r.guests.forEach(({uid},i)=>{d.members[uid].seat=i+1;});
 }else{
  d.karaoke={queue:[],active:null,phase:'idle',startsAt:0,inviteExpiresAt:0,readyExpiresAt:0,revision:(d.karaoke?.revision||0)+1};
  if(name==='queue')for(const [i,g] of r.guests.entries())await f.command(r,g.state,'request',{track_id:'qa-song-'+i},g.uid);
  if(['mine','singing'].includes(name)){
   const owner=await f.call(r.root+'state');await f.command(r,owner.body,'request',{track_id:'one'});
   if(name==='singing'){d.karaoke.phase='singing';d.karaoke.startsAt=Date.now()+3000;d.karaoke.inviteExpiresAt=0;}
  }
 }
 if(['light','dark','base'].includes(name)){d.config.theme_sku=name==='base'?'navy':name==='dark'?'theme_aurora_night':'theme_cherry_blossom';d.config.background='navy';d.config.settings_revision=(d.config.settings_revision||0)+1;}
 d.revision++;r.room.notify();return r;
}
const wss=new WebSocketServer({noServer:true});
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://'+(req.headers.host||'127.0.0.1:'+port));
  if(u.pathname==='/qa-frame'){
   const width=Number(u.searchParams.get('width')||390),height=Number(u.searchParams.get('height')||844);
   if(!Number.isInteger(width)||width<280||width>1920||!Number.isInteger(height)||height<320||height>1440){res.writeHead(400,{'content-type':'text/plain;charset=utf-8'});res.end('QA viewport must be 280–1920px wide and 320–1440px high.');return;}
   const mode=u.searchParams.get('mode')==='karaoke'?'karaoke':'talk',user=qaUser(u.searchParams.get('as'));
   const target=new URLSearchParams({mode,as:user}),scenarioName=u.searchParams.get('scenario');
   if(['empty','full','few','many','queue','mine','singing','light','dark','base'].includes(scenarioName))target.set('scenario',scenarioName);
   res.setHeader('content-type','text/html;charset=utf-8');
   res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIFECT '+width+'×'+height+' '+mode+' '+user+' 검증</title><style>html,body{margin:0;padding:0;width:'+width+'px;height:'+height+'px;overflow:hidden;background:#0c1018}iframe{display:block;border:0;width:'+width+'px;height:'+height+'px}</style></head><body><iframe id="qa-room-frame" name="qa-room-frame" title="AIFECT 실제 방 화면 '+width+'×'+height+'" width="'+width+'" height="'+height+'" allow="microphone; autoplay" src="/qa?'+target.toString().replace(/&/g,'&amp;')+'"></iframe></body></html>');return;
  }
  if(u.pathname==='/qa'){
   if(u.searchParams.has('mode')){
    const mode=u.searchParams.get('mode')==='talk'?'talk':'karaoke',user=qaUser(u.searchParams.get('as')||u.searchParams.get('qa-user'));
    // Participant links inspect the same room without resetting its active state.
    const r=user==='owner'&&u.searchParams.has('scenario')?await scenario(mode,u.searchParams.get('scenario')):rooms[mode];
    res.writeHead(302,{location:'/?qa-user='+user+'#'+(r.room.data.config.mode==='karaoke'?'live':'voice')+'/'+r.state.room.id});res.end();return;
   }
   res.setHeader('content-type','text/html;charset=utf-8');res.end('<h1>격리된 방 검증</h1><p>각 링크를 별도 탭에서 열면 방장과 참여자로 같은 방을 함께 확인할 수 있습니다.</p>'+['talk','karaoke'].map(mode=>'<h2>'+mode+'</h2><p><a href="/qa?mode='+mode+'&as=owner">방장으로 현재 방 열기</a> · <a href="/qa?mode='+mode+'&as=other">참여자로 현재 방 열기</a></p><p>'+[[1440,900],[390,844],[320,700],[768,1024],[1280,600]].map(([width,height])=>['owner','other'].map(user=>'<a href="/qa-frame?width='+width+'&height='+height+'&mode='+mode+'&as='+user+'">'+width+'×'+height+' '+(user==='owner'?'방장':'참여자')+'</a>').join(' · ')).join(' | ')+'</p>'+['empty','full','few','many','queue','mine','singing','light','dark','base'].map(name=>'<p><a href="/qa?mode='+mode+'&as=owner&scenario='+name+'">'+mode+' '+name+'</a></p>').join('')).join(''));return;
  }
  if(u.pathname==='/qa-probe.js'){res.setHeader('content-type','text/javascript');res.end(await readFile('tests/room-performance-probe.js'));return;}
  if(u.pathname==='/qa-metrics'){res.setHeader('content-type','application/json');res.end(JSON.stringify([...f.rooms.values()].map(r=>({room:r.data.config.id,mode:r.data.config.mode,title:r.data.config.title,visibility:r.data.config.visibility,revision:r.data.revision,members:Object.keys(r.data.members),seats:Object.values(r.data.members).map(m=>({id:m.id,seat:m.seat})),phase:r.data.karaoke?.phase}))));return;}
  if(images.has(u.pathname)){res.setHeader('content-type','image/webp');res.end(await readFile(resolve('dist/assets/ai-bot-import',images.get(u.pathname))));return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const user=qaUser(req.headers['x-qa-user']||u.searchParams.get('qa-user'));
  const response=await worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:'aifect_session='+user},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){void p.catch(()=>{});}});
  const responseHeaders=new Headers(response.headers);
  // Only this disposable fixture's app shell can be framed by its same origin.
  // Keep the production worker and every other security directive unchanged.
  if(u.pathname==='/'&&responseHeaders.get('content-type')?.includes('text/html')){
   const directives=(responseHeaders.get('content-security-policy')||'').split(';').map(value=>value.trim()).filter(value=>value&&!/^frame-ancestors(?:\s|$)/i.test(value));
   responseHeaders.set('content-security-policy',[...directives,"frame-ancestors 'self'"].join('; '));
   responseHeaders.set('x-frame-options','SAMEORIGIN');
  }
  res.writeHead(response.status,Object.fromEntries(responseHeaders));let body=Buffer.from(await response.arrayBuffer());
  if(response.headers.get('content-type')?.includes('text/html'))body=Buffer.from(body.toString().replace('<head>','<head>'+identityScript).replace('</body>','<script src="/qa-probe.js"></script><script>addEventListener("aifect:seat-measured",e=>console.info("seat timing",JSON.stringify(e.detail)),true);</script></body>'));
  res.end(body);
 }catch(error){res.writeHead(500);res.end(error.message);console.error(error);}
});
server.on('upgrade',(req,socket,head)=>{
 const u=new URL(req.url,'http://'+(req.headers.host||'127.0.0.1:'+port)),id=u.pathname.match(/rooms\/([^/]+)\/socket$/)?.[1],r=f.rooms.get(id),generation=u.searchParams.get('generation'),user=qaUser(u.searchParams.get('qa_user')),p=Object.values(r?.data.members||{}).find(p=>p.id===user&&p.generation===generation);
 if(!p){socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>{ws.deserializeAttachment=()=>({id:p.id,generation});sockets.get(id).add(ws);ws.on('close',()=>sockets.get(id).delete(ws));ws.send(JSON.stringify({type:'state',state:r.snapshot(p)}));});
});
const presence=setInterval(()=>{for(const r of Object.values(rooms))for(const {uid,state} of r.guests)void f.call(r.root+'heartbeat','POST',{generation:state.generation},uid);},10000);
const alarms=setInterval(()=>{for(const r of f.rooms.values())void r.alarm().catch(()=>{});},500);
server.listen(port,host,()=>console.log('http://'+host+':'+port+'/qa'));
process.on('SIGINT',()=>{clearInterval(presence);clearInterval(alarms);wss.close();server.close();cleanup.forEach(fn=>fn());process.exit(0);});
