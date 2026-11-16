// Run on the target Linux host: node check.mjs <directory containing drizzle/ and worker.mjs>.
// No credentials, outbound API calls, production writes or on-disk databases.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.');
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
try {
 const files=readdirSync(join(root,'drizzle')).filter(p=>p.endsWith('.sql')).sort();
 for(const p of files)db.exec(readFileSync(join(root,'drizzle',p),'utf8'));
 const counts=Object.fromEntries(db.prepare("SELECT type, count(*) n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' GROUP BY type").all().map(r=>[r.type,r.n]));
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 function prepare(q,params=[]){const s=db.prepare(q);return {bind:(...p)=>prepare(q,p),first:(k)=>{const r=s.get(...params);return k?r?.[k]??null:r??null;},all:()=>({results:s.all(...params),success:true}),run:()=>s.columns().length?{results:s.all(...params),success:true}:{results:[],success:true,meta:s.run(...params)}};}
 const DB={prepare,batch(a){db.exec('BEGIN IMMEDIATE');try{const v=a.map(s=>s.run());db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}};
 db.exec('CREATE TEMP TABLE journal_probe(id TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount > 0))');
 const credit=(id)=>prepare('INSERT INTO journal_probe VALUES(?, ?)').bind(id,100);
 DB.batch([credit('one')]);assert.throws(()=>DB.batch([credit('two'),credit('one')]));assert.equal(prepare('SELECT SUM(amount) AS n FROM journal_probe').first('n'),100);
 const worker=(await import(pathToFileURL(join(root,'worker.mjs')).href)).default;
 const env={DB,ASSETS:{fetch(){return new Response('<!doctype html><html lang="ko"></html>')}}};
 for(const [path,status] of [['/api/catalog',200],['/music',200],['/checkout/toss/gold',200],['/api/me/profile/image',401]]){
  const res=await worker.fetch(new Request('https://aifect.co.kr'+path),env,{waitUntil(p){Promise.resolve(p).catch(()=>{})}});
  assert.equal(res.status,status,path);await res.arrayBuffer();
 }
 console.log(JSON.stringify({migrations:files.length,objects:counts,integrity:'ok',brokenForeignKeys:0,duplicateAndRollback:'pass',publicRoutes:3,anonymousAccountRoute:'denied',productionData:false}));
} finally { db.close(); }
