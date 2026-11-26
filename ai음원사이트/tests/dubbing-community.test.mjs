import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {sampleScript,options,memoryBucket} from './dubbing-fixtures.mjs';
import worker from '../server/index.js';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const reporting={rightsholder:'권리자 테스트',contact:'rights@example.test',details:'이 작품의 대본 이용 권한을 확인해주세요.',evidence:['https://example.test/evidence'],confirmed:true};
async function setup(t){
 const settings={DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',DUBBING_PAID_API_ENABLED:'true',DUBBING_GOLD_ENABLED:'true',PIKA_API_KEY:'mock-only',TRANSCODER_TOKEN:'local',BUCKET:memoryBucket(),ADMIN_USER_IDS:'other'};
 const f=await fixture(t,settings);return {...f,env:{...settings,DB:f.DB},async create(publish=true){const s=sampleScript();s.title=crypto.randomUUID();const r=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:s});assert.equal(r.status,201,JSON.stringify(r));const p=r.body.project;if(publish){const x=await f.call('/api/dubbing/projects/'+p.id+'/publish','POST',{revision:1,rightsAccepted:true});assert.equal(x.status,200);return x.body.project;}return p;},async report(p){assert.equal((await f.call('/api/dubbing/projects/'+p.id+'/report','POST',reporting,'other')).status,201);return f.sql.prepare('SELECT * FROM track_reports WHERE dubbing_id=?').get(p.id);},review(r,status='removed'){return f.call('/api/admin/dubbing-reports/'+r.id,'PATCH',{version:r.version,status,note:'권리 증빙을 확인한 검토 결과입니다.'},'other');}};
}
test('music migration preserves comments, reactions and existing reports with foreign keys enabled',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const files=readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort();
 for(const file of files.filter(x=>x<'0058'))db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 db.exec(`INSERT INTO users(id,email,name,created) VALUES('u','u@test.test','u',0);INSERT INTO producers(id,user_id,name,created) VALUES('p','u','p',0);INSERT INTO artists(id,producer_id,name,created) VALUES('a','p','a',0);
 INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created) VALUES('t','u','a','p','t','pop','ai',1,'wav',100,0);
 INSERT INTO likes(user_id,track_id,created) VALUES('u','t',0);INSERT INTO comments(id,track_id,user_id,body,created) VALUES('c','t','u','keep',0);
 INSERT INTO comment_likes(user_id,comment_id) VALUES('u','c');INSERT INTO comment_reports(id,comment_id,user_id,reason,body_snapshot,created) VALUES('cr','c','u','spam','keep',0);
 INSERT INTO track_reports(id,track_id,user_id,reason,created) VALUES('tr','t','u','low_quality',0);BEGIN;`);
 db.exec(readFileSync(new URL('../drizzle/0058_stormy_tomas.sql',import.meta.url),'utf8'));db.exec('COMMIT');
 for(const table of ['likes','comments','comment_likes','comment_reports','track_reports'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+table).get().n,1,table);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('SELECT body FROM comments').get().body,'keep');assert.equal(db.prepare('SELECT track_id,dubbing_id FROM track_reports').get().dubbing_id,null);db.close();
});
test('community keeps music state separate and supports idempotent likes and comments',async t=>{
 const f=await setup(t),p=await f.create(),base='/api/dubbing/projects/'+p.id;
 assert.equal((await f.call(base+'/like','PUT',null,null)).status,401);
 await Promise.all([f.call(base+'/like','PUT'),f.call(base+'/like','PUT')]);assert.equal((await f.call(base)).body.project.community.likes,1);
 assert.deepEqual((await f.call('/api/me?state=1')).body.interaction_state.likes,[]);
 const id=crypto.randomUUID(),b={id,body:'<script>그대로 보이는 감상</script>'};await f.call(base+'/comments','POST',b);await f.call(base+'/comments','POST',b);
 const comments=(await f.call(base+'/comments')).body.comments;assert.equal(comments.length,1);assert.equal(comments[0].body,b.body);
 assert.equal((await f.call(base+'/comments','POST',{...b,body:'다른 내용'})).status,409);
 assert.equal((await f.call('/api/tracks/one/comments')).body.comments.length,0);
 assert.equal((await f.call(base+'/comments/'+id,'DELETE',null,'other')).status,403);
 await f.call(base+'/like','DELETE');assert.equal((await f.call(base)).body.project.community.likes,0);
 await f.call(base+'/comments/'+id,'DELETE');assert.equal((await f.call(base+'/comments')).body.comments.length,0);
});
test('private works, blocking and existing comment moderation apply to dubbing',async t=>{
 const f=await setup(t),priv=await f.create(false);assert.equal((await f.call('/api/dubbing/projects/'+priv.id+'/comments','GET',null,'other')).status,404);
 const p=await f.create(),base='/api/dubbing/projects/'+p.id,cid=crypto.randomUUID();await f.call(base+'/comments','POST',{id:cid,body:'감상 내용'});
 assert.equal((await f.call('/api/comments/'+cid+'/report','POST',{reason:'spam'},'other')).status,201);
 const reports=(await f.call('/api/admin/comment-reports','GET',null,'other')).body.reports;assert.equal(reports[0].dubbing_id,p.id);assert.equal(reports[0].title,p.title);
 assert.equal((await f.call('/api/admin/comment-reports/'+reports[0].id,'PATCH',{status:'removed'},'other')).status,200);
 assert.equal((await f.call(base+'/comments')).body.comments.length,0);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");assert.equal((await f.call(base+'/comments','GET',null,'other')).status,404);
});
test('rights reports stay private, takedown blocks every media route and owner can appeal',async t=>{
 const f=await setup(t),p=await f.create(),base='/api/dubbing/projects/'+p.id,r=await f.report(p);
 assert.equal((await f.call(base,'GET',null,null)).status,200,'pending report alone does not remove work');
 assert.doesNotMatch(JSON.stringify((await f.call(base)).body),/rights@example|권리자 테스트|example.test\/evidence/);
 assert.equal((await f.call('/api/admin/dubbing-reports')).status,403);assert.equal((await f.review(r)).status,200);
 assert.equal((await f.call('/api/dubbing/projects')).body.projects.length,0);
 assert.equal((await f.call('/api/dubbing/projects?tab=mine')).body.projects.length,1);
 for(const action of ['', '/background','/final','/recording','/comments'])assert.equal((await f.call(base+action,'GET',null,'other')).status,404,action);
 for(const action of ['/background','/final','/recording'])assert.equal((await f.call(base+action)).status,403,action);
 assert.equal((await f.call(base+'/publish','POST',{revision:p.revision,rightsAccepted:true})).status,403);
 const own=(await f.call(base)).body.project;assert.equal(own.removed,true);assert.equal(own.canEdit,false);
 assert.equal((await f.call(base+'/appeal/'+r.id,'POST',{version:2,details:'정당한 이용 권한이 있습니다.',evidence:['https://example.test/license']})).status,200);
 assert.equal((await f.call(base+'/appeal/'+r.id,'POST',{version:2,details:'재전송',evidence:[]})).status,409);
 assert.equal((await f.call(base,'GET',null,null)).status,404);
 const a=f.sql.prepare('SELECT * FROM track_reports WHERE id=?').get(r.id);assert.equal((await f.review(a,'restored')).status,200);assert.equal((await f.call(base,'GET',null,null)).status,200);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,2);
});
test('reporter deletion scrubs private evidence without undoing an enforced takedown',async t=>{
 const f=await setup(t),p=await f.create(),r=await f.report(p);await f.review(r);
 assert.equal((await f.call('/api/account/delete','POST',{confirmation:'DELETE'},'other')).status,200);
 const retained=f.sql.prepare('SELECT * FROM track_reports WHERE id=?').get(r.id);
 assert.equal(retained.status,'removed');assert.equal(retained.contact,'');assert.equal(retained.rightsholder,'');assert.equal(retained.details,'');assert.equal(retained.evidence_json,'[]');
 assert.equal((await f.call('/api/dubbing/projects/'+p.id,'GET',null,null)).status,404);
});
test('report evidence validation and concurrent admin decisions prevent overwrites',async t=>{
 const f=await setup(t),p=await f.create();for(const evidence of [['javascript:alert(1)'],['https://name:password@example.test'],[]])assert.equal((await f.call('/api/dubbing/projects/'+p.id+'/report','POST',{...reporting,evidence},'other')).status,400);
 const r=await f.report(p),results=await Promise.all([f.review(r),f.review(r,'dismissed')]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,1);
});
test('confirmed repeat violations restrict new work but restoration removes restriction',async t=>{
 const f=await setup(t),reports=[];for(let n=0;n<3;n++){const p=await f.create(),r=await f.report(p);await f.review(r);reports.push(r);}
 assert.equal((await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()})).status,403);
 const r=f.sql.prepare('SELECT * FROM track_reports WHERE id=?').get(reports[0].id);await f.review(r,'restored');assert.equal((await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()})).status,201);
});
test('versioned prices require a fresh quote and preserve old orders, including a price change during checkout',async t=>{
 const f=await setup(t),p=await f.create();f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,status,created,paid_at) VALUES('lot','owner','test',500,0,'paid',0,0)");
 assert.equal((await f.call('/api/admin/dubbing/settings','PUT',{soundGold:75,version:0})).status,403);
 assert.equal((await f.call('/api/admin/dubbing/settings','PUT',{soundGold:75,version:0},'other')).status,200);
 assert.equal((await f.call('/api/admin/dubbing/settings','PUT',{soundGold:80,version:0},'other')).status,409);
 assert.equal((await f.call('/api/dubbing/config')).body.soundPriceGold,75);
 const queue=price=>f.call('/api/dubbing/projects/'+p.id+'/sound','POST',{requestId:crypto.randomUUID(),revision:p.revision,mode:'ai',acceptedGold:price,acceptedChargeGold:price});
 assert.equal((await queue(50)).status,409);
 const batch=f.DB.batch;let race=true;f.DB.batch=async statements=>{if(race){race=false;f.sql.exec("UPDATE dubbing_settings SET sound_gold=80,version=version+1");}return batch(statements);};
 assert.equal((await queue(75)).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_gold_orders').get().n,0);
 assert.equal((await queue(80)).status,202);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,80);
 f.sql.exec('UPDATE dubbing_settings SET sound_gold=100');assert.equal((await queue(100)).body.sound.chargeGold,80);
});
test('takedown cancels paid jobs and refunds once; admin summary exposes costs, never private keys',async t=>{
 const f=await setup(t),p=await f.create();f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,status,created,paid_at) VALUES('lot','owner','test',100,0,'paid',0,0)");
 await f.call('/api/dubbing/projects/'+p.id+'/sound','POST',{requestId:crypto.randomUUID(),revision:p.revision,mode:'ai',acceptedGold:50,acceptedChargeGold:50});
 const job=f.sql.prepare('SELECT * FROM dubbing_sound_jobs').get();
 f.sql.prepare("UPDATE dubbing_sound_assets SET state='completed',provider_id='media_test',billing_json=?").run(JSON.stringify({state:'settled',chargeMicroUsd:3100,estimatedKrw:4.34,fxRate:1400}));
 f.sql.exec("INSERT INTO dubbing_provider_usage(job_id,cue_id,provider_id,state,usage_json,billing_json,created,updated) SELECT a.job_id,a.cue_id,a.provider_id,a.state,a.usage_json,a.billing_json,j.created,a.updated FROM dubbing_sound_assets a JOIN dubbing_sound_jobs j ON j.id=a.job_id");
 const r=await f.report(p);await f.review(r);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,0);
 assert.equal(f.sql.prepare('SELECT state FROM dubbing_sound_jobs').get().state,'failed');
 const d=await f.call('/api/admin/dubbing','GET',null,'other');assert.equal(d.status,200,JSON.stringify(d));assert.equal(d.body.pika.settled_micro_usd,3100);assert.equal(d.body.pika.provider_jobs,1);assert.equal(d.body.jobs[0].can_retry,0);assert.equal(d.body.payments[0].refunded_gold,50);assert.doesNotMatch(JSON.stringify(d.body),/mock-only|output_url|script_key/);
 const res=await worker.fetch(new Request('https://aifect.test/internal/dubbing/claim',{method:'POST',headers:{authorization:'Bearer local'}}),f.env,{waitUntil(){}});assert.equal((await res.json()).job,null);
});
test('final mix retry is authenticated, audited, stale-safe and calls no provider',async t=>{
 const f=await setup(t),p=await f.create();const job=crypto.randomUUID(),at=Math.floor(Date.now()/1000);const sk=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(p.id).script_key;
 for(const [role,uid]of [['role_1','owner'],['role_2','other']])f.sql.prepare("INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,write_token,created,updated) VALUES(?,?,?,?,?,'submitted','test',?,?)").run(crypto.randomUUID(),p.id,role,uid,sk,at,at);
 f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,state,manifest_json,created,updated) VALUES(?,?,?,'failed','{}',?,?)").run(job,p.id,sk,at,at);
 const path='/api/admin/dubbing/final/'+job+'/retry',body={updated:at,note:'입력 확인 후 재합성'};assert.equal((await f.call(path,'POST',body)).status,403);assert.equal((await f.call(path,'POST',body,'other')).status,200);assert.equal((await f.call(path,'POST',body,'other')).status,409);assert.equal(f.sql.prepare('SELECT state FROM dubbing_final_jobs').get().state,'queued');
});
