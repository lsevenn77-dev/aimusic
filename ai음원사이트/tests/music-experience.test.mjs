import * as AifectPlayer from '../shared/player.js';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../dist/'+f,import.meta.url),'utf8');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(user=null,responses={}){const calls=[];const c=vm.createContext({AifectPlayer,window:{addEventListener(){}},setInterval(){},localStorage:{getItem(){return null;}},grid:items=>items.map(t=>`<button data-play="${escape(t.id)}" data-add="${escape(t.id)}"></button>`).join(''),me:user,URLSearchParams,Date,location:{hash:'#community'},esc:escape,number:n=>String(n||0),heading:(a,b='')=>`<h1>${escape(a)}</h1><p>${escape(b)}</p>`,icon:()=>'',cover:()=>'',portrait:()=>'',credits:()=>'',liked:()=>false,followed:()=>false,giftButton:t=>`<button data-gift="${escape(t.id)}">선물</button>`,gate:()=>'<p>LOGIN</p>',empty:()=>'<p>EMPTY</p>',section:s=>`<h2>${escape(s)}</h2>`,document:{addEventListener(){}},remember:x=>x,genres:[],library:{follows:[]},api:async p=>{calls.push(p);if(!(p in responses))throw Error('Unexpected API '+p);return responses[p];}});for(const f of ['player-progress.js','music-ui.js','community.js','browse.js','views.js','social-chat.js','improvements.js','artist-gallery.js','chat-features.js','page-redesign.js','social-layouts.js','release-refinements.js'])vm.runInContext(read(f),c);return {c,calls};}
const original={id:'o',producer_id:'p',producer:'아티스트',user_id:'owner',title:'원곡',kind:'original',created:1},cover={...original,id:'c',title:'커버',kind:'cover',original_id:'o',original_title:'원곡',created:2},duet={...cover,id:'d',cover_mode:'duet',duet_open:1,created:3};
test('originals, covers and duets preserve their own IDs when saving',()=>{const {c}=context();for(const t of [original,cover,duet]){const html=c.musicTrackCard(t);assert.match(html,new RegExp('data-add="'+t.id+'"'));assert.match(html,/플레이리스트 담기/);assert.match(html,new RegExp('data-play="'+t.id+'"'));}assert.doesNotMatch(c.musicTrackCard(cover),/data-add="o"/);});
test('all profile music is deduplicated; duet filter retains the exact recording',()=>{const {c}=context(),d={tracks:[original],covers:[cover,duet,cover]};assert.deepEqual(Array.from(c.musicProfileItems(d),t=>t.id),['d','c','o']);assert.deepEqual(Array.from(c.musicProfileItems(d,'duets'),t=>t.id),['d']);assert.equal(d.tracks[0],original);});
test('only a genuinely open duet exposes joining; existing singer cannot join self',()=>{const {c}=context();assert.match(c.musicTrackCard(duet),/#sing\/o\?duet=d/);assert.doesNotMatch(c.musicTrackCard({...duet,duet_open:'false'}),/이 듀엣에 참여/);c.me={id:'owner'};assert.doesNotMatch(c.musicTrackCard(duet),/이 듀엣에 참여/);});
test('community landing is public and keeps crews visible without being a crew-only landing',async()=>{const {c,calls}=context(null,{'/api/community':{tracks:[cover]}});assert.equal(await c.improvementsView('community',undefined,'community'),null);const page=await c.communityView('community',undefined,'community');assert.match(page.html,/#community\/crews/);assert.match(page.html,/data-add="c"/);assert.deepEqual(calls,['/api/community']);assert.doesNotMatch(page.html,/지금 노래하는 사람들|LIVE|파티방/);});
test('duet discovery and invitation listing use their existing separate API paths',async()=>{const {c,calls}=context(null,{'/api/community?kind=cover&cover_mode=duet':{tracks:[duet]},'/api/duets':{tracks:[duet]}});await c.communityView('community','duets','community/duets');await c.communityView('community','duets','community/duets?open=1');assert.deepEqual(calls,['/api/community?kind=cover&cover_mode=duet','/api/duets']);});
test('following is gated before any private fetch',async()=>{const {c,calls}=context();assert.match((await c.communityView('community','following')).html,/LOGIN/);assert.deepEqual(calls,[]);});
test('visitor profile hides private library and does not link to the visitor own followers',()=>{const {c}=context({id:'visitor'}),d={profile:{id:'p',user_id:'owner',name:'Singer'},tracks:[original],covers:[cover],followers:4};const html=c.personProfileHTML(d,'p','all');assert.match(html,/#dm\/p/);assert.match(html,/data-profile-gift="p"/);assert.doesNotMatch(html,/#library\/followers|href="#library\/playlists"|프로필 수정/);assert.match(html,/data-add="c"/);});
test('own profile exposes private library shortcuts and no self-follow button',()=>{const {c}=context({id:'owner'}),d={profile:{id:'p',user_id:'owner',name:'Singer'},tracks:[original],covers:[],followers:4,following_count:2};const html=c.personProfileHTML(d,'p');assert.match(html,/#library\/playlists/);assert.doesNotMatch(html,/data-follow="producer\/p"/);assert.match(html,/#profile\/edit/);});
test('a listener without a public profile can use My page without creating one',async()=>{const {c,calls}=context({id:'u',name:'Listener'},{'/api/me/profile':{profile:{name:'Listener'}}});const page=await c.improvementsView('profile',undefined,'profile');assert.match(page.html,/#library\/playlists/);assert.deepEqual(calls,['/api/me/profile','/api/gold/balance','/api/crews?summary=1&home=1']);});
test('all public text and IDs are escaped before generating card markup',()=>{const {c}=context();const html=c.musicTrackCard({...cover,title:'<script>x</script>',producer:'<img onerror=x>',description:'<iframe>',id:'c" onclick="bad'});assert.doesNotMatch(html,/<script>|<img onerror|<iframe>|onclick="bad/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot;/);});
test('following and follower rows link the entire identity to the correct page',()=>{
 const {c}=context();const html=c.peopleListHTML([{id:'p',user_id:'u',name:'Singer'},{id:null,user_id:'listener',name:'Listener'}]);
 assert.match(html,/href="#producer\/p"/);assert.match(html,/href="#follower\/listener"/);assert.match(html,/people-list-row/);
 assert.doesNotMatch(html,/producer\/null|producer\/undefined/);
 assert.match(c.peopleListHTML([{target_id:'ai',name:'AI singer'}],'artist'),/href="#artist\/ai"/);
});
test('profile-less follower navigation is gated and exposes only the returned public identity',async()=>{
 const guest=context();assert.match((await guest.c.improvementsView('follower','u','follower/u')).html,/LOGIN/);assert.deepEqual(guest.calls,[]);
 const {c,calls}=context({id:'me'},{'/api/followers/u':{profile:{id:null,name:'Listener',user_id:'u'}}});
 const page=await c.improvementsView('follower','u','follower/u');assert.match(page.html,/Listener/);assert.doesNotMatch(page.html,/data-follow|data-profile-gift|#dm\/null/);assert.deepEqual(calls,['/api/followers/u']);
});
test('a DM opened directly has an explicit return to the conversation list',async()=>{
 const {c}=context({id:'me'},{'/api/blocks':{blocks:[]},'/api/dm':{conversations:[]},'/api/dm/p':{peer:{id:'p',name:'Singer'},messages:[]}});c.chatPanelHTML=()=>'<div>CHAT</div>';
 const page=await c.improvementsView('dm','p','dm/p');assert.match(page.html,/dm-thread-header/);assert.match(page.html,/href="#dm"/);assert.match(page.html,/대화 목록으로 돌아가기/);
});
test('cover grid/list presentation uses the cover ID and never enables unpublished own music',()=>{
 const {c}=context({id:'owner'});let mode='grid';c.localStorage={getItem:()=>mode};
 const grid=c.coverCollectionHTML([cover,duet],'profile-covers');assert.match(grid,/layout-grid/);assert.match(grid,/data-add="c"/);assert.match(grid,/data-play="d"/);assert.doesNotMatch(grid,/data-add="o"|data-play="o"/);
 mode='list';assert.match(c.coverCollectionHTML([cover]),/layout-list/);
 const pending=c.coverCollectionHTML([{...cover,status:'processing'}],'my-covers',true);assert.match(pending,/음원 처리 중/);assert.match(pending,/#manage\/c/);assert.doesNotMatch(pending,/data-play|data-add/);
});
test('profile photo reuses the single photo safely and needs no separate banner',()=>{
 const {c}=context();assert.match(c.profilePhotoHTML({id:'p',image_version:'photo 1'}),/src="\/media\/producer\/p\?v=photo%201"/);
 assert.doesNotMatch(c.profilePhotoHTML({id:'p'}),/<img/);
 assert.doesNotMatch(c.profilePhotoHTML({id:'" onerror="bad',image_version:'"'}),/onerror="/);
});
test('support panels replace the catalog with one profile or song gift-dialog banner',()=>{
 const {c}=context({id:'visitor'}),g={free_count:3,total_gold:10,ranking:[{rank:1,name:'<Fan>',stars:3,gold:10,score:13}]};
 const profile=c.giftsPanelHTML(g,'받은 응원',{profile:{id:'person',user_id:'owner'}});
 assert.equal((profile.match(/data-profile-gift=/g)||[]).length,1);assert.match(profile,/class="gift-support-banner" data-profile-gift="person"/);
 assert.match(profile,/선물로 응원하기/);assert.match(profile,/&lt;Fan&gt;/);assert.match(profile,/13점/);assert.match(profile,/#rewards/);
 assert.doesNotMatch(profile,/gift-quick-grid|data-gift-type|선물 선택/);
 c.avatarImage=()=>'';const track=c.giftsPanelHTML(g,'응원',{track:{id:'song',user_id:'owner'}});assert.match(track,/class="song-image-gift-banner" href="#gifts"/);assert.doesNotMatch(track,/data-profile-gift/);
 c.me={id:'owner'};const own=c.giftsPanelHTML(g,'받은 응원',{profile:{id:'person',user_id:'owner'}});
 assert.match(own,/data-profile-gift="person" disabled/);assert.match(own,/방문자가 이곳에서 응원을/);assert.equal(c.giftsPanelHTML(null,'받은 응원'),'');
});
