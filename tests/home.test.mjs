import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/home.js',import.meta.url),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function element(){const listeners=new Map(),attrs=new Map();return {innerHTML:'',clientWidth:360,scrollLeft:0,addEventListener(type,fn,opts){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);opts?.signal?.addEventListener('abort',()=>listeners.set(type,(listeners.get(type)||[]).filter(f=>f!==fn)),{once:true});},emit(type,target=this){for(const fn of listeners.get(type)||[])fn({type,target,key:target.key,preventDefault(){}});},setAttribute(k,v){attrs.set(k,String(v));},getAttribute:k=>attrs.get(k),hasAttribute:k=>attrs.has(k),toggleAttribute(k,on){if(on)attrs.set(k,'');else attrs.delete(k);},scrollTo({left}){this.scrollLeft=left;}};}
function carousel(reducedMotion=false){
 const root=element(),rail=element(),auto=element(),dots=[element(),element(),element()],slides=[element(),element(),element()],document=element(),reduced=element(),timers=new Map();let serial=0,observer;
 reduced.matches=reducedMotion;root.querySelector=s=>s==='.home-hero-rail'?rail:auto;root.querySelectorAll=s=>s==='.home-hero-slide'?slides:dots;
 const c=vm.createContext({AbortController,document,matchMedia:()=>reduced,icon:name=>name,clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++serial,fn);return serial;},cancelAnimationFrame(){},requestAnimationFrame:fn=>{fn();return 1;},IntersectionObserver:class{constructor(fn){observer=this;this.callback=fn;}observe(){}disconnect(){this.disconnected=true;}},homeBrowseObserver:null});
 vm.runInContext(source,c);c.bindHomeCarousel(root);
 return {c,root,rail,auto,dots,slides,document,reduced,timers,get observer(){return observer;},tick(){const [id,fn]=timers.entries().next().value||[];timers.delete(id);fn?.();},click(attr,value=''){const target=element();target.setAttribute(attr,value);target.closest=()=>target;root.emit('click',target);}};
}
test('carousel auto-advances, makes only the active slide interactive and pauses when hidden',()=>{
 const h=carousel();assert.equal(h.timers.size,1);assert.equal(h.slides[1].hasAttribute('inert'),true);
 h.tick();assert.equal(h.rail.scrollLeft,360);assert.equal(h.slides[0].hasAttribute('inert'),true);assert.equal(h.slides[1].hasAttribute('inert'),false);assert.equal(h.dots[1].getAttribute('aria-current'),'true');
 h.document.hidden=true;h.document.emit('visibilitychange');assert.equal(h.timers.size,0);
 h.document.hidden=false;h.document.emit('visibilitychange');assert.equal(h.timers.size,1);
 h.observer.callback([{isIntersecting:false}]);assert.equal(h.timers.size,0);
});

test('genre filtering uses real multi-genre metadata without inventing categories',()=>{
 const c=vm.createContext({esc});vm.runInContext(source,c);
 const tracks=[{id:'a',genres:['Jazz','Soul']},{id:'b',genre:'Rock'},{id:'c',genre:'분석 대기'},{id:'d'}];
 assert.equal(c.homeFilterTracks(tracks,'').length,4);
 assert.deepEqual(c.homeFilterTracks(tracks,'Soul').map(t=>t.id),['a']);
 assert.equal(c.homeFilterTracks(tracks,'Pop').length,0);
 assert.equal(c.homeGenres(tracks[2]).length,0);
});

test('chart movement distinguishes missing history from unchanged rank and escapes descriptions',()=>{
 const c=vm.createContext({esc,hasArtist:()=>true,icon:name=>name,cover:()=>'<div></div>',number:String,liked:()=>false});vm.runInContext(source,c);
 assert.match(c.homeMovement({chart_movement:'up',rank_change:2}),/▲ 2/);
 assert.match(c.homeMovement({chart_movement:'down',rank_change:-3}),/▼ 3/);
 assert.match(c.homeMovement({}),/비교 기록 없음/);
 assert.match(c.homeMovement({chart_movement:'same',rank_change:0}),/변동 없음/);
 assert.doesNotMatch(c.releaseHTML([{id:'a',title:'곡',description:'<script>unsafe</script>'}]),/<script>/);
 assert.match(c.homePlay({id:'a',title:'곡'},true),/audio-play/);
});
test('manual carousel navigation, focus and reduced motion stop unsolicited movement',()=>{
 const h=carousel();h.click('data-home-slide','2');assert.equal(h.rail.scrollLeft,720);assert.equal(h.timers.size,0);assert.equal(h.auto.getAttribute('aria-label'),'자동 전환 시작');
 h.click('data-home-auto');assert.equal(h.timers.size,1);h.root.emit('focusin');assert.equal(h.timers.size,0);
 const reduced=carousel(true);assert.equal(reduced.timers.size,0);reduced.click('data-home-next');assert.equal(reduced.rail.scrollLeft,360);assert.equal(reduced.timers.size,0);
});
test('leaving home cancels timers, animation work, observers and listeners',()=>{
 const h=carousel();h.c.cleanupHome();assert.equal(h.timers.size,0);assert.equal(h.observer.disconnected,true);
 h.click('data-home-next');assert.equal(h.rail.scrollLeft,0);h.document.emit('visibilitychange');assert.equal(h.timers.size,0);
});
test('participant names use real API fields, reject null names, and escape rendered metadata',()=>{
 const c=vm.createContext({esc,hasArtist:t=>t.kind!=='cover',icon:()=>'',cover:()=>'<div></div>',number:String,liked:()=>false});vm.runInContext(source,c);
 assert.equal(c.homeArtist({kind:'cover',producer:'리스너',duet_partner:'파트너'}),'리스너 & 파트너');
 assert.equal(c.homeArtist({kind:'cover',producer:'null',duet_partner:'undefined'}),'AIFECT 음악가');
 const html=c.homeAlbumHTML({id:'<id>',title:'<script>bad</script>',artist:'<name>'});assert.doesNotMatch(html,/<script>|<name>/);assert.match(html,/&lt;script&gt;/);
});
test('home routes preserve existing navigation and distinguish playback, details and recording',()=>{
 const c=vm.createContext({esc,hasArtist:()=>true,icon:()=>'',cover:()=>'<div></div>',number:String,liked:()=>false});vm.runInContext(source,c);
 const nav=c.homeShortcuts();for(const section of ['recommended','popular','latest','discover'])assert.ok(nav.includes('data-home-jump="home-'+section+'"'));
 assert.equal((nav.match(/href="#home"/g)||[]).length,4);
 assert.doesNotMatch(c.homeHTML(),/home-library|home-history|home-curations|home-people/);
 for(const route of ['#karaoke','#karaoke/duets','#karaoke/dubbing?tab=join'])assert.ok(c.homeSingHTML().includes('href="'+route+'"'));
 const row=c.homeRowHTML({id:'song',title:'곡'},{singable:true});assert.match(row,/data-play="song" data-community-toggle/);assert.match(row,/href="#song\/song"/);assert.match(row,/href="#sing\/song"/);
});
