import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
const endpoint='/api/follow-management?';
const write=(f,tab,action,keys,actor='owner',suffix='')=>f.call(endpoint+'tab='+tab+suffix,'POST',{action,keys},actor);
function load(f,n=0){
 const {sql}=f;sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('p2','other','친구',0); INSERT INTO artists(id,producer_id,name,created) VALUES('a2','producer','둘',0),('foreign','p2','외부',0); INSERT INTO follows VALUES('other','producer','producer',1),('owner','producer','p2',2),('other','artist','artist',3),('other','artist','a2',4);");
 for(let i=0;i<n;i++){const uid='fan'+String(i).padStart(3,'0'),name=['강나','가나다','hello10','Hello2','23','2','!별'][i]||'한별'+i;sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@example.test',name);sql.prepare("INSERT INTO follows VALUES(?,'producer','producer',?)").run(uid,1000+i);}
}
test('full-set Hangul search, literal wildcards, natural name groups, stable paging and select-all beyond a page',async t=>{
 const f=await fixture(t);load(f,520);
 const get=async q=>{const r=await f.call(endpoint+'tab=followers&'+q);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const recent=await get('');assert.equal(recent.items[0].uid,'fan519');assert.equal(recent.total,521);assert.equal(recent.next,50);
 const hangul=await get('q='+encodeURIComponent('ㅎㅂ'));assert.equal(hangul.matched,513);
 const keys=await get('keys=1&q=ㅎㅂ');assert.equal(keys.items.length,500);const remaining=await get('keys=1&q=ㅎㅂ&after='+encodeURIComponent(keys.next));assert.equal(remaining.items.length,13);
 const alpha=await get('q=HELLO&sort=name');assert.deepEqual(alpha.items.map(x=>x.name),['Hello2','hello10']);
 const tail=await get('sort=name&offset=516');assert.deepEqual(tail.items.map(x=>x.name),['Hello2','hello10','2','23','!별']);
 assert.equal((await get('q=*')).matched,0);assert.equal((await get('q=ㄱㄴ')).matched,2);
});
test('owner-only edits, distinct edge direction, missing/replayed targets, public lists and private blocks',async t=>{
 const f=await fixture(t);load(f);
 for(const key of ['followers','following']){const r=await f.call(endpoint+'user=owner&tab='+key,'GET',null,null);assert.equal(r.status,200);assert.equal(r.body.manage,false);}
 assert.equal((await write(f,'followers','remove',['m:other'],'other','&user=owner')).status,403);
 assert.equal((await write(f,'followers','remove',['m:other'],null)).status,401);
 assert.equal((await f.call(endpoint+'tab=blocks&user=owner','GET',null,'other')).status,403);
 let r=await write(f,'followers','remove',['m:other','m:missing']);assert.deepEqual(r.body,{ok:['m:other'],failed:['m:missing']});
 assert.equal((await f.call(endpoint+'tab=following')).body.total,1);
 assert.deepEqual((await write(f,'followers','remove',['m:other'])).body.ok,[]);
 assert.deepEqual((await write(f,'following','unfollow',['m:other'])).body.ok,['m:other']);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM follows WHERE kind='artist'").get().n,2);
});
test('scoped artist moderation denies refollows, posts and likes without affecting personal/other artists; unblock restores no edge',async t=>{
 const f=await fixture(t);load(f);const add='&artist=artist',key='m:other';
 f.sql.exec("INSERT INTO artist_fan_operators(artist_id,user_id,approved_by,created) VALUES('artist','other','owner',0)");
 assert.equal((await f.call(endpoint+'tab=artists')).body.total,1);assert.equal((await write(f,'artists','block',[key])).status,403);
 assert.equal((await write(f,'artists','block',[key],'other',add)).status,403);assert.equal((await write(f,'artists','block',[key],'owner','&artist=foreign')).status,403);
 const post=await f.call('/api/artists/artist/fanpage/posts','POST',{kind:'lounge',body:'keep',request_id:'first'},'other');assert.equal(post.status,201);
 assert.deepEqual((await write(f,'artists','block',[key],'owner',add)).body.ok,[key]);
 for(const [p,m,b] of [['/api/artists/artist/follow','PUT',{}],['/api/artists/artist/fanpage/posts','POST',{body:'blocked',request_id:'no'}],['/api/tracks/one/like','PUT',{}]])assert.equal((await f.call(p,m,b,'other')).status,403);
 assert.equal((await f.call(endpoint+'tab=followers')).body.total,1);assert.equal((await f.call(endpoint+'tab=artists&artist=a2')).body.total,1);assert.equal(f.sql.prepare('SELECT body FROM artist_fan_posts').get().body,'keep');
 const blocks=(await f.call(endpoint+'tab=blocks')).body;assert.equal(blocks.items[0].key,'s:artist:other');
 await write(f,'blocks','unblock',['s:artist:other']);assert.equal((await f.call(endpoint+'tab=artists'+add)).body.total,0);assert.equal((await f.call('/api/artists/artist/follow','PUT',{},'other')).status,200);
});
test('personal block from either API removes both directions; unblock never restores, listener follows survive profile creation',async t=>{
 const f=await fixture(t);await f.call('/api/producers/producer/follow','PUT',{},'other');
 assert.deepEqual((await write(f,'followers','follow',['m:other'])).body.ok,['m:other']);
 assert.equal((await f.call(endpoint+'user=other&tab=followers')).body.items[0].name,'QA');
 const friend=(await f.call('/api/me/profile','PUT',{name:'Listen_2'},'other')).body.profile;assert.equal(f.sql.prepare("SELECT target_id FROM follows WHERE user_id='owner'").get().target_id,friend.id);
 await f.call('/api/blocks/other','PUT');assert.equal((await f.call(endpoint+'tab=blocks')).body.total,1);
 assert.equal((await f.call(endpoint+'user=owner&tab=followers','GET',null,'other')).status,403);
 await write(f,'blocks','unblock',['m:other']);assert.equal(f.sql.prepare('SELECT count(*) n FROM follows').get().n,0);
});
test('a listener blocking a followed artist cannot remove a separate fan moderation record',async t=>{
 const f=await fixture(t);load(f);const r=await write(f,'following','block',['a:artist'],'other');assert.deepEqual(r.body.ok,['a:artist']);
 assert.equal((await f.call(endpoint+'tab=blocks','GET',null,'other')).body.items[0].name,'QA');
 assert.equal((await f.call('/api/artists/artist/follow','PUT',{},'other')).status,403);
 await write(f,'blocks','unblock',['a:artist'],'other');assert.equal((await f.call(endpoint+'tab=artists&artist=artist')).body.total,0);
});

test('list rows distinguish reciprocal personal edges, unrelated artist follows and public profile fields',async t=>{
 const f=await fixture(t);load(f);
 f.sql.exec("UPDATE producers SET bio='소개' WHERE id='p2'");
 const list=async(tab,user='owner')=>(await f.call(endpoint+'user=owner&tab='+tab,'GET',null,user)).body.items;
 const row=(await list('following')).find(r=>r.uid==='other');
 assert.equal(row.bio,'소개');assert.match(row.public_id,/^[A-Z]{3}\d{4}$/);
 assert.equal(row.following,1);assert.equal(row.follows_viewer,1);
 const guest=(await list('following',null)).find(r=>r.uid==='other');
 assert.equal(guest.following,0);assert.equal(guest.follows_viewer,0);
 f.sql.exec("DELETE FROM follows WHERE kind='producer' AND user_id='other'");
 assert.equal((await list('following'))[0].follows_viewer,0);
});
test('unfollowing one displayed member also resolves a legacy member key for the same profile',async t=>{
 const f=await fixture(t);load(f);
 f.sql.exec("INSERT INTO follows VALUES('owner','member','other',5)");
 assert.equal((await f.call(endpoint+'tab=following')).body.total,1);
 assert.deepEqual((await write(f,'following','unfollow',['m:other'])).body.ok,['m:other']);
 assert.equal((await f.call(endpoint+'tab=following')).body.total,0);
 assert.equal((await f.call(endpoint+'tab=followers')).body.total,1);
});

test('oldest sorting uses actual relationship timestamps and counts ignore search filters',async t=>{
 const f=await fixture(t);load(f);
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('sort-a','sort-a@example.test','older',0),('sort-b','sort-b@example.test','newer',0); INSERT INTO follows VALUES('sort-a','producer','producer',10),('sort-b','producer','producer',20)");
 const get=async query=>(await f.call(endpoint+'tab=followers&'+query)).body;
 const old=await get('sort=oldest'),latest=await get('sort=latest');
 assert.deepEqual(old.items.map(r=>r.created),[...old.items.map(r=>r.created)].sort((a,b)=>a-b));
 assert.deepEqual(latest.items.map(r=>r.created),[...latest.items.map(r=>r.created)].sort((a,b)=>b-a));
 const filtered=await get('q=older');assert.equal(filtered.matched,1);assert.equal(filtered.counts.followers,old.total);assert.equal(filtered.counts.following,1);
 await f.call('/api/producers/p2/follow','DELETE',{},'owner');
 assert.equal((await get('')).counts.following,0);
});

test('all three management lists search the complete dataset and retain private unfiltered counts',async t=>{
 const f=await fixture(t);load(f,65);
 f.sql.exec("UPDATE users SET name='하루한국' WHERE id='fan000'");
 const get=async(tab,q='',actor='owner',extra='')=>(await f.call(endpoint+'tab='+tab+'&q='+encodeURIComponent(q)+extra,'GET',null,actor)).body;
 const initial=await get('followers');assert.equal(initial.items.length,50);assert(!initial.items.some(r=>r.uid==='fan000'));assert.equal(initial.counts.blocks,0);
 const found=await get('followers','  하루한국  ');assert.deepEqual(found.items.map(r=>r.name),['하루한국']);assert.equal(found.total,66);assert.equal(found.counts.followers,66);
 assert.equal((await get('followers','HELLO2')).matched,1);assert.equal((await get('followers','없는닉네임')).matched,0);
 await write(f,'followers','follow',['m:fan000']);assert.equal((await get('following','하루한국')).matched,1);
 await write(f,'following','block',['m:fan000']);const blocked=await get('blocks','하루한국');assert.equal(blocked.matched,1);assert.equal(blocked.counts.blocks,1);assert.equal(blocked.counts.followers,65);assert.equal(blocked.counts.following,1);
 assert.equal((await get('blocks','없는닉네임')).counts.blocks,1);
 await write(f,'blocks','unblock',['m:fan000']);const unblocked=await get('blocks');assert.equal(unblocked.total,0);assert.equal(unblocked.counts.blocks,0);assert.equal((await get('followers','하루한국')).matched,0);
 assert(!Object.hasOwn((await get('followers','','other','&user=owner')).counts,'blocks'));
});
