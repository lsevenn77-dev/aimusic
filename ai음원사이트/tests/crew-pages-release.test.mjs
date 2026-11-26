import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
async function crew(t,extra={}){
 const f=await fixture(t,extra);
 await f.call('/api/me/profile','PUT',{name:'Member'},'other');
 const r=await f.call('/api/crews','POST',{name:'Local Crew'});assert.equal(r.status,201);
 return {...f,cid:r.body.crew.id,path:'/api/crews/'+r.body.crew.id};
}
test('self, original creator, AI-artist owner and duet participants are denied before all balances and ranking writes',async t=>{
 const f=await crew(t);await f.call(f.path+'/join','POST',{},'other');
 const artist=f.sql.prepare("INSERT INTO artists(id,producer_id,name,created) SELECT 'a2',id,'Other artist',0 FROM producers WHERE user_id='other'").run();
 assert.equal(artist.changes,1);
 f.sql.exec("UPDATE tracks SET karaoke_at=1;INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_open) SELECT 'duet','other','a2',id,'Duet','Rock','x',1,'wav',42,0,'published','cover','one','duet',1 FROM producers WHERE user_id='other';INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id) VALUES('v','owner','a2','producer','v','Rock','x',1,'wav',42,0,'published','cover','one','duet','duet');INSERT INTO free_gift_wallets VALUES('owner',100)");
 for(const [path,text] of [['/api/producers/producer/gifts','본인에게는'],['/api/tracks/one/gifts','내 작품에는'],['/api/tracks/duet/gifts','내 작품에는']]){
  for(const gift_type of ['lollipop','silver-letter']){const r=await f.call(path,'POST',{gift_type,quantity:1,request_id:crypto.randomUUID()});
   assert.equal(r.status,400);assert.ok(r.body.error.includes(text));}
 }
 // The sender only participated, and does not own this track, its original, or its AI artist.
 f.sql.exec("UPDATE tracks SET user_id='other',artist_id='a2',producer_id=(SELECT id FROM producers WHERE user_id='other') WHERE id='one'");
 const blocked=await f.call('/api/tracks/duet/gifts','POST',{gift_type:'silver-letter',request_id:crypto.randomUUID()});assert.match(blocked.body.error,/참여한 작품/);
 f.sql.exec("INSERT INTO gift_inventory(id,user_id,gift_type,gift_name,currency,value,source,request_id,unit,created) VALUES('stock','owner','silver-letter','손편지','silver',2,'purchase','q',1,0)");
 const pid=f.sql.prepare("SELECT id FROM producers WHERE user_id='other'").get().id;
 const inventory=await f.call('/api/me/gift-inventory/stock/send','POST',{profile_id:pid,track_id:'duet',request_id:crypto.randomUUID()});assert.equal(inventory.status,400);
 assert.equal(f.sql.prepare("SELECT used_at FROM gift_inventory").get().used_at,0);
 assert.equal(f.sql.prepare("SELECT balance FROM free_gift_wallets WHERE user_id='owner'").get().balance,100);
 assert.equal(f.sql.prepare("SELECT (SELECT count(*) FROM gifts)+(SELECT count(*) FROM free_gifts) n").get().n,0);
});
test('dubbing context blocks the original creator and cast before personal gold, silver or item delivery',async t=>{
 const f=await crew(t);const pid=f.sql.prepare("SELECT id FROM producers WHERE user_id='other'").get().id;
 f.sql.exec("INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,state,visibility,role_count,duration,write_token,created,updated) VALUES('dub','other','Test','{}','{}','s','h','complete','public',2,30,'t',0,0);INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) VALUES('dub','cast','owner',0)");
 for(const gift_type of ['lollipop','silver-letter']){
  const r=await f.call('/api/producers/'+pid+'/gifts','POST',{gift_type,dubbing_id:'dub',request_id:crypto.randomUUID()});assert.equal(r.status,400);assert.match(r.body.error,/참여한 작품/);
  const owner=await f.call('/api/producers/producer/gifts','POST',{gift_type,dubbing_id:'dub',request_id:crypto.randomUUID()},'other');assert.match(owner.body.error,/내 작품/);
 }
 assert.equal(f.sql.prepare('SELECT (SELECT count(*) FROM free_gifts)+(SELECT count(*) FROM gifts) n').get().n,0);
});

test('approval creates one greeting only after admission on the existing schema',async t=>{
 const f=await crew(t);
 await f.call(f.path,'PATCH',{join_policy:'approval'});
 assert.equal((await f.call(f.path+'/join','POST',{},'other')).status,202);
 assert.equal((await f.call(f.path+'/messages','GET',null,'other')).status,403);
 for(let i=0;i<2;i++)assert.equal((await f.call(f.path+'/applications/other','POST',{decision:'approve'})).status,200);
 const history=(await f.call(f.path+'/messages','GET',null,'other')).body.messages;
 assert.equal(history.filter(m=>m.kind==='system'&&m.user_id==='other'&&m.body.endsWith('인사를 나눠 보세요.')).length,1);
});
