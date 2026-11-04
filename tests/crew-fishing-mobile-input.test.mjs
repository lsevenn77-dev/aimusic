import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMobileReelInput} from '../dist/crew-fishing/mobile-input.js';

function setup(pointerEvents=true){
  const root=new EventTarget();
  const state={mobile:true,playing:true,pulls:0};
  bindMobileReelInput({root,mobile:()=>state.mobile,playing:()=>state.playing,
    pull:()=>state.pulls++,pointerEvents});
  let clicks=0;
  root.addEventListener('click',()=>clicks++);
  function send(type,{control=false,reelButton=false,...props}={}){
    const e=new Event(type,{cancelable:true});
    Object.defineProperty(e,'target',{value:{closest:selector=>selector==='[data-act="pull"]'?(reelButton?{}:null):(control||reelButton?{}:null)}});
    Object.assign(e,props);root.dispatchEvent(e);return e;
  }
  return {state,send,clicks:()=>clicks};
}

test('mobile presses anywhere reel immediately; release/click never reel twice',()=>{
  const {state,send,clicks}=setup();
  // Sea, gauge, header text and blank page space all use the same document input.
  for(let i=0;i<4;i++){
    assert.equal(send('pointerdown',{isPrimary:true,button:0,pointerType:'touch'}).defaultPrevented,true);
    assert.equal(state.pulls,i+1);
    send('pointerup');
    assert.equal(send('click').defaultPrevented,true);
    assert.equal(state.pulls,i+1);
  }
  assert.equal(clicks(),0);
});

test('desktop and inactive screens keep their existing click controls',()=>{
  const {state,send,clicks}=setup();
  for(const [mobile,playing] of [[false,true],[true,false]]){
    Object.assign(state,{mobile,playing});
    assert.equal(send('pointerdown').defaultPrevented,false);
    assert.equal(send('click').defaultPrevented,false);
  }
  assert.equal(state.pulls,0);assert.equal(clicks(),2);
});

test('navigation, rules dialog controls, secondary touches and right-click do not reel',()=>{
  const {state,send,clicks}=setup();
  send('pointerdown',{control:true});send('click',{control:true});
  send('pointerdown',{button:2});
  send('pointerdown',{isPrimary:false});
  assert.equal(state.pulls,0);assert.equal(clicks(),1);
  send('pointerdown',{isPrimary:true});
  send('pointerdown',{isPrimary:false});
  send('click');
  assert.equal(state.pulls,1);assert.equal(clicks(),1);
});

test('a completed catch cannot click through into result actions; next deliberate press works',()=>{
  const {state,send,clicks}=setup();
  send('pointerdown');state.playing=false;
  assert.equal(send('click',{control:true}).defaultPrevented,true);
  send('pointerdown',{control:true});send('click',{control:true});
  assert.equal(clicks(),1);assert.equal(state.pulls,1);
});

test('older touch browsers use one touchstart, and cancellation does not swallow later controls',()=>{
  const {state,send,clicks}=setup(false);
  send('touchstart',{touches:[{}]});send('touchstart',{touches:[{},{}]});
  assert.equal(state.pulls,1);assert.equal(send('click').defaultPrevented,true);
  send('touchstart',{touches:[{}]});send('touchcancel');
  assert.equal(send('click',{control:true}).defaultPrevented,false);
  assert.equal(clicks(),1);
});

test('TouchEvent-only input works even when PointerEvent exists and the media query says desktop',()=>{
  const {state,send,clicks}=setup();
  state.mobile=false;
  assert.equal(send('touchstart',{touches:[{identifier:1}]}).defaultPrevented,true);
  assert.equal(state.pulls,1);
  send('touchend',{touches:[]});
  assert.equal(send('click').defaultPrevented,true);
  assert.equal(state.pulls,1);assert.equal(clicks(),0);
  send('touchstart',{touches:[{identifier:2}]});assert.equal(state.pulls,2);
});

test('click-only mobile activation still reels when no pointer event arrived',()=>{
  const {state,send,clicks}=setup();
  assert.equal(send('click').defaultPrevented,true);
  assert.equal(state.pulls,1);assert.equal(clicks(),0);
});

test('a native pointer/touch pair reels once per gesture and does not drop the next press',()=>{
  const {state,send,clicks}=setup();state.mobile=false;
  for(let id=1;id<=3;id++){
    send('pointerdown',{pointerType:'touch',pointerId:id,isPrimary:true,button:0});
    send('touchstart',{touches:[{identifier:id}]});
    send('pointerup',{pointerId:id});send('touchend',{touches:[]});send('click');
    assert.equal(state.pulls,id);
  }
  assert.equal(clicks(),0);
});

test('touch-first event ordering and pen input also work without a mobile media match',()=>{
  const {state,send}=setup();state.mobile=false;
  send('touchstart',{touches:[{identifier:1}]});
  send('pointerdown',{pointerType:'touch',pointerId:1,isPrimary:true,button:0});
  assert.equal(state.pulls,1);
  send('pointerup',{pointerId:1});send('touchend',{touches:[]});send('click');
  send('pointerdown',{pointerType:'pen',pointerId:2,isPrimary:true,button:0});
  assert.equal(state.pulls,2);
});


test('the native play-field button receives direct input while other controls remain excluded',()=>{
  const root=new EventTarget();let pulls=0;
  bindMobileReelInput({root,mobile:()=>true,playing:()=>true,pull:()=>pulls++});
  function send(type,target,props={}){const event=new Event(type,{cancelable:true});Object.defineProperty(event,'target',{value:target});Object.assign(event,props);root.dispatchEvent(event);return event;}
  const surface={closest:()=>root},navigation={closest:()=>({})};
  send('pointerdown',surface,{pointerType:'touch',pointerId:1});
  send('touchstart',surface,{touches:[{}]});send('pointerup',surface,{pointerId:1});send('touchend',surface,{touches:[]});send('click',surface);
  assert.equal(pulls,1);
  send('click',surface);assert.equal(pulls,2);
  send('pointerdown',navigation);send('click',navigation);assert.equal(pulls,2);
});
