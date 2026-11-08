import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {hash} from '../server/auth.js';
import {chatStreamRoute} from '../server/chat-stream.js';
import {activateWelcomeCampaign,ensureWelcomeReceipt,welcomeNoticeStatus,queueWelcomeCampaign} from '../server/welcome-notices.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_PEER_ID} from '../shared/welcome-guide.js';

const at=()=>Math.floor(Date.now()/1000);
const receipt=(f,user)=>f.sql.prepare('SELECT * FROM welcome_receipts WHERE campaign_id=? AND user_id=?').get(WELCOME_CAMPAIGN_ID,user);
const count=(f,table)=>f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n;
async function member(f,id,{provider='email',name=id,accountType='human',profile=false}={}){
 f.sql.prepare('INSERT INTO users(id,email,name,provider,subject,account_type,created) VALUES(?,?,?,?,?,?,0)').run(id,id+'@example.test',name,provider,accountType==='ai_bot'?null:id,accountType);
 if(accountType==='human')f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash(id),id,at()+3600);
 if(profile)f.sql.prepare('INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES(?,?,?,0,1)').run('profile-'+id,id,name);
}
function dm(f,id,sender,recipient,body){
 f.sql.prepare('INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)').run(id,sender,recipient,body,id,at());
}
async function rawPatch(f,body,{origin='https://aifect.test',user='owner'}={}){
 return worker.fetch(new Request('https://aifect.test/api/notices/welcome',{
  method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',...(user?{Cookie:'aifect_session='+user}:{})},body
 }),{DB:f.DB},{waitUntil(p){p.catch(()=>{});}});
}

test('broadcast includes every existing human, including the operator and members without profiles, but excludes bots and deleted accounts',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});
 await member(f,'listener',{name:'첫 방문자'});
 await member(f,'ai_999999',{provider:'ai_service',accountType:'ai_bot'});
 await member(f,'retired',{provider:'deleted'});
 const usersBefore=count(f,'users'),profilesBefore=count(f,'producers');
 await activateWelcomeCampaign({DB:f.DB});
 assert.deepEqual(f.sql.prepare('SELECT user_id FROM welcome_receipts ORDER BY user_id').all().map(r=>r.user_id),['listener','other','owner']);
 assert.equal(count(f,'users'),usersBefore);
 assert.equal(count(f,'producers'),profilesBefore);
 assert.equal(count(f,'direct_messages'),0);
 assert.equal(count(f,'push_outbox'),0,'in-app receipt must not masquerade as a personal-DM push');
 for(const id of ['owner','other','listener']){
  const result=await f.call('/api/notices/welcome','GET',undefined,id);
  assert.equal(result.status,200);
  assert.equal(result.body.peer.read_only,true);
  assert.equal(result.body.guide.sections.length,8);
 }
 const audit=f.sql.prepare("SELECT * FROM admin_audit WHERE action='welcome:broadcast'").all();
 assert.equal(audit.length,1);
 assert.equal(JSON.parse(audit[0].target).recipients,3);
 const status=await welcomeNoticeStatus({DB:f.DB});
 assert.equal(status.broadcast_targets,3);
 assert.equal(status.broadcast_delivered,3);
 assert.equal(status.broadcast_missing,0);
});

