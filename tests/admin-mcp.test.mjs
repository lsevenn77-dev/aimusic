import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';
import {executeAdminTool} from '../server/admin-mcp-operations.js';
import {BUSINESS} from '../shared/site-info.js';
import {finalizeGiftDiamonds} from '../server/diamonds.js';
import {sampleScript,options,memoryBucket} from './dubbing-fixtures.mjs';
import {hash} from '../server/auth.js';
import {inspectBoxSource} from '../shared/library-backup.js';

const owner='site-scoped-operator-123';
const settings={AIFECT_MCP_ENABLED:'true',AIFECT_MCP_OWNER_ID:owner};
async function setup(t,extra={}) {
 const f=await fixture(t,{ADMIN_USER_IDS:'owner',...extra});
 const rpc=async(method,params={},changes={})=>{
  const headers={'content-type':'application/json','oai-authenticated-user-id':owner,...changes.headers};
  for(const k of Object.keys(headers))if(headers[k]===null)delete headers[k];
  const body=changes.raw??JSON.stringify({jsonrpc:'2.0',id:1,method,params,...changes.envelope});
  const request=new Request('https://aifect.test/mcp',{method:'POST',headers,body});
  const r=await worker.fetch(request,{...settings,...extra,...changes.env,DB:f.DB},{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,headers:r.headers,body:r.status===202?null:await r.json()};
 };
 const tool=(name,args={},changes={})=>rpc('tools/call',{name,arguments:args},changes);
 return {...f,rpc,tool};
}
const output=r=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.result?.isError,false,JSON.stringify(r.body));return r.body.result.structuredContent;};
const grant=(overrides={})=>({user_id:'other',gold:100,reason:'음성 선물 테스트',request_id:'test-request-0000001',...overrides});

