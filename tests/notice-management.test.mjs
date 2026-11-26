import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {hash} from '../server/auth.js';
import {WELCOME_CAMPAIGN_ID} from '../shared/welcome-guide.js';
import {activateWelcomeCampaign,ensureWelcomeReceipt} from '../server/welcome-notices.js';
import {cleanNoticeContent,renderNoticeEntry} from '../shared/official-notice-content.js';
import {processNoticeBatch} from '../server/notice-delivery.js';
import {notificationData} from '../server/push.js';

const root='/api/admin/notices',feed='/api/notices/official';
const operator={ADMIN_USER_IDS:'owner,reviewer',AIFECT_NOTICE_OPERATOR_IDS:'owner'};
const title='격리된 공지 테스트';
const content=(text=title)=>({format:1,title:text,blocks:[{type:'p',runs:[{text:'본문',bold:true}]}]});
const audience=(type,ids=[])=>({type,ids});
const member=(f,name,provider='email',type='human')=>f.sql.prepare(
 'INSERT INTO users(id,email,name,provider,account_type,created) VALUES(?,?,?,?,?,unixepoch())'
).run(name,name+'@example.test',name,provider,type);
const login=async(f,name)=>f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,unixepoch()+3600)').run(await hash(name),name);
const check=(f,target)=>f.call(root+'/targets','POST',{audience:target});
const delivery=(body,checkId,request_id=crypto.randomUUID())=>({request_id,content:body,check_id:checkId});
const post=(f,data)=>f.call(root,'POST',data);
const selectors=(f,uid)=>f.call(feed,'GET',undefined,uid);
const patch=(f,id,data)=>f.call(root+'/history/'+id,'PATCH',data);
const withdraw=(f,id,data)=>f.call(root+'/history/'+id+'/withdraw','POST',data);
const raw=(f,path,method='GET',uid='owner',headers={},body,extra={})=>worker.fetch(
 new Request('https://aifect.test'+path,{method,headers:{...(uid?{cookie:'aifect_session='+uid}:{}),origin:'https://aifect.test',...headers},body}),
 {...operator,DB:f.DB,...extra},{waitUntil(p){p.catch(()=>{});}});

test('only verified administrators can read, and review access cannot publish or mutate',async t=>{
 const f=await fixture(t,operator);
 member(f,'reviewer');await login(f,'reviewer');
 assert.equal((await f.call(root,'GET',undefined,null)).status,401);
 assert.equal((await f.call(root,'GET',undefined,'other')).status,403);
 assert.equal((await f.call(root,'GET',undefined,'reviewer')).status,200);
 assert.equal((await f.call(root+'/targets','POST',{audience:audience('all')},'reviewer')).status,403);
 assert.equal((await raw(f,root+'/targets','POST','owner',{origin:'https://other.test','content-type':'application/json'},'{}')).status,403);
 assert.equal((await post(f,delivery(content(),crypto.randomUUID()))).status,409);
 assert.equal((await check(f,audience(''))).status,400);
 assert.equal((await check(f,audience('specific'))).status,400);
});

test('a changed equal-count target snapshot needs reconfirmation and a repeated send creates one source and one set of receipts',async t=>{
 const f=await fixture(t,operator);
 member(f,'ai_999901','ai_service','ai_bot');member(f,'gone','deleted');member(f,'00012');
 const original=await check(f,audience('all'));
 assert.equal(original.status,201,JSON.stringify(original.body));
 assert.equal(original.body.count,3);
 f.sql.exec("UPDATE users SET provider='deleted' WHERE id='00012'");
 member(f,'new-here');
 const request=delivery(content(),original.body.id);
 const rejected=await post(f,request);
 assert.equal(rejected.status,409,JSON.stringify(rejected.body));
 assert.deepEqual(rejected.body.check.change,{added:{count:1,ids:['new-here']},removed:{count:1,ids:['00012']}});
 const approved={...request,check_id:rejected.body.check.id};
 const [first,retry]=await Promise.all([post(f,approved),post(f,approved)]);
 assert.ok([200,201].includes(first.status),JSON.stringify(first.body));
 assert.ok([200,201].includes(retry.status),JSON.stringify(retry.body));
 assert.equal(first.body.id,retry.body.id);
 assert.equal(first.body.recipients,3);
 assert.equal((await post(f,{...approved,content:content('다른 본문')})).status,409);
 member(f,'too-late');await login(f,'too-late');
 assert.equal((await selectors(f,'too-late')).body.items.length,0);
 const past=f.sql.prepare('SELECT user_id FROM welcome_receipts WHERE campaign_id=? ORDER BY user_id').all(first.body.id);
 assert.deepEqual(past.map(r=>r.user_id),['new-here','other','owner']);
 assert.equal(f.sql.prepare("SELECT count(*) count FROM admin_audit WHERE action='notice:send'").get().count,1);
});

