// Real application routes/templates against disposable local DB and room objects.
// No production accounts, external media, microphone or paid operations.
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {liveFixture} from './live-karaoke-fixture.mjs';
import worker from '../server/index.js';
import {transform} from 'esbuild';
const cleanup=[],t={after:f=>cleanup.push(f),mock:{method(obj,key,fn){obj[key]=fn;}}};
const f=await liveFixture(t),port=4329,root=resolve('dist/client');
f.sql.exec("UPDATE users SET name=CASE id WHEN 'owner' THEN '로컬 방장' ELSE '로컬 가창자' END;UPDATE producers SET name=CASE user_id WHEN 'owner' THEN '로컬 방장' ELSE '로컬 가창자' END;UPDATE tracks SET title='검증용 노래' WHERE id='one'");
const r=await f.create({title:'라이브 노래방 · 로컬 검증',background:'night',announcement:'로컬 테스트 데이터입니다. 실제 이용자와 운영 데이터에 영향을 주지 않습니다.'});
const other=await f.join(r);await f.command(r,other,'request',{track_id:'one'},'other');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html;charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const originalHTML=await readFile('dist/index.html','utf8'),baseline={};
for(const [ext,pattern] of [['js',/<script\s+defer\s+src="([^"\s]+)"\s*><\/script>/g],['css',/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"\s]+)"[^>]*>/g]]){
 const inputs=[...originalHTML.matchAll(pattern)].map(m=>m[1]).filter(p=>!/^https?:/.test(p));
 const body=await Promise.all(inputs.map(p=>{const path=p.replace(/^\//,'').split('?')[0];return path==='live-karaoke.'+ext?execFileSync('git',['show','22e487ce3095d09b9df8b51b5a5942571b3db5d3:dist/'+path],{encoding:'utf8'}):readFile(resolve(root,path),'utf8');}));
 baseline['/qa-before-app.'+ext]=(await transform(body.join(ext==='js'?'\n;\n':'\n'),{loader:ext,target:'es2022'})).code;
}
const assets={async fetch(req){const u=new URL(req.url),file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+sep))return new Response('',{status:404});try{return new Response(u.searchParams.has('before')&&['/live-karaoke.js','/live-karaoke.css'].includes(u.pathname)?execFileSync('git',['show','HEAD:dist'+u.pathname]):await readFile(file),{headers:{'content-type':mime[extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}};
const env={...f.siteEnv,BILLING_REVIEW_USER_IDS:'owner',BILLING_REVIEW_UNTIL:'2000000000',ASSETS:assets,BUCKET:{async get(){return null;},async head(){return null;}}};
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:'+port);
  if(baseline[u.pathname]){res.setHeader('content-type',mime[extname(u.pathname)]);res.end(baseline[u.pathname]);return;}
  if(['/live-karaoke.js','/live-karaoke.css'].includes(u.pathname)&&String(req.headers.referer||'').includes('qaBefore=1')){
   res.setHeader('content-type',mime[extname(u.pathname)]);res.end(execFileSync('git',['show','22e487ce3095d09b9df8b51b5a5942571b3db5d3:dist'+u.pathname]));return;
  }
  if(u.pathname==='/qa-layout'){
   const w=[320,390,768,1440].includes(Number(u.searchParams.get('width')))?Number(u.searchParams.get('width')):1440,h=w>800?900:844;
   res.setHeader('content-type','text/html;charset=utf-8');res.end(`<!doctype html><html><meta charset="utf-8"><title>라이브 노래방 로컬 검증</title><body style="overflow:hidden;margin:0;background:#0c121b;color:white;font:14px sans-serif"><p>로컬 검증 · ${w} × ${h} · <a style="color:white" href="/qa-layout?width=1440">PC</a> <a style="color:white" href="/qa-layout?width=390">390</a> <a style="color:white" href="/qa-layout?width=320">320</a> <a style="color:white" href="/qa-layout?width=768">768</a></p><output id="qa-metrics" style="display:block;font-size:10px;height:16px;white-space:nowrap"></output><iframe title="라이브 노래방 ${w}" src="/?qaBefore=${u.searchParams.get('before')==='1'?'1':'0'}#live/${r.state.room.id}" style="width:${w}px;height:${h}px;transform-origin:top left;border:0"></iframe><script>function fit(){document.querySelector('iframe').style.transform='scale('+Math.min(1,(innerWidth-10)/${w},(innerHeight-80)/${h})+')'}addEventListener('resize',fit);fit();setInterval(()=>{const d=document.querySelector('iframe').contentDocument,room=d?.querySelector('.voice-room');if(room)document.querySelector('#qa-metrics').textContent=JSON.stringify({width:d.documentElement.clientWidth,scrollWidth:d.documentElement.scrollWidth,roomWidth:room.clientWidth,roomScroll:room.scrollWidth,buttons:[...d.querySelectorAll('#live-actions button')].map(b=>b.textContent)});},1000)</script>`);return;
  }
  const chunks=[];for await(const b of req)chunks.push(b);
  const start=performance.now();
  const response=await worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:'aifect_session=owner'},body:chunks.length?Buffer.concat(chunks):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
  res.writeHead(response.status,Object.fromEntries(response.headers));let bytes=Buffer.from(await response.arrayBuffer());if(u.searchParams.get('qaBefore')==='1'&&response.headers.get('content-type')?.includes('text/html'))bytes=Buffer.from(bytes.toString().replace(/\/aifect-app-[a-f0-9]+\.(js|css)/g,'/qa-before-app.$1'));res.end(bytes);
  if(u.pathname.endsWith('karaoke-search'))console.log('local search: '+Math.round(performance.now()-start)+'ms, status '+response.status);
 }catch(e){res.writeHead(500);res.end('Local preview error');console.error(e.message);}
});
const presence=setInterval(()=>void f.call(r.root+'heartbeat','POST',{generation:other.generation},'other'),10000);
const timer=setInterval(()=>{for(const room of f.rooms.values())void room.alarm().catch(()=>{});},1000);
server.listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/qa-layout?width=1440'));
process.on('SIGINT',()=>{clearInterval(timer);clearInterval(presence);server.close();cleanup.forEach(f=>f());process.exit(0);});
