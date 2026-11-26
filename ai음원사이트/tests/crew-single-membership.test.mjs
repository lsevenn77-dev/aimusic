import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';

async function addApplicant(f){
 const uid='applicant';
 f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@example.test','Applicant');
 f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash(uid),uid,Math.floor(Date.now()/1000)+3600);
 const profile=await f.call('/api/me/profile','PUT',{name:'Applicant'},uid);
 assert.equal(profile.status,200,JSON.stringify(profile.body));
 return {uid,profileId:profile.body.profile.id};
}

async function makeCrew(f,user,name,join_policy='open'){
 const result=await f.call('/api/crews','POST',{name,join_policy},user);
 assert.equal(result.status,201,JSON.stringify(result.body));
 return result.body.crew.id;
}

const memberships=(f,uid)=>f.sql.prepare('SELECT crew_id,role FROM crew_members WHERE user_id=?').all(uid);
const membershipIds=(f,uid)=>memberships(f,uid).map(row=>row.crew_id);

test('competing crew creations admit one owner and roll back the losing crew',async t=>{
 const f=await fixture(t);
 const results=await Promise.all([
  f.call('/api/crews','POST',{name:'First competing crew'}),
  f.call('/api/crews','POST',{name:'Second competing crew'})
 ]);
 assert.deepEqual(results.map(result=>result.status).sort(),[201,409]);
 const created=results.find(result=>result.status===201).body.crew.id;
 assert.deepEqual(membershipIds(f,'owner'),[created]);
 assert.equal(memberships(f,'owner')[0].role,'owner');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM crews').get().n,1,'failed creation leaves no orphan crew');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM crew_messages').get().n,1,'failed creation leaves no creation greeting');
 assert.equal((await f.call('/api/crews','POST',{name:'Already joined owner'})).status,409);
});

test('simultaneous joins to different crews create one membership and one greeting',async t=>{
 const f=await fixture(t),applicant=await addApplicant(f);
 const first=await makeCrew(f,'owner','First open crew'),second=await makeCrew(f,'other','Second open crew');
 const results=await Promise.all([first,second].map(cid=>f.call('/api/crews/'+cid+'/join','POST',{},applicant.uid)));
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 const joined=results.find(result=>result.status===200).body.crew.id;
 assert.deepEqual(membershipIds(f,applicant.uid),[joined]);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_messages WHERE user_id=? AND kind='system'").get(applicant.uid).n,1);
 const remaining=first===joined?second:first;
 assert.equal((await f.call('/api/crews/'+remaining+'/join','POST',{},applicant.uid)).status,409);
 assert.equal((await f.call('/api/crews','POST',{name:'Already joined applicant'},applicant.uid)).status,409);
 assert.deepEqual(membershipIds(f,applicant.uid),[joined]);
});

test('approval rejects an applicant who joined elsewhere and succeeds after that membership ends',async t=>{
 const f=await fixture(t),applicant=await addApplicant(f);
 const approval=await makeCrew(f,'owner','Approval crew','approval'),open=await makeCrew(f,'other','Open crew');
 assert.equal((await f.call('/api/crews/'+approval+'/join','POST',{},applicant.uid)).status,202);
 assert.equal((await f.call('/api/crews/'+open+'/join','POST',{},applicant.uid)).status,200);
 const decision='/api/crews/'+approval+'/applications/'+applicant.uid;
 assert.equal((await f.call(decision,'POST',{decision:'approve'})).status,409);
 assert.deepEqual(membershipIds(f,applicant.uid),[open]);
 assert.equal(f.sql.prepare('SELECT state FROM crew_applications WHERE crew_id=? AND user_id=?').get(approval,applicant.uid).state,'pending');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_messages WHERE crew_id=? AND user_id=? AND kind='system'").get(approval,applicant.uid).n,0);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_audit WHERE crew_id=? AND action='application_approved' AND detail=?").get(approval,applicant.uid).n,0);
 assert.equal((await f.call('/api/crews/'+open+'/leave','POST',{},applicant.uid)).status,200);
 assert.deepEqual(membershipIds(f,applicant.uid),[]);
 assert.equal((await f.call(decision,'POST',{decision:'approve'})).status,200);
 assert.deepEqual(membershipIds(f,applicant.uid),[approval]);
});

test('competing approvals in different crews cannot admit the same applicant twice',async t=>{
 const f=await fixture(t),applicant=await addApplicant(f);
 const first=await makeCrew(f,'owner','First approval crew','approval'),second=await makeCrew(f,'other','Second approval crew','approval');
 for(const cid of [first,second])assert.equal((await f.call('/api/crews/'+cid+'/join','POST',{},applicant.uid)).status,202);
 const results=await Promise.all([
  f.call('/api/crews/'+first+'/applications/'+applicant.uid,'POST',{decision:'approve'}),
  f.call('/api/crews/'+second+'/applications/'+applicant.uid,'POST',{decision:'approve'},'other')
 ]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 assert.equal(memberships(f,applicant.uid).length,1);
 const applications=f.sql.prepare('SELECT crew_id,state FROM crew_applications WHERE user_id=?').all(applicant.uid);
 assert.deepEqual(applications.map(application=>application.state).sort(),['approved','pending']);
 assert.deepEqual(membershipIds(f,applicant.uid),applications.filter(application=>application.state==='approved').map(application=>application.crew_id));
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_audit WHERE action='application_approved' AND detail=?").get(applicant.uid).n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_messages WHERE user_id=? AND kind='system'").get(applicant.uid).n,1);
});

test('a valid invitation cannot bypass an existing membership and works after leaving it',async t=>{
 const f=await fixture(t),applicant=await addApplicant(f);
 const invited=await makeCrew(f,'owner','Invitation crew','invite_only'),open=await makeCrew(f,'other','Existing crew');
 const invitation=await f.call('/api/dm/'+applicant.profileId+'/crew-invite','POST',{crew_id:invited,request_id:crypto.randomUUID()});
 assert.equal(invitation.status,201,JSON.stringify(invitation.body));
 assert.deepEqual(membershipIds(f,applicant.uid),[],'an invitation is not an active membership');
 assert.equal((await f.call('/api/crews/'+open+'/join','POST',{},applicant.uid)).status,200);
 assert.equal((await f.call('/api/crews/'+invited+'/join','POST',{},applicant.uid)).status,409);
 assert.deepEqual(membershipIds(f,applicant.uid),[open]);
 assert.equal((await f.call('/api/crews/'+open+'/leave','POST',{},applicant.uid)).status,200);
 assert.equal((await f.call('/api/crews/'+invited+'/join','POST',{},applicant.uid)).status,200);
 assert.deepEqual(membershipIds(f,applicant.uid),[invited]);
});
