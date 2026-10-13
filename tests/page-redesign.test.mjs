import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../dist/'+f,import.meta.url),'utf8');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(){
 const c=vm.createContext({document:{addEventListener(){}},window:{},me:{id:'owner'},esc,icon:()=>'<svg></svg>',number:n=>String(n||0),cover:()=>'<img alt="">',heading:t=>'<h1>'+esc(t)+'</h1>',inboxControlsHTML:()=>'',conversationListHTML:()=>'<p>conversations</p>'});
 vm.runInContext(read('page-redesign.js'),c);return c;
}
test('My gallery is a top photo strip, not a settings-only gallery; visitor has no mutation controls',()=>{
 const c=context(),d={profile:{user_id:'owner',name:'Singer'},gallery:[{id:'p',url:'/media/profile-gallery/p?v=1'}]};
 const own=c.profileGalleryHTML(d,'person');
 assert.match(own,/profile-gallery-photos/);assert.match(own,/data-profile-photo-add="person"/);
 assert.match(own,/data-profile-photo-delete="p"/);assert.match(own,/data-gallery-photo="\/media\/profile-gallery\/p\?v=1"/);
 c.me={id:'visitor'};const visitor=c.profileGalleryHTML(d,'person');assert.match(visitor,/profile-gallery-photo/);assert.doesNotMatch(visitor,/data-profile-photo-(add|delete)/);
 assert.equal(c.profileGalleryHTML({...d,gallery:[]},'person'),'');
 assert.match(read('views.js'),/return profileGalleryHTML\(d,id\)\+/);
});
test('gallery escapes labels and photo identifiers; limit disables the upload CTA',()=>{
 const c=context(),d={profile:{user_id:'owner',name:'"><img onerror="bad">'},gallery:Array.from({length:30},()=>({id:'" onclick="bad',url:'/x?y="'}))};
 const html=c.profileGalleryHTML(d,'<bad>');
 assert.doesNotMatch(html,/<img onerror|onclick="bad/);assert.match(html,/data-profile-photo-add="&lt;bad&gt;" disabled/);
 assert.match(c.profileGalleryHTML({...d,gallery:[]},'id'),/profile-gallery-empty/);
});
test('singing discovery distinguishes own open duet and preserves actual song IDs',()=>{
 const c=context(),track={id:'duet',original_id:'original',user_id:'owner',producer:'Singer',title:'Song'};
 assert.match(c.singingDiscoverHTML([track]),/href="#song\/duet"/);
 c.me=null;assert.match(c.singingDiscoverHTML([track]),/href="#sing\/original\?duet=duet"/);
 assert.match(c.singingDiscoverHTML([]),/아직 참여를 기다리는 듀엣이 없어요/);
});
test('the recording redesign keeps controller hooks exactly once and mode choices in its header',()=>{
 const c=context();c.time=String;c.liked=()=>false;c.preferredLyricSize=()=> 'normal';
 vm.runInContext(read('karaoke.js'),c);
 const html=c.singHTML({track:{id:'song',title:'Song',duration:20},mode:'solo',words:[]});
 for(const id of ['sing','sing-wheel','sing-monitor','sing-seek','sing-now','sing-duration','mic-level','sing-status','sing-panel']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 for(const hook of ['data-sing-start','data-sing-pause','data-sing-stop','data-sing-redo-live','data-sing-settings'])assert.match(html,new RegExp(hook));
 assert.match(html,/sing-header-mode/);
});
test('new markup and last stylesheet are packaged, without replacing existing billing or audio controllers',()=>{
 const index=read('index.html'),build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.ok(index.indexOf('page-redesign.css')>index.indexOf('mobile-ux.css'));
 assert.ok(index.indexOf('page-redesign.js')<index.indexOf('actions.js'));
 assert.match(build,/'page-redesign.js','page-redesign.css'/);
 for(const script of ['gold-checkout.js','karaoke-core.js','audio-ads.js','social-chat.js'])assert.match(index,new RegExp(script.replace('.','\\.')));
});

