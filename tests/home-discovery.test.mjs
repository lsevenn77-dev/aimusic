import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';

test('home profiles use real follows, latest public originals, existing partner policy and a ten-person limit',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET created=2; INSERT INTO producers(id,user_id,name,created) VALUES('new-producer','other','신곡 제작자',100); INSERT INTO artists(id,producer_id,name,created) VALUES('new-artist','new-producer','신곡 아티스트',100); INSERT INTO follows VALUES('other','artist','artist',0),('other','producer','producer',0); INSERT INTO creator_partners VALUES('owner','special',1,0,'owner','fixture')");
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES('new-song','other','new-artist','new-producer','새 곡','Rock','QA',1,'wav',128,200,'published')").run();
 for(const kind of ['artist','producer']){
  const popular=await f.call('/api/discovery/profiles?kind='+kind,'GET',undefined,null),latest=await f.call('/api/discovery/profiles?kind='+kind+'&sort=latest','GET',undefined,null);
  assert.equal(popular.status,200);assert.equal(popular.body.profiles[0].id,kind==='artist'?'artist':'producer');
  assert.equal(latest.body.profiles[0].id,kind==='artist'?'new-artist':'new-producer');
  for(const p of popular.body.profiles)for(const forbidden of ['followers','latest_track','user_id','plays','genre','rank'])assert.equal(p[forbidden],undefined);
  if(kind==='producer')assert.equal(popular.body.profiles[0].partner_badge,'공식 파트너');
 }
 assert.equal((await f.call('/api/catalog?section=producers&sort=popular')).body.producers[0].id,'producer');
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='new-song'");
 assert.equal((await f.call('/api/discovery/profiles?kind=producer&sort=latest')).body.profiles.length,1);
 for(let i=0;i<13;i++){
  f.sql.prepare('INSERT INTO artists(id,producer_id,name,created) VALUES(?,?,?,?)').run('a-'+i,'producer','실험 아티스트 '+i,i);
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner',?,'producer','테스트','Rock','QA',1,'wav',128,?,'published')").run('t-'+i,'a-'+i,i);
 }
 assert.equal((await f.call('/api/discovery/profiles?kind=artist')).body.profiles.length,10);
 assert.equal((await f.call('/api/discovery/profiles?kind=unknown')).status,400);
 assert.equal((await f.call('/api/discovery/profiles?kind=artist&sort=unknown')).status,400);
});

test('profile discovery excludes blocked creators, hidden originals and cover-only producers',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");
 for(const kind of ['artist','producer'])assert.deepEqual((await f.call('/api/discovery/profiles?kind='+kind,'GET',undefined,'other')).body.profiles,[]);
 const g=await fixture(t);g.sql.exec("UPDATE tracks SET status='hidden'");
 for(const kind of ['artist','producer'])assert.deepEqual((await g.call('/api/discovery/profiles?kind='+kind)).body.profiles,[]);
});

test('home cards expose only profile identity and playlist metadata, preserving shared avatar behavior elsewhere',()=>{
 const c=vm.createContext({URL,URLSearchParams,Map,console,AifectGenres:{GENRES:[],MOODS:[]},window:{addEventListener(){}},Audio:class{},sessionStorage:{getItem:()=>null},document:{querySelectorAll:()=>[],addEventListener(){}}});
 for(const file of ['icons.js','app.js','home.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),c);
 c.playlistArt=()=>'<div class="collection-art"></div>';
 const p={id:'real-id',name:'긴 이름 <실제>',image_version:'v1',partner_badge:'공식 파트너',followers:999,plays:888,genre:'Rock'};
 const html=c.homeProfileCard(p,'producer');
 assert.match(html,/href="#producer\/real-id"/);assert.match(html,/긴 이름 &lt;실제&gt;/);assert.match(html,/partner-badge/);
 assert.doesNotMatch(html,/999|888|Rock|data-profile-preview|tabindex|rank|팔로워/);
 assert.match(c.avatarImage(p,'producer'),/data-profile-preview/);
 const home=c.homeHTML(),order=['home-library','home-recommended','home-popular','home-more','home-artists','home-discovery','home-producers'];for(let i=1;i<order.length;i++)assert.ok(home.indexOf('id="'+order[i-1]+'"')<home.indexOf('id="'+order[i]+'"'));assert.match(home,/주목할 작곡가/);assert.doesNotMatch(home,/내 플레이리스트|home-own-playlists|주목할만한 작곡가/);
 const playlist=c.homePlaylistCard({id:'real-playlist',name:'선곡',description:'기존 소개',tracks:2,is_public:1,covers:[]});
 for(const text of ['#playlist/real-playlist','data-home-playlist="real-playlist"','기존 소개','2곡 · 공개'])assert.ok(playlist.includes(text));
});
