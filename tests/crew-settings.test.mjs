import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';

const client=vm.createContext({});
for(const file of ['social-layouts.js','crew-settings.js']){
 vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),client);
}

test('crew settings expose only actions allowed by the current role',()=>{
 const actions=role=>Array.from(client.crewActionsFor(role),a=>a.key);
 assert.deepEqual(actions('owner'),['info','members','activity','leadership']);
 assert.deepEqual(actions('deputy'),['info','members','activity']);
 for(const role of ['manager','operator'])assert.deepEqual(actions(role),['info','activity']);
 for(const role of ['member',undefined])assert.deepEqual(actions(role),[]);
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
