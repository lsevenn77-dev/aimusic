import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const home=readFileSync('dist/home.js','utf8');
function context(){
 const c=vm.createContext({Map,console,window:{addEventListener(){}},me:null,esc:String,number:String,playlistArt:()=>'<div class="collection-art"></div>',icon:n=>`<svg data-icon="${n}"></svg>`});
 const explorer=readFileSync('dist/explorer.js','utf8');vm.runInContext(explorer.slice(explorer.indexOf('function recommendedPlaylistBookmark'),explorer.indexOf('function discoveryTabs')),c);vm.runInContext(home,c);return c;
}
test('home and recommendations share the same card while the library retains its compact variant',()=>{
 const c=context(),p={id:'p',name:'목록',owner_name:'소유자',tracks:5,covers:[],description:'소개'};
 assert.equal(c.homePlaylistCard(p),c.recommendedPlaylistCard(p));
 const library=c.homePlaylistCard(p,null,{compact:true,footer:'<footer>library actions</footer>'});assert.match(library,/home-playlist-compact/);assert.match(library,/library actions/);assert.doesNotMatch(library,/public-playlist-|보관함 저장|수록곡 미리보기/);
});
test('home keeps recommendation order, selection and limit without fetching each full playlist',()=>{
 const c=context(),a=home.indexOf(' const paintCurations='),b=home.indexOf(' const profileRequests=',a);let result;const target={};
 c.$=()=>target;c.paint=(t,html)=>{assert.equal(t,target);result=html;};c.api=()=>{throw Error('Unexpected detail read');};vm.runInContext(home.slice(a,b)+';globalThis.paintCurations=paintCurations;',c);
 const playlists=[{id:'empty',tracks:0,is_public:1},{id:'private',tracks:2,is_public:0},{id:'locked',tracks:2,is_public:1,locked:true},...Array.from({length:8},(_,i)=>({id:'actual-'+i,name:'목록 '+i,tracks:2,is_public:1,covers:[]}))];
 c.paintCurations({playlists});assert.equal((result.match(/<article /g)||[]).length,6);for(let i=0;i<6;i++)assert.ok(result.includes('data-public-playlist="actual-'+i+'"'));
 assert.doesNotMatch(result,/data-public-playlist="(?:empty|private|locked|actual-6)|캐러셀|home-rail/);
});
