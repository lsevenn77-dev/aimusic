import * as AifectMessages from '../shared/system-messages.js';
import {VISIBLE} from './catalog.js';
import {trackBlockScope} from './block-policy.js';
import {producerNameSQL} from './identity.js';
import {namedArtistSQL} from './artist-identity.js';
import {GENRES, genreFilterSQL} from '../shared/genres.js';
import {rows} from './db.js';
import {artworkURL, trackArtworkSQL} from './track-artwork.js';
import {escapeHTML as esc} from '../shared/site-info.js';
import {titleHTML as coverPickTitleHTML} from '../shared/cover-pick-ui.js';
import {aboutIcon as icon} from './about-icons.js';

const labels = {
 'K-POP':'케이팝', Pop:'팝', 'Dark Pop':'다크 팝', Ballad:'발라드', 'R&B':'알앤비', Soul:'소울', 'Hip-Hop':'힙합',
 Rock:'록', Alternative:'얼터너티브', 'Indie Pop':'인디 팝', EDM:'이디엠', Electronic:'일렉트로닉', 'Synth Pop':'신스팝',
 'City Pop':'시티팝', 'Lo-fi':'로파이', Jazz:'재즈', Blues:'블루스', Folk:'포크', Acoustic:'어쿠스틱', Country:'컨트리',
 Classical:'클래식', Ambient:'앰비언트', Fusion:'퓨전', 'Korean Folklore Fusion':'국악 퓨전', 'World Music':'월드 뮤직',
 'J-POP':'제이팝', OST:'오리지널 사운드트랙', Instrumental:'연주곡', Dance:'댄스', Funk:'펑크 (Funk)', Disco:'디스코',
 Metal:'메탈', Punk:'펑크 록', Reggae:'레게', Latin:'라틴', Reggaeton:'레게톤', Afrobeats:'아프로비츠', House:'하우스',
 Techno:'테크노', Trance:'트랜스', 'Drum & Bass':'드럼 앤 베이스', Trap:'트랩', Gospel:'가스펠', 'New Age':'뉴에이지',
 Chillout:'칠아웃', Cinematic:'시네마틱', Orchestral:'오케스트라', Children:'어린이 음악'
};
const kinds = [['','전체'],['original','제작곡'],['solo','커버'],['duet','듀엣']];
const size = 24;
export function catalogFilters(url) {
 const params = new URL(url).searchParams;
 return {
  q:(params.get('q') || '').trim().slice(0,100),
  genre:GENRES.includes(params.get('genre')) ? params.get('genre') : '',
  kind:['original','solo','duet','cover'].includes(params.get('kind')) ? params.get('kind') : '',
  sort:params.get('sort') === 'popular' ? 'popular' : '',
  page:Math.max(1,Math.min(500,Math.trunc(Number(params.get('page'))) || 1))
 };
}
function catalogURL(filters) {
 const params = new URLSearchParams();
 for (const [key,value] of Object.entries(filters)) if(value && !(key==='page' && value===1)) params.set(key,value);
 return '/music' + (params.size ? '?' + params : '');
}
export async function discoverTracks(env,filters) {
 // Some older first-cover/social profiles persisted the generated public name, even as confirmed.
 // Match the profile's own ID, so a similar-looking chosen nickname is preserved.
 const displayName = alias => `CASE WHEN ${alias}.name='리스너 '||substr(${alias}.user_id,1,8) THEN '리스너'
  WHEN ${alias}.nickname_confirmed=1 THEN ${alias}.name
  WHEN ${alias}.name IN (${alias}.user_id,${alias}.id) OR (${producerNameSQL(alias)})!=${alias}.name THEN '리스너'
  ELSE ${alias}.name END`;
 const artistName=`CASE WHEN ${namedArtistSQL()} THEN a.name END`;
 const performer=displayName('p'), partner=displayName('fp');
 const conditions=[VISIBLE()], args=[];
 const {q,genre,kind,sort,page}=filters;
 if(q){
  const fields=['t.title',performer,artistName,partner];
  conditions.push('('+fields.map(field=>`instr(lower(${field}),lower(?))>0`).join(' OR ')+')');
  args.push(...fields.map(()=>q));
 }
 if(genre){conditions.push(genreFilterSQL());args.push(genre,genre);}
 if(kind==='original') conditions.push("t.kind='original'");
 if(kind==='cover') conditions.push("t.kind='cover'"); // Old bookmarks include all covers.
 if(kind==='solo'||kind==='duet'){conditions.push("t.kind='cover' AND t.cover_mode=?");args.push(kind);}
 const block=trackBlockScope(env);
 if(block.sql){conditions.push('1'+block.sql);args.push(...block.args);}
 // The catalogue's qualified-listen measure counts one listener per day.
 const popular="(SELECT count(DISTINCT l.listener||l.day) FROM listens l WHERE l.track_id=t.id AND l.qualified=1) DESC,";
 const order=(sort==='popular'?popular:'')+'t.created DESC,t.id';
 // Keep the shared artwork resolution, including inheritance from the original.
 const tracks=await rows(env,`SELECT t.id,t.title,t.kind,t.cover_mode,t.duration,t.genre,t.producer_id,t.original_id,
  (t.kind='cover' AND EXISTS(SELECT 1 FROM song_cover_picks sp WHERE sp.original_id=t.original_id AND sp.cover_id=t.id)) is_composer_pick,
  ${trackArtworkSQL()},${performer} producer,${partner} partner,fp.id partner_id,
  CASE WHEN t.kind='original' AND ${namedArtistSQL()} THEN a.name ELSE ${performer} END artist,
  CASE WHEN t.kind='original' AND ${namedArtistSQL()} THEN a.id END artist_id,
  (t.kind='original' AND ${namedArtistSQL()}) has_ai_artist,
  (t.duet_parent_id IS NOT NULL) completed_duet
  FROM tracks t JOIN producers p ON p.id=t.producer_id JOIN artists a ON a.id=t.artist_id
  LEFT JOIN tracks o ON o.id=t.original_id LEFT JOIN tracks parent ON parent.id=t.duet_parent_id
  LEFT JOIN producers fp ON fp.id=parent.producer_id
  WHERE ${conditions.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,...args,size+1,(page-1)*size);
 // The public renderer needs the resolved artwork, never a work's underlying version.
 const publicFields=['id','title','kind','cover_mode','duration','genre','producer_id','producer','partner','partner_id',
  'artist','artist_id','has_ai_artist','completed_duet','artwork_id','has_cover','cover_version','original_id','is_composer_pick'];
 return tracks.map(track=>Object.fromEntries(publicFields.map(key=>[key,track[key]])));
}
const selected=(a,b)=>a===b?' selected':'';
const duration=n=>n>0?Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'):'';
const title='당신의 취향을 발견하세요';
export const musicIntro={title,summary:'제작곡부터 커버와 듀엣까지, 원하는 음악을 찾아보세요.'};
export function catalogControls(f){
 const opts=GENRES.map(g=>`<option value="${esc(g)}"${selected(f.genre,g)}>${esc(labels[g]||g)}</option>`).join('');
 const types=f.kind==='cover'?[...kinds,['cover','모든 커버']]:kinds;
 return `<form id="catalog-form" method="get" action="/music">
 <div class="discover-search"><label for="music-query">${icon('search')}<span class="visually-hidden">곡 제목, 아티스트 또는 창작자 활동명</span></label><input type="search" id="music-query" name="q" maxlength="100" value="${esc(f.q)}" placeholder="곡 제목, 아티스트 또는 창작자 활동명 검색"><button type="submit">검색</button></div>
 <div class="discover-tools"><fieldset class="discover-kinds"><legend class="visually-hidden">곡 유형</legend>${types.map(([v,label])=>`<label><input type="radio" name="kind" value="${v}"${v===f.kind?' checked':''}><span>${label}</span></label>`).join('')}</fieldset>
 <div class="discover-selects"><label><span class="visually-hidden">장르</span><select name="genre"><option value="">모든 장르</option>${opts}</select></label>
 <label><span class="visually-hidden">정렬</span><select name="sort"><option value="">최신순</option><option value="popular"${selected(f.sort,'popular')}>인기순</option></select></label></div></div></form>`;
}
function trackCard(t){
 const href='/music/'+encodeURIComponent(t.id), category=t.kind==='cover'?(t.cover_mode==='duet'?'duet':'solo'):'original';
 const type=category==='duet'?(t.completed_duet?'완성 듀엣':'듀엣'):category==='solo'?'솔로 커버':'제작곡';
 const name=t.kind==='cover'?t.producer:t.artist;
 const profile=t.has_ai_artist?'artist:'+t.artist_id:t.producer_id;
 const credit=(name,key)=>`<button type="button" class="track-artist user-nickname" data-user-nickname data-profile-preview="${esc(key)}" aria-haspopup="dialog" aria-label="${esc(name)} 프로필 보기">${esc(name)}</button>`;
 const seconds=duration(t.duration);
 return `<article class="discover-track"><a class="track-link" href="${href}" aria-label="${esc(t.title)} 상세 보기"><img src="${esc(artworkURL(t))}" alt="${esc(t.title)} 커버" width="352" height="352" loading="lazy" decoding="async">
 <div class="track-meta"><span data-type="${category}">${type}</span>${seconds?`<span aria-label="재생시간 ${seconds}">${seconds}</span>`:''}</div><h2>${coverPickTitleHTML(t)}</h2></a>
 <div class="track-credits">${t.partner_id?credit(t.partner,t.partner_id)+'<span aria-hidden="true"> · </span>':''}${credit(name,profile)}</div></article>`;
}
export function catalogResult(tracks,f,error=false){
 const filtered=!!(f.q||f.kind||f.genre||f.sort), list=tracks.slice(0,size);
 const prev=f.page>1?`<a data-catalog-link href="${esc(catalogURL({...f,page:f.page-1}))}">이전 페이지</a>`:'';
 const next=tracks.length>size&&f.page<500?`<a data-catalog-link href="${esc(catalogURL({...f,page:f.page+1}))}">다음 페이지</a>`:'';
 const html=error?`<div class="catalog-empty"><h2>음악을 불러오지 못했습니다</h2><p>연결 상태를 확인하고 다시 시도해 주세요.</p><a href="${esc(catalogURL(f))}" data-catalog-link>다시 시도</a></div>`:
  (list.length?`<div class="discover-grid">${list.map(trackCard).join('')}</div>`:
   '<div class="catalog-empty"><h2>조건에 맞는 공개 음악이 없습니다</h2><p>다른 활동명이나 장르로 찾아보세요.</p><a href="/music" data-catalog-link>전체 음악 보기</a></div>')+
  (prev||next?`<nav class="discover-pages" aria-label="음악 목록 페이지">${prev}<span aria-current="page">${f.page} 페이지</span>${next}</nav>`:'');
 return {html,filters:f,title:'공개 음악'+(f.page>1?' · '+f.page+' 페이지':'')+' | AIFECT',
  canonical:'https://aifect.co.kr/music'+(f.page>1?'?page='+f.page:''),noindex:filtered||!list.length,
  announcement:error?'음악 목록을 불러오지 못했습니다.':list.length?`${f.page}페이지에 음악 ${list.length}곡을 표시했습니다.`:AifectMessages.searchEmpty,
  status:error?503:f.page>1&&!list.length&&!filtered?404:200};
}
