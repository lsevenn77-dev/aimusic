import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const samples=JSON.parse(read('tests/fixtures/song-detail-descriptions.json'));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const track={id:'song',title:'곡 제목',kind:'original',user_id:'other',producer_id:'person',producer:'제작자',artist_id:'artist',artist:'아티스트',has_ai_artist:true,karaoke_ready:true,lyrics_mode:'synced',genre:'Pop',duration:120,likes:12,plays:20,comments:2,description:''};
function header(user='owner',active=false){
 const c=vm.createContext({me:user?{id:user}:null,esc,number:n=>Number(n).toLocaleString('en-US'),time:()=> '2:00',liked:()=>active,hasArtist:t=>t.kind!=='cover'&&!!t.has_ai_artist,credits:t=>'<a href="#artist/'+esc(t.artist_id)+'">'+esc(t.artist)+'</a>',cover:t=>'<div class="album-art">'+esc(t.title)+'</div>',songReleaseDateHTML:()=>''});
 vm.runInContext(read('dist/icons.js'),c);
 const views=read('dist/views.js');
 vm.runInContext(views.slice(views.indexOf('function songCredits('),views.indexOf('function coversPanelHTML(')),c);
 c.authConfig={};
 c.songReleaseDateHTML=()=>'<p class="song-release-date">발매일</p>';
 vm.runInContext(views.slice(views.indexOf('function trackModerationToolsHTML('),views.indexOf('function trackReviewHTML(')),c);
 vm.runInContext(read('dist/song-detail.js'),c);return c;
}
test('saved descriptions display without guessing authorship from content',()=>{
 const c=header();assert.equal(samples.legacy_auto.length,13);
 for(const t of samples.legacy_auto){
  assert.equal(c.songCreatorDescription(t),t.description,t.title);
  assert.equal(c.songCreatorDescription({description:t.description.replaceAll('\\n','\n')}),t.description.replaceAll('\\n','\n'),t.title);
  assert.ok(c.songDescriptionHTML(t).includes(esc(t.description)));
 }
});
test('creator text, paragraphs and amended descriptions stay intact and HTML-safe',()=>{
 const c=header();
 for(const t of samples.creator_samples)assert.equal(c.songCreatorDescription(t),t.description);
 const text='첫 줄\n둘째 줄\n\n다음 문단 <script>alert(1)</script> & "인용"';
 const html=c.songDescriptionHTML({description:text});
 assert.match(html,/첫 줄\n둘째 줄\n\n다음 문단/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 const edited=samples.legacy_auto[0].description+'\n제작자가 새로 수정한 소개입니다.';
 assert.equal(c.songCreatorDescription({description:edited}),edited,'Similar prose is not guessed to be automatic');
});
test('empty introductions do not reserve a card and saved text stays intact',()=>{
 const c=header();
 for(const description of [undefined,null,'',' \n\t '])assert.equal(c.songDescriptionHTML({description}),'');
 for(const description of ['none','없음','음악을 듣고 감상을 나눠보세요.','  첫 줄\n둘째 줄  '])assert.equal(c.songCreatorDescription({description}),description);
 assert.doesNotMatch(c.songDetailHeaderHTML(track),/song-description|음악을 듣고 감상을/);
});

test('one introduction follows the date and precedes actions; metrics and report share a row',()=>{
 const c=header(),html=c.songDetailHeaderHTML({...track,description:'제작자 소개'});
 const order=['song-release-date','song-introduction','song-actions','song-engagement','song-metrics','data-report-track'];
 let previous=-1;for(const key of order){const at=html.indexOf(key);assert.ok(at>previous,key);previous=at;}
 assert.equal(html.match(/class="song-introduction"/g).length,1);
 assert.match(html,/<h3>곡 소개<\/h3>/);assert.match(html,/aria-label="재생 20회"/);assert.match(html,/aria-label="댓글 2개"/);assert.match(html,/aifect-icon-plays/);assert.match(html,/aifect-icon-comment/);
 assert.doesNotMatch(header(null).songDetailHeaderHTML(track),/data-report-track/);
 assert.doesNotMatch(header('other').songDetailHeaderHTML(track),/data-report-track/);
});
test('song actions retain delegates, links, active state and count with the lyrics entry last',()=>{
 const c=header('owner',true),html=c.songDetailActionsHTML(track);
 const order=['data-play="song"','href="#sing/song"','data-like="song"','data-add="song"','data-gift="song"','id="lyrics-expand"'];let previous=-1;
 for(const key of order){const i=html.indexOf(key);assert.ok(i>previous,key);previous=i;}
 assert.match(html,/aria-pressed="true"/);assert.match(html,/data-like-count>12</);
 for(const key of ['play','sing','heart','plus','gift','lyrics'])assert.ok(html.includes('song-action-icon-'+key));
 assert.match(html,/<span>선물<\/span>/);assert.doesNotMatch(html,/선물하기|audio-play-icon/);
 const lyrics=html.match(/<button\b[^>]*\bid="lyrics-expand"[^>]*>/)?.[0];
 assert.ok(lyrics);assert.match(lyrics,/data-track="song"/);assert.match(lyrics,/aria-controls="expanded-song-lyrics"/);assert.match(lyrics,/aria-expanded="false"/);assert.doesNotMatch(lyrics,/\bdisabled\b/);
 assert.match(html,/<span>가사<\/span>/);assert.equal((html.match(/id="lyrics-expand"/g)||[]).length,1);
});
test('guest listening, unavailable karaoke, self-gifts and duet ownership remain gated',()=>{
 const guest=header(null),own=header('other'),other=header();
 assert.match(guest.songDetailActionsHTML(track),/data-play="song"[^>]*>.*<span>노래 듣기<\/span>/);
 assert.doesNotMatch(other.songDetailActionsHTML({...track,karaoke_ready:false}),/노래 부르기|#sing/);
 assert.doesNotMatch(own.songDetailActionsHTML(track),/data-gift=/);
 const invitation={...track,kind:'cover',id:'invitation',original_id:'original',cover_mode:'duet',duet_open:1,karaoke_ready:false};
 assert.match(other.songDetailActionsHTML(invitation),/href="#sing\/original\?duet=invitation"/);
 assert.doesNotMatch(own.songDetailActionsHTML(invitation),/듀엣 참여/);
 assert.match(own.songOwnerActionsHTML(invitation),/data-delete-track="invitation".*data-track-kind="cover"/);
 assert.match(own.songOwnerActionsHTML(invitation),/\/api\/covers\/invitation\/download/);
 assert.equal(other.songOwnerActionsHTML(invitation),'');assert.equal(own.songOwnerActionsHTML(track),'');
 const unavailable=other.songDetailActionsHTML({...track,lyrics_mode:'none'}).match(/<button\b[^>]*\bid="lyrics-expand"[^>]*>/)?.[0];
 assert.ok(unavailable);assert.match(unavailable,/\bdisabled\b/);
});
test('artist and producer profiles are each shown once without dropping cover credits',()=>{
 const c=header(),html=c.songDetailCreditsHTML(track);
 assert.equal(html.match(/href="#producer\/person"/g).length,1);assert.equal(html.match(/href="#artist\/artist"/g).length,1);
 assert.match(html,/song-producer-label">PRODUCER/);
 const plain=c.songDetailCreditsHTML({...track,has_ai_artist:false,artist_id:null});assert.doesNotMatch(plain,/AI ARTIST|#artist/);
 const cover=c.songDetailCreditsHTML({...track,kind:'cover',original_id:'parent',original_title:'원곡',original_artist:'원곡 아티스트',cover_mode:'duet',duet_open:1,duet_partner_id:'partner',duet_partner:'파트너'});
 for(const href of ['#producer/person','#producer/partner','#song/parent'])assert.ok(cover.includes(href));
});
test('the existing track API returns saved introductions unchanged and performs no cleanup write',async t=>{
 const f=await fixture(t),c=header(),values=['첫 줄\n둘째 줄\n\n다음 문단',samples.legacy_auto[0].description,''];
 for(const description of values){
  f.sql.prepare("UPDATE tracks SET description=? WHERE id='one'").run(description);
  const r=await f.call('/api/tracks/one','GET',undefined,null);
  assert.equal(r.status,200);assert.equal(r.body.track.description,description);
  assert.equal(f.sql.prepare("SELECT description FROM tracks WHERE id='one'").get().description,description);
  assert.equal(c.songCreatorDescription(r.body.track),description);
 }
});
