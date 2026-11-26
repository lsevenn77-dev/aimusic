import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import voiceWorker,{VoiceRoom} from '../realtime/worker-live-karaoke.js';

// Run the real Site router, signed bridge and exact uploaded room Worker against
// local SQLite and isolated Durable Objects. No production or audio API is used.
export async function liveFixture(t){
 const bridge={VOICE_SERVICE_URL:'https://live-karaoke-fixture.test',VOICE_BRIDGE_SECRET:'local-live-karaoke-bridge-00000001'};
 const f=await fixture(t,bridge),roomSql=new DatabaseSync(':memory:');
 for(const file of ['0001_rooms.sql','0002_room_settings.sql'])roomSql.exec(readFileSync(new URL('../realtime/migrations/'+file,import.meta.url),'utf8'));
 t.after(()=>roomSql.close());
 const rooms=new Map(),calls=[];
 const env={...bridge,ROOM_DB:{prepare(q){return {bind(...args){const stmt=roomSql.prepare(q);return {async run(){stmt.run(...args);},async all(){return {results:stmt.all(...args)};}};}};}}};
 env.ROOMS={idFromName:id=>id,get(id){
  if(!rooms.has(id)){
   const saved=new Map(),ctx={storage:{async get(k){return structuredClone(saved.get(k));},async put(k,v){saved.set(k,structuredClone(v));},async setAlarm(){}},getWebSockets(){return [];}};
   const room=new VoiceRoom(ctx,env);room.notify=()=>{};
   room.sfu={async create(){throw Error('Unexpected SFU creation in local integration test');},async close(){return {resolved:true};},async tracks(){throw Error('Unexpected live SFU request');}};
   rooms.set(id,room);
  }
  return rooms.get(id);
 }};
 const original=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const req=new Request(input,init);
  if(new URL(req.url).hostname!=='live-karaoke-fixture.test')return original(input,init);
  calls.push({path:new URL(req.url).pathname,body:JSON.parse(await req.clone().text())});
  return voiceWorker.fetch(req,env);
 });
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','Live friend',0)");
 f.sql.exec("UPDATE tracks SET title='Live '||id,duration=120,karaoke_at=1,lyrics='Test lyric' WHERE id IN ('one','two','three','hidden')");
 f.sql.exec("UPDATE tracks SET karaoke_at=0 WHERE id='two'");
 const words=JSON.stringify([{s:0,e:2,w:[{t:'Test',s:0,e:1},{t:'lyric',s:1,e:2}]}]);
 for(const id of ['one','two','three','hidden'])f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,lyrics_text,words,created,updated) VALUES(?,?,'ready',1,'ready','Test lyric',?,0,0)").run(id,'job-'+id,words);
 f.sql.exec("UPDATE karaoke_jobs SET state='queued' WHERE track_id='three'");
 const addSong=(id,changes={})=>{
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,duration,karaoke_at) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published',120,1)").run(id,'Live '+id);
  f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,lyrics_text,words,created,updated) VALUES(?,?,'ready',1,'ready','Test lyric',?,0,0)").run(id,'job-'+id,words);
  for(const [column,value] of Object.entries(changes)){
   assert.ok(['kind','original_id','rights_accepted','duration','karaoke_at'].includes(column));
   f.sql.prepare('UPDATE tracks SET '+column+'=? WHERE id=?').run(value,id);
  }
 };
 const create=async(more={})=>{
  const response=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'Local live karaoke',visibility:'public',mode:'karaoke',...more});
  assert.equal(response.status,201,JSON.stringify(response.body));
  const root='/api/voice/rooms/'+response.body.room.id+'/';
  const joined=await f.call(root+'join','POST',{request_id:crypto.randomUUID()});
  assert.equal(joined.status,200,JSON.stringify(joined.body));
  return {root,state:joined.body,room:rooms.get(response.body.room.id)};
 };
 const join=async(r,user='other')=>{
  const response=await f.call(r.root+'join','POST',{request_id:crypto.randomUUID()},user);
  assert.equal(response.status,200,JSON.stringify(response.body));return response.body;
 };
 const command=(r,state,operation,more={},user='owner')=>f.call(r.root+'karaoke','POST',{generation:state.generation,request_id:crypto.randomUUID(),operation,...more},user);
 const search=(r,state,q='Live',user='owner')=>f.call(r.root+'karaoke-search?generation='+encodeURIComponent(state.generation)+'&q='+encodeURIComponent(q),'GET',undefined,user);
 return {...f,siteEnv:{...bridge,DB:f.DB},roomSql,rooms,calls,addSong,create,join,command,search};
}
