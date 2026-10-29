import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
test('artist directory counts all public artists, sorts real follows and paginates without losing identity',async t=>{
 const f=await fixture(t);
 for(let i=0;i<52;i++){
  const id='directory-'+i;
  f.sql.prepare('INSERT INTO artists(id,producer_id,name,created) VALUES(?,?,?,?)').run(id,'producer',id,100+i);
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner',?,'producer',?,'Rock','QA',1,'wav',128,0,'published')").run('track-'+i,id,id);
 }
 f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('private','producer','private',900),('placeholder','producer','없음',900); INSERT INTO follows VALUES('other','artist','directory-0',0)");
 const popular=await f.call('/api/catalog?section=artists&directory=1'),recent=await f.call('/api/catalog?section=artists&directory=1&sort=recent'),next=await f.call('/api/catalog?section=artists&directory=1&offset=50');
 assert.equal(popular.status,200);assert.equal(popular.body.total,53);assert.equal(popular.body.artists.length,50);assert.equal(popular.body.nextOffset,50);
 assert.equal(popular.body.artists[0].id,'directory-0');assert.equal(popular.body.artists[0].followers,1);assert.equal(popular.body.artists[0].producer_name,'QA');
 assert.equal(recent.body.artists[0].id,'directory-51');assert.equal(next.body.artists.length,3);assert.equal(next.body.nextOffset,null);
 assert.equal(new Set([...popular.body.artists,...next.body.artists].map(a=>a.id)).size,53);
 await f.call('/api/artists/directory-0/follow','DELETE',undefined,'other');
 const profile=await f.call('/api/producers/producer?dashboard=1');
 assert.equal(profile.body.artists.find(a=>a.id==='directory-0').followers,0);
 assert.equal((await f.call('/api/catalog?section=artists&directory=1')).body.artists.find(a=>a.id==='directory-0')?.followers,undefined); // moved to later page after unfollow
});

