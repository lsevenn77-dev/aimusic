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

test('both artist cards count only credited public songs and visible artist follows',async t=>{
 const f=await fixture(t);
 f.sql.exec(`INSERT INTO artists(id,producer_id,name,created) VALUES('empty','producer','New artist',0);
  UPDATE tracks SET karaoke_at=1 WHERE id='one';
  UPDATE tracks SET kind='cover',original_id='one' WHERE id='two';
  UPDATE tracks SET status='draft' WHERE id='three';
  INSERT INTO follows VALUES('other','artist','artist',0),('other','producer','producer',0);`);
 async function counts(viewer){
  const [list,profile]=await Promise.all([
   f.call('/api/catalog?section=artists&directory=1','GET',undefined,viewer),
   f.call('/api/producers/producer?dashboard=1','GET',undefined,viewer)
  ]);
  assert.equal(list.status,200);assert.equal(profile.status,200);
  const stats=artist=>[artist.track_count,artist.followers];
  assert.deepEqual(stats(profile.body.artists.find(a=>a.id==='empty')),[0,0]);
  const publicCard=list.body.artists.find(a=>a.id==='artist');
  const managed=stats(profile.body.artists.find(a=>a.id==='artist'));
  if(publicCard)assert.deepEqual(stats(publicCard),managed);
  return [!!publicCard,...managed];
 }
 assert.deepEqual(await counts('owner'),[true,1,1]);
 assert.deepEqual(await counts(null),[true,1,1]);
 f.sql.exec("INSERT INTO artist_follow_blocks VALUES('artist','other','fan',0)");
 assert.deepEqual(await counts('owner'),[true,1,0]);
 f.sql.exec("UPDATE tracks SET status='deleted' WHERE id='one'");
 assert.deepEqual(await counts('owner'),[false,0,0]);
});