test('specific, Premium benefit, paying and ordinary members have distinct server-owned scopes',async t=>{
 const f=await fixture(t,operator);
 member(f,'paid-ios');member(f,'store-test');member(f,'00003');member(f,'ai_999901','ai_service','ai_bot');
 f.sql.exec("UPDATE users SET premium_until=unixepoch()+50000 WHERE id='other'; UPDATE users SET created=0 WHERE id='00003'");
 const apple=f.sql.prepare(`INSERT INTO apple_transactions (id,environment,transaction_id,original_id,user_id,product_id,purchased,
  expires,revoked,signed_date,created) VALUES(?,?,?,?,?,'kr.co.aifect.app.premium.monthly',unixepoch(),unixepoch()+50000,0,unixepoch(),unixepoch())`);
 apple.run('paid','Production','tx-paid','original-paid','paid-ios');
 apple.run('test','Sandbox','tx-test','original-test','store-test');
 const specific=await check(f,audience('specific',['00003','00003','other','invalid','ai_999901']));
 assert.equal(specific.status,201,JSON.stringify(specific.body));
 assert.equal(specific.body.duplicates,1);
 assert.deepEqual(specific.body.invalid,['ai_999901','invalid']);
 assert.deepEqual(specific.body.members.map(m=>m.id),['00003','other']);
 assert.ok((await check(f,audience('premium'))).body.members.some(m=>m.id==='other'));
 assert.deepEqual((await check(f,audience('paid'))).body.members.map(m=>m.id),['paid-ios']);
 assert.ok((await check(f,audience('normal'))).body.members.some(m=>m.id==='owner'));
 const empty=await check(f,audience('specific',['invalid']));
 assert.equal(empty.body.count,0);
 assert.equal((await post(f,delivery(content(),empty.body.id))).status,409);
});

