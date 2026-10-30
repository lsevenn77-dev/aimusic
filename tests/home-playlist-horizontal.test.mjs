import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function context(){const c=vm.createContext({Map,console,window:{},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),number:String,playlistArt:()=>'<div class="collection-art"></div>',icon:n=>`<svg data-icon="${n}"></svg>`});vm.runInContext(readFileSync('dist/home.js','utf8'),c);return c;}
test('home preview preserves ordered real titles/artists, caps three, escapes text and calculates remainder',()=>{
 const c=context();for(const n of [0,1,2,3,4,6]){
  const tracks=Array.from({length:n},(_,i)=>({id:'track-'+i,title:'곡 <'+i+'>',artist:'가수 '+i}));
  const html=c.homePlaylistCard({id:'p',name:'선곡',description:'실제 소개',tracks:999,is_public:1},tracks);
  assert.equal((html.match(/class="home-playlist-index"/g)||[]).length,Math.min(n,3));
  assert.ok(html.includes(n+'곡 수록'));assert.doesNotMatch(html,/공개|999곡|외 0곡|<button[^>]*href/);
  if(n>3)assert.ok(html.includes('외 '+(n-3)+'곡'));else assert.doesNotMatch(html,/외 \d+곡/);
  for(let i=0;i<Math.min(n,3);i++){assert.ok(html.includes('곡 &lt;'+i+'>'));assert.ok(html.includes('가수 '+i));assert.ok(html.includes('>0'+(i+1)+'</span>'));}
 }
});
test('playlist pause/resume identity follows exact queue order and current song, not overlapping tracks',()=>{
 const c=context(),tracks=[{id:'a'},{id:'b'}];c.current={id:'b'};c.queue=['a','b'];assert.equal(c.homePlaylistQueueMatches(tracks),true);
 c.queue=['b','a'];assert.equal(c.homePlaylistQueueMatches(tracks),false);c.queue=['a'];assert.equal(c.homePlaylistQueueMatches(tracks),false);
 c.queue=['a','b'];c.current={id:'c'};assert.equal(c.homePlaylistQueueMatches(tracks),false);
});
