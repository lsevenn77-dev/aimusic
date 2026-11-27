import {nicknameContext} from './nickname-context.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';

const client=nicknameContext({});
for(const file of ['social-layouts.js','crew-settings.js']){
 vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),client);
}

test('crew settings expose only actions allowed by the current role',()=>{
 const actions=role=>Array.from(client.crewActionsFor(role),a=>a.key);
 assert.deepEqual(actions('owner'),['info','members','applications','audit','leadership']);
 assert.deepEqual(actions('deputy'),['info','members','applications','audit']);
 for(const role of ['manager','operator'])assert.deepEqual(actions(role),['info','applications','audit']);
 for(const role of ['member',undefined])assert.deepEqual(actions(role),[]);
});

test('approval requests and member audit enforce crew state and permissions',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES('friend','other','신청자',0,1); UPDATE producers SET name='운영자',nickname_confirmed=1 WHERE id='producer'; INSERT INTO crews(id,owner_id,name,created,join_policy,recruiting) VALUES('crew','owner','Crew',0,'approval',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0)");
 assert.equal((await f.call('/api/crews/crew/join','POST',undefined,'other')).status,409);
 f.sql.exec("UPDATE crews SET recruiting=1 WHERE id='crew'");
 assert.equal((await f.call('/api/crews/crew/join','POST',undefined,'other')).status,202);
 assert.equal((await f.call('/api/crews/crew/join','POST',undefined,'other')).status,202);
 assert.equal((await f.call('/api/crews/crew?web=1','GET',undefined,'other')).body.application_pending,true);
 assert.equal((await f.call('/api/crews/crew/audit?members=1','GET',undefined,'other')).status,403);
 assert.equal((await f.call('/api/crews/crew/applications/other','POST',{decision:'approve'})).status,200);
 f.sql.exec("INSERT INTO crew_audit(id,crew_id,actor_id,action,detail,created) VALUES('config','crew','owner','settings_changed','',0)");
 const log=(await f.call('/api/crews/crew/audit?members=1')).body.events;
 assert.deepEqual(log.map(event=>[event.action,event.actor_name,event.target_name]),[['application_approved','운영자','신청자']]);
 assert.equal((await f.call('/api/crews/crew?web=1','GET',undefined,'other')).body.application_pending,false);
});

test('info changes exclude locked or absent fields and ignore legacy capacity fields',()=>{
 const form={elements:{}};
 for(const name of ['name','description','interests','join_policy','notice'])form.elements[name]={value:''};
 form.elements.name.readOnly=true;
 form.elements.join_policy.disabled=true;
 form.elements.minimum_level={type:'number',valueAsNumber:1};
 form.elements.member_limit={type:'number',valueAsNumber:6};
 form.elements.recruiting={type:'checkbox',checked:true};
 const before=client.crewInfoValues(form);
 form.elements.name.value='locked';
 form.elements.member_limit.valueAsNumber=0;
 form.elements.recruiting.checked=false;
 assert.deepEqual({...client.changedCrewFields(before,client.crewInfoValues(form))},{recruiting:false});
 assert.equal('name' in before,false);
 assert.equal('join_policy' in before,false);
});

test('member audit includes direct joins and voluntary departures from existing system notices',async t=>{
 const f=await fixture(t);
 await f.call('/api/me/profile','PUT',{name:'Member'},'other');
 const crew=(await f.call('/api/crews','POST',{name:'Audit crew'})).body.crew;
 const path='/api/crews/'+crew.id;
 assert.equal((await f.call(path+'/join','POST',{},'other')).status,200);
 assert.equal((await f.call(path+'/audit?members=1','GET',undefined,'other')).status,403);
 await f.call(path+'/messages','POST',{body:'Member님이 크루에서 나갔습니다.',request_id:crypto.randomUUID()},'other');
 assert.equal((await f.call(path+'/leave','POST',{},'other')).status,200);
 const {events}=(await f.call(path+'/audit?members=1')).body;
 assert.deepEqual(events.map(e=>e.action).sort(),['member_joined','member_left']);
 assert.ok(events.every(e=>e.target_name==='Member'));
});

test('separate management actions persist to the existing API and update rights after transfer',async t=>{
 const f=await fixture(t);
 const profile=(await f.call('/api/me/profile','PUT',{name:'Singer'},'other')).body.profile.id;
 const crew=(await f.call('/api/crews','POST',{name:'Settings crew',interests:'Ballad',notice:'Old notice'})).body.crew;
 const path='/api/crews/'+crew.id;
 const detail=()=>f.call(path);
 const saved=await f.call(path,'PATCH',{description:'Edited',join_policy:'approval',version:crew.version});
 assert.equal(saved.status,200);
 assert.equal((await detail()).body.crew.interests,'Ballad');
 assert.equal((await detail()).body.crew.notice,'Old notice');
 assert.equal((await f.call(path,'PATCH',{notice:'stale',version:crew.version})).status,409);
 const request=()=>f.call(path+'/join','POST',{},'other');
 const decide=decision=>f.call(path+'/applications/other','POST',{decision});
 assert.equal((await request()).status,202);
 assert.equal((await decide('reject')).status,200);
 assert.equal((await request()).status,202);
 assert.equal((await decide('approve')).status,200);
 assert.equal((await f.call(path+'/members/'+profile,'PATCH',{role:'deputy'})).status,200);
 assert.equal((await f.call(path+'/leadership','POST',{user_id:'other'},'other')).status,403);
 assert.equal((await f.call(path+'/leadership','POST',{user_id:'missing'})).status,400);
 assert.equal((await f.call(path+'/leadership','POST',{user_id:'other'})).status,200);
 assert.equal((await detail()).body.membership.role,'member');
 assert.equal((await f.call(path+'/audit')).status,403);
 const events=(await f.call(path+'/audit','GET',null,'other')).body.events;
 for(const action of ['settings_changed','application_rejected','application_approved','role_changed','leadership_transferred'])assert.ok(events.some(e=>e.action===action),action);
 assert.equal((await f.call(path+'/members/producer','DELETE',null,'other')).status,200);
 assert.equal((await detail()).body.membership,null);
});
