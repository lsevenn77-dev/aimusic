import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {castingFixture} from './dubbing-casting-fixtures.mjs';

const ownCover={original_id:'one',extension:'wav',bytes:128,own_voice:true,rights:true};

test('cover scene defaults, explicit basic, omitted edits and duet settings remain distinct',async t=>{
 const {call,sql}=await fixture(t);
 sql.exec("UPDATE tracks SET karaoke_at=1,duration=20 WHERE id='one'; INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words,words_state,created,updated) VALUES('one','listening-job','ready',1,'[]','ready',0,0)");
 const created=await call('/api/covers','POST',ownCover,'other');
 assert.equal(created.status,201);
 const track=id=>call('/api/tracks/'+id).then(result=>result.body.track);
 const publish=id=>sql.prepare("UPDATE tracks SET status='published',duration=20 WHERE id=?").run(id);
 const update=(id,body,user='other')=>call('/api/studio/tracks/'+id,'PUT',body,user);
 publish(created.body.id);
 assert.equal((await track(created.body.id)).listening_template,'cover');

 const duet=await call('/api/covers','POST',{...ownCover,cover_mode:'duet',duet_consent:true,listening_template:'turntable-v1',description:'내 한마디'},'other');
 assert.equal(duet.status,201);
 publish(duet.body.id);
 assert.equal((await track(duet.body.id)).duet_joinable,true);
 assert.equal((await call('/api/duets/'+duet.body.id)).body.duet.partner.listening_template,'turntable-v1');

 const participation={...ownCover,cover_mode:'duet',duet_part:'female',duet_parent_id:duet.body.id,description:'참여한 작품'};
 const inherited=await call('/api/covers','POST',participation);
 const basic=await call('/api/covers','POST',{...participation,listening_template:'cover'});
 assert.equal(inherited.status,201);assert.equal(basic.status,201);
 publish(inherited.body.id);publish(basic.body.id);

 assert.equal((await update(duet.body.id,{listening_template:'projector-v1'})).status,200);
 assert.equal((await track(duet.body.id)).description,'내 한마디');
 assert.equal((await track(inherited.body.id)).listening_template,'turntable-v1');
 assert.equal((await update(basic.body.id,{description:'보존할 문장'},'owner')).status,200);
 assert.equal((await track(basic.body.id)).listening_template,'cover');
 assert.equal((await track(basic.body.id)).duet_joinable,false);
 assert.equal((await update(basic.body.id,{listening_template:'projector-v1'})).status,404);
 assert.equal((await update(basic.body.id,{listening_template:null},'owner')).status,400);
});

test('dubbing participation can publish its own scene while retaining the selected cast',async t=>{
 const f=await castingFixture(t);
 await f.base();
 const projectPath=id=>'/api/dubbing/projects/'+id;
 const project=async(id,user)=> (await f.call(projectPath(id),'GET',null,user)).body.project;
 const settings=async(id,user,body)=>{
  const revision=(await project(id,user)).revision;
  const result=await f.call(projectPath(id)+'/listening','PUT',{revision,...body},user);
  assert.equal(result.status,200,JSON.stringify(result.body));
  return result.body.project;
 };
 await settings(f.root,'owner',{listening_template:'turntable-v1',listening_description:'원작 한마디'});
 const first=await f.draft('role_2','actor2');
 assert.equal((await project(first.pid,'actor2')).listening_template,'turntable-v1');
 await settings(f.root,'owner',{listening_template:'projector-v1'});
 const firstSubmission=await f.submit(first.pid,'role_2','actor2',first.rev);
 assert.equal(firstSubmission.status,200,JSON.stringify(firstSubmission.body));
 const invitation=firstSubmission.body.casting.combinationId;
 assert.equal((await project(invitation,'actor3')).listening_template,'turntable-v1');
 const second=await f.draft('role_3','actor3',invitation);
 const selection=await settings(second.pid,'actor3',{listening_template:'cover',listening_description:'참여자의 한마디'});
 assert.equal(selection.listening_template,'cover');
 assert.equal((await f.call(projectPath(second.pid)+'/listening','PUT',{revision:selection.revision,listening_template:'projector-v1'},'actor2')).status,404);
 const published=await f.submit(second.pid,'role_3','actor3',second.rev);
 assert.equal(published.status,200,JSON.stringify(published.body));
 const completed=await project(published.body.casting.combinationId,'actor3');
 assert.notEqual(completed.id,invitation);
 assert.equal(completed.state,'complete');
 assert.equal(completed.listening_template,'cover');
 assert.equal(completed.listening_description,'참여자의 한마디');
 assert.equal(completed.roles.filter(role=>role.claimed).length,3);
 assert.equal((await project(invitation,'actor3')).listening_template,'turntable-v1');
 assert.equal((await project(f.root,'owner')).listening_description,'원작 한마디');
});

test('dubbing message cards keep the actual work and share receipt and respect item visibility',async t=>{
 const f=await castingFixture(t);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','받는 사람',0)");
 const path='/api/dm/other-profile';
 const payload={track_id:f.root,track_kind:'dubbing',request_id:crypto.randomUUID()};
 const first=await f.call(path,'POST',payload);
 assert.equal(first.status,201,JSON.stringify(first.body));
 assert.equal(first.body.message.shared_track.kind,'dubbing');
 assert.equal(first.body.message.shared_track.id,f.root);
 assert.match(first.body.message.body,new RegExp('#dubbing/'+f.root));
 const replay=await f.call(path,'POST',payload);
 assert.equal(replay.body.message.id,first.body.message.id);
 const inbox=await f.call('/api/dm/producer','GET',null,'other');
 assert.equal(inbox.body.messages[0].shared_track.id,f.root);
 f.sql.prepare("UPDATE dubbing_projects SET visibility='private' WHERE id=?").run(f.root);
 assert.equal((await f.call('/api/dm/producer','GET',null,'other')).body.messages[0].shared_track,null);
 assert.equal((await f.call(path,'POST',{...payload,request_id:crypto.randomUUID()})).status,404);
});