test('MCP discovery and every operation require Sites owner, ignoring member/admin cookies, emails and caller roles',async t=>{
 const f=await setup(t);
 for(const method of ['server/discover','initialize','tools/list','tools/call']) {
  const params=method==='tools/call'?{name:'aifect_grant_test_gold',arguments:grant()}:{};
  assert.equal((await f.rpc(method,params,{headers:{'oai-authenticated-user-id':null,Cookie:'aifect_session=owner','oai-authenticated-user-email':'owner@example.test'}})).status,401);
  assert.equal((await f.rpc(method,params,{headers:{'oai-authenticated-user-id':'ordinary-member'}})).status,403);
  assert.equal((await f.rpc(method,params,{env:{AIFECT_MCP_ENABLED:'false'}})).status,403);
  assert.equal((await f.rpc(method,params,{env:{AIFECT_MCP_OWNER_ID:''}})).status,403);
 }
 await assert.rejects(executeAdminTool({DB:f.DB},{id:'sites:'+owner,admin:true},'aifect_grant_test_gold',grant()),/운영자 인증/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM gold_purchases').get().n,0);
 assert.equal((await f.rpc('tools/list',{}, {headers:{Origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await f.call('/api/admin/mcp/identity')).status,403);
});

test('MCP protocols, catalog, schema enforcement, notifications and bounded body',async t=>{
 const f=await setup(t);
 assert.equal((await f.rpc('server/discover')).body.result.supportedVersions[0],'2026-07-28');
 assert.equal((await f.rpc('initialize',{protocolVersion:'2025-06-18'})).body.result.protocolVersion,'2025-06-18');
 assert.equal((await f.rpc('initialize')).body.result.serverInfo.title,'AIFECT 관리자');
 const list=(await f.rpc('tools/list')).body.result.tools;
 assert.equal(list.length,10);assert.ok(list.every(t=>t.inputSchema.additionalProperties===false));
 assert.equal(list.find(t=>t.name==='aifect_grant_test_gold').annotations.readOnlyHint,false);
 assert.equal(list.find(t=>t.name==='aifect_retire_my_boxes').annotations.destructiveHint,true);
 assert.equal((await f.rpc('unknown')).body.error.code,-32601);
 assert.equal((await f.tool('run_sql',{sql:'DROP TABLE users'})).body.error.code,-32602);
 assert.equal((await f.rpc('tools/list',{}, {raw:'['})).body.error.code,-32700);
 assert.equal((await f.rpc('tools/list',{}, {raw:'[]'})).body.error.code,-32600);
 assert.equal((await f.rpc('tools/list',{}, {headers:{'content-type':'text/plain'}})).status,415);
 assert.equal((await f.rpc('tools/list',{}, {raw:JSON.stringify({text:'x'.repeat(20000)})})).status,413);
 assert.equal((await f.rpc('notifications/initialized',{}, {envelope:{id:undefined}})).status,202);
 assert.equal((await f.rpc('tools/call',{name:'aifect_grant_test_gold',arguments:grant()}, {envelope:{id:undefined}})).status,400);
 for(const args of [grant({gold:0}),grant({gold:-1}),grant({gold:1.5}),grant({gold:10001}),grant({user_id:''}),grant({request_id:'x'}),{...grant(),admin:true},{...grant(),__proto__:null,sql:'select'}])assert.equal((await f.tool('aifect_grant_test_gold',args)).body.error.code,-32602);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM gold_purchases').get().n,0);
});

test('My Box retirement requires a matching backup and deletes only old box rows before enabling the new library',async t=>{
 const f=await setup(t);
 f.sql.exec(`INSERT INTO my_boxes(id,user_id,name,created,updated) VALUES('old','owner','보관함',1,1),('empty','other','빈 목록',1,1);
  INSERT INTO my_box_items VALUES('old','original','one',0,1);
  INSERT INTO playlists(id,user_id,name,name_key,is_public,created) VALUES('kept','owner','같은 이름','같은 이름',1,1),('other-list','other','같은 이름','같은 이름',0,1);
  INSERT INTO playlist_tracks VALUES('kept','one',1,0);
  INSERT INTO playlist_saves VALUES('other','kept',1);`);
 const source=await inspectBoxSource((sql,...args)=>f.sql.prepare(sql).get(...args),hash);
 const backup={source_sha256:source.fingerprint,backup_sha256:'b'.repeat(64),...source.counts};
 const name='aifect_retire_my_boxes';
 assert.equal((await f.tool(name,backup,{headers:{'oai-authenticated-user-id':null,Cookie:'aifect_session=owner'}})).status,401);
 assert.equal((await f.tool(name,{...backup,items:2})).body.result.isError,true);
 assert.equal((await f.call('/api/library/unification')).body.ready,false);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM my_boxes').get().n,2);

 f.sql.exec("CREATE TRIGGER interrupt_delete BEFORE DELETE ON my_boxes BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
 assert.equal((await f.tool(name,backup)).body.result.isError,true);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM my_box_items').get().n,1);
 assert.equal((await f.call('/api/library/unification')).body.ready,false);
 f.sql.exec('DROP TRIGGER interrupt_delete');

 const preserved=Object.fromEntries(['tracks','playlists','playlist_tracks','playlist_saves'].map(name=>[name,f.sql.prepare('SELECT * FROM '+name).all()]));
 const result=output(await f.tool(name,backup));
 assert.equal(result.mode,'deleted');
 assert.equal(result.boxes,2);assert.equal(result.items,1);
 assert.deepEqual(output(await f.tool(name,backup)),result);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM my_boxes').get().n,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM my_box_items').get().n,0);
 for(const [name,records] of Object.entries(preserved))assert.deepEqual(f.sql.prepare('SELECT * FROM '+name).all(),records);
 assert.deepEqual((await f.call('/api/library/unification')).body,{ready:true,legacy_boxes_removed:true});
 assert.equal((await f.call('/api/my-boxes','POST',{name:'새 마이박스'})).status,410);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='library:v3:deleted'").get().n,1);
});

test('nickname search is public identity, escaped, bounded and excludes deleted accounts',async t=>{
 const f=await setup(t);
 f.sql.exec("UPDATE producers SET name='코코_100%',nickname_confirmed=1; UPDATE users SET name='숨긴 OAuth 실명',provider='google' WHERE id='owner'; INSERT INTO users(id,email,name,created,provider) VALUES('gone','gone@test.invalid','코코',0,'deleted')");
 const result=output(await f.tool('aifect_search_users',{nickname:'코코_'}));
 assert.deepEqual(result.users.map(x=>x.user_id),['owner']);
 assert.equal(JSON.stringify(result).includes('email'),false);
 assert.deepEqual(output(await f.tool('aifect_search_users',{nickname:'숨긴 OAuth'})).users,[]);
 assert.deepEqual(output(await f.tool('aifect_search_users',{nickname:"' OR 1=1 --"})).users,[]);
 assert.deepEqual(output(await f.tool('aifect_search_users',{nickname:'not_found%'})).users,[]);
 assert.equal((await f.tool('aifect_gold_balance',{user_id:'gone'})).body.result.isError,true);
});

test('test grant retries and simultaneous requests credit once and preserve paid ledgers',async t=>{
 const f=await setup(t);
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,status,created,paid_at) VALUES('paid','other','web',500,5500,'paid',1,1)");
 const old=f.sql.prepare("SELECT * FROM gold_purchases WHERE id='paid'").get();
 const replies=await Promise.all(Array.from({length:6},()=>f.tool('aifect_grant_test_gold',grant())));
 assert.equal(new Set(replies.map(r=>output(r).grant_id)).size,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_test_gold_grants').get().n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,1);
 assert.deepEqual(f.sql.prepare("SELECT * FROM gold_purchases WHERE id='paid'").get(),old);
 assert.deepEqual(output(await f.tool('aifect_gold_balance',{user_id:'other'})),{user:{id:'other',nickname:'other'},balance_gold:600,test_gold:100,other_gold:500,currency:'G'});
 const conflict=await f.tool('aifect_grant_test_gold',grant({gold:101}));assert.equal(conflict.body.result.isError,true);
 assert.match(conflict.body.result.content[0].text,/같은 요청 ID/);
 const audit=output(await f.tool('aifect_audit_history')).records[0];assert.equal(audit.operator_id,'sites:'+owner);assert.equal(JSON.parse(audit.target).revenue_krw,0);
 const history=output(await f.tool('aifect_gold_history',{user_id:'other'}));assert.equal(history.lots.find(x=>x.is_test).price_krw,0);assert.equal(history.events.length,2);
});

test('daily grant cap and audit failure roll back the whole transaction',async t=>{
 const f=await setup(t);
 for(let i=0;i<5;i++)output(await f.tool('aifect_grant_test_gold',grant({gold:10000,request_id:'daily-limit-request-'+i})));
 assert.equal((await f.tool('aifect_grant_test_gold',grant({gold:1}))).body.result.isError,true);
 assert.equal(output(await f.tool('aifect_gold_balance',{user_id:'other'})).balance_gold,50000);
 f.sql.exec('DELETE FROM admin_test_gold_grants');
 f.sql.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON admin_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
 const before=f.sql.prepare('SELECT COUNT(*) n FROM gold_purchases').get().n;
 assert.equal((await f.tool('aifect_grant_test_gold',grant())).body.result.isError,true);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM gold_purchases').get().n,before);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_test_gold_grants').get().n,0);
});

test('test gold can use existing gifts but produces no revenue, payout or diamond entitlement',async t=>{
 const f=await setup(t);
 output(await f.tool('aifect_grant_test_gold',grant()));
 const sent=await f.call('/api/tracks/one/gifts','POST',{gift_type:'lollipop',quantity:1,request_id:'test-gift-request-001'},'other');
 assert.equal(sent.status,201,JSON.stringify(sent));
 const gift=f.sql.prepare('SELECT * FROM gifts').get();
 assert.equal(gift.net_mw+gift.creator_mw+gift.singer_mw+gift.platform_mw,0);
 assert.equal(f.sql.prepare('SELECT net_mw FROM gift_lots').get().net_mw,0);
 const lastMonth='2026-01';f.sql.prepare('UPDATE gifts SET month=?').run(lastMonth);
 await finalizeGiftDiamonds({DB:f.DB},{id:'owner'},lastMonth);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM diamond_ledger').get().n,0);
 const dashboard=await f.call('/api/admin/dashboard');assert.equal(dashboard.body.revenue.gold_gross_krw,0);assert.equal(dashboard.body.revenue.gold_orders,0);
 assert.equal(output(await f.tool('aifect_gold_balance',{user_id:'other'})).balance_gold,99);
 assert.ok(output(await f.tool('aifect_gold_history',{user_id:'other'})).events.some(e=>e.kind==='gift'&&e.delta_gold===-1));
});

test('simultaneous distinct grants cannot cross the daily budget',async t=>{
 const f=await setup(t);
 for(let i=0;i<4;i++)output(await f.tool('aifect_grant_test_gold',grant({gold:10000,request_id:'parallel-budget-'+i})));
 const replies=await Promise.all([0,1].map(i=>f.tool('aifect_grant_test_gold',grant({gold:6000,request_id:'parallel-final-'+i}))));
 assert.equal(replies.filter(r=>!r.body.result.isError).length,1);
 assert.equal(output(await f.tool('aifect_gold_balance',{user_id:'other'})).balance_gold,46000);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,5);
});