test('edits retain the receipt and chronology; scoped and full withdrawals remove actual read and media access',async t=>{
 const bytes=readFileSync(new URL('../dist/assets/chat-stickers/v1/basic/cat_basic_happy.webp',import.meta.url)),objects=new Map();
 const BUCKET={async put(k,b){objects.set(k,b);},async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{body:objects.get(k)}:null;}};
 const f=await fixture(t,{...operator,BUCKET});
 const uploaded=await raw(f,root+'/images','POST','owner',{'content-type':'image/webp'},bytes,{BUCKET});
 assert.equal(uploaded.status,201);
 const asset=(await uploaded.json()).id;
 const source=content();
 source.blocks.push({type:'image',asset,width:80,align:'center',alt:'이미지'});
 const plan=await check(f,audience('specific',['owner','other']));
 const sent=await post(f,delivery(source,plan.body.id));
 assert.equal(sent.status,201,JSON.stringify(sent.body));
 const id=sent.body.id,fullId='campaign:'+id;
 const media=feed+'/'+id+'/images/'+asset;
 assert.equal((await raw(f,media,'GET',null,{},undefined,{BUCKET})).status,401);
 assert.equal((await raw(f,media,'GET','owner',{},undefined,{BUCKET})).headers.get('cache-control'),'private, no-store');
 member(f,'stranger');await login(f,'stranger');
 assert.equal((await raw(f,media,'GET','stranger',{},undefined,{BUCKET})).status,404);
 assert.equal((await f.call(feed+'?known='+encodeURIComponent(fullId),'GET',undefined,'stranger')).body.items.length,0);
 const a=await f.call(feed,'PATCH',{ids:[fullId]});
 assert.equal(a.status,200);
 const before=(await selectors(f,'owner')).body.items[0];
 const edit={version:1,request_id:crypto.randomUUID(),content:{...source,title:'수정된 공지'}};
 const edited=await patch(f,id,edit);
 assert.equal(edited.status,200,JSON.stringify(edited.body));
 const after=(await selectors(f,'owner')).body.items[0];
 assert.deepEqual([after.id,after.created,after.read_at],[before.id,before.created,before.read_at]);
 assert.equal(after.rich.title,'수정된 공지');
 assert.ok(after.edited_at&&after.version===2);
 assert.equal((await patch(f,id,edit)).status,200);
 const subset={scope:'specific',ids:['owner'],reason:'격리 테스트',version:2,request_id:crypto.randomUUID()};
 const withdrawn=await withdraw(f,id,subset);
 assert.equal(withdrawn.status,200,JSON.stringify(withdrawn.body));
 assert.equal(withdrawn.body.status,'partially_withdrawn');
 assert.equal(withdrawn.body.active,1);
 assert.equal((await selectors(f,'owner')).body.items.length,0);
 assert.equal((await selectors(f,'other')).body.items.length,1);
 assert.equal((await raw(f,media,'GET','owner',{},undefined,{BUCKET})).status,404);
 assert.equal((await raw(f,media,'GET','other',{},undefined,{BUCKET})).status,200);
 assert.equal((await f.call('/api/dm/summary','GET',undefined,'other')).body.notice_unread,1);
 assert.equal((await patch(f,id,{...edit,request_id:crypto.randomUUID()})).status,409);
 const all=await withdraw(f,id,{scope:'all',reason:'격리 테스트 전체',version:3,request_id:crypto.randomUUID()});
 assert.equal(all.status,200,JSON.stringify(all.body));
 assert.equal(all.body.status,'withdrawn');
 assert.equal((await f.call('/api/dm/summary','GET',undefined,'other')).body.notice_unread,0);
 assert.equal((await raw(f,media,'GET','other',{},undefined,{BUCKET})).status,404);
 assert.equal(f.sql.prepare('SELECT COUNT(*) count FROM welcome_receipts WHERE campaign_id=?').get(id).count,2);
 assert.ok(all.body.history.some(a=>a.details.before&&a.details.after));
});

test('welcome templates are immutable across signup boundaries and disable/re-enable periods',async t=>{
 const f=await fixture(t,operator);
 await activateWelcomeCampaign({DB:f.DB});
 const save=(version,enabled,text)=>f.call(root+'/welcome','PUT',{version,enabled,content:content(text),request_id:crypto.randomUUID()});
 const first=await save(0,true,'첫 버전 {닉네임}');
 assert.equal(first.status,200,JSON.stringify(first.body));
 member(f,'first-signup');
 const disabled=await save(1,false,'중지');
 assert.equal(disabled.status,200);
 member(f,'during-disabled');
 const latest=await save(2,true,'세 번째 버전');
 assert.equal(latest.status,200);
 member(f,'late-signup');
 for(const who of ['first-signup','during-disabled','late-signup']){
  await login(f,who);
  await Promise.all([ensureWelcomeReceipt({DB:f.DB},who),ensureWelcomeReceipt({DB:f.DB},who)]);
 }
 const has=(user)=>f.sql.prepare('SELECT campaign_id FROM welcome_receipts WHERE user_id=?').all(user);
 assert.deepEqual(has('owner').map(r=>r.campaign_id),[WELCOME_CAMPAIGN_ID]);
 assert.equal(has('first-signup').length,1);
 assert.equal((await selectors(f,'first-signup')).body.items[0].rich.title,'첫 버전 first-signup');
 assert.equal(has('during-disabled').length,0);
 assert.equal((await selectors(f,'late-signup')).body.items[0].rich.title,'세 번째 버전');
 assert.equal((await save(1,true,'동시 변경')).status,409);
});

