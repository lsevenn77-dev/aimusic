// Real local Workers/assets routing with an isolated fixture DB and R2 bucket.
// This is never deployed and never connects to production storage.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
// Reproduce Sites' asset-first routing instead of relying on local-only overrides.
assert.equal(config.assets.run_worker_first,undefined);
assert.equal(existsSync('dist/client/index.html'),false,'An index asset would bypass the live homepage renderer');
assert.ok(existsSync('dist/client/aifect-shell.txt'));
const cleanups=[],f=await fixture({after(fn){cleanups.push(fn);}});
f.sql.exec("UPDATE artists SET name='로컬 검증 아티스트',bio='운영 데이터와 분리된 화면 검증용 소개입니다. 실제 서비스에는 등록되지 않습니다.'; UPDATE tracks SET duration=60,description='로컬 화면 검증용 샘플입니다. 창작자가 등록한 곡 소개와 미리듣기가 함께 표시되는지 확인합니다.',has_cover=0 WHERE status='published';");
f.sql.prepare('UPDATE tracks SET title=? WHERE id=?').run('공개 음악 미리듣기 · 로컬 검증','one');
const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,scriptPath:resolve('dist/server/index.js'),compatibilityDate:config.compatibility_date,compatibilityFlags:['nodejs_compat'],port:process.argv.includes('--check')?0:Number((process.argv.includes('--port')?process.argv[process.argv.indexOf('--port')+1]:null)||process.env.PREVIEW_PORT||4196),host:process.argv.includes('--host')?process.argv[process.argv.indexOf('--host')+1]:'127.0.0.1',d1Databases:['DB'],r2Buckets:['BUCKET'],assets:{...config.assets,directory:resolve('dist/client'),routerConfig:{has_user_worker:true}}}),handleStructuredLogs:entry=>console.log(JSON.stringify(entry))});
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
for(const path of ['/','/index.html','/?source=share']){
 for(const headers of [{},{'sec-fetch-mode':'navigate',accept:'text/html'}]){
  const root=await mf.dispatchFetch('http://localhost'+path,{headers});const rootHTML=await root.text();
  assert.equal(root.status,200,rootHTML);assert.match(rootHTML,/href="\/music\/one"/);assert.doesNotMatch(rootHTML,/href="\/music\/hidden"/);
  assert.equal(root.headers.get('cache-control'),'no-store');
  const clientPath=rootHTML.match(/src="(\/aifect-app-[a-f0-9]+\.js)"/)?.[1];assert.ok(clientPath);
  const client=await mf.dispatchFetch('http://localhost'+clientPath);assert.equal(client.status,200);assert.ok((await client.text()).length>1000);
 }
 const head=await mf.dispatchFetch('http://localhost'+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
}
// Exercise the actual D1 engine too: its SQL expression-depth limit differs from node:sqlite.
for(const q of ['Rock','rock','록','Rokc','ㄹㅋㄱㅈㅇㅌㅅㅌ']){
 const response=await mf.dispatchFetch('http://localhost/api/search?'+new URLSearchParams({q})),result=await response.json();
 assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.counts.tracks,3,q);
}
await db.prepare("UPDATE tracks SET status='hidden' WHERE id='two'").run();
const refreshed=await (await mf.dispatchFetch('http://localhost/')).text();assert.doesNotMatch(refreshed,/href="\/music\/two"/);
const ads=await mf.dispatchFetch('http://localhost/ads.txt');assert.equal(ads.status,200);assert.match(await ads.text(),/pub-5910265378731607/);
const head=await mf.dispatchFetch('http://localhost/media/one/preview',{method:'HEAD',headers:{'content-length':'0'}});assert.equal(head.status,200);
const hidden=await mf.dispatchFetch('http://localhost/music/hidden');assert.equal(hidden.status,404);
for(const path of ['/music/','/music/one/','/about/','/guide/recording/']){
 const redirect=await mf.dispatchFetch('http://localhost'+path,{redirect:'manual'});
 assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),path.slice(0,-1));
}
const detail=await mf.dispatchFetch('http://localhost/music/one');const detailHTML=await detail.text();
assert.equal(detail.status,200);assert.match(detailHTML,/href="\/design-system\.css"/);
const tokens=await mf.dispatchFetch('http://localhost/design-system.css');assert.equal(tokens.status,200);
assert.match(await tokens.text(),/--ds-text:#F8FAFC/);
assert.equal((await mf.dispatchFetch('http://localhost/music?page=500')).status,404);
console.log('Verified asset-first homepage GET/HEAD/navigation, index alias, fresh visibility, client bundle, ads.txt, media HEAD and hidden-track denial.');
if(process.argv.includes('--check'))await stop();
else{
 console.log('Local preview: '+(await mf.ready).href+'music/one');
 process.on('SIGINT',()=>stop().then(()=>process.exit(0)));process.on('SIGTERM',()=>stop().then(()=>process.exit(0)));
}
}catch(error){await stop();throw error;}
