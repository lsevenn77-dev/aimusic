import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/player-shell.js',import.meta.url),'utf8');
const artistRule=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').split('\n').find(line=>line.startsWith('const hasArtist='));
function fixture(){
 const nodes=new Map(),audioEvents={},documentEvents={};let width=390;
 function node(id){const classes=new Set();return {id,hidden:false,innerHTML:'',textContent:'',max:100,value:25,dataset:{},attributes:{},events:{},parentElement:null,contains:()=>true,style:{setProperty(k,v){this[k]=v;}},getBoundingClientRect:()=>({width}),querySelectorAll:()=>[],classList:{contains:k=>classes.has(k),remove:k=>classes.delete(k),toggle(k,v){v?classes.add(k):classes.delete(k);}},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},addEventListener(k,fn){this.events[k]=fn;},focus(){this.focused=true;},append(...els){els.forEach(el=>el.parentElement=this);},prepend(...els){this.append(...els);}};}
 for(const id of ['.player','#volume','.player-controls','#seek','#player-lyrics-toggle','#player-more','#player-extension','#player-action-panel','#player-actions','#player-inline-actions','#player-volume-toggle','#player-utility-panel','.player-volume-box','.player-buttons','.player-utility-buttons','#shuffle','#repeat','#play-toggle','#player-close','#queue-toggle','#elapsed','#duration','#now-playing','#player-genre','.player-track-details','.player-meta-line','.player-clock'])nodes.set(id,node(id));
 const e=s=>nodes.get(s);e('#player-actions').parentElement=e('#player-action-panel');e('#shuffle').parentElement=e('.player-buttons');e('#repeat').parentElement=e('.player-buttons');
 Object.defineProperty(e('.player'),'clientWidth',{get:()=>width});
 e('.player-buttons').getBoundingClientRect=()=>({width:220});
 e('.player-controls').children=[{getBoundingClientRect:()=>({width:e('.player').dataset.playerLayout==='labels'?720:441})}];
 e('.player-controls').insertBefore=el=>el.parentElement=e('.player-controls');
 const audio={currentTime:25,duration:NaN,volume:.75,muted:false,paused:false,addEventListener(k,fn){audioEvents[k]=fn;}};
 const document={querySelector:s=>e(s)||null,addEventListener(k,fn){documentEvents[k]=fn;},createElement:()=>({getContext:()=>({measureText:t=>({width:t.length*8})})})};
 const context=vm.createContext({document,audio,window:{},getComputedStyle:()=>({fontFamily:'sans-serif',paddingLeft:'10px',paddingRight:'10px',columnGap:'10px',gridTemplateColumns:'1px 220px 1px',display:'flex'}),ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},current:{id:'one'},shuffle:false,repeatMode:0,esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),cover:()=>'<img>',icon:s=>'<svg>'+s+'</svg>',liked:()=>true,giftButton:t=>t.own?'':'<button data-gift="'+t.id+'"><span>선물</span></button>'});
 vm.runInContext(artistRule,context);vm.runInContext(source,context);
 return {e,context,audio,audioEvents,documentEvents,click:s=>e(s).events.click(),view:()=>e('.player').dataset.playerView,run:s=>vm.runInContext(s,context),resize:n=>{width=n;context.window.AifectPlayerShell.refresh();}};
}
test('all six explicit panel transitions remain exclusive without touching audio',()=>{const f=fixture();for(const [id,view] of [['#player-lyrics-toggle','lyrics'],['#player-lyrics-toggle','none'],['#player-more','actions'],['#player-lyrics-toggle','lyrics'],['#player-more','actions'],['#player-more','none']]){f.click(id);assert.equal(f.view(),view);assert.equal(f.e('#player-extension').hidden,view==='none');assert.equal(f.e('#player-action-panel').hidden,view!=='actions');assert.equal(f.audio.currentTime,25);}});
test('a new track updates all five action targets and preserves the open panel',()=>{const f=fixture();for(const [trigger,view] of [['#player-more','actions'],['#player-lyrics-toggle','lyrics']]){f.click(trigger);f.run("renderPlayerActions({id:'next',title:'<unsafe>',kind:'cover',producer:'Creator'})");assert.equal(f.view(),view);const html=f.e('#player-actions').innerHTML;for(const target of ['data-like="next"','data-gift="next"','data-add="next"','#song/next?comments=1','data-share="next"'])assert.ok(html.includes(target));assert.ok(f.e('#now-playing').innerHTML.includes('&lt;unsafe>'));assert.ok(f.e('#now-playing').innerHTML.includes('Creator'));}});
test('responsive relocation preserves action nodes and keeps queue options reachable',()=>{const f=fixture(),actions=f.e('#player-actions');f.click('#player-more');f.resize(1440);assert.equal(f.view(),'actions');assert.equal(f.e('#player-extension').hidden,false);assert.equal(actions.parentElement,f.e('#player-inline-actions'));assert.equal(f.e('#player-volume-toggle').parentElement,f.e('.player-volume-box'));f.resize(390);assert.equal(f.e('#player-extension').hidden,false);assert.equal(actions.parentElement,f.e('#player-action-panel'));assert.equal(f.e('#player-volume-toggle').parentElement,f.e('.player-utility-buttons'));});
test('credits preserve original artist fallback and cover author policy',()=>{const f=fixture();for(const [track,expected] of [[{kind:'cover',producer:'Creator',artist:'Original'},'Creator'],[{artist_id:'a',artist:'Singer',producer:'Composer'},'Singer'],[{has_ai_artist:false,artist:'미등록',producer:'Composer'},'Composer'],[{},'']]){f.context.track=track;assert.equal(f.run('playerCredit(track)'),expected);}});
test('own-track gifts remain suppressed by the original helper',()=>{const f=fixture();f.run("renderPlayerActions({id:'own',title:'Own',own:true})");assert.ok(!f.e('#player-actions').innerHTML.includes('data-gift'));});
test('finite clock formatting handles hours, missing and invalid values',()=>{const f=fixture();for(const [input,expected] of [[0,'0:00'],[65.9,'1:05'],[3661,'1:01:01'],[-9,'0:00'],[Infinity,'0:00'],[NaN,'0:00']]){f.context.input=input;assert.equal(f.run('playerClock(input)'),expected);}});
test('seek preview survives time ticks and cancellation releases scrubbing',()=>{const f=fixture();f.e('#seek').events.pointerdown({pointerId:1});f.e('#seek').value=70;f.e('#seek').events.input();f.audioEvents.timeupdate();assert.equal(f.e('#seek').style['--seek-progress'],'70%');assert.equal(f.e('#seek').attributes['aria-valuetext'],'1:10 / 1:40');assert.equal(f.context.window.AifectPlayerShell.scrubbing,true);f.e('#seek').events.pointercancel();assert.equal(f.context.window.AifectPlayerShell.scrubbing,false);assert.equal(f.e('#elapsed').textContent,'0:25');});
test('display clamps time to duration and disables unknown duration seeking',()=>{const f=fixture();f.audio.currentTime=150;f.audioEvents.seeked();assert.equal(f.e('#elapsed').textContent,'1:40');assert.equal(f.e('#seek').style['--seek-progress'],'100%');f.e('#seek').max=0;f.audio.currentTime=0;f.audioEvents.emptied();assert.equal(f.e('#duration').textContent,'0:00');assert.equal(f.e('#seek').disabled,true);});
test('clock reserves the same space before and after crossing one hour',()=>{const f=fixture();f.e('#seek').max=3661;for(const time of [1,3599,3600,3661]){f.audio.currentTime=time;f.audioEvents.seeked();assert.equal(f.e('.player-clock').style['--player-clock-width'],'17ch');}assert.equal(f.e('#elapsed').textContent,'1:01:01');});
test('repeat and shuffle presentation reflects the engine globals independently',()=>{const f=fixture();f.context.shuffle=true;for(const mode of [0,1,2,0]){f.context.repeatMode=mode;f.context.window.AifectPlayerShell.paintModes();assert.equal(f.e('#repeat').dataset.repeatMode,String(mode));assert.equal(f.e('#shuffle').attributes['aria-pressed'],'true');assert.equal(f.e('#repeat').innerHTML.includes('repeat-one'),mode===2);}});
test('repeat clicks cycle all engine modes without emitting a toast',()=>{
 const f=fixture(),notices=[];
 f.context.$=f.e;f.context.toast=message=>notices.push(message);f.context.saveResume=()=>{};
 const handler=readFileSync(new URL('../dist/actions.js',import.meta.url),'utf8').split('\n').find(line=>line.startsWith("$('#repeat').onclick="));
 vm.runInContext(handler,f.context);
 for(const mode of [1,2,0]){f.e('#repeat').onclick();assert.equal(f.context.repeatMode,mode);assert.equal(f.e('#repeat').dataset.repeatMode,String(mode));assert.equal(f.e('#repeat').attributes['aria-pressed'],String(!!mode));assert.equal(f.audio.currentTime,25);}
 assert.deepEqual(notices,[]);
 f.context.toast('normal notification');assert.deepEqual(notices,['normal notification']);
});
test('mute is immediate and independent from playback, clock, panels and stored volume',()=>{
 const f=fixture();f.audio.volume=.37;f.audioEvents.volumechange();f.click('#player-more');
 for(const muted of [true,false,true,false]){f.click('#player-volume-toggle');assert.equal(f.audio.muted,muted);assert.equal(f.audio.volume,.37);assert.equal(f.audio.paused,false);assert.equal(f.audio.currentTime,25);assert.equal(f.view(),'actions');assert.equal(f.e('#player-volume-toggle').attributes['aria-pressed'],String(muted));assert.equal(f.e('#player-volume-toggle').attributes['aria-expanded'],undefined);}
 f.click('#player-close');assert.equal(f.view(),'none');
});
test('external volume changes update the mute icon and zero volume restores last audible setting',()=>{
 const f=fixture();f.audio.volume=.42;f.audioEvents.volumechange();f.audio.volume=0;f.audioEvents.volumechange();assert.match(f.e('#player-volume-toggle').innerHTML,/volume-off/);
 f.click('#player-volume-toggle');assert.equal(f.audio.volume,.42);assert.equal(f.audio.muted,false);assert.match(f.e('#player-volume-toggle').innerHTML,/>volume</);
 f.audio.muted=true;f.audioEvents.volumechange();assert.equal(f.e('#player-volume-toggle').attributes['aria-pressed'],'true');
});

