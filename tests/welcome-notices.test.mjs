import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {hash} from '../server/auth.js';
import {chatStreamRoute} from '../server/chat-stream.js';
import {activateWelcomeCampaign,ensureWelcomeReceipt,welcomeNoticeStatus,queueWelcomeCampaign} from '../server/welcome-notices.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_PEER_ID,WELCOME_PREVIEW} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE,PREMIUM_OPEN_NOTICE_ID} from '../shared/premium-open-notice.js';

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

function premiumNotice(f,{users=['owner','other'],created=at()+1,content=PREMIUM_OPEN_NOTICE}={}){
 f.sql.prepare('INSERT INTO welcome_campaigns(id,content_json,created,recipient_max_rowid) VALUES(?,?,?,0)').run(PREMIUM_OPEN_NOTICE_ID,JSON.stringify(content),created);
 for(const user of users)f.sql.prepare("INSERT INTO welcome_receipts(campaign_id,user_id,created,source) VALUES(?,?,?,'broadcast')").run(PREMIUM_OPEN_NOTICE_ID,user,created);
}

test('the official inbox has one channel and combines old guides, event cards and member-scoped operator history',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'operator'}),path='/api/notices/official';
 await member(f,'operator',{profile:true});await member(f,'friend',{profile:true});
 await activateWelcomeCampaign({DB:f.DB});
 f.sql.prepare('UPDATE welcome_receipts SET created=10,read_at=5 WHERE campaign_id=? AND user_id=?').run(WELCOME_CAMPAIGN_ID,'owner');
 f.sql.prepare('INSERT INTO welcome_campaigns(id,content_json,created,recipient_max_rowid) VALUES(?,?,40,0)').run(PREMIUM_OPEN_NOTICE_ID,JSON.stringify(PREMIUM_OPEN_NOTICE));
 f.sql.prepare("INSERT INTO welcome_receipts(campaign_id,user_id,created,source) VALUES(?,'owner',40,'broadcast')").run(PREMIUM_OPEN_NOTICE_ID);
 dm(f,'official-first','operator','owner','이용 안내');dm(f,'reply','owner','operator','확인했습니다.');
 dm(f,'private-other','operator','other','다른 계정에게만 표시');dm(f,'regular','friend','owner','개인 메시지');
 f.sql.exec("UPDATE direct_messages SET created=20 WHERE id='official-first'; UPDATE direct_messages SET created=30 WHERE id='reply'");
 const inbox=(await f.call('/api/dm?notices=unified')).body;
 assert.deepEqual(inbox.conversations.map(p=>p.id),['aifect-official-notice','profile-friend']);
 assert.equal(inbox.conversations[0].name,'아이팩트 안내');assert.equal(inbox.conversations[0].notice_type,'official');
 assert.equal(inbox.conversations[0].last_message,PREMIUM_OPEN_NOTICE.title);assert.equal(inbox.conversations[0].updated,40);
 assert.equal(inbox.conversations[0].unread,2);assert.equal(inbox.unread,3);
 assert.equal((await f.call(path,'GET',undefined,null)).status,401);
 const feed=(await f.call(path)).body;
 assert.deepEqual(feed.items.map(item=>[item.id,item.created]),[['campaign:'+WELCOME_CAMPAIGN_ID,10],['dm:official-first',20],['dm:reply',30],['campaign:'+PREMIUM_OPEN_NOTICE_ID,40]]);
 assert.equal(feed.items[0].read_at,5);assert.equal(feed.items[0].legacy_id,WELCOME_PEER_ID);
 assert.equal(feed.items[2].mine,true);assert.deepEqual(feed.items[3].notice,PREMIUM_OPEN_NOTICE);
 assert.ok(feed.items.every(item=>!Object.hasOwn(item,'sender_id')&&!Object.hasOwn(item,'name')));
 assert.equal((await f.call(path,'PATCH',{ids:['dm:official-first'],user_id:'other'})).status,400);
 const receipt=(await f.call(path,'PATCH',{ids:['dm:official-first','dm:reply','dm:private-other','dm:regular']})).body;
 assert.equal(receipt.notice.unread,1);assert.equal(receipt.unread,2);
 assert.equal((await f.call('/api/dm?notices=unified')).body.conversations[0].unread,1);
 for(const id of ['reply','private-other','regular'])assert.equal(f.sql.prepare('SELECT read_at FROM direct_messages WHERE id=?').get(id).read_at,0);
 assert.equal((await f.call('/api/notices/welcome')).body.read_at,5);
 assert.equal((await f.call('/api/notices/premium-open-event')).body.read_at,0);
 assert.equal((await f.call(path,'PATCH',{ids:['campaign:'+PREMIUM_OPEN_NOTICE_ID]})).body.notice.unread,0);
 assert.ok((await f.call('/api/notices/premium-open-event')).body.read_at>0);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','operator',1)");
 assert.ok((await f.call(path)).body.items.every(item=>item.kind!=='dm'));
});