test('client and server agree on safe content and retain versioned draft/roster state without exposing it to members',async t=>{
 const f=await fixture(t,operator);
 const code=f.sql.prepare("SELECT code FROM public_profile_ids WHERE user_id='other'").get().code;
 assert.equal((await f.call(root+'/settings','PUT',{public_id:code})).status,200);
 const valid=content();
 valid.blocks[0].runs.push({text:'<img onerror=alert(1)>',href:'#song/one',bold:true},{sticker:'cat_basic_happy'});
 const render=renderNoticeEntry({id:'campaign:notice',rich:cleanNoticeContent(valid),created:1});
 assert.match(render,/&lt;img onerror/);
 assert.doesNotMatch(render,/<img onerror/);
 assert.throws(()=>cleanNoticeContent({...valid,blocks:[{type:'p',runs:[{text:'bad',href:'javascript:alert(1)'}]}]}));
 assert.throws(()=>cleanNoticeContent({...valid,blocks:[{type:'p',runs:[{sticker:'unregistered'}]}]}));
 const id=crypto.randomUUID(),draft=root+'/drafts/'+id;
 const input={version:0,content:valid,audience:audience('specific',['other']),push:false};
 assert.equal((await f.call(draft,'PUT',input)).status,201);
 assert.equal((await f.call(draft,'PUT',input)).body.version,1);
 assert.equal((await f.call(draft,'GET',undefined,'other')).status,403);
 assert.equal((await f.call(draft,'PUT',{...input,content:content('충돌')})).status,409);
 const roster=await f.call(root+'/rosters','POST',{name:'테스트 명단',ids:['other','other']});
 assert.deepEqual(roster.body.ids,['other']);
 assert.equal((await f.call(root+'/rosters/'+roster.body.id)).body.name,'테스트 명단');
 assert.equal((await f.call(root+'/rosters/'+roster.body.id,'DELETE',{version:1})).status,200);
 const test=await f.call(root+'/test','POST',{request_id:crypto.randomUUID(),content:valid});
 assert.equal(test.status,201,JSON.stringify(test.body));
 assert.equal((await selectors(f,'other')).body.items[0].test,true);
 assert.equal((await selectors(f,'owner')).body.items.length,0);
 assert.equal((await f.call(root)).body.items.length,0);
 assert.equal((await f.call(root+'?test=test')).body.items.length,1);
 assert.equal((await f.call(root+'/test','POST',{request_id:crypto.randomUUID(),content:content(),push:true})).status,409);
});

