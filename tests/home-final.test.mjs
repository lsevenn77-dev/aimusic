import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({URL,URLSearchParams,Map,console,AifectGenres:{GENRES:[]},window:{},Audio:class{},sessionStorage:{getItem:()=>null},document:{querySelectorAll:()=>[],addEventListener(){}}});
 for(const file of ['icons.js','app.js','music-ui.js','browse.js','home.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),c);
 c.track={id:'real-song',title:'긴 제목 <곡> "원곡"',artist:'실제 가수',artist_id:'artist',producer_id:'producer',kind:'original',has_cover:1,cover_version:'real-art',description:'등록된 소개 <설명>',chart_rank:1,previous_rank:3,chart_movement:'up',rank_change:2,chart_likes:123,chart_comments:45,chart_plays:6789};
 return c;
}

test('the static new release has one linked cover and its listening and library actions',()=>{
 const c=setup(),html=c.releaseHTML(c.track);
 assert.match(html,/NEW RELEASE <span>새로 도착한 음악/);
 assert.equal((html.match(/<img /g)||[]).length,1);
 assert.match(html,/\/media\/real-song\/cover\?artwork=track/);
 assert.equal((html.match(/href="#song\/real-song"/g)||[]).length,2);
 for(const action of ['data-play="real-song"', 'data-like="real-song"', 'data-add="real-song"'])assert.ok(html.includes(action));
 assert.doesNotMatch(html,/data-home-slide|home-feature-arrow|home-feature-dots|home-floating/);
 const layout=c.homeHTML();
 assert.match(layout,/home-feature-layout/);
 assert.match(layout,/home-invitation[\s\S]*?href="#karaoke"[\s\S]*?href="#community\/covers"/);
});

test('home chart renders seven ranks while the full chart keeps all rows and actions',()=>{
 const c=setup();const tracks=Array.from({length:12},(_,i)=>({...c.track,id:'song-'+i,chart_rank:i+1}));
 const html=c.homeChartHTML(tracks);
 assert.equal((html.match(/data-song-row=/g)||[]).length,7);
 for(const metric of ['좋아요','댓글','재생수','변동','듣기'])assert.ok(html.includes(metric));
 assert.ok(html.includes('▲</span><span>2'));assert.match(html,/home-chart-feature/);assert.match(html,/data-play="song-0"/);assert.match(html,/data-track-menu="song-6"/);
 assert.doesNotMatch(html,/이전 순위|song-table-previous|data-song-row="song-7"/);
 assert.equal((c.songTable(tracks,{chart:true}).match(/data-song-row=/g)||[]).length,12);
 assert.equal(tracks[0].previous_rank,3);
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

test('rank-one feature follows fresh chart data and preserves artwork, description and routes',()=>{
 const c=setup(),first={...c.track,id:'first',title:'첫 곡'},next={...c.track,id:'next',title:'새 1위',description:'새 소개',cover_version:'new-cover'};
 const before=c.homeChartHTML([first,{...next,chart_rank:2}]);
 const after=c.homeChartHTML([next,{...first,chart_rank:2}]);
 const feature=after.slice(after.indexOf('<aside'));
 assert.match(before.slice(before.indexOf('<aside')),/data-play="first"/);
 assert.match(feature,/data-play="next"/);assert.ok(feature.includes('href="#song/next"'));
 assert.match(feature,/새 1위/);assert.match(feature,/새 소개/);assert.match(feature,/v=new-cover/);
 assert.doesNotMatch(feature,/data-play="first"/);
 for(const [state,symbol] of [['up','▲'],['down','▼'],['same','—']])assert.ok(c.chartMovementHTML({...next,chart_movement:state}).includes(symbol));
});
