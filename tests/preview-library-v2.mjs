// Isolated actual Worker/D1 preview. No runtime credentials or production data.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {fixture} from './fixture.mjs';
const cleanup=[],f=await fixture({after(fn){cleanup.push(fn);}});
f.sql.exec("INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES('listener','other','로컬 검증 계정',0,1); UPDATE producers SET name='검증용 창작자',nickname_confirmed=1 WHERE id='producer'; UPDATE tracks SET title='검증용 제작곡 '||id,duration=60 WHERE status='published'; UPDATE tracks SET kind='cover',title='검증용 커버' WHERE id='two'");
await f.call('/api/playlists','POST',{name:'검증용 공개 플레이리스트',is_public:true,track_ids:['one','three']});
const first=(await f.call('/api/playlists')).body.playlists[0];await f.call('/api/playlists/'+first.id+'/save','PUT',null,'other');
await f.call('/api/playlists','POST',{name:'나만 듣는 제작곡',track_ids:['one']},'other');
const box=(await f.call('/api/my-boxes','POST',{name:'퇴근 후 듣고 싶은 음악'},'other')).body.id;
for(const item of [{kind:'original',content_id:'one'},{kind:'cover',content_id:'two'}])await f.call('/api/my-boxes/'+box+'/items','PUT',item,'other');
f.sql.exec("UPDATE tracks SET title='비 오는 긴 밤에 다시 듣고 싶은 검증용 제작곡' WHERE id='one'; UPDATE artists SET name='이름이 아주 긴 검증용 가수' WHERE id='artist'; UPDATE producers SET name='긴 이름의 검증용 음악 제작자' WHERE id='producer'; INSERT INTO likes(user_id,track_id,created) VALUES('other','one',10),('other','two',20),('other','three',30); INSERT INTO listens(id,listener,user_id,track_id,started,day) VALUES('ui-one','other','other','one',10,'2026-11-18'),('ui-two','other','other','two',20,'2026-11-18'),('ui-three','other','other','three',30,'2026-11-18')");
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,scriptPath:resolve('dist/server/index.js'),compatibilityDate:config.compatibility_date,compatibilityFlags:['nodejs_compat'],port:0,host:'127.0.0.1',d1Databases:['DB'],r2Buckets:['BUCKET'],assets:{...config.assets,directory:resolve('dist/client'),routerConfig:{has_user_worker:true}}}),handleStructuredLogs:entry=>{if(entry.level==='error')console.log(JSON.stringify(entry));}});
await mf.ready;const db=await mf.getD1Database('DB');
for(const {sql} of f.sql.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid").all())await db.prepare(sql).run();
const triggers=f.sql.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();for(const {name} of triggers)await db.prepare('DROP TRIGGER "'+name+'"').run();
const inserts=[];for(const {name} of f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())for(const row of f.sql.prepare('SELECT * FROM "'+name+'"').all()){
 const keys=Object.keys(row);inserts.push(db.prepare('INSERT INTO "'+name+'"('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])));
}
await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...inserts]);for(const {sql} of triggers)await db.prepare(sql).run();
const bucket=await mf.getR2Bucket('BUCKET'),wav=Buffer.alloc(44+8000*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(const id of ['one','two','three']){await bucket.put('preview/'+id+'.m4a',wav);await bucket.put('audio/'+id+'.m4a',wav);}
const server=createServer(async(req,res)=>{try{
 const url='http://127.0.0.1:4197'+req.url;
 if(req.url.startsWith('/__qa/login')){const user=new URL(url).searchParams.get('user')==='owner'?'owner':'other';res.writeHead(302,{'Set-Cookie':'aifect_session='+user+'; Path=/; HttpOnly; SameSite=Lax',Location:'/#profile?view=library&section=playlists'});return res.end();}
 const parts=[];for await(const part of req)parts.push(part);const response=await mf.dispatchFetch(url,{method:req.method,headers:req.headers,...(parts.length?{body:Buffer.concat(parts)}:{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Preview error');}});
server.listen(4197,'127.0.0.1',()=>console.log('Local library preview: http://127.0.0.1:4197/__qa/login'));
const stop=()=>{server.close();mf.dispose().then(()=>{cleanup.forEach(fn=>fn());process.exit(0);});};process.on('SIGINT',stop);process.on('SIGTERM',stop);