test('older official messages paginate in chronological order without duplicates at a shared timestamp',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'operator'}),path='/api/notices/official';
 await member(f,'operator',{profile:true});
 for(let i=0;i<104;i++)dm(f,'number-'+String(i).padStart(3,'0'),'operator','owner','공지 '+i);
 f.sql.exec("UPDATE direct_messages SET created=99 WHERE sender_id='operator'");
 const latest=(await f.call(path)).body;
 assert.equal(latest.items.length,100);assert.equal(latest.items[0].id,'dm:number-004');assert.equal(latest.items.at(-1).id,'dm:number-103');
 const older=(await f.call(path+'?before='+encodeURIComponent(latest.before))).body;
 assert.deepEqual(older.items.map(item=>item.id),['dm:number-000','dm:number-001','dm:number-002','dm:number-003']);
 assert.equal(older.before,null);assert.equal((await f.call(path+'?before=bad')).status,400);
});
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
  assert.equal(result.body.guide.sections.length,9);
  assert.equal(result.body.guide.stickers,undefined);
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
 const historical={...JSON.parse(stored),closing:['이미 전달된 안내의 저장본'],stickers:{greeting:'cat_hand_wave',closing:'cat_basic_heart'}};
 historical.sections=historical.sections.filter(section=>section.id!=='crew');
 f.sql.prepare('UPDATE welcome_campaigns SET content_json=? WHERE id=?').run(JSON.stringify(historical),WELCOME_CAMPAIGN_ID);
 await Promise.all([activateWelcomeCampaign(env),...Array.from({length:8},()=>ensureWelcomeReceipt(env,'owner')),f.call('/api/me')]);
 assert.deepEqual({...receipt(f,'owner')},before);
 assert.equal(count(f,'welcome_receipts'),2);
 assert.equal(f.sql.prepare('SELECT content_json FROM welcome_campaigns WHERE id=?').get(WELCOME_CAMPAIGN_ID).content_json,JSON.stringify(historical));
 const guide=(await f.call('/api/notices/welcome')).body.guide;
 assert.deepEqual(guide.closing,historical.closing);
 assert.equal(guide.stickers,undefined);
 assert.equal(guide.sections.filter(section=>section.id==='crew').length,1);
 assert.equal(guide.sections.find(section=>section.id==='crew').href,'#community/crews');
 assert.equal(guide.sections.findIndex(section=>section.id==='crew'),guide.sections.findIndex(section=>section.id==='talking')+1);
 assert.equal((await f.call('/api/notices/welcome')).body.guide.sections.filter(section=>section.id==='crew').length,1);
 assert.deepEqual({...receipt(f,'owner')},before);
 assert.equal(count(f,'welcome_receipts'),2);
 assert.equal(f.sql.prepare('SELECT content_json FROM welcome_campaigns WHERE id=?').get(WELCOME_CAMPAIGN_ID).content_json,JSON.stringify(historical));
});

