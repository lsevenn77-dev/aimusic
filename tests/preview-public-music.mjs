// Real local Workers/assets routing with an isolated fixture DB and R2 bucket.
// This is never deployed and never connects to production storage.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}});
f.sql.exec("UPDATE artists SET name='로컬 검증 아티스트',bio='운영 데이터와 분리된 화면 검증용 소개입니다. 실제 서비스에는 등록되지 않습니다.'; UPDATE tracks SET duration=60,description='로컬 화면 검증용 샘플입니다. 창작자가 등록한 곡 소개와 미리듣기가 함께 표시되는지 확인합니다.',has_cover=0 WHERE status='published';");
f.sql.prepare('UPDATE tracks SET title=? WHERE id=?').run('공개 음악 미리듣기 · 로컬 검증','one');
const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,scriptPath:resolve('dist/server/index.js'),compatibilityDate:config.compatibility_date,compatibilityFlags:['nodejs_compat'],port:process.argv.includes('--check')?0:Number(process.env.PREVIEW_PORT||4196),host:'127.0.0.1',d1Databases:['DB'],r2Buckets:['BUCKET'],assets:{...config.assets,directory:resolve('dist/client'),routerConfig:{has_user_worker:true}}}),handleStructuredLogs:entry=>console.log(JSON.stringify(entry))});
const stop=async()=>{cleanups.forEach(fn=>fn());await mf.dispose();};
try{
await mf.ready;
const db=await mf.getD1Database('DB');
const schema=f.sql.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid").all();
for(const {sql} of schema)await db.prepare(sql).run();
// Seed fixture rows with triggers temporarily absent so previously computed fixture state isn't replayed.
const triggers=f.sql.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
for(const {name} of triggers)await db.prepare('DROP TRIGGER "'+name.replaceAll('"','""')+'"').run();
const inserts=[];
for(const {name} of f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all()){
 for(const row of f.sql.prepare('SELECT * FROM "'+name+'"').all()){
  const keys=Object.keys(row),statement='INSERT INTO "'+name+'"('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')';
  inserts.push(db.prepare(statement).bind(...keys.map(k=>row[k])));
 }
}
await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...inserts]);
for(const {sql} of triggers)await db.prepare(sql).run();
const bucket=await mf.getR2Bucket('BUCKET');
// A one-second silent PCM sample checks the media control without recording a microphone.
const wav=Buffer.alloc(44+8000*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(const id of ['one','two','three'])await bucket.put('preview/'+id+'.m4a',wav);
const root=await mf.dispatchFetch('http://localhost/');const rootHTML=await root.text();assert.equal(root.status,200,rootHTML);assert.match(rootHTML,/href="\/music\/one"/);
const head=await mf.dispatchFetch('http://localhost/media/one/preview',{method:'HEAD',headers:{'content-length':'0'}});assert.equal(head.status,200);
const hidden=await mf.dispatchFetch('http://localhost/music/hidden');assert.equal(hidden.status,404);
console.log('Verified built Workers/assets routing, homepage catalog, media HEAD and hidden-track denial.');
if(process.argv.includes('--check'))await stop();
else{
 console.log('Local preview: '+(await mf.ready).href+'music/one');
 process.on('SIGINT',()=>stop().then(()=>process.exit(0)));process.on('SIGTERM',()=>stop().then(()=>process.exit(0)));
}
}catch(error){await stop();throw error;}
