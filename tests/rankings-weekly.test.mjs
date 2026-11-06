import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {communityPeriod} from '../server/community-rankings.js';
import {rankingAudit} from '../server/ranking-audit.js';

function cover(f,id,mode='solo',parent=null,open=0){
 f.sql.prepare(`INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id,duet_open,duration)
 VALUES(?,'owner','artist','producer',?,'Rock','',1,'wav',128,0,'published','cover','one',?,?,?,100)`).run(id,id,mode,parent,open);
}
test('completed public solo/duet eligibility, boundary events, owner exclusions and raw audit agree without writes',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=100");
 cover(f,'solo');cover(f,'invitation','duet',null,1);cover(f,'duet','duet','invitation');cover(f,'still-open','duet','invitation',1);
 const {from,until}=communityPeriod(),at=from+100;
 for(const id of ['solo','invitation','duet','still-open'])f.sql.prepare("INSERT INTO listens(id,track_id,listener,user_id,started,seconds,day,qualified) VALUES(?,?,'other','other',?,100,'2026-11-02',1)").run(id,id,at);
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('owner','solo',?)").run(at);
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('other','solo',?)").run(until);
 const solo=(await f.call('/api/community/rankings?category=work&workKind=solo')).body;
 assert.deepEqual(solo.rows.map(r=>r.id),['solo']);assert.equal(solo.rows[0].listeners,1);assert.equal(solo.rows[0].reactions,0);
 assert.equal(solo.rows[0].image_url,'/assets/aifect-mark.svg');
 const duet=(await f.call('/api/community/rankings?category=work&workKind=duet')).body;assert.deepEqual(duet.rows.map(r=>r.id),['duet']);
 const before=f.sql.prepare('SELECT total_changes() n').get().n,audit=await rankingAudit({DB:f.DB},at);
 assert.equal(audit.published_cover_count,4);assert.equal(audit.periods[0].candidate_count,2);assert.equal(audit.periods[0].ranked_count,2);
 assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);assert.doesNotMatch(JSON.stringify(audit),/user_id|listener"|email/);
 f.sql.exec("UPDATE listens SET user_id='owner'");
 assert.deepEqual((await f.call('/api/community/rankings?category=work')).body.rows,[]);
 const self=await rankingAudit({DB:f.DB},at);assert.equal(self.periods[0].works.find(r=>r.id==='solo').self_qualified_events,1);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 assert.deepEqual((await f.call('/api/community/rankings?category=work&workKind=duet')).body.rows,[]);
});
test('weekly normalization and pagination preserve complete-population scores and deterministic ordering',async t=>{
 const f=await fixture(t),at=Math.floor(Date.now()/1000);f.sql.exec("UPDATE tracks SET karaoke_at=1");
 for(let i=0;i<43;i++){const id='cover-'+String(i).padStart(2,'0');cover(f,id);f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('other',?,?)").run(id,at);}
 const path='/api/community/rankings?category=work&period=month',all=(await f.call(path)).body;
 assert.equal(all.period,'week');assert.equal(all.from,communityPeriod().from);assert.equal(all.rows.length,43);
 const pages=[];let offset=0;
 do{const d=(await f.call(path+'&limit=20&offset='+offset)).body;assert.equal(d.total,43);pages.push(...d.rows);offset=d.next_offset;}while(offset!==null);
 assert.deepEqual(pages,all.rows);assert.equal((await f.call('/api/community/rankings')).body.rows.length,0);
 for(const invalid of ['limit=0','limit=101','offset=-1','limit=1.5'])assert.equal((await f.call(path+'&'+invalid)).status,400);
});
test('server artwork uses track cover/original fallback and never a performer portrait',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1,has_cover=1,cover_version='original-art' WHERE id='one'");cover(f,'solo');
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('other','solo',?)").run(Math.floor(Date.now()/1000));
 const get=async()=>(await f.call('/api/community/rankings?category=work')).body.rows[0];
 assert.equal((await get()).image_url,'/media/one/cover?artwork=track&v=original-art');
 f.sql.exec("UPDATE tracks SET has_cover=1,cover_version='own-art' WHERE id='solo'");assert.equal((await get()).image_url,'/media/solo/cover?artwork=track&v=own-art');
});
function ui(){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const c=nicknameContext({URLSearchParams,esc,communityNavigation:()=>'<nav>unchanged navigation</nav>'});vm.runInContext(readFileSync(new URL('../dist/community-v3.js',import.meta.url),'utf8'),c);return c;
}
test('ranking UI canonical links, minimal content, podium counts and errors',async()=>{
 const c=ui(),rows=Array.from({length:21},(_,i)=>({id:String(i),name:'A very long <name>'+i,href:'#artist/'+i,image_url:'/assets/default-avatar.svg',score:987,listeners:456,detail:'secret detail'}));
 const calls=[],read=async path=>{calls.push(path);return {rows:rows.slice(0,20),next_offset:20,from:1,until:2,updated_at:3};};
 const v=await c.communityRankingV3('community/rankings?period=month',read);
 assert.match(calls[0],/category=aiArtist&period=week.*limit=20/);assert.doesNotMatch(v.html,/987|456|secret detail|관계 랭킹|월간|<name>/);
 assert.equal((v.html.match(/class="ranking-place /g)||[]).length,3);assert.equal((v.html.match(/class="ranking-row"/g)||[]).length,17);
 assert.ok(v.html.indexOf('ranking-info')>v.html.indexOf('data-ranking-more'));assert.match(v.html,/<details class="ranking-info">/);
 assert.equal(c.communityRankingOptions('community/rankings?category=relationship').category,'aiArtist');
 assert.equal(c.communityRankingOptions('community/rankings?category=work&workKind=dubbing').category,'dubbing');
 for(const n of [0,1,2]){const html=c.communityRankingResults(rows.slice(0,n));assert.equal((html.match(/class="ranking-place /g)||[]).length,n);if(n===0)assert.match(html,/아직 집계된 순위/);}
 for(const category of ['aiArtist','crew','dubbing'])assert.doesNotMatch((await c.communityRankingV3('community/rankings?category='+category,read)).html,/class="ranking-kinds"/);
 const work=await c.communityRankingV3('community/rankings?category=work',read);assert.match(work.html,/class="ranking-kinds"/);
 const error=await c.communityRankingV3('community/rankings',async()=>{throw new Error('offline');});assert.match(error.html,/data-ranking-retry/);assert.doesNotMatch(error.html,/아직 집계된/);
});