test('later signups have a dedicated queue entry and subsequent authenticated startup leaves the receipt intact',async t=>{
 const f=await fixture(t),env={DB:f.DB};
 await activateWelcomeCampaign(env);
 const max=f.sql.prepare('SELECT recipient_max_rowid n FROM welcome_campaigns').get().n;
 for(const provider of ['email','google','kakao','apple'])await member(f,'new-'+provider,{provider});
 assert.ok(f.sql.prepare("SELECT rowid n FROM users WHERE id='new-email'").get().n>max);
 await activateWelcomeCampaign(env);
 assert.equal(count(f,'welcome_receipts'),2,'retries must not expand the original broadcast audience');
 for(const provider of ['email','google','kakao','apple']){
  const user='new-'+provider;
  assert.equal(f.sql.prepare('SELECT state FROM notice_signup_deliveries WHERE user_id=?').get(user).state,'pending');
  await Promise.all([ensureWelcomeReceipt(env,user),ensureWelcomeReceipt(env,user)]);
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
 assert.ok(chosen.body.guide.greeting.startsWith('별빛 $& <친구>님, 반갑습니다!'));
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

test('welcome and premium receipts project as one channel with their saved content, timestamps and read state intact',async t=>{
 const f=await fixture(t);
 await activateWelcomeCampaign({DB:f.DB});
 const welcomeCreated=receipt(f,'owner').created;
 premiumNotice(f,{created:welcomeCreated+10,content:{...PREMIUM_OPEN_NOTICE,title:'🎁 저장된 오픈 선물 안내'}});
 f.sql.prepare('UPDATE welcome_receipts SET read_at=? WHERE campaign_id=? AND user_id=?').run(welcomeCreated+1,WELCOME_CAMPAIGN_ID,'owner');
 const campaigns=f.sql.prepare('SELECT * FROM welcome_campaigns ORDER BY id').all();
 const receipts=f.sql.prepare('SELECT rowid sequence,* FROM welcome_receipts ORDER BY rowid').all();
 const inbox=(await f.call('/api/dm')).body;
 assert.equal(inbox.conversations.length,1);
 assert.equal(inbox.notice_unread,1);
 assert.deepEqual(inbox.conversations[0],{id:WELCOME_PEER_ID,name:'아이팩트 안내',chat_nickname:'아이팩트 안내',is_notice:true,notice_type:'welcome',read_only:true,last_message:'🎁 저장된 오픈 선물 안내',updated:welcomeCreated+10,unread:1});
 const channel=await f.call('/api/notices/welcome');
 assert.equal(channel.status,200);
 assert.equal(channel.body.campaign_id,WELCOME_CAMPAIGN_ID,'legacy guide acknowledgement remains campaign-specific');
 assert.equal(channel.body.created,welcomeCreated);
 assert.equal(channel.body.read_at,welcomeCreated+1);
 assert.deepEqual(channel.body.notices.map(n=>[n.campaign_id,n.path]),[[WELCOME_CAMPAIGN_ID,'/api/notices/welcome'],[PREMIUM_OPEN_NOTICE_ID,'/api/notices/premium-open-event']]);
 assert.equal(channel.body.notices[1].read_at,0);
 assert.deepEqual(channel.body.notices[1].notice,{...PREMIUM_OPEN_NOTICE,title:'🎁 저장된 오픈 선물 안내'});
 assert.match(channel.body.guide.intro[0],/^🎁 저장된 오픈 선물 안내/,'guide-only apps also receive the event text');
 assert.ok(channel.body.guide.intro[0].includes(PREMIUM_OPEN_NOTICE.body));
 assert.equal(channel.body.notices[0].guide.intro.some(text=>text.includes('저장된 오픈 선물 안내')),false,'structured timeline does not duplicate the event');
 assert.deepEqual(f.sql.prepare('SELECT * FROM welcome_campaigns ORDER BY id').all(),campaigns);
 assert.deepEqual(f.sql.prepare('SELECT rowid sequence,* FROM welcome_receipts ORDER BY rowid').all(),receipts);
 assert.equal(count(f,'direct_messages'),0);
 assert.equal(count(f,'push_outbox'),0);
});

test('each campaign acknowledgement preserves the other unread receipt and never marks another member read',async t=>{
 const f=await fixture(t);
 await activateWelcomeCampaign({DB:f.DB});
 premiumNotice(f);
 assert.equal((await f.call('/api/dm')).body.conversations[0].unread,2);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:PREMIUM_OPEN_NOTICE_ID})).status,400);
 assert.equal((await f.call('/api/notices/premium-open-event','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID})).status,400);
 assert.equal((await f.call('/api/notices/welcome','PATCH',{campaign_id:WELCOME_CAMPAIGN_ID})).status,200);
 const welcomeRead=receipt(f,'owner').read_at;
 assert.ok(welcomeRead>0);
 const premium=(await f.call('/api/notices/premium-open-event')).body;
 assert.equal(premium.peer.name,'아이팩트 안내');
 assert.equal(premium.peer.id,PREMIUM_OPEN_NOTICE_ID,'old premium endpoint retains its published type contract');
 assert.equal(premium.read_at,0);
 assert.equal((await f.call('/api/dm')).body.conversations[0].unread,1);
 assert.equal((await f.call('/api/notices/premium-open-event','PATCH',{campaign_id:PREMIUM_OPEN_NOTICE_ID})).status,200);
 assert.equal((await f.call('/api/dm')).body.conversations[0].unread,0);
 assert.equal((await f.call('/api/dm/summary')).body.notice_unread,0);
 assert.equal(receipt(f,'owner').read_at,welcomeRead);
 assert.equal((await f.call('/api/notices/welcome','GET',undefined,'other')).body.peer.unread,2);
 assert.equal((await f.call('/api/notices/premium-open-event','GET',undefined,'other')).body.read_at,0);
});

test('the default app inbox merges the two virtual notices without hiding real operator or personal DMs',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'other'});
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('operator-profile','other','기존 운영자',0)");
 await member(f,'friend',{profile:true,name:'친구'});
 dm(f,'operator-history','other','owner','기존 운영자 대화');
 dm(f,'friend-history','friend','owner','기존 개인 대화');
 await activateWelcomeCampaign({DB:f.DB});
 premiumNotice(f);
 const existing=f.sql.prepare('SELECT * FROM direct_messages ORDER BY id').all();
 const legacy=(await f.call('/api/dm')).body;
 assert.deepEqual(legacy.conversations.map(p=>p.id).sort(),[WELCOME_PEER_ID,'operator-profile','profile-friend'].sort());
 assert.equal(legacy.conversations.find(p=>p.id===WELCOME_PEER_ID).unread,2);
 assert.equal(legacy.conversations.find(p=>p.id==='operator-profile').last_message,'기존 운영자 대화');
 assert.equal(legacy.unread,4);
 const unified=(await f.call('/api/dm?notices=unified')).body;
 assert.deepEqual(unified.conversations.map(p=>p.id),['aifect-official-notice','profile-friend']);
 assert.equal(unified.conversations[0].unread,3);
 assert.deepEqual(f.sql.prepare('SELECT * FROM direct_messages ORDER BY id').all(),existing);
});

