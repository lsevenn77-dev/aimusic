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

test('the visible reel button reacts on press once, with its compatibility click consumed',()=>{
  const {state,send,clicks}=setup();
  assert.equal(send('pointerdown',{reelButton:true,isPrimary:true,button:0}).defaultPrevented,true);
  assert.equal(state.pulls,1);
  assert.equal(send('click',{reelButton:true}).defaultPrevented,true);
  assert.equal(state.pulls,1);assert.equal(clicks(),0);
  // Keyboard-generated button click still reaches the normal delegated action.
  send('click',{reelButton:true});assert.equal(clicks(),1);
});

test('click-only mobile activation still reels when no pointer event arrived',()=>{
  const {state,send,clicks}=setup();
  assert.equal(send('click').defaultPrevented,true);
  assert.equal(state.pulls,1);assert.equal(clicks(),0);
});