test('slider updates the existing audio and dragging out of mute restores audibility',()=>{
 const f=fixture();f.e('#volume').value='0.37';f.e('#volume').events.input();
 assert.equal(f.audio.volume,.37);assert.equal(f.audio.muted,false);
 f.click('#player-volume-toggle');assert.equal(f.audio.muted,true);
 f.e('#volume').value='0.62';f.e('#volume').events.input();
 assert.equal(f.audio.volume,.62);assert.equal(f.audio.muted,false);
 f.e('#volume').value='0';f.e('#volume').events.input();
 f.click('#player-volume-toggle');assert.equal(f.audio.volume,.62);
 assert.equal(f.e('#volume').value,'0.62');assert.equal(f.audio.currentTime,25);
});

test('live width budget switches labels, icons and overflow without losing the volume input',()=>{
 const f=fixture();for(const [width,layout] of [[1920,'labels'],[1440,'icons'],[1024,'compact'],[390,'compact'],[1280,'icons']]){
  f.resize(width);assert.equal(f.e('.player').dataset.playerLayout,layout);
  assert.equal(f.e('#volume').parentElement,f.e(layout==='compact'?'.player-utility-buttons':'.player-volume-box'));
 }
});

test('long titles hide the clock first and a shorter title restores it on refresh',()=>{
 const f=fixture(),find=f.context.document.querySelector,title={scrollWidth:400,clientWidth:250};
 f.context.document.querySelector=s=>s==='.player-metadata strong'?title:find(s);
 f.resize(1440);assert.equal(f.e('.player').dataset.playerTimeHidden,'true');
 title.scrollWidth=100;f.context.window.AifectPlayerShell.refresh();
 assert.equal(f.e('.player').dataset.playerTimeHidden,'false');
 title.scrollWidth=400;f.resize(1024);assert.equal(f.e('.player').dataset.playerTimeHidden,'true');
 assert.equal(f.audio.currentTime,25);assert.equal(f.audio.paused,false);
});

test('only the narrowest player moves the same lyrics control into the existing options panel',()=>{
 const f=fixture(),lyrics=f.e('#player-lyrics-toggle');
 f.resize(256);assert.equal(f.e('.player').dataset.playerNarrow,'true');
 assert.equal(lyrics.parentElement,f.e('.player-utility-buttons'));
 f.click('#player-more');f.click('#player-lyrics-toggle');assert.equal(f.view(),'lyrics');
 f.resize(390);assert.equal(f.e('.player').dataset.playerNarrow,'false');
 assert.equal(lyrics.parentElement,f.e('.player-controls'));
 assert.equal(f.audio.currentTime,25);assert.equal(f.audio.paused,false);
});
