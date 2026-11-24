// Usage: node talking-room-fixture.mjs /absolute/path/to/the/built/web/checkout
import http from 'node:http';
import {readFile, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname, extname, resolve, sep} from 'node:path';

const port=4188;
const qa = dirname(fileURLToPath(import.meta.url));
if(!process.argv[2])throw Error('Pass the web checkout containing the release build.');
const site=resolve(process.argv[2]);
const require=createRequire(resolve(site,'package.json'));
const wss = new (require('ws').WebSocketServer)({noServer:true});
const source = resolve(site, 'dist');
const built = resolve(source, 'client');
if(!existsSync(resolve(built,'aifect-shell.txt')))throw Error('Build the release client first.');
const avatar = (await readdir(resolve(source, 'assets/ai-bot-import'))).find(f=>f.endsWith('.webp'));
const tone = Buffer.alloc(44 + 22050*2*45);
tone.write('RIFF'); tone.writeUInt32LE(tone.length-8,4); tone.write('WAVEfmt ',8); tone.writeUInt32LE(16,16);
tone.writeUInt16LE(1,20); tone.writeUInt16LE(1,22); tone.writeUInt32LE(22050,24); tone.writeUInt32LE(44100,28);
tone.writeUInt16LE(2,32); tone.writeUInt16LE(16,34); tone.write('data',36); tone.writeUInt32LE(tone.length-44,40);
for(let i=0;i<(tone.length-44)/2;i++) tone.writeInt16LE(Math.round(3200*Math.sin(i*2*Math.PI*440/22050)),44+i*2);
const participants = ['host','guest'].map((id,i)=>({id,profile_id:id+'-profile',name:i?'청취자':'시뮬레이터 방장',role:i?'listener':'host',seat:i?null:0,muted:true,publishing:false,image_version:'fixture-1',requested:false,locked:false}));
const room={id:'fixture-talk',host_id:'host',mode:'talk',title:'테스트 토킹룸',background:'basic_dark',max_members:8,seating_mode:'free',settings_revision:1};
let revision=0, messages=[],music,observations={},requests=[];
function postMessage(i) {return {id:'m'+i,user_id:'host',profile_id:'host-profile',name:'시뮬레이터 방장',body:'이전 대화 스크롤 확인 '+i,created:Date.now(),sequence:i};}
function reset(){
  revision=1;participants[0].muted=true;messages=Array.from({length:50},(_,i)=>postMessage(i+1));
  music={queue:[],volume:.7,balance:.7,index:-1,playing:false,position:0,updated:Date.now(),starts:0,revision:0,repeat:'off'};
  requests=[];observations={};
}
reset();
function snapshot(){return {room,self:'guest',generation:'sim-guest',revision,members:participants,chat:messages,notices:[],seat_invites:[],music,serverNow:Date.now()};}
function broadcast(){revision++;for(const ws of wss.clients)if(ws.readyState===1)ws.send(JSON.stringify({type:'state',state:snapshot()}));}
const mime={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const path=url.pathname;
 const json=x=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(x));};
 try{
  if(req.headers.host!=='127.0.0.1:4188'||(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:4188')){res.writeHead(403).end();return;}
  if(req.method==='POST'&&path==='/qa/result'){let body='';for await(const chunk of req)body+=chunk;if(body.length<65000)observations={...observations,...JSON.parse(body)};return json({ok:true});}
  if(path==='/qa/result')return json({...observations,streamRequests:requests});
  if(path==='/qa/advance'&&req.method==='POST'){
   let action='';for await(const chunk of req)action+=chunk;
   if(action==='mic'){participants[0].muted=!participants[0].muted;}
   if(action==='message')messages.push(postMessage(messages.length+1));
   if(action==='music')music={...music,queue:[{id:'qa-song',title:'방장 테스트 음원',artist:'로컬 440Hz',duration:45}],index:0,playing:true,updated:Date.now(),position:0,revision:music.revision+1,starts:music.starts+1};
   broadcast();return json({revision});
  }
  if(path==='/api/voice/rooms/fixture-talk/music-stream'){
   const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
   const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(+range[2],tone.length-1):tone.length-1;
   if(start>end){res.writeHead(416,{'content-range':'bytes */'+tone.length});return res.end();}
   requests.push({method:req.method,range:req.headers.range||null});
   res.writeHead(range?206:200,{'accept-ranges':'bytes','content-type':'audio/wav','content-length':end-start+1,...(range?{'content-range':'bytes '+start+'-'+end+'/'+tone.length}:{})});
   return res.end(req.method==='HEAD'?undefined:tone.subarray(start,end+1));
  }
  if(path==='/api/me')return json({user:{id:'guest',name:'청취자',nickname_confirmed:1},interaction_state:{likes:[],follows:[]},membership:{active:false},providers:[]});
  if(path==='/api/chat/events'){res.writeHead(204);return res.end();}
  if(path==='/api/library')return json({likes:[],playlists:[],follows:[]});
  if(path==='/api/voice/status')return json({enabled:true});
  if(path.startsWith('/api/voice/rooms/fixture-talk/'))return json(snapshot());
  if(path.startsWith('/api/'))return json({items:[],tracks:[],rooms:[],users:[],counts:{},summary:{},decorations:[]});
  if(path==='/qa/browser.js'){res.setHeader('content-type','text/javascript');return res.end(await readFile(resolve(qa,'fixtures/talking-room-probe.js')));}
  if(path==='/'){
   reset();const file=resolve(built,'aifect-shell.txt');
   const errors='<script>window.addEventListener("error",e=>fetch("/qa/result",{method:"POST",body:JSON.stringify({error:(e.message||"resource")+" "+(e.filename||"")+":"+e.lineno})}));</script>';
   let html=(await readFile(file,'utf8')).replace('<head>','<head>'+errors).replace('</body>','<script defer src="/qa/browser.js"></script></body>');
   res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:"+port+"; media-src 'self' blob:;"});return res.end(html);
  }
  const relative = path.startsWith('/media/producer/')?'assets/ai-bot-import/'+avatar:decodeURIComponent(path.slice(1));
  const file=resolve(built,relative);
  if(file.startsWith(built+sep)&&existsSync(file)){
   res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');
   res.setHeader('cache-control','no-store');return res.end(await readFile(file));
  }
  res.writeHead(404);res.end();
 }catch(error){console.error(path,error.message);if(!res.headersSent)res.writeHead(500);res.end();}
});
server.on('upgrade',(req,socket,head)=>{if(!req.url.startsWith('/api/voice/rooms/fixture-talk/socket'))return socket.destroy();wss.handleUpgrade(req,socket,head,ws=>{wss.emit('connection',ws);ws.send(JSON.stringify({type:'state',state:snapshot()}));});});
server.listen(port,'127.0.0.1',()=>console.log('Talking room simulator fixture listening on '+port));
