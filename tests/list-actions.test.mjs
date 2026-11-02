import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const item=Object.freeze({id:'work',title:'Title',genre:'Rock',genres:['Rock'],duration:187,created:1700000000,producer:'Singer',producer_id:'singer',artist:'AI',artist_id:'artist',kind:'cover',cover_mode:'duet',original_id:'original',can_join:true,duet_open:1,participants:2,completions:3,likes:4});
function context(){return vm.createContext({esc:s=>String(s??''),time:()=> '3:07',number:String,icon:n=>'<svg data-icon="'+n+'"></svg>',cover:()=>'<img>',liked:()=>false,remember(){},hasArtist:()=>false,credits:()=> 'Singer',songCredits:()=> 'Singer',songReleaseDateHTML:()=>'<time>2023.11.14</time>',trackModerationToolsHTML:()=>'',me:null,AifectDubbing:{dubbingGenreArtwork:()=>'/art.webp'},document:{addEventListener(){}}});}
test('compact rows omit metadata, cover detail keeps duration and date, and original detail keeps genre',()=>{
 const c=context(),app=read('dist/app.js');
 vm.runInContext(app.slice(app.indexOf('function card('),app.indexOf('function identityCards(')),c);
 vm.runInContext(read('dist/play-page.js'),c);
 vm.runInContext(read('dist/song-detail.js'),c);
 const before=JSON.stringify(item);
 for(const html of [c.card(item),c.songTable([item]),c.playProjectRows?.([item],'discover')||'']){
  assert.doesNotMatch(html,/3:07|Rock|song-table-duration|album-meta/);
 }
 const detail=c.songDetailHeaderHTML(item);assert.doesNotMatch(detail,/Rock/);assert.match(detail,/3:07/);assert.match(detail,/2023.11.14/);
 assert.match(c.songDetailHeaderHTML({...item,kind:'original'}),/Rock/);
 assert.equal(JSON.stringify(item),before);
});
test('cover list preserves playback, like, menu, participation and child expansion delegates',()=>{
 const c=context();vm.runInContext(read('dist/song-covers.js'),c);
 const normal=c.songCoverRowHTML(item),invitation=c.songCoverRowHTML(item,{invitation:true});
 for(const attr of ['data-play="work"','data-like="work"','data-track-menu="work"','data-community-toggle','data-song-cover-toggle'])assert.ok(normal.includes(attr),attr);
 assert.match(invitation,/data-cover-children="work"/);assert.match(invitation,/#sing\/original\?duet=work/);
 for(const html of [normal,invitation])assert.doesNotMatch(html,/3:07|Rock/);
});
test('functional draft dates and durations remain available',()=>{
 const c=context();vm.runInContext(read('dist/sing-drafts.js'),c);vm.runInContext(read('dist/play-page.js'),c);
 const html=c.playDraftRows([{draftKey:'owner:work',id:'work',title:'Draft',mode:'solo',duration:187,updated:1700000000000}]);
 assert.match(html,/3:07/);assert.match(html,/저장/);assert.match(html,/draft=1/);assert.match(html,/data-delete-draft="owner:work"/);
});