test('concurrent activation and startup retries create one receipt and never reset a read notice or rewrite the stored campaign',async t=>{
 const f=await fixture(t),env={DB:f.DB};
 await Promise.all(Array.from({length:4},()=>activateWelcomeCampaign(env)));
 assert.equal(count(f,'welcome_campaigns'),1);
 assert.equal(count(f,'welcome_receipts'),2);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM admin_audit WHERE action='welcome:broadcast'").get().n,1);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID})).status,200);
 const before={...receipt(f,'owner')};
 const stored=f.sql.prepare('SELECT content_json FROM welcome_campaigns WHERE id=?').get(WELCOME_CAMPAIGN_ID).content_json;
 const historical={...JSON.parse(stored),closing:['이미 전달된 안내의 저장본']};
 f.sql.prepare('UPDATE welcome_campaigns SET content_json=? WHERE id=?').run(JSON.stringify(historical),WELCOME_CAMPAIGN_ID);
 await Promise.all([activateWelcomeCampaign(env),...Array.from({length:8},()=>ensureWelcomeReceipt(env,'owner')),f.call('/api/me')]);
 assert.deepEqual({...receipt(f,'owner')},before);
 assert.equal(count(f,'welcome_receipts'),2);
 assert.equal(f.sql.prepare('SELECT content_json FROM welcome_campaigns WHERE id=?').get(WELCOME_CAMPAIGN_ID).content_json,JSON.stringify(historical));
 assert.deepEqual((await f.call('/api/notices/welcome')).body.guide.closing,historical.closing);
});

test('the broadcast snapshot excludes later signups; common authenticated startup automatically delivers once for every login provider',async t=>{
 const f=await fixture(t),env={DB:f.DB};
 await activateWelcomeCampaign(env);
 const max=f.sql.prepare('SELECT recipient_max_rowid n FROM welcome_campaigns').get().n;
 for(const provider of ['email','google','kakao','apple'])await member(f,'new-'+provider,{provider});
 assert.ok(f.sql.prepare("SELECT rowid n FROM users WHERE id='new-email'").get().n>max);
 await activateWelcomeCampaign(env);
 assert.equal(count(f,'welcome_receipts'),2,'retries must not expand the original broadcast audience');
 for(const provider of ['email','google','kakao','apple']){
  const user='new-'+provider;
  const results=await Promise.all([f.call('/api/me','GET',undefined,user),f.call('/api/me','GET',undefined,user)]);
  assert.ok(results.every(r=>r.status===200));
  assert.equal(receipt(f,user).source,'automatic');
  assert.equal((await f.call('/api/notices/welcome','GET',undefined,user)).status,200);
 }
 assert.equal(count(f,'welcome_receipts'),6);
 const status=await welcomeNoticeStatus(env);
 assert.equal(status.broadcast_targets,2);
 assert.equal(status.broadcast_delivered,2);
 assert.equal(status.automatic_delivered,4);
 assert.equal(status.broadcast_missing,0);
});

test('welcome API scopes reads and acknowledgements to the authenticated member and rejects arbitrary recipients, campaigns, writes, and cross-origin requests',async t=>{
 const f=await fixture(t);
 await activateWelcomeCampaign({DB:f.DB});
 assert.equal((await f.call('/api/notices/welcome','GET',undefined,null)).status,401);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID},null)).status,401);
 for(const method of ['POST','PUT','DELETE'])assert.equal((await f.call('/api/notices/welcome',method,{campaign_id:WELCOME_CAMPAIGN_ID})).status,405);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:'unapproved-campaign'})).status,400);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID,user_id:'other'})).status,400);
 assert.equal(receipt(f,'owner').read_at,0);
 assert.equal(receipt(f,'other').read_at,0);
 const own=await f.call('/api/notices/welcome?user_id=other');
 assert.equal(own.status,200);
 assert.match(own.body.guide.greeting,/^QA님,/);
 assert.equal((await rawPatch(f,JSON.stringify({campaign_id:WELCOME_CAMPAIGN_ID}),{origin:'https://elsewhere.test'})).status,403);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID})).status,200);
 assert.ok(receipt(f,'owner').read_at>0);
 assert.equal(receipt(f,'other').read_at,0);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID})).status,200);
});

test('malformed read acknowledgements return a client error without changing unread state',async t=>{
 const f=await fixture(t);
 await activateWelcomeCampaign({DB:f.DB});
 for(const payload of ['', '{', 'null', '[]', '42', '"text"', '{}']){
  const response=await rawPatch(f,payload);
  assert.equal(response.status,400,'payload '+JSON.stringify(payload));
  assert.equal(receipt(f,'owner').read_at,0);
 }
});

