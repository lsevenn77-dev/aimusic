import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/index.js';
import {hash} from '../server/auth.js';

export async function fixture(t,extraEnv={}){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 t.after(()=>sql.close());
 let batchTail=Promise.resolve();
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){s.run(...args);return {success:true};}};}};},async batch(statements){const previous=batchTail;let release;batchTail=new Promise(resolve=>release=resolve);await previous;sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}finally{release();}}};
 for(const uid of ['owner','other']){
  sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@example.test',uid);
  sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash(uid),uid,Math.floor(Date.now()/1000)+3600);
 }
 sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('producer','owner','QA',0); INSERT INTO artists(id,producer_id,name,created) VALUES('artist','producer','QA',0)");
 for(const tid of ['one','two','three','hidden'])sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,?)").run(tid,tid,tid==='hidden'?'hidden':'published');
 const call=async(path,method='GET',body,user='owner')=>{const r=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{Origin:'https://aifect.test',...(user?{Cookie:'aifect_session='+user}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{...extraEnv,DB},{waitUntil(p){p.catch(()=>{});}});return {status:r.status,body:await r.json()};};
 return {sql,call,DB};
}