test('gold balance excludes revoked purchase lots with the same rules as the existing wallet',async t=>{
 const f=await setup(t);
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,status,created,paid_at) VALUES('revoked','other','web',500,5500,'paid',1,1); INSERT INTO gold_orders(id,user_id,request_id,state,created,expires,updated) VALUES('revoked','other','revoked-order','refund_review',1,1,1)");
 output(await f.tool('aifect_grant_test_gold',grant({gold:10})));
 assert.equal(output(await f.tool('aifect_gold_balance',{user_id:'other'})).balance_gold,10);
 assert.equal((await f.call('/api/gold/balance','GET',null,'other')).body.balance,10);
});

test('email bugs use approved support mailbox, minimal summaries, deduplication and audit',async t=>{
 const f=await setup(t),args={mailbox:BUSINESS.email,message_id:'gmail-message-123',subject:'재생 오류',summary:'Android 브라우저에서 재생이 멈춤',received_at:1};
 const replies=await Promise.all([f.tool('aifect_register_email_bug',args),f.tool('aifect_register_email_bug',args)]);
 assert.equal(output(replies[0]).id,output(replies[1]).id);
 const list=output(await f.tool('aifect_list_reports',{kind:'bug'}));assert.equal(list.reports.length,1);assert.equal(list.automatically_synced,false);
 assert.equal(JSON.stringify(list).includes('gmail-message-123'),false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,1);
 assert.equal((await f.tool('aifect_register_email_bug',{...args,summary:'다른 내용'})).body.result.isError,true);
 assert.equal((await f.tool('aifect_register_email_bug',{...args,mailbox:'other@test.invalid'})).body.result.isError,true);
 assert.equal(output(await f.tool('aifect_admin_stats')).registered_email_bugs,1);
});