test('exact public IDs and UUIDs, nickname fragments, exclusions, and the default test account',async t=>{
 const f=await fixture(t,operator),uid=crypto.randomUUID(),removed=crypto.randomUUID(),bot='ai_999901';
 member(f,uid);member(f,removed,'deleted');member(f,bot,'ai_service','ai_bot');
 f.sql.exec('DROP TRIGGER public_profile_ids_immutable');
 const name=f.sql.prepare('UPDATE users SET name=? WHERE id=?');
 name.run('공지 검색 테스트 회원',uid);
 const code=f.sql.prepare('UPDATE public_profile_ids SET code=? WHERE user_id=?');
 code.run('RGT4228',uid);
 f.sql.prepare('INSERT OR IGNORE INTO public_profile_ids(user_id,code) VALUES(?,?)').run(removed,'ZZZ7001');
 f.sql.prepare('INSERT OR IGNORE INTO public_profile_ids(user_id,code) VALUES(?,?)').run(bot,'ZZZ7002');
 code.run('ZZZ7001',removed);code.run('ZZZ7002',bot);
 for(const term of [' rGt  4228 ',uid.toUpperCase(),'검색 테스트']){
  const {body,status}=await f.call(root+'/members?q='+encodeURIComponent(term));
  assert.equal(status,200);
  assert.deepEqual(body.members.map(item=>[item.id,item.public_id]),[[uid,'RGT4228']]);
 }
 assert.deepEqual((await f.call(root+'/members?q='+uid.slice(3,14))).body.members,[]);
 const settings=await f.call(root+'/settings');
 assert.equal(settings.body.test.member.public_id,'RGT4228');
 const resolved=await f.call(root+'/members/resolve','POST',{codes:['rgt4228','RG T4228','ZZZ7001','ZZZ7002','ZZZ7003','!']});
 assert.deepEqual(resolved.body.members.map(item=>item.id),[uid]);
 assert.deepEqual(resolved.body.excluded.map(item=>item.reason),['withdrawn','ai_account','not_found','invalid_format']);
 const query=await f.call(root+'/targets/count','POST',{audience:audience('specific',[uid,uid,bot,removed])});
 assert.equal(query.body.count,1);
 assert.equal((await f.call(root+'/settings','PUT',{public_id:'ZZZ7003'})).status,422);
 assert.equal((await f.call(root+'/settings')).body.test.member.id,uid);
 const message={request_id:crypto.randomUUID(),content:content('환영 테스트 {닉네임}'),purpose:'welcome',audience:audience('all')};
 await login(f,uid);
 const [first,second]=await Promise.all([f.call(root+'/test','POST',message),f.call(root+'/test','POST',message)]);
 assert.equal(first.body.recipients,1);assert.equal(second.body.id,first.body.id);
 assert.equal((await selectors(f,uid)).body.items[0].rich.title,'환영 테스트 공지 검색 테스트 회원');
 assert.equal((await selectors(f,'owner')).body.items.length,0);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM admin_audit WHERE action='notice:test'").get().n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM push_outbox').get().n,0);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM notice_signup_deliveries WHERE state='sent'").get().n,0);
});

test('a confirmed payload is single-use and processes only the original recipients; retry skips successes',async t=>{
 const f=await fixture(t,{...operator,FCM_SERVICE_ACCOUNT:'fixture'});
 for(let i=0;i<135;i++)member(f,'bulk-'+String(i).padStart(3,'0'));
 const body=content('격리된 대량 발송');
 const confirmed=await f.call(root+'/targets','POST',{audience:audience('all'),content:body,push:true});
 assert.equal(confirmed.body.count,137);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM welcome_receipts').get().n,0);
 member(f,'new-after-confirm');
 f.sql.exec("UPDATE users SET provider='deleted' WHERE id='bulk-000'");
 const request={...delivery(body,confirmed.body.id),push:true};
 assert.equal((await post(f,{...request,push:false})).status,409);
 const sent=await post(f,request);
 assert.equal(sent.status,202,JSON.stringify(sent.body));
 const id=sent.body.id;
 assert.equal((await post(f,{...request,request_id:crypto.randomUUID()})).status,409);
 for(let i=0;i<5;i++)await processNoticeBatch({DB:f.DB},id);
 const intermediate=(await f.call(root+'/history/'+id+'/delivery')).body;
 assert.deepEqual([intermediate.requested,intermediate.success,intermediate.failed,intermediate.pending],[137,136,1,0]);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM welcome_receipts WHERE campaign_id=? AND user_id='new-after-confirm'").get(id).n,0);
 const example=f.sql.prepare('SELECT * FROM push_outbox WHERE target=? LIMIT 1').get(id);
 assert.equal(notificationData(example).target,'aifect-official-notice');
 f.sql.exec("UPDATE users SET provider='email' WHERE id='bulk-000'");
 const bodyRetry={revision:intermediate.revision};
 await Promise.all([f.call(root+'/history/'+id+'/retry','POST',bodyRetry),f.call(root+'/history/'+id+'/retry','POST',bodyRetry)]);
 await processNoticeBatch({DB:f.DB},id);
 const done=(await f.call(root+'/history/'+id+'/delivery')).body;
 assert.deepEqual([done.requested,done.success,done.failed,done.pending,done.revision],[137,137,0,0,1]);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM welcome_receipts WHERE campaign_id=?').get(id).n,137);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM push_outbox WHERE target=?').get(id).n,137);
});

