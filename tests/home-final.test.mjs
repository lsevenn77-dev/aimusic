import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({URL,URLSearchParams,Map,console,AifectGenres:{GENRES:[]},window:{},Audio:class{},sessionStorage:{getItem:()=>null},document:{querySelectorAll:()=>[],addEventListener(){}}});
 for(const file of ['icons.js','app.js','browse.js','home.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),c);
 c.track={id:'real-song',title:'긴 제목 <곡> "원곡"',artist:'실제 가수',artist_id:'artist',producer_id:'producer',kind:'original',has_cover:1,cover_version:'real-art',description:'등록된 소개 <설명>',chart_rank:1,previous_rank:3,chart_movement:'up',rank_change:2,chart_likes:123,chart_comments:45,chart_plays:6789};
 return c;
}

test('featured title action preserves real artwork, detail URLs and the locked player control',()=>{
 const c=setup(),html=c.releaseHTML(c.track,{...c.track,id:'next-song'});
 assert.match(html,/home-feature-title-row/);assert.match(html,/home-feature-play[^>]+data-play="real-song"[^>]+data-community-toggle/);
 assert.match(html,/aifect-icon-play/);assert.match(html,/aria-pressed="false"/);
 assert.match(html,/background-image:url/);assert.match(html,/\/media\/real-song\/cover\?artwork=track/);
 assert.equal((html.match(/href="#song\/real-song"/g)||[]).length,3);
 assert.match(html,/다음 곡/);assert.doesNotMatch(html,/지금 듣기|primary-button/);
});
test('home chart preserves all rows, metrics and existing actions with a real rank-one feature',()=>{
 const c=setup();const tracks=Array.from({length:12},(_,i)=>({...c.track,id:'song-'+i,chart_rank:i+1}));
 const html=c.homeChartHTML(tracks);
 assert.equal((html.match(/data-song-row=/g)||[]).length,12);
 for(const metric of ['좋아요','댓글','재생수','이전 순위','변동','듣기'])assert.ok(html.includes(metric));
 assert.match(html,/▲2/);assert.match(html,/home-chart-feature/);assert.match(html,/data-play="song-0"/);assert.match(html,/data-track-menu="song-11"/);
 assert.match(html,/등록된 소개 &lt;설명&gt;/);assert.doesNotMatch(html,/등록된 소개 <설명>/);
 assert.doesNotMatch(c.homeChartHTML([{...c.track,chart_rank:2}]),/home-chart-feature/);
});
test('home card keeps detail, artist, menu, play and full-title accessibility; hidden sections remain available',()=>{
 const c=setup(),html=c.homeCard(c.track);
 assert.match(html,/title="긴 제목 &lt;곡&gt; &quot;원곡&quot;"/);
 for(const action of ['href="#song/real-song"','href="#artist/artist"','data-play="real-song"','data-track-menu="real-song"'])assert.ok(html.includes(action));
 assert.match(html,/artwork=track/);
 assert.match(c.homeHTML(),/id="home-bridge" class="home-bridge" hidden/);
 assert.equal(typeof c.homeSingHTML,'function');
 assert.match(c.homeHTML(),/href="#charts\/releases"|id="home-more"/);
});
