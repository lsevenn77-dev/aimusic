import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {profileDiscovery} from '../server/profile-discovery.js';
import {partnerState} from '../server/diamonds.js';
import {partnerBadgeUsers} from '../server/partner-badges.js';
import {PARTNER_MIN_KRW} from '../shared/gifts.js';

test('ten public creators use two queries while preserving every partner eligibility boundary',async t=>{
 const f=await fixture(t),threshold=PARTNER_MIN_KRW*1000;
 const cases=[
  {id:'special',basis:'special',active:1,badge:true},
  {id:'earned',basis:'earned',active:1,eligible:threshold,badge:true},
  {id:'below',basis:'earned',active:1,eligible:threshold-1},
  {id:'inactive',basis:'special',active:0,eligible:threshold},
  {id:'unapproved',eligible:threshold},
  {id:'legacy',basis:'earned',active:1,legacy:PARTNER_MIN_KRW,badge:true},
  {id:'linked',basis:'earned',active:1,eligible:threshold-1,legacy:PARTNER_MIN_KRW,linked:true},
  {id:'negative',basis:'earned',active:1,eligible:-1,legacy:PARTNER_MIN_KRW},
  {id:'empty',basis:'earned',active:1},
  {id:'combined',basis:'earned',active:1,eligible:threshold-1000,legacy:1,badge:true}
 ];
 f.sql.exec("UPDATE tracks SET status='hidden'");
 for(const c of cases){
  f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(c.id,c.id+'@example.test',c.id);
  f.sql.prepare('INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)').run('p-'+c.id,c.id,c.id);
  f.sql.prepare("INSERT INTO tracks(id,user_id,producer_id,artist_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,?,?,'artist','Fixture','Rock','QA',1,'wav',128,0,'published')").run('t-'+c.id,c.id,'p-'+c.id);
  if(c.basis)f.sql.prepare('INSERT INTO creator_partners VALUES(?,?,?,0,?,?)').run(c.id,c.basis,c.active,'owner','fixture');
  if(c.eligible)f.sql.prepare("INSERT INTO diamond_ledger(id,user_id,kind,source_key,amount_mw,eligible_mw,period,created) VALUES(?,?,'stream','fixture',?,?,'2020-01',0)").run('d-'+c.id,c.id,c.eligible,c.eligible);
  if(c.legacy)f.sql.prepare("INSERT INTO payout_statements(id,profile_id,user_id,period,from_month,gross_krw,net_krw,status,due_on,created) VALUES(?,?,?,'2020-01','2020-01',?,?,'paid','2020-02-10',0)").run('s-'+c.id,'p-'+c.id,c.id,c.legacy,c.legacy);
  if(c.linked)f.sql.prepare("INSERT INTO diamond_ledger(id,user_id,kind,source_key,amount_mw,period,created) VALUES(?,?,'payout','fixture-payout',-1,'2020-01',0)").run('s-'+c.id,c.id);
 }
 let queries=0;
 const env={DB:{prepare(sql){queries++;return f.DB.prepare(sql);}}};
 const profiles=await profileDiscovery(env,'producer');
 assert.equal(profiles.length,10);assert.equal(queries,2,'query count must not grow with the number of cards');
 for(const c of cases){
  const profile=profiles.find(p=>p.id==='p-'+c.id),expected=c.badge?'공식 파트너':null;
  assert.equal(profile.partner_badge,expected,c.id);
  assert.equal(profile.partner_badge,(await partnerState({DB:f.DB},c.id)).badge,c.id+' must agree with the unchanged wallet policy');
  assert.deepEqual(Object.keys(profile).sort(),['id','image_version','name','partner_badge']);
 }
 queries=0;assert.equal((await profileDiscovery(env,'producer','popular',1)).length,1);assert.equal(queries,2);
 queries=0;assert.equal((await profileDiscovery(env,'artist')).length,1);assert.equal(queries,1);
 f.sql.exec("UPDATE tracks SET status='hidden'");queries=0;
 assert.deepEqual(await profileDiscovery(env,'producer'),[]);assert.equal(queries,1,'empty lists must not issue a badge query');
});

test('the hundred-creator directory stays within D1 bound-parameter limits',async t=>{
 const f=await fixture(t);let queries=0;
 const env={DB:{prepare(sql){queries++;return {bind(...args){assert.ok(args.length<=100);return f.DB.prepare(sql).bind(...args);}};}}};
 f.sql.exec("INSERT INTO creator_partners VALUES('owner','special',1,0,'owner','fixture')");
 const ids=['owner',...Array.from({length:99},(_,i)=>'missing-'+i)];
 assert.deepEqual([...await partnerBadgeUsers(env,ids)],['owner']);assert.equal(queries,1);
});
