import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function display({legacy=true,preview=false,paid=true,canvas=false}={}){
 let timeout,interval,resize,overlay=null,stamp=100000;
 const properties=new Map(),classes=new Set(canvas?['profile-frame-canvas']:[]),events={};
 const legacyImage={style:{},src:'/assets/crew-basic-v2.webp'};
 const host={classList:{add:c=>classes.add(c),contains:c=>classes.has(c)},style:{setProperty:(k,v)=>properties.set(k,v)},
  querySelector:s=>s.includes('player-frame-artwork')?(legacy?legacyImage:null):overlay,
  querySelectorAll:s=>s.includes('aurora_ring_frame')&&legacyImage.src.includes('aurora_ring_frame')?[legacyImage]:[],append(el){overlay=el;}};
 const img={isConnected:true,parentElement:host,dataset:{avatarProfile:'person'},offsetLeft:7,offsetTop:9,offsetWidth:88,offsetHeight:88,closest:()=>preview?{}:null,getBoundingClientRect(){throw Error('visual transforms must not enter local frame geometry');}};
 const create=()=>({getAttribute(k){return this[k];},setAttribute(k,v){this[k]=v;},remove(){overlay=null;}});
 const document={documentElement:{},hidden:false,querySelectorAll:s=>s==='img[data-avatar-profile]'?[img]:[],querySelector:()=>null,createElement:create,addEventListener:(name,fn)=>events[name]=fn};
 const c=vm.createContext({document,window:{addEventListener:(name,fn)=>events[name]=fn},MutationObserver:class{observe(){}},ResizeObserver:class{constructor(fn){resize=fn;}observe(){}unobserve(){}},Date:{now:()=>stamp*1000},setTimeout:fn=>(timeout=fn,1),clearTimeout(){},setInterval:fn=>(interval=fn,1),api:async()=>({server_now:stamp,avatars:[{profile_id:'person',artwork:paid?'/assets/products/aurora_ring_frame.png':null,expires_at:stamp+10}]})});
 vm.runInContext(readFileSync(new URL('../dist/decoration-display.js',import.meta.url),'utf8'),c);
 return {properties,classes,img,legacyImage,events,get overlay(){return overlay;},start:async()=>{timeout();await new Promise(r=>setImmediate(r));},resize:()=>resize(),expire(){stamp+=11;interval();}};
}

test('basic and paid art share the photo local center, independent of transformed visual rectangles',async()=>{
 const f=display();await f.start();assert.ok(f.overlay);assert.ok(f.classes.has('avatar-frame-host'));
 assert.equal(f.properties.get('--avatar-frame-x'),'51px');assert.equal(f.properties.get('--avatar-frame-y'),'53px');
 assert.equal(f.properties.get('--avatar-frame-width'),'110.88px');assert.equal(f.properties.get('--avatar-frame-height'),'110.88px');
 f.img.offsetWidth=104;f.img.offsetHeight=104;f.img.offsetLeft=4;f.resize();assert.equal(f.properties.get('--avatar-frame-x'),'56px');assert.equal(f.properties.get('--avatar-frame-width'),'131.04px');
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

test('profile popup uses the same equipped frame markup as profile portraits',()=>{
 const c=vm.createContext({me:{id:'self'},esc:String,number:String,icon:()=>'',avatarImage:()=>'<img class="profile-avatar-image">',document:{addEventListener(){}},window:{addEventListener(){}}});
 vm.runInContext(readFileSync(new URL('../dist/player-progress.js',import.meta.url),'utf8'),c);
 vm.runInContext(readFileSync(new URL('../dist/profile-preview.js',import.meta.url),'utf8'),c);
 const html=c.profilePreviewHTML({profile:{id:'p',user_id:'self',name:'사진',profile_frame:'crew-outline',profile_frame_artwork:'/assets/crew-basic-v2.webp'}});
 assert.match(html,/profile-preview-photo player-avatar player-has-frame/);assert.match(html,/player-frame-artwork/);assert.match(html,/crew-basic-v2.webp/);
});
