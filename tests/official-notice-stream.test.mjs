import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_PEER_ID,WELCOME_GUIDE} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE_ID,PREMIUM_OPEN_NOTICE} from '../shared/premium-open-notice.js';

const aliases=['notice',WELCOME_PEER_ID,PREMIUM_OPEN_NOTICE_ID];
const otherCampaign='unrelated-local-campaign';
const nextEvent=async reader=>{
 const value=await reader.read();
 return value.done?'':new TextDecoder().decode(value.value);
};
function campaigns(f){
 for(const [id,content] of [[WELCOME_CAMPAIGN_ID,WELCOME_GUIDE],[PREMIUM_OPEN_NOTICE_ID,PREMIUM_OPEN_NOTICE],[otherCampaign,{}]]){
  f.sql.prepare('INSERT INTO welcome_campaigns(id,content_json,created,recipient_max_rowid) VALUES(?,?,50,2)').run(id,JSON.stringify(content));
 }
}
function receipt(f,campaign,user='owner',readAt=0){
 f.sql.prepare("INSERT INTO welcome_receipts(campaign_id,user_id,created,read_at,source) VALUES(?,?,50,?,'broadcast')").run(campaign,user,readAt);
}
async function open(f,peer,{user='owner',method='GET',headers={}}={}){
 return worker.fetch(new Request('https://aifect.test/api/chat/events?peer='+encodeURIComponent(peer),{
  method,headers:{...(user?{Cookie:'aifect_session='+user}:{}),Origin:'https://aifect.test',...headers}
 }),{DB:f.DB},{waitUntil(){}});
}

test('official notice aliases open the same read-only stream without a producer profile or a delivery',async t=>{
 const f=await fixture(t);campaigns(f);
 receipt(f,WELCOME_CAMPAIGN_ID,'owner',10);receipt(f,PREMIUM_OPEN_NOTICE_ID);
 const before=f.sql.prepare('SELECT rowid,* FROM welcome_receipts ORDER BY rowid').all();
 for(const alias of aliases){
  assert.equal(f.sql.prepare('SELECT id FROM producers WHERE id=?').get(alias),undefined);
  const response=await open(f,alias);
  assert.equal(response.status,200,alias);
  assert.match(response.headers.get('content-type'),/text\/event-stream/);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const reader=response.body.getReader();
  try{assert.match(await nextEvent(reader),/^event: change\n/);}finally{await reader.cancel();}
 }
 assert.deepEqual(f.sql.prepare('SELECT rowid,* FROM welcome_receipts ORDER BY rowid').all(),before);
 for(const table of ['direct_messages','push_outbox'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
});

test('official streams observe only their recipient and known campaigns, then revoke with the session',async t=>{
 const f=await fixture(t);campaigns(f);receipt(f,WELCOME_CAMPAIGN_ID,'owner',10);
 const response=await open(f,WELCOME_PEER_ID),reader=response.body.getReader();
 t.after(()=>reader.cancel());
 assert.match(await nextEvent(reader),/^event: change\n/);
 receipt(f,PREMIUM_OPEN_NOTICE_ID,'other');receipt(f,otherCampaign);
 assert.match(await nextEvent(reader),/^event: heartbeat\n/,'other recipients and unrelated receipts do not change this channel');
 receipt(f,PREMIUM_OPEN_NOTICE_ID);
 assert.match(await nextEvent(reader),/^event: change\n/,'a new receipt is detected even when its timestamp is unchanged');
 f.sql.prepare('UPDATE welcome_receipts SET read_at=20 WHERE campaign_id=? AND user_id=?').run(PREMIUM_OPEN_NOTICE_ID,'owner');
 assert.match(await nextEvent(reader),/^event: change\n/,'receipt acknowledgement changes the channel');
 assert.equal(f.sql.prepare('SELECT read_at FROM welcome_receipts WHERE campaign_id=? AND user_id=?').get(PREMIUM_OPEN_NOTICE_ID,'other').read_at,0);
 f.sql.exec("DELETE FROM sessions WHERE user_id='owner'");
 assert.match(await nextEvent(reader),/^event: revoked\n/);
 assert.equal(await nextEvent(reader),'');
});

test('official streams retain authentication, origin, method and exact-alias boundaries',async t=>{
 const f=await fixture(t);
 assert.equal((await open(f,WELCOME_PEER_ID,{user:null})).status,401);
 assert.equal((await open(f,WELCOME_PEER_ID,{user:'missing-session'})).status,401);
 assert.equal((await open(f,WELCOME_PEER_ID,{headers:{Origin:'https://elsewhere.test'}})).status,403);
 assert.equal((await open(f,WELCOME_PEER_ID,{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await open(f,WELCOME_PEER_ID,{method:'POST'})).status,405);
 assert.equal((await open(f,WELCOME_PEER_ID+'-lookalike')).status,404);
 const response=await open(f,'notice'),reader=response.body.getReader();
 try{
  assert.equal(response.status,200,'a member may subscribe before the first delivery');
  assert.match(await nextEvent(reader),/^event: change\n/);
 }finally{await reader.cancel();}
});
