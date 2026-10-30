import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('frame metadata wins, transparent bounds are measured once, unavailable art reserves its full canvas',()=>{
 let reads=0;const pixels=new Uint8ClampedArray(4*4*4);pixels[(1*4+2)*4+3]=255;
 const document={addEventListener(){},createElement(){return {getContext:()=>({drawImage(){},getImageData(){reads++;return {data:pixels};}})};}};
 const c=vm.createContext({document});const source=readFileSync(new URL('../dist/decoration-display.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('const profileFrameBounds=')),c);
 const art={dataset:{},src:'/frame.png',complete:false,naturalWidth:4,naturalHeight:4};
 const bounds=()=>Array.from(c.frameArtworkBounds(art));
 assert.deepEqual(bounds(),[0,0,1,1]);art.complete=true;
 assert.deepEqual(bounds(),[.5,.25,.75,.5]);assert.deepEqual(bounds(),[.5,.25,.75,.5]);assert.equal(reads,1);
 art.dataset.frameBounds='0.1,0.2,0.8,0.9';assert.deepEqual(bounds(),[.1,.2,.8,.9]);
});

test('shared layout reserves asymmetric decoration clearance and resets after removal',()=>{
 const style={values:{},setProperty(k,v){this.values[k]=v;},getPropertyValue(k){return this.values[k]||'';}};
 const photo={getBoundingClientRect:()=>({left:20,right:120,top:30,bottom:130,width:100,height:100})};
 let arts=[{dataset:{frameBounds:'0,.1,1,1'},getBoundingClientRect:()=>({left:0,top:0,width:150,height:160})}];
 const host={style,querySelector:()=>photo,querySelectorAll:()=>arts,classList:{add(){}},closest:()=>null};
 const c=vm.createContext({document:{addEventListener(){},querySelectorAll:()=>[host]},getComputedStyle:()=>({visibility:'visible'})});
 const source=readFileSync(new URL('../dist/decoration-display.js',import.meta.url),'utf8');vm.runInContext(source.slice(source.indexOf('const profileFrameBounds=')),c);
 c.layoutProfileFrames();assert.equal(style.values['--frame-left'],'20px');assert.equal(style.values['--frame-right'],'30px');assert.equal(style.values['--frame-top'],'14px');assert.equal(style.values['--frame-bottom'],'30px');
 arts=[];c.layoutProfileFrames();for(const side of ['left','right','top','bottom'])assert.equal(style.values['--frame-'+side],'0px');
});
