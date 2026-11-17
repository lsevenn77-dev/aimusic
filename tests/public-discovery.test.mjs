import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {publicDiscoveryRoute} from '../server/public-discovery.js';

const read=(env,query='',partial=false,method='GET')=>publicDiscoveryRoute(new Request('https://aifect.test/music'+query,{
 method,headers:partial?{'X-AIFECT-Results':'1'}:{}
}),env,'/music');

test('catalogue uses public credits, honours legacy cover links and excludes hidden duet chains',async t=>{
 const {DB,sql}=await fixture(t);
 sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; UPDATE users SET provider='google',name='private OAuth name' WHERE id='other'; INSERT INTO producers(id,user_id,name,nickname_confirmed,created) VALUES('singer','other','private OAuth name',0,0)");
 const cover=sql.prepare(`INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id)
 VALUES(?,'other','artist','singer',?,'Rock','QA',1,'wav',42,2,'published','cover','one',?,?)`);
 cover.run('solo','솔로 검색','solo',null);
 cover.run('first','듀엣 모집','duet',null);
 cover.run('second','듀엣 완성','duet','first');
 const result=async query=>(await (await read({DB},query,true)).json()).html;
 assert.match(await result('?kind=solo'),/href="\/music\/solo"/);
 assert.doesNotMatch(await result('?kind=solo'),/href="\/music\/first"/);
 const duet=await result('?kind=duet');
 assert.match(duet,/완성 듀엣/);assert.doesNotMatch(duet,/href="\/music\/solo"|리스너 other|private OAuth name/);
 assert.match(await result('?kind=cover'),/href="\/music\/solo"/);
 assert.match(await result('?q=private'),/조건에 맞는 공개 음악이 없습니다/);
 sql.exec("UPDATE tracks SET status='hidden' WHERE id='first'");
 assert.match(await result('?kind=duet'),/조건에 맞는 공개 음악이 없습니다/);
 sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 assert.match(await result('?kind=cover'),/조건에 맞는 공개 음악이 없습니다/);
});

test('popular order counts qualified listeners per day and full and partial pages agree',async t=>{
 const {DB,sql}=await fixture(t),env={DB};
 const listen=sql.prepare('INSERT INTO listens(id,track_id,listener,started,day,qualified) VALUES(?,?,?,0,1,?)');
 for(let i=0;i<4;i++)listen.run('one'+i,'one','same',1);
 for(let i=0;i<2;i++)listen.run('two'+i,'two','unique'+i,1);
 for(let i=0;i<5;i++)listen.run('three'+i,'three','unique'+i,0);
 const query='?sort=popular',data=await (await read(env,query,true)).json();
 assert.equal([...data.html.matchAll(/class="track-link" href="\/music\/([^"]+)"/g)].map(x=>x[1]).join(','),'two,one,three');
 const full=await read(env,query);
 assert.match(full.headers.get('vary'),/X-AIFECT-Results/);
 assert.ok((await full.text()).includes(data.html));
 assert.ok(data.noindex);
 const head=await read(env,query,true,'HEAD');
 assert.equal(head.status,200);assert.equal(await head.text(),'');
});

test('an unavailable catalogue can be retried and never looks like an empty successful search',async()=>{
 const DB={prepare(){throw Error('test storage unavailable');}};
 for(const partial of [false,true]){
  const response=await read({DB},'?q=hello',partial);
  assert.equal(response.status,503);
  assert.match(await response.text(),/다시 시도/);
 }
});
