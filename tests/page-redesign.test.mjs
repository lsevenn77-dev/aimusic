import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as karaoke from '../shared/karaoke-audio.js';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../dist/'+f,import.meta.url),'utf8');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(){
 const c=vm.createContext({document:{addEventListener(){}},window:{},me:{id:'owner'},esc,icon:()=>'<svg></svg>',number:n=>String(n||0),cover:()=>'<img alt="">',heading:t=>'<h1>'+esc(t)+'</h1>',inboxControlsHTML:()=>'',conversationListHTML:()=>'<p>conversations</p>'});
 vm.runInContext(read('page-redesign.js'),c);return c;
}
test('My gallery follows profile identity and precedes music; visitor has no mutation controls',()=>{
 const c=context(),d={profile:{user_id:'owner',name:'Singer'},gallery:[{id:'p',url:'/media/profile-gallery/p?v=1'}]};
 const own=c.profileGalleryHTML(d,'person');
 assert.match(own,/profile-gallery-photos/);assert.match(own,/data-profile-photo-add="person"/);
 assert.match(own,/data-profile-photo-delete="p"/);assert.match(own,/data-gallery-photo="\/media\/profile-gallery\/p\?v=1"/);
 c.me={id:'visitor'};const visitor=c.profileGalleryHTML(d,'person');assert.match(visitor,/profile-gallery-photo/);assert.doesNotMatch(visitor,/data-profile-photo-(add|delete)/);
 assert.equal(c.profileGalleryHTML({...d,gallery:[]},'person'),'');
 const view=read('views.js').split('function personProfileHTML')[1].split('function giftsPanelHTML')[0];
 assert.ok(view.indexOf('person-profile social-profile')<view.indexOf('profileGalleryHTML(d,id)'));
 assert.ok(view.indexOf('profileGalleryHTML(d,id)')<view.indexOf('profile-page-layout'));
 assert.doesNotMatch(read('page-redesign.js'),/마이페이지 맨 위에 표시/);
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
 c.window.AifectKaraoke=karaoke;vm.runInContext(read('sing-key.js'),c);
 vm.runInContext(read('karaoke.js'),c);
 const html=c.singHTML({track:{id:'song',title:'Song',duration:20},mode:'solo',words:[]});
 for(const id of ['sing','sing-wheel','sing-monitor','sing-seek','sing-now','sing-duration','sing-status','sing-panel']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 for(const hook of ['data-sing-start','data-sing-stop','data-sing-redo-live','data-sing-settings'])assert.match(html,new RegExp(hook));
 assert.doesNotMatch(html,/id="mic-level"/);
 assert.match(html,/sing-header-mode/);
 assert.match(html,/sing-transport studio-transport/);
 assert.match(html,/aria-label="녹음 가사 크기"/);
 for(const hook of ['data-sing-start','data-sing-stop','data-sing-redo-live','data-sing-settings'])assert.equal((html.match(new RegExp(hook,'g'))||[]).length,1,hook);
});

test('atmospheric artwork is decorative, route-specific, and recorder controls remain compact',()=>{
 const css=read('page-atmosphere.css');
 assert.match(css,/pointer-events:none/);
 for(const asset of ['records-v1.svg','conversation-v1.svg','gallery-v1.svg','gift-v1.svg','community-v1.svg','microphone-v1.svg','community-studio-v1.webp']){
  assert.match(css,new RegExp(asset.replace('.','\\.')));
  assert.ok(readFileSync(new URL('../dist/assets/atmosphere/'+asset,import.meta.url)).length>0);
 }
 assert.match(css,/studio-secondary-controls\{[^}]*grid-template-columns:repeat\(3/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(read('index.html'),/page-atmosphere.css/);
 assert.doesNotMatch(css,/recording-room-v1.webp/);
 assert.doesNotMatch(css,/karaoke-rose-mirrorball-v1.webp/);
});
test('new markup and last stylesheet are packaged, without replacing existing billing or audio controllers',()=>{
 const index=read('index.html'),build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.ok(index.indexOf('page-redesign.css')>index.indexOf('mobile-ux.css'));
 assert.ok(index.indexOf('page-redesign.js')<index.indexOf('actions.js'));
 assert.match(build,/'page-redesign.js','page-redesign.css'/);
 for(const script of ['gold-checkout.js','karaoke-core.js','audio-ads.js','social-chat.js'])assert.match(index,new RegExp(script.replace('.','\\.')));
});
test('banner gradients override the old flat theme and retain readable surfaces',()=>{
 const css=read('page-atmosphere.css'),index=read('index.html');
 assert.match(css,/--surface-wash:linear-gradient/);assert.match(css,/--surface-feature:linear-gradient/);
 assert.match(css,/\.home-sing-card\{background:radial-gradient/);
 assert.ok(index.indexOf('page-atmosphere.css')>index.indexOf('unified-ui.css'));
 assert.match(css,/\.community-crew-ranking a\{display:grid/);
});

test('desktop content clears the fixed sidebar and mobile uses the full viewport',()=>{
 const css=read('page-redesign.css');
 assert.match(css,/\.page-wrap\{width:calc\(100% - var\(--sidebar\)\);max-width:none;margin-left:var\(--sidebar\);margin-right:0\}/);
 assert.match(css,/@media\(max-width:800px\)\{\.page-wrap\{width:100%;margin-left:0;margin-right:0;padding-inline:0\}\}/);
});

