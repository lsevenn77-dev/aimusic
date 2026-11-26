import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectPlayer from '../shared/player.js';

function display({legacy=true,preview=false,paid=true,canvas=false,frameKey='frame_aurora_ring'}={}){
 let timeout,interval,resize,overlay=null,effect=null,stamp=100000;
 const properties=new Map(),classes=new Set(canvas?['profile-frame-canvas']:[]),events={};
 const item=AifectPlayer.PLAYER_ITEMS[paid?frameKey:'crew-outline'];
 const legacyImage={style:{},src:item.display.overlay,getAttribute(k){return this[k];}};
 const host={classList:{add:c=>classes.add(c),contains:c=>classes.has(c)},style:{setProperty:(k,v)=>properties.set(k,v)},
  querySelector:s=>s.includes('player-frame-artwork')?(legacy?legacyImage:null):overlay,
  querySelectorAll:s=>s===':scope > img.player-frame-artwork'&&legacy?[legacyImage]:[],append(el){overlay=el;}};
 const img={isConnected:true,parentElement:host,dataset:{avatarProfile:'person'},offsetLeft:7,offsetTop:9,offsetWidth:88,offsetHeight:88,closest:()=>preview?{}:null,getBoundingClientRect(){throw Error('visual transforms must not enter local frame geometry');}};
 const create=()=>({isConnected:true,closest:()=>null,getAttribute(k){return this[k];},setAttribute(k,v){this[k]=v;},after(el){effect=el;},remove(){if(this===effect)effect=null;else overlay=null;}});
 const document={documentElement:{},hidden:false,querySelectorAll:s=>s==='img[data-avatar-profile]'?[img]:[],querySelector:()=>null,createElement:create,addEventListener:(name,fn)=>events[name]=fn};
 const c=nicknameContext({AifectPlayer,document,window:{addEventListener:(name,fn)=>events[name]=fn},MutationObserver:class{observe(){}},IntersectionObserver:class{constructor(fn){this.notify=fn;}observe(target){this.notify([{target,isIntersecting:true}]);}unobserve(){}},ResizeObserver:class{constructor(fn){resize=fn;}observe(){}unobserve(){}},Date:{now:()=>stamp*1000},setTimeout:fn=>(timeout=fn,1),clearTimeout(){},setInterval:fn=>(interval=fn,1),api:async()=>({server_now:stamp,avatars:[{profile_id:'person',artwork:paid?item.artwork:null,effect:paid?item.effect:null,expires_at:stamp+10}]})});
 vm.runInContext(readFileSync(new URL('../dist/decoration-display.js',import.meta.url),'utf8'),c);
 return {properties,classes,img,legacyImage,events,get overlay(){return overlay;},get effect(){return effect;},start:async()=>{timeout();await new Promise(r=>setImmediate(r));},resize:()=>resize(),expire(){stamp+=11;interval();}};
}

test('basic and paid art share the photo local center, independent of transformed visual rectangles',async()=>{
 const f=display();await f.start();assert.ok(f.overlay);assert.ok(f.classes.has('avatar-frame-host'));
 assert.equal(f.properties.get('--avatar-frame-x'),'51px');assert.equal(f.properties.get('--avatar-frame-y'),'53px');
 assert.equal(f.properties.get('--avatar-frame-width'),'132px');assert.equal(f.properties.get('--avatar-frame-height'),'132px');
 assert.equal(f.overlay.src,'/assets/profile-frames-v1/aurora_ring_frame.png');
 f.img.offsetWidth=104;f.img.offsetHeight=104;f.img.offsetLeft=4;f.resize();assert.equal(f.properties.get('--avatar-frame-x'),'56px');assert.equal(f.properties.get('--avatar-frame-width'),'156px');
});

test('normalized home art uses its reserved canvas without legacy image measurements',async()=>{
 const f=display({canvas:true,legacy:false});
 Object.defineProperty(f.img,'offsetWidth',{get(){throw Error('canvas sizing is CSS-owned');}});
 await f.start();assert.equal(f.overlay.src,'/assets/profile-frames-v1/aurora_ring_frame.png');
 assert.equal(f.properties.size,0);f.expire();assert.equal(f.overlay,null);
});

test('paid expiry removes only its overlay while basic and preview frames keep their existing ownership behavior',async()=>{
 const f=display({legacy:false});await f.start();assert.ok(f.overlay);f.expire();assert.equal(f.overlay,null);
 const basic=display({paid:false});await basic.start();assert.equal(basic.overlay,null);assert.ok(basic.classes.has('avatar-frame-host'));
 const preview=display({preview:true});await preview.start();assert.equal(preview.overlay,null);assert.equal(preview.properties.size,0);
});

test('animated space frame uses the same normalized canvas on small photos and hides both layers on expiry',async()=>{
 const f=display({frameKey:'frame_space_bunny'});f.img.offsetWidth=36;f.img.offsetHeight=36;
 await f.start();
 assert.equal(f.overlay.src,'/assets/profile-frames-v1/space_bunny_base.png');
 assert.equal(f.effect.src,'/assets/profile-frames-v1/space_bunny_fx.webp');
 assert.equal(f.properties.get('--avatar-frame-width'),'54px');
 assert.equal(f.properties.get('--avatar-frame-x'),'25px');
 assert.equal(f.legacyImage.style.visibility,'');
 f.expire();assert.equal(f.overlay,null);assert.equal(f.effect,null);assert.equal(f.legacyImage.style.visibility,'hidden');
});

test('all equipped frames use the normalized photo opening from the first HTML paint',()=>{
 const c=vm.createContext({AifectPlayer,document:{addEventListener(){}},esc:String});
 vm.runInContext(readFileSync(new URL('../dist/player-progress.js',import.meta.url),'utf8'),c);
 for(const [key,item] of Object.entries(AifectPlayer.PLAYER_ITEMS)){
  const p={profile_frame:key,profile_frame_artwork:item.artwork};
  assert.equal(c.playerFrameURL(p),item.display.overlay,key);
  assert.ok(c.playerBadgeHTML(p).includes('src="'+item.display.overlay+'"'),key);
 }
});

test('profile popup uses the same equipped frame markup as profile portraits',()=>{
 const c=nicknameContext({AifectPlayer,me:{id:'self'},esc:String,number:String,icon:()=>'',avatarImage:()=>'<img class="profile-avatar-image">',document:{addEventListener(){}},window:{addEventListener(){}}});
 vm.runInContext(readFileSync(new URL('../dist/player-progress.js',import.meta.url),'utf8'),c);
 vm.runInContext(readFileSync(new URL('../dist/profile-preview.js',import.meta.url),'utf8'),c);
 const html=c.profilePreviewHTML({profile:{id:'p',user_id:'self',name:'사진',profile_frame:'crew-outline',profile_frame_artwork:'/assets/crew-basic-v2.webp'}});
 assert.match(html,/profile-preview-photo player-avatar player-has-frame/);assert.match(html,/player-frame-artwork/);assert.match(html,/crew-basic-v2.webp/);
});