test('the official timeline includes only delivered receipts and works without a producer profile or a welcome receipt',async t=>{
 const f=await fixture(t);
 premiumNotice(f,{users:['other']});
 assert.equal((await f.call('/api/dm')).body.conversations.length,0);
 assert.equal((await f.call('/api/notices/welcome')).status,404);
 const received=await f.call('/api/notices/welcome?user_id=owner','GET',undefined,'other');
 assert.equal(received.status,200);
 assert.equal(received.body.peer.id,WELCOME_PEER_ID);
 assert.equal(received.body.peer.name,'아이팩트 안내');
 assert.deepEqual(received.body.notices.map(n=>n.campaign_id),[PREMIUM_OPEN_NOTICE_ID]);
 assert.equal(received.body.guide.intro[0],PREMIUM_OPEN_NOTICE.title+'\n\n'+PREMIUM_OPEN_NOTICE.body);
 assert.equal((await f.call('/api/dm/aifect-guide','GET',undefined,'other')).status,200);
 await activateWelcomeCampaign({DB:f.DB});
 const welcomeOnly=(await f.call('/api/notices/welcome')).body;
 assert.deepEqual(welcomeOnly.notices.map(n=>n.campaign_id),[WELCOME_CAMPAIGN_ID]);
 assert.equal(welcomeOnly.peer.last_message,WELCOME_PREVIEW);
 assert.equal((await f.call('/api/notices/premium-open-event')).status,404);
});

test('legacy official peer aliases return read-only history before profile lookup with stable receipt cursors',async t=>{
 const f=await fixture(t);
 await activateWelcomeCampaign({DB:f.DB});
 premiumNotice(f,{created:receipt(f,'owner').created});
 const expected=f.sql.prepare('SELECT rowid sequence,campaign_id FROM welcome_receipts WHERE user_id=? ORDER BY rowid').all('owner');
 for(const alias of ['notice',WELCOME_PEER_ID,PREMIUM_OPEN_NOTICE_ID]){
  const path='/api/dm/'+alias,result=await f.call(path);
  assert.equal(result.status,200,path);
  assert.equal(result.body.peer.id,WELCOME_PEER_ID);
  assert.equal(result.body.peer.name,'아이팩트 안내');
  assert.equal(result.body.peer.read_only,true);
  assert.equal(result.body.peer.user_id,WELCOME_PEER_ID);
  assert.equal(result.body.peer.image_version,'');
  assert.equal(result.body.peer.premium_style_until,0);
  assert.equal(result.body.peer.premium_default_frame,0);
  assert.deepEqual(result.body.messages.map(m=>[m.sequence,m.campaign_id]),expected.map(r=>[r.sequence,r.campaign_id]));
  assert.deepEqual(result.body.messages.map(m=>m.id),expected.map(r=>'notice:'+r.campaign_id));
  assert.ok(result.body.messages[0].body.startsWith('QA님, 반갑습니다!'));
  assert.equal(result.body.messages[1].body,PREMIUM_OPEN_NOTICE.title+'\n\n'+PREMIUM_OPEN_NOTICE.body);
  assert.equal(result.body.messages[1].image_id,null,'public event art must not use private chat-image identifiers');
  assert.equal(result.body.messages[1].image_url,PREMIUM_OPEN_NOTICE.banner);
  assert.equal(result.body.has_more,false);
  assert.equal(result.body.settings.read_only,true);
  assert.deepEqual((await f.call(path+'/settings')).body,{muted:0,cleared_sequence:0,read_only:true});
  assert.deepEqual((await f.call(path+'?after='+expected[0].sequence)).body.messages.map(m=>m.campaign_id),[PREMIUM_OPEN_NOTICE_ID]);
  assert.deepEqual((await f.call(path+'?before='+expected[1].sequence)).body.messages.map(m=>m.campaign_id),[WELCOME_CAMPAIGN_ID]);
  assert.equal((await f.call(path+'?before=1&after=2')).status,400);
  assert.equal((await f.call(path+'?after=not-a-cursor')).status,400);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await f.call(path,method,{body:'새 공지'})).status,405);
  assert.equal((await f.call(path+'/settings','PUT',{muted:true})).status,405);
  assert.equal((await f.call(path+'/images','PUT',{})).status,405);
  assert.equal((await f.call(path,'GET',undefined,null)).status,401);
 }
 assert.equal((await f.call('/api/dm/not-an-official-profile')).status,404);
 assert.equal(count(f,'direct_messages'),0);
 assert.equal(count(f,'dm_settings'),0);
 assert.equal(count(f,'chat_images'),0);
 assert.equal((await f.call('/api/dm/summary')).body.notice_unread,2,'history GET never marks a notice read');
});