test('personalized greetings use only the public nickname and preserve nickname text literally',async t=>{
 const f=await fixture(t);
 await member(f,'oauth-hidden',{provider:'google',name:'공개하지 않은 로그인 실명'});
 f.sql.prepare('INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES(?,?,?,0,0)').run('hidden-profile','oauth-hidden','공개하지 않은 로그인 실명');
 await activateWelcomeCampaign({DB:f.DB});
 const hidden=await f.call('/api/notices/welcome','GET',undefined,'oauth-hidden');
 assert.equal(hidden.status,200);
 assert.doesNotMatch(hidden.body.guide.greeting,/공개하지 않은 로그인 실명/);
 assert.match(hidden.body.guide.greeting,/^리스너 /);
 f.sql.prepare('UPDATE producers SET name=?,nickname_confirmed=1 WHERE user_id=?').run('별빛 $& <친구>','oauth-hidden');
 const chosen=await f.call('/api/notices/welcome','GET',undefined,'oauth-hidden');
 assert.ok(chosen.body.guide.greeting.startsWith('별빛 $& <친구>님, 반가워요!'));
 assert.equal(chosen.body.guide.greeting.includes('{닉네임}'),false);
});

test('one welcome unread is added alongside existing official and personal conversations, and reading it leaves other messages unread',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'other'});
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('operator-profile','other','기존 운영자',0)");
 await member(f,'friend',{profile:true,name:'친구'});
 dm(f,'old-official','other','owner','기존 공지 기록');
 dm(f,'old-personal','friend','owner','개인 대화 기록');
 const before=f.sql.prepare('SELECT * FROM direct_messages ORDER BY id').all().map(r=>({...r}));
 await activateWelcomeCampaign({DB:f.DB});
 const inbox=await f.call('/api/dm');
 assert.equal(inbox.status,200);
 assert.equal(inbox.body.unread,3);
 assert.equal(inbox.body.notice_unread,1);
 const guide=inbox.body.conversations.find(p=>p.id===WELCOME_PEER_ID);
 assert.equal(guide.is_notice,true);
 assert.equal(guide.read_only,true);
 assert.equal(guide.unread,1);
 assert.equal(inbox.body.conversations.find(p=>p.id==='operator-profile').is_notice,true);
 assert.equal(inbox.body.conversations.find(p=>p.id==='profile-friend').is_notice,false);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID})).status,200);
 const summary=await f.call('/api/dm/summary');
 assert.equal(summary.body.unread,2);
 assert.equal(summary.body.notice_unread,0);
 assert.deepEqual(f.sql.prepare('SELECT * FROM direct_messages ORDER BY id').all().map(r=>({...r})),before);
});

for(const [action,path,method] of [['read all','/api/dm/read-all','POST'],['clear all','/api/dm','DELETE']]){
 test(action+' acknowledges welcome without deleting it or recreating its unread state on startup',async t=>{
  const f=await fixture(t);
  dm(f,'ordinary','other','owner','보존되는 대화');
  await activateWelcomeCampaign({DB:f.DB});
  const result=await f.call(path,method,{});
  assert.equal(result.status,200);
  const saved={...receipt(f,'owner')};
  assert.ok(saved.read_at>0);
  assert.equal((await f.call('/api/dm/summary')).body.unread,0);
  assert.equal((await f.call('/api/notices/welcome')).status,200);
  await f.call('/api/me');
  await activateWelcomeCampaign({DB:f.DB});
  assert.deepEqual({...receipt(f,'owner')},saved);
  assert.equal(count(f,'welcome_receipts'),2);
  assert.equal(f.sql.prepare("SELECT body FROM direct_messages WHERE id='ordinary'").get().body,'보존되는 대화');
 });
}