test('reported songs use version checks and reversible moderation without deleting audio or payment data',async t=>{
 const f=await setup(t);
 assert.equal((await f.call('/api/tracks/one/report','POST',{reason:'low_quality',details:'소리 오류'},'other')).status,201);
 const r=output(await f.tool('aifect_list_reports',{kind:'track'})).reports[0];
 const args={kind:'track',report_id:r.id,decision:'removed',expected_status:'pending',version:r.version,reason:'운영자 음질 검토'};
 output(await f.tool('aifect_moderate_report',args));
 assert.equal(f.sql.prepare("SELECT status FROM tracks WHERE id='one'").get().status,'removed');
 assert.equal((await f.tool('aifect_moderate_report',args)).body.result.isError,true);
 output(await f.tool('aifect_moderate_report',{...args,decision:'restored',expected_status:'removed',version:2}));
 assert.equal(f.sql.prepare("SELECT status FROM tracks WHERE id='one'").get().status,'published');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,2);
});

test('comment moderation is audited and competing decisions cannot overwrite each other',async t=>{
 const f=await setup(t);
 f.sql.exec("INSERT INTO comments(id,track_id,user_id,body,created) VALUES('comment','one','owner','bad text',1); INSERT INTO comment_reports(id,comment_id,user_id,reason,details,body_snapshot,created) VALUES('report','comment','other','abuse','','bad text',1)");
 const args={kind:'comment',report_id:'report',decision:'removed',expected_status:'pending',reason:'사용자 신고 검토'};
 const replies=await Promise.all([f.tool('aifect_moderate_report',args),f.tool('aifect_moderate_report',{...args,decision:'dismissed'})]);
 assert.equal(replies.filter(r=>!r.body.result.isError).length,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,1);
 const r=output(await f.tool('aifect_list_reports',{kind:'comment',status:'all'})).reports[0];
 if(r.status==='removed')assert.equal(f.sql.prepare("SELECT body FROM comments WHERE id='comment'").get().body,'');
});

test('dubbing moderation uses existing rights workflow and explicit version',async t=>{
 const f=await setup(t,{DUBBING_ENABLED:'true',BUCKET:memoryBucket()}),pid=crypto.randomUUID();
 assert.equal((await f.call('/api/dubbing/projects','POST',{id:pid,options,script:sampleScript()})).status,201);
 f.sql.prepare("INSERT INTO track_reports(id,dubbing_id,user_id,reason,details,created) VALUES('dubbing-report',?,'other','copyright','권리 신고',1)").run(pid);
 const report=output(await f.tool('aifect_list_reports',{kind:'dubbing'})).reports[0];
 output(await f.tool('aifect_moderate_report',{kind:'dubbing',report_id:report.id,decision:'removed',expected_status:'pending',version:report.version,reason:'권리 증빙 검토'}));
 assert.equal(f.sql.prepare("SELECT status FROM track_reports WHERE id='dubbing-report'").get().status,'removed');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,1);
});

test('authentication changes take effect on every request and internal errors never expose SQL or secrets',async t=>{
 const f=await setup(t);
 assert.equal((await f.rpc('tools/list')).status,200);
 assert.equal((await f.rpc('tools/list',{}, {env:{AIFECT_MCP_OWNER_ID:'different-operator'}})).status,403);
 f.sql.exec("CREATE TRIGGER fail_grant BEFORE INSERT ON gold_purchases BEGIN SELECT RAISE(ABORT,'private-secret-token SELECT hidden'); END");
 const failed=await f.tool('aifect_grant_test_gold',grant());
 assert.equal(failed.body.result.isError,true);assert.doesNotMatch(JSON.stringify(failed.body),/private-secret|SELECT hidden/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,0);
});