test('email registration delivers before inbox startup; write failure is recorded and retries once',async t=>{
 const f=await fixture(t,{...operator,AUTH_PEPPER:'fixture-qa-pepper'}),env={DB:f.DB};
 await activateWelcomeCampaign(env);
 const saved=await f.call(root+'/welcome','PUT',{version:0,enabled:true,content:content('가입 환영 {닉네임}'),request_id:crypto.randomUUID()});
 assert.equal(saved.status,200);
 const source={email:'welcome@example.test',password:'fixture-password-long',name:'가입환영회원'};
 f.sql.exec("CREATE TEMP TRIGGER fail_signup_receipt BEFORE INSERT ON welcome_receipts WHEN NEW.source='automatic' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 const registered=await f.call('/api/auth/register','POST',source,null);
 assert.equal(registered.status,200);
 const {id}=registered.body.user;
 const status=()=>f.sql.prepare('SELECT state,attempts FROM notice_signup_deliveries WHERE user_id=?').get(id);
 assert.deepEqual({...status()},{state:'failed',attempts:1});
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='notice:signup_failed'").get().n,1);
 f.sql.exec('DROP TRIGGER fail_signup_receipt');
 await Promise.all([ensureWelcomeReceipt(env,id),ensureWelcomeReceipt(env,id)]);
 assert.deepEqual({...status()},{state:'sent',attempts:2});
 await login(f,id);
 assert.equal((await selectors(f,id)).body.items[0].rich.title,'가입 환영 가입환영회원');
 assert.equal((await f.call('/api/auth/login','POST',source,null)).status,200);
 assert.equal((await f.call('/api/me','GET',undefined,id)).status,200);
 assert.equal((await selectors(f,id)).body.items.length,1);
});

test('audit failure rolls back every receipt and the same request can complete once',async t=>{
 const f=await fixture(t,operator),plan=await check(f,audience('all'));
 const message=delivery(content(),plan.body.id);
 f.sql.exec("CREATE TEMP TRIGGER notice_test_failure BEFORE INSERT ON admin_audit WHEN NEW.action='notice:send' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
 const original=console.error;
 console.error=()=>{};
 try{assert.equal((await post(f,message)).status,500);}finally{console.error=original;}
 assert.equal(f.sql.prepare("SELECT COUNT(*) count FROM welcome_campaigns WHERE kind='announcement'").get().count,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) count FROM welcome_receipts').get().count,0);
 f.sql.exec('DROP TRIGGER notice_test_failure');
 const recovered=await post(f,message);
 assert.equal(recovered.status,201);
 assert.equal((await post(f,message)).body.recipients,2);
 assert.equal(f.sql.prepare('SELECT COUNT(*) count FROM welcome_receipts').get().count,2);
});

test('simultaneous edit and withdrawal cannot both commit the same version',async t=>{
 const f=await fixture(t,operator),plan=await check(f,audience('all'));
 const sent=await post(f,delivery(content(),plan.body.id)),id=sent.body.id;
 const edit={version:1,request_id:crypto.randomUUID(),content:content('경쟁 상태 변경')};
 const remove={version:1,request_id:crypto.randomUUID(),scope:'all',reason:'경쟁 검증'};
 const result=await Promise.all([patch(f,id,edit),withdraw(f,id,remove)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
 const current=(await f.call(root+'/history/'+id)).body;
 assert.equal(current.version,2);
 assert.equal(current.history.filter(x=>['notice:edit','notice:withdraw'].includes(x.action)).length,1);
 const old=(await f.call('/api/dm/aifect-guide','GET',undefined,'other')).body;
 if(current.status==='sent')assert.match(old.messages[0].body,/경쟁 상태 변경/);
 else assert.equal((await selectors(f,'other')).body.items.length,0);
});