test('legacy sequence acknowledgements preserve deliveries arriving after the returned history and are scoped to the member',async t=>{
 const f=await fixture(t);
 await activateWelcomeCampaign({DB:f.DB});
 const initial=(await f.call('/api/dm/notice')).body.messages;
 assert.equal(initial.length,1);
 premiumNotice(f,{created:initial[0].created-1});
 assert.equal((await f.call('/api/dm/notice','PATCH',{sequence:initial[0].sequence})).status,200);
 assert.ok(receipt(f,'owner').read_at>0);
 assert.equal((await f.call('/api/notices/premium-open-event')).body.read_at,0,'arrival order, not its declared date, bounds the read');
 assert.equal((await f.call('/api/dm/summary')).body.notice_unread,1);
 const latest=(await f.call('/api/dm/'+PREMIUM_OPEN_NOTICE_ID)).body.messages.at(-1);
 assert.equal(latest.campaign_id,PREMIUM_OPEN_NOTICE_ID);
 assert.equal((await f.call('/api/dm/aifect-guide','PATCH',{sequence:latest.sequence})).status,200);
 const readAt=(await f.call('/api/notices/premium-open-event')).body.read_at;
 assert.ok(readAt>0);
 assert.equal((await f.call('/api/dm/notice','PATCH',{sequence:latest.sequence})).status,200);
 assert.equal((await f.call('/api/notices/premium-open-event')).body.read_at,readAt);
 assert.equal((await f.call('/api/dm/summary')).body.notice_unread,0);
 assert.equal((await f.call('/api/dm/summary','GET',undefined,'other')).body.notice_unread,2);
});

test('legacy aliases reject unbounded, foreign and malformed read acknowledgements while accepting a delivered campaign',async t=>{
 const f=await fixture(t);
 await activateWelcomeCampaign({DB:f.DB});
 premiumNotice(f);
 const foreign=f.sql.prepare('SELECT rowid sequence FROM welcome_receipts WHERE user_id=? ORDER BY rowid DESC LIMIT 1').get('other').sequence;
 for(const body of [{},{sequence:foreign},{sequence:0},{sequence:-1},{sequence:1.5},{sequence:999999},{sequence:'1'},{campaign_id:'missing'},{campaign_id:WELCOME_CAMPAIGN_ID,user_id:'other'},{campaign_id:WELCOME_CAMPAIGN_ID,sequence:1},[],null]){
  assert.equal((await f.call('/api/dm/notice','PATCH',body)).status,400,JSON.stringify(body));
 }
 assert.equal((await f.call('/api/dm/summary')).body.notice_unread,2);
 assert.equal((await f.call('/api/dm/notice','PATCH',{campaign_id:PREMIUM_OPEN_NOTICE_ID})).status,200);
 assert.equal(receipt(f,'owner').read_at,0);
 assert.ok((await f.call('/api/notices/premium-open-event')).body.read_at>0);
 assert.equal((await f.call('/api/dm/summary')).body.notice_unread,1);
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
