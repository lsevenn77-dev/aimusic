import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('DM recipient search matches public nicknames and IDs and respects both directions of a block',async t=>{
 const f=await fixture(t);
 const add=(id,name,provider='email',type='human')=>{
  f.sql.prepare('INSERT INTO users(id,email,name,created,provider,account_type) VALUES(?,?,?,0,?,?)').run(id,id+'@example.test',name,provider,type);
  f.sql.prepare('INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES(?,?,?,0,1)').run('p-'+id,id,name);
 };
 for(const [id,kind] of [['valid','human'],['out','human'],['in','human'],['ai_987654','ai_bot']])add(id,'별빛 '+id,kind==='human'?'email':'ai_service',kind);
 add('gone','별빛 gone','deleted');
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','out',1),('in','owner',1)");
 const query=term=>'/api/dm/recipients/search?q='+encodeURIComponent(term);
 const code=f.sql.prepare("SELECT code FROM public_profile_ids WHERE user_id='valid'").get().code;
 assert.equal((await f.call(query('별빛'),'GET',undefined,null)).status,401);
 assert.deepEqual((await f.call(query('  '))).body.members,[]);
 for(const term of ['별빛',code.toLowerCase()]){
  const {status,body}=await f.call(query(term));assert.equal(status,200,JSON.stringify(body));
  assert.deepEqual(body.members.map(p=>[p.id,p.nickname,p.public_id]),[['p-valid','별빛 valid',code]]);
 }
 assert.deepEqual((await f.call(query('QA'))).body.members,[]);
 assert.deepEqual((await f.call(query('%_'))).body.members,[]);
 const initial=await f.call('/api/dm/p-valid');assert.equal(initial.status,200);assert.deepEqual(initial.body.messages,[]);
 assert.equal((await f.call('/api/dm/p-in')).status,403);
 assert.equal((await f.call('/api/dm/p-out')).status,403);
});
