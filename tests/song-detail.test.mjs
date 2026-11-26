import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const samples=JSON.parse(read('tests/fixtures/song-detail-descriptions.json'));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const track={id:'song',title:'곡 제목',kind:'original',user_id:'other',producer_id:'person',producer:'제작자',artist_id:'artist',artist:'아티스트',has_ai_artist:true,karaoke_ready:true,lyrics_mode:'synced',genre:'Pop',duration:120,likes:12,plays:20,comments:2,description:''};
function header(user='owner',active=false,platform={}){
 const c=nicknameContext({me:user?{id:user}:null,...platform,esc,number:n=>Number(n).toLocaleString('en-US'),time:()=> '2:00',liked:()=>active,hasArtist:t=>t.kind!=='cover'&&!!t.has_ai_artist,credits:t=>'<a href="#artist/'+esc(t.artist_id)+'">'+esc(t.artist)+'</a>',cover:t=>'<div class="album-art">'+esc(t.title)+'</div>',songReleaseDateHTML:()=>''});
 vm.runInContext(read('dist/icons.js'),c);
 const views=read('dist/views.js');
 vm.runInContext(views.slice(views.indexOf('function songCredits('),views.indexOf('function profileMusicCards(')),c);
 c.authConfig={};
 c.songReleaseDateHTML=()=>'<p class="song-release-date">발매일</p>';
 vm.runInContext(views.slice(views.indexOf('function trackModerationToolsHTML('),views.indexOf('function trackReviewHTML(')),c);
 vm.runInContext(read('dist/song-detail.js'),c);return c;
}
test('web song introductions use the creator field and native readers use the stored field',()=>{
 const web=header(),sample={...samples.legacy_auto[0],creator_description:'첫 줄\n둘째 줄'};
 assert.equal(web.songDescriptionHTML({...sample,creator_description:''}),'');
 assert.equal(web.songDescriptionHTML(samples.legacy_auto[0]),'');
 assert.match(web.songDescriptionHTML(sample),/첫 줄\n둘째 줄/);
 assert.ok(!web.songDescriptionHTML(sample).includes(esc(sample.description)));
 for(const platform of [{inApp:true},{navigator:{userAgent:'AIFECT-Mobile/1.0'}}]){
  const markup=header('owner',false,platform).songDescriptionHTML(sample);
  assert.ok(markup.includes(esc(sample.description)));
  assert.match(markup,/>\+더보기<\/button>/);
 }
});
test('creator text and paragraphs stay intact and HTML-safe',()=>{
 const c=header();
 for(const t of samples.creator_samples)assert.equal(c.songCreatorDescription({creator_description:t.description}),t.description);
 const text='첫 줄\n둘째 줄\n\n다음 문단 <script>alert(1)</script> & "인용"';
 const html=c.songDescriptionHTML({id:'song',creator_description:text});
 assert.match(html,/첫 줄\n둘째 줄\n\n다음 문단/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 assert.match(html,/<section\b[^>]*data-song-description-track="song"/);
 const description=html.match(/<p\b[^>]*id="song-description-text"[^>]*>([\s\S]*?)<\/p>/)?.[1];
 assert.ok(description);assert.ok(description.includes('<span class="song-description-content">'+esc(text)+'</span>'));
 const toggle=description.match(/<button\b[^>]*class="text-link song-description-toggle"[^>]*>/)?.[0];
 assert.ok(toggle);assert.match(toggle,/type="button"/);assert.match(toggle,/aria-controls="song-description-text"/);assert.match(toggle,/aria-expanded="false"/);assert.match(toggle,/\bhidden\b/);assert.match(description,/>… 더보기<\/button>/);
});
test('empty introductions do not reserve a card and saved text stays intact',()=>{
 const c=header();
 for(const creator_description of [undefined,null,'',' \n\t '])assert.equal(c.songDescriptionHTML({creator_description}),'');
 for(const creator_description of ['none','없음','음악을 듣고 감상을 나눠보세요.','  첫 줄\n둘째 줄  '])assert.equal(c.songCreatorDescription({creator_description}),creator_description);
 assert.doesNotMatch(c.songDetailHeaderHTML(track),/song-description|음악을 듣고 감상을/);
});

test('the song title heads the page and metrics follow the date before introduction and actions',()=>{
 const c=header(),html=c.songDetailHeaderHTML({...track,creator_description:'제작자 소개'});
 const order=['song-track-meta','song-title','song-credits','song-meta-row','song-metrics','song-release-date','song-duration','song-engagement','data-report-track','song-introduction','song-actions'];
 let previous=-1;for(const key of order){const at=html.indexOf(key);assert.ok(at>previous,key);previous=at;}
 assert.equal(html.match(/class="song-introduction"/g).length,1);
 assert.match(html,/<h1\b[^>]*class="song-title"[^>]*>곡 제목<\/h1>/);assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.match(c.songDetailHeaderHTML({...track,title:'곡 <제목> "1"'}),/<h1\b[^>]*class="song-title"[^>]*>곡 &lt;제목&gt; &quot;1&quot;<\/h1>/);
 assert.match(html,/<h3>곡 소개<\/h3>/);assert.match(html,/aria-label="재생 20회"/);assert.match(html,/aria-label="댓글 2개"/);assert.match(html,/aifect-icon-plays/);assert.match(html,/aifect-icon-comment/);
 const meta=html.match(/<span\b[^>]*class="eyebrow song-track-meta"[^>]*>([\s\S]*?)<\/span>/)?.[1];assert.equal(meta,'Pop');
 const metrics=html.match(/<div\b[^>]*class="song-metrics"[^>]*>([\s\S]*?)<\/div>/)?.[1];assert.ok(metrics);
 const duration=metrics.match(/<span\b[^>]*class="metric-inline song-duration"[^>]*>[\s\S]*?<\/span>/)?.[0];
 assert.ok(duration);assert.match(duration,/aria-label="곡 길이 2:00"/);assert.match(duration,/>2:00<\/span>/);
 assert.ok(duration.includes(vm.runInContext("icon('clock')",c)));
 assert.match(c.songDetailHeaderHTML(track,3),/data-song-comment-value>3<\/span>/);
 assert.doesNotMatch(html,/song-track-options|song-header-divider/);
 assert.doesNotMatch(c.songDetailMetricsHTML({...track,ai_comments:12}),/공식|AI|응원/);
 for(const c of [header(null),header('other')]){const plain=c.songDetailHeaderHTML(track);assert.doesNotMatch(plain,/song-engagement|data-report-track/);assert.match(plain,/song-metrics/);}
});
test('song actions retain delegates and place the five web actions in order',()=>{
 const c=header('owner',true),html=c.songDetailActionsHTML(track);
 const order=['data-play="song"','href="#sing/song"','data-like="song"','id="lyrics-expand"','data-add="song"','data-gift="song"','data-song-share="song"'];let previous=-1;
 for(const key of order){const i=html.indexOf(key);assert.ok(i>previous,key);previous=i;}
 assert.match(html,/aria-label="좋아요 12개" aria-pressed="true"/);assert.match(html,/data-like-count>12</);
 assert.doesNotMatch(html,/<span>좋아요<\/span>/);
 assert.match(c.songDetailActionsHTML({...track,likes:0}),/data-like-count>0<\/span>/);
 for(const key of ['play','sing','heart','plus','gift','share-2'])assert.ok(html.includes('song-action-icon-'+key));
 assert.match(html,/<span>담기<\/span>/);assert.match(html,/<span>공유<\/span>/);
 assert.doesNotMatch(html,/data-track-menu|song-action-more|저장/);
 assert.match(html,/aria-label="노래 듣기"/);assert.match(html,/<span>듣기<\/span>/);
 assert.match(html,/song-actions-primary[\s\S]*data-play="song"[\s\S]*href="#sing\/song"[\s\S]*<\/div><div class="inline-actions song-actions song-actions-secondary"/);
 assert.match(html,/aria-label="노래 부르기"/);assert.match(html,/<span>부르기<\/span>/);
 assert.match(html,/<span>선물<\/span>/);assert.doesNotMatch(html,/선물하기|audio-play-icon/);
 const page=c.songDetailHeaderHTML(track);
 assert.doesNotMatch(page,/data-track-menu="song"/);
 assert.ok(html.includes(vm.runInContext("paths['file-text']",c)));
 const lyrics=page.match(/<button\b[^>]*\bid="lyrics-expand"[^>]*>/)?.[0];
 assert.ok(lyrics);assert.match(lyrics,/data-track="song"/);assert.match(lyrics,/aria-controls="expanded-song-lyrics"/);assert.match(lyrics,/aria-expanded="false"/);assert.doesNotMatch(lyrics,/\bdisabled\b/);
 assert.match(page,/<span>가사<\/span>/);assert.equal((page.match(/id="lyrics-expand"/g)||[]).length,1);
});
test('guest listening, unavailable karaoke, self-gifts and duet ownership remain gated',()=>{
 const guest=header(null),own=header('other'),other=header();
 assert.match(guest.songDetailActionsHTML(track),/data-play="song"[^>]*aria-label="노래 듣기"/);
 assert.doesNotMatch(other.songDetailActionsHTML({...track,karaoke_ready:false}),/노래 부르기|#sing/);
 assert.doesNotMatch(own.songDetailActionsHTML(track),/data-gift=/);
 const invitation={...track,kind:'cover',id:'invitation',original_id:'original',cover_mode:'duet',duet_open:1,karaoke_ready:false};
 assert.match(other.songDetailActionsHTML(invitation),/href="#sing\/original\?duet=invitation"/);
 assert.doesNotMatch(own.songDetailActionsHTML(invitation),/듀엣 참여/);
 const mine=own.songDetailHeaderHTML(invitation);
 assert.match(mine,/data-play="invitation".*data-like="invitation".*id="lyrics-expand".*data-song-share="invitation".*data-delete-track="invitation".*data-track-kind="cover"/);
 assert.match(mine,/data-cover-photo="invitation"/);
 assert.doesNotMatch(mine,/song-track-meta|내 녹음 파일 저장|내 커버 삭제|data-add=|data-gift=/);
 for(const viewer of [own,other,guest]){
  viewer.AifectUnifiedPlaylists=true;
  assert.match(viewer.songDetailActionsHTML(invitation),/data-add="invitation"/);
 }
 for(const viewer of [other,guest])assert.doesNotMatch(viewer.songDetailHeaderHTML(invitation),/data-cover-photo|data-delete-track/);
 const native=header('other',false,{inApp:true});
 assert.doesNotMatch(native.songDetailActionsHTML(invitation),/data-song-share/);
 assert.match(native.songDetailActionsHTML(track),/data-track-menu="song"/);
 assert.doesNotMatch(own.songDetailHeaderHTML(track),/data-cover-photo/);
 const unavailable=other.songDetailHeaderHTML({...track,lyrics_mode:'none'}).match(/<button\b[^>]*\bid="lyrics-expand"[^>]*>/)?.[0];
 assert.ok(unavailable);assert.match(unavailable,/\bdisabled\b/);
});
test('artist and producer profiles are each shown once without dropping cover credits',()=>{
 const c=header(),html=c.songDetailCreditsHTML(track);
 assert.equal(html.match(/href="#producer\/person"/g).length,1);assert.equal(html.match(/href="#artist\/artist"/g).length,1);
 assert.match(html,/song-artist-label">AI 아티스트/);assert.match(html,/song-producer-label">제작자/);
 const plain=c.songDetailCreditsHTML({...track,has_ai_artist:false,artist_id:null});assert.doesNotMatch(plain,/AI 아티스트|#artist/);
 const native=header('owner',false,{inApp:true});
 assert.match(native.songDetailCreditsHTML(track),/song-artist-label">AI ARTIST/);
 assert.match(native.songDetailActionsHTML(track),/<span>좋아요<\/span>/);
 const cover=c.songDetailCreditsHTML({...track,kind:'cover',original_id:'parent',original_title:'원곡',original_artist:'원곡 아티스트',cover_mode:'duet',duet_open:1,duet_partner_id:'partner',duet_partner:'파트너'});
 for(const href of ['#producer/person','#producer/partner','#song/parent'])assert.ok(cover.includes(href));
});
test('track detail reads the creator copy from the matching editorial audit without rewriting stored descriptions',async t=>{
 const f=await fixture(t);
 const generated=samples.legacy_auto[0].description,original='첫 줄\n둘째 줄\n\n다음 문단';
 const edited=generated+'\n제작자가 새로 수정한 소개입니다.';
 const save=f.sql.prepare("UPDATE tracks SET description=? WHERE id='one'");
 const audit=f.sql.prepare("INSERT OR REPLACE INTO admin_audit(id,admin_id,action,target,created) VALUES('public-copy-0078:one','operator-requested-editorial:0078','track_description_editorial',?,0)");
 for(const [description,before,expected] of [
  [original,null,original],[generated,'',''],[generated,original,original],
  [generated.replaceAll('\n','\r\n'),original,original],[generated,'없음',''],
  [edited,original,edited],['',original,'']
 ]){
  save.run(description);
  if(before!==null)audit.run(JSON.stringify({track_id:'one',before,after:generated}));
  const r=await f.call('/api/tracks/one','GET',undefined,null);
  assert.equal(r.status,200);
  assert.equal(r.body.track.description,description);
  assert.equal(r.body.track.creator_description,expected);
  assert.equal(f.sql.prepare("SELECT description FROM tracks WHERE id='one'").get().description,description);
 }
});

test('catalog, detail credits and gift rankings omit only crew data, preserving literal parentheses and existing API shape',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE producers SET name='코코(별)',nickname_confirmed=1 WHERE id='producer'; INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES('fan','other','Veil(밤)',0,1); INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','크루',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0),('crew','other','member',0); INSERT INTO free_gifts(id,sender_id,track_id,request_id,created,silver) VALUES('gift','other','one','request',0,3)");
 const before=f.sql.prepare('SELECT * FROM crew_members ORDER BY user_id').all();
 const detail=(await f.call('/api/tracks/one')).body.track;
 assert.equal(detail.producer,'코코(별)');
 assert.match(header().songDetailCreditsHTML(detail),/data-profile-preview="producer"[^>]*>코코\(별\)<\/span>/);
 const catalog=(await f.call('/api/catalog?section=tracks')).body.tracks;
 assert.equal(catalog.find(x=>x.id==='one').producer,'코코(별)');
 const gifts=(await f.call('/api/tracks/one/gifts')).body;
 assert.equal(gifts.support_ranking[0].name,'Veil(밤)');
 assert.equal(gifts.support_ranking[0].score,3);
 assert.equal(gifts.ranking[0].name,'Veil(밤)');
 assert.deepEqual(f.sql.prepare('SELECT * FROM crew_members ORDER BY user_id').all(),before);
 assert.equal(f.sql.prepare("SELECT name FROM producers WHERE id='producer'").get().name,'코코(별)');
});
