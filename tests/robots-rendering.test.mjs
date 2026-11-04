import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';

// REP matching for this ASCII, single User-agent group: longest match wins,
// Allow breaks ties, '*' is a wildcard and final '$' anchors the URL.
function crawlAllowed(text,path){
 const matches=text.split('\n').flatMap(line=>{
  const match=line.match(/^(Allow|Disallow): (.+)$/);if(!match)return [];
  const [,kind,pattern]=match,end=pattern.endsWith('$'),body=end?pattern.slice(0,-1):pattern;
  const regex='^'+body.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(end?'$':'');
  return new RegExp(regex).test(path)?[{allow:kind==='Allow',length:pattern.length}]:[];
 }).sort((a,b)=>b.length-a.length||Number(b.allow)-Number(a.allow));
 return matches[0]?.allow??true;
}

test('served robots allows home rendering resources but not account or playlist actions',async()=>{
 const response=await worker.fetch(new Request('https://aifect.test/robots.txt'),{},{});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/plain/);
 const text=await response.text();assert.match(text,/Sitemap: https:\/\/aifect.co.kr\/sitemap.xml/);
 for(const path of [
  '/','/music','/music/one','/design-system.css','/media/one/cover',
  '/api/catalog','/api/catalog?section=tracks&limit=12',
  '/api/catalog?section=tracks&chart=top&period=week&limit=12',
  '/api/discovery','/api/discovery?',
  '/api/discovery/profiles?kind=artist&sort=popular',
  '/api/discovery/profiles?kind=producer&sort=popular',
  '/api/playlists','/api/playlists?sort=popular','/api/playlists/public-list',
  '/api/playlists/public-list?v=1'
 ])assert.equal(crawlAllowed(text,path),true,path);
 for(const path of [
  '/api/me?state=1','/api/me/profile','/api/admin/stats','/api/auth/google',
  '/api/library','/api/library/playlists/order','/api/follows','/api/gold',
  '/api/catalog-private','/api/catalog/export','/api/discovery/private',
  '/api/discovery/profiles-private','/api/discovery/profiles/manage',
  '/api/playlists/public-list/tracks/one','/api/playlists/public-list/order',
  '/api/playlists/public-list/save','/api/playlists/public-list/image',
  '/internal/jobs/claim'
 ])assert.equal(crawlAllowed(text,path),false,path);
 const head=await worker.fetch(new Request('https://aifect.test/robots.txt',{method:'HEAD'}),{},{});
 assert.equal(head.status,200);assert.equal(await head.text(),'');
});

test('crawlable public APIs still hide unpublished songs and private playlists from anonymous visitors',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO playlists(id,user_id,name,is_public,created) VALUES('public-list','owner','Public',1,0),('private-list','owner','Private',0,1); INSERT INTO playlist_tracks(playlist_id,track_id,created,position) VALUES('public-list','one',0,0),('public-list','hidden',0,1),('private-list','two',0,0)");
 for(const path of ['/api/catalog?section=tracks&limit=12','/api/catalog?section=tracks&chart=top&period=week&limit=12','/api/discovery?']){
  const r=await f.call(path,'GET',undefined,null);assert.equal(r.status,200,path);
  assert.ok(r.body.tracks.every(t=>t.id!=='hidden'),path);
 }
 for(const kind of ['artist','producer']){
  const r=await f.call('/api/discovery/profiles?kind='+kind+'&sort=popular','GET',undefined,null);
  assert.equal(r.status,200);assert.ok(r.body.profiles.length>0);
 }
 const list=await f.call('/api/playlists?sort=popular','GET',undefined,null);
 assert.equal(list.status,200);assert.deepEqual(list.body.playlists.map(p=>p.id),['public-list']);
 const detail=await f.call('/api/playlists/public-list','GET',undefined,null);
 assert.equal(detail.status,200);assert.deepEqual(detail.body.tracks.map(t=>t.id),['one']);
 assert.equal((await f.call('/api/playlists/private-list','GET',undefined,null)).status,404);
 for(const path of ['/api/library','/api/discovery?following=1'])assert.equal((await f.call(path,'GET',undefined,null)).status,401,path);
 assert.equal((await f.call('/api/playlists','POST',{name:'Unauthorized'},null)).status,401);
 assert.equal((await f.call('/api/playlists/public-list','PATCH',{name:'Unauthorized'},null)).status,401);
 assert.equal(f.sql.prepare("SELECT name FROM playlists WHERE id='public-list'").get().name,'Public');
});
