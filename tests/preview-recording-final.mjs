// Disposable SQLite and generated audio only. No production requests or storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const cleanup=[],f=await fixture({after(fn){cleanup.push(fn);}});
const words=['스쳐가는 바람 속에서도','너의 목소리가 들려','멈추지 않는 이 길 위에서','다시 너를 떠올려','작은 불빛을 따라','오늘도 걸어가','너와의 시간이','아직 내 안에 살아'].map((text,i)=>({s:2+i*5,e:6+i*5,w:text.split(' ').map((t,j,a)=>({t,s:2+i*5+j*4/a.length,e:2+i*5+(j+1)*4/a.length}))}));
f.sql.prepare("UPDATE tracks SET title='녹음 검증',duration=45,karaoke_at=1 WHERE id='one'").run();
f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','qa-record','ready',1,'ready',?,0,0)").run(JSON.stringify(words));
const wav=Buffer.alloc(44+32000*2*45);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(32000,24);wav.writeUInt32LE(64000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);for(let i=0;i<32000*45;i++)wav.writeInt16LE(Math.sin(i*2*Math.PI*220/32000)*250,44+i*2);
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:4438'),baseline=(req.headers.cookie||'').includes('record_baseline=1');
 if(u.pathname==='/qa'){
 const w=Math.max(320,Math.min(1920,Number(u.searchParams.get('w'))||1440)),h=Number(u.searchParams.get('h'))||(w>=1024?900:844),duet=u.searchParams.get('duet')==='1',before=u.searchParams.get('before')==='1';
 res.setHeader('set-cookie','record_baseline='+(before?'1':'0')+'; Path=/; SameSite=Lax');res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Recording QA</title><body style="margin:0;background:#0c121b;color:white;font:12px sans-serif"><div style="height:40px">Local fixture · '+(before?'before':'after')+' · '+w+'×'+h+' · '+(duet?'duet':'solo')+'</div><iframe title="AIFECT 녹음 검증" src="/#sing/one'+(duet?'?mode=duet':'')+'" style="width:'+w+'px;height:'+h+'px;border:0;transform-origin:top left"></iframe><script>const f=document.querySelector("iframe");function fit(){f.style.transform="scale("+Math.min(1,innerWidth/'+w+',(innerHeight-40)/'+h+')+")"}addEventListener("resize",fit);fit();</script>');return;
 }
 const root=resolve(baseline?'work/recording-baseline/client':'dist/client');
 const env={DB:f.DB,BUCKET:{async head(){return {size:wav.length};},async get(){return {body:wav,size:wav.length};}},ASSETS:{async fetch(r){const file=resolve(root,'.'+new URL(r.url).pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(file),{headers:{'content-type':({'.txt':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}};
 const body=[];for await(const chunk of req)body.push(chunk);
 const response=await worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:body.length?Buffer.concat(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end(String(e));}}).listen(4438,'127.0.0.1',()=>console.log('Local recording QA: http://127.0.0.1:4438/#sing/one'));
process.on('SIGINT',()=>server.close(()=>{cleanup.forEach(f=>f());process.exit(0);}));
