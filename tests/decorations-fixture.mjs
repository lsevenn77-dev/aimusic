import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import voiceWorker from '../realtime/worker.js';
import {VoiceRoom} from '../realtime/room.js';
export async function decorationsFixture(t,{gold=10000,voice=false}={}){
 const extra={VOICE_SERVICE_URL:'https://voice-fixture.test',VOICE_BRIDGE_SECRET:'local-decoration-bridge-secret-0001'};
 const f=await fixture(t,voice?extra:{});
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','테스트 친구',0)");
 f.sql.prepare("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('funds','owner','web',?,?,0,'paid',0,1)").run(gold,gold*100);
 if(voice){
  const sql=new DatabaseSync(':memory:');for(const name of ['0001_rooms.sql','0002_room_settings.sql'])sql.exec(readFileSync(new URL('../realtime/migrations/'+name,import.meta.url),'utf8'));t.after(()=>sql.close());
  const rooms=new Map(),env={...extra,ROOM_DB:{prepare(q){return {bind(...a){const s=sql.prepare(q);return {async run(){s.run(...a);},async all(){return {results:s.all(...a)};}};}};}}};
  env.ROOMS={idFromName:id=>id,get(id){if(!rooms.has(id)){
   const storage=new Map(),ctx={storage:{get:async k=>structuredClone(storage.get(k)),put:async(k,v)=>storage.set(k,structuredClone(v)),setAlarm:async()=>{}},getWebSockets:()=>[],waitUntil:()=>{}};
   const room=new VoiceRoom(ctx,env);room.sfu={close:async()=>({resolved:true})};rooms.set(id,room);
  }return rooms.get(id);}};
  const original=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async(url,init)=>new URL(typeof url==='string'?url:url.url||url).hostname==='voice-fixture.test'?voiceWorker.fetch(new Request(url,init),env):original(url,init));
  Object.assign(f,{rooms,voiceSql:sql,voiceEnv:env});
 }
 f.buy=(sku='frame_aurora_ring',period='P7D',more={})=>f.call('/api/decorations/buy','POST',{sku,period,request_id:crypto.randomUUID(),...more});
 f.use=(item,user='owner',request_id=crypto.randomUUID())=>f.call('/api/decorations/inventory/'+item+'/use','POST',{request_id},user);
 f.gift=async(sku='frame_aurora_ring',period='P7D',profile_id='friend')=>{const b=await f.buy(sku,period);if(b.status!==201)return b;const sent=await f.call('/api/decorations/inventory/'+b.body.order.inventory_id+'/send','POST',{profile_id,request_id:crypto.randomUUID()});return sent.status===200?b:sent;};
 f.buyUse=async(sku='frame_aurora_ring',period='P7D',more={})=>{const r=await (more.profile_id?f.gift(sku,period,more.profile_id):f.buy(sku,period,more));if(r.status!==201)return r;return f.use(r.body.order.inventory_id,more.profile_id==='friend'?'other':'owner');};
 return f;
}