test('failed audit insertion rolls back the entire campaign and every delivery before a safe retry',async t=>{
 const f=await fixture(t),env={DB:f.DB};
 f.sql.exec("CREATE TEMP TRIGGER fail_welcome_audit BEFORE INSERT ON admin_audit WHEN NEW.action='welcome:broadcast' BEGIN SELECT RAISE(ABORT,'audit write failed'); END");
 await assert.rejects(activateWelcomeCampaign(env),/audit write failed/);
 assert.equal(count(f,'welcome_campaigns'),0);
 assert.equal(count(f,'welcome_receipts'),0);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM admin_audit WHERE action='welcome:broadcast'").get().n,0);
 f.sql.exec('DROP TRIGGER fail_welcome_audit');
 await activateWelcomeCampaign(env);
 assert.equal(count(f,'welcome_campaigns'),1);
 assert.equal(count(f,'welcome_receipts'),2);
 assert.equal((await welcomeNoticeStatus(env)).broadcast_missing,0);
});

test('account deletion removes that member receipt and neither automatic delivery nor campaign retry restores it',async t=>{
 const f=await fixture(t),env={DB:f.DB};
 await activateWelcomeCampaign(env);
 const result=await f.call('/api/account/delete','POST',{confirmation:'DELETE',account_id:'other'},'other');
 assert.equal(result.status,200);
 assert.equal(f.sql.prepare("SELECT provider FROM users WHERE id='other'").get().provider,'deleted');
 assert.equal(receipt(f,'other'),undefined);
 await ensureWelcomeReceipt(env,'other');
 await activateWelcomeCampaign(env);
 assert.equal(receipt(f,'other'),undefined);
 assert.ok(receipt(f,'owner'));
 assert.equal((await f.call('/api/notices/welcome','GET',undefined,'other')).status,401);
});

test('inbox event stream changes when the welcome arrives or is read without any direct-message mutation',async t=>{
 const f=await fixture(t),controller=new AbortController();
 t.after(()=>controller.abort());
 const request=new Request('https://aifect.test/api/chat/events',{headers:{Cookie:'aifect_session=owner',Origin:'https://aifect.test'},signal:controller.signal});
 const response=await chatStreamRoute(request,{DB:f.DB},'/api/chat/events',{id:'owner'}),reader=response.body.getReader(),decoder=new TextDecoder();
 t.after(()=>reader.cancel().catch(()=>{}));
 const change=async()=>{
  const result=await reader.read();
  assert.equal(result.done,false);
  assert.match(decoder.decode(result.value),/^event: change\n/);
 };
 await change();
 await activateWelcomeCampaign({DB:f.DB});
 await change();
 await f.call('/api/notices/welcome','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID});
 await change();
 assert.equal(count(f,'direct_messages'),0);
 await reader.cancel();
});

test('deployment activation is inert in previews and cannot take recipients or content from an incoming request',async t=>{
 const f=await fixture(t),env={DB:f.DB},pending=[];
 const ctx={waitUntil(p){pending.push(p);}};
 queueWelcomeCampaign(new Request('https://preview.aifect.test/'),env,ctx);
 queueWelcomeCampaign(new Request('https://aifect.co.kr/assets/app.js'),env,ctx);
 queueWelcomeCampaign(new Request('https://aifect.co.kr/api/notices/welcome',{method:'POST',body:'{}'}),env,ctx);
 assert.equal(pending.length,0);
 assert.equal(count(f,'welcome_campaigns'),0);
 const params=new URLSearchParams({user_id:'other',content:'untrusted replacement',campaign_id:'unapproved'});
 queueWelcomeCampaign(new Request('https://aifect.co.kr/?'+params),env,ctx);
 queueWelcomeCampaign(new Request('https://aifect.co.kr/'),env,ctx);
 assert.equal(pending.length,1);
 await Promise.all(pending);
 assert.equal(count(f,'welcome_receipts'),2);
 const campaign=f.sql.prepare('SELECT id,content_json FROM welcome_campaigns').get();
 assert.equal(campaign.id,WELCOME_CAMPAIGN_ID);
 assert.equal(campaign.content_json.includes('untrusted replacement'),false);
 assert.equal((await welcomeNoticeStatus(env)).broadcast_missing,0);
});
