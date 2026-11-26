import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../dist/mobile-input.js', import.meta.url), 'utf8');
function fixture({visual = true, mobile = true} = {}) {
  const listeners = new Map(), timers = new Map(), frames = new Map(); let serial = 0;
  const emitter = () => {
    const handlers = new Map();
    const target = {
      addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
      removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
      dispatchEvent(event) { for (const fn of [...handlers.get(event.type) || []]) fn(event); },
      count(name) { return handlers.get(name)?.size || 0; }
    };
    listeners.set(target, handlers); return target;
  };
  const node = () => {
    const attrs = new Map(), properties = new Map();
    return {attrs, properties, setAttribute: (k,v) => attrs.set(k,v), removeAttribute: k => attrs.delete(k),
      hasAttribute: k => attrs.has(k), toggleAttribute: (k,on) => on ? attrs.set(k,'') : attrs.delete(k),
      style: {setProperty: (k,v) => properties.set(k,v), removeProperty: k => properties.delete(k)}};
  };
  const root = node(), popup = Object.assign(node(), {scrollHeight:900, clientHeight:300, scrollTop:100, getBoundingClientRect:()=>({top:20,bottom:320})});
  const input = {isConnected:true, value:'한글 입력', selectionStart:2, selectionEnd:2, matches:()=>true, closest:()=>popup,
    getBoundingClientRect:()=>({top:350,bottom:394})};
  const vv = Object.assign(emitter(), {height:844, offsetTop:0, scale:1});
  const media = Object.assign(emitter(), {matches:mobile});
  const window = emitter(), document = Object.assign(emitter(), {documentElement:root, activeElement:input});
  if (visual) window.visualViewport = vv;
  const context = nicknameContext({window, document, innerHeight:844, innerWidth:390,
    screen:{orientation:{type:'portrait-primary'}}, matchMedia:()=>media, Event:class {constructor(type) {this.type=type;}},
    requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;}, cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:fn=>{timers.set(++serial,fn);return serial;}, clearTimeout:id=>timers.delete(id)});
  vm.runInContext(source, context);
  const flush = () => {const pending=[...frames.values()]; frames.clear(); pending.forEach(fn=>fn());};
  const settle = () => {const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());flush();};
  const fire = (target,type,extra={}) => {target.dispatchEvent({type,...extra});flush();};
  return {context,window,document,root,popup,input,vv,media,flush,settle,fire,
    focus:()=>fire(document,'focusin',{target:input}), measure:()=>window.AifectMobileInput.measure()};
}

test('Safari overlay/panning constrains only the active popup without altering input or cursor', () => {
  const f=fixture(); f.focus(); f.vv.height=450; f.vv.offsetTop=64; f.fire(f.vv,'resize');
  assert.equal(f.measure().keyboard,true); assert.equal(f.measure().bottom,514);
  assert.equal(f.popup.properties.get('--input-viewport-top'),'72px');
  assert.equal(f.popup.properties.get('--input-viewport-height'),'434px');
  assert.equal(f.root.hasAttribute('data-mobile-keyboard'),true);
  f.settle(); const top=f.popup.scrollTop;
  for(let i=0;i<4;i++)f.fire(f.vv,'scroll'); f.settle();
  assert.equal(f.popup.scrollTop,top); assert.equal(f.input.value,'한글 입력');assert.equal(f.input.selectionStart,2);
});
test('Android layout resize and visual resize use one viewport height, with no extra keyboard inset', () => {
  const f=fixture(); f.focus(); f.context.innerHeight=420; f.vv.height=420;
  f.fire(f.window,'resize'); f.fire(f.vv,'resize');
  assert.equal(f.measure().keyboard,true); assert.equal(f.measure().height,420);
  assert.equal(f.popup.properties.get('--input-viewport-height'),'404px');
  f.vv.height=844;f.context.innerHeight=844;f.fire(f.vv,'resize');
  assert.equal(f.popup.hasAttribute('data-input-viewport'),false);assert.equal(f.root.hasAttribute('data-mobile-keyboard'),false);
});
test('layout resize fallback works without VisualViewport', () => {
  const f=fixture({visual:false});f.focus();f.context.innerHeight=400;f.fire(f.window,'resize');
  assert.equal(f.measure().keyboard,true);assert.equal(f.measure().height,400);
});
test('rotating with the keyboard open retains the landscape keyboard geometry', () => {
  const f=fixture();f.focus();f.vv.height=420;f.fire(f.vv,'resize');
  f.context.screen.orientation.type='landscape-primary';f.context.innerWidth=844;f.context.innerHeight=200;f.vv.height=200;
  f.fire(f.window,'resize');assert.equal(f.measure().keyboard,true);assert.equal(f.measure().height,200);
  f.context.screen.orientation.type='portrait-primary';f.context.innerWidth=390;f.context.innerHeight=420;f.vv.height=420;
  f.fire(f.window,'resize');assert.equal(f.measure().keyboard,true);
});
test('orientation fallback uses width changes and ignores keyboard-only height changes', () => {
  const f=fixture();delete f.context.screen.orientation;f.focus();f.context.innerHeight=420;f.vv.height=420;f.fire(f.window,'resize');
  assert.equal(f.measure().keyboard,true);
  f.context.innerWidth=844;f.context.innerHeight=200;f.vv.height=200;f.fire(f.window,'resize');
  assert.equal(f.measure().keyboard,true);
});
test('short keyboard viewports enable the compact composer and restore it on close', () => {
  const f=fixture();f.focus();f.vv.height=220;f.fire(f.vv,'resize');
  assert.equal(f.root.hasAttribute('data-mobile-keyboard-compact'),true);
  f.vv.height=844;f.fire(f.vv,'resize');assert.equal(f.root.hasAttribute('data-mobile-keyboard-compact'),false);
  f.vv.height=220;f.fire(f.vv,'resize');f.fire(f.window,'pagehide');
  assert.equal(f.root.hasAttribute('data-mobile-keyboard-compact'),false);
});
test('pinch zoom and desktop focus never activate keyboard layout rules', () => {
  const f=fixture();f.focus();f.vv.scale=2;f.vv.height=422;f.fire(f.vv,'resize');
  assert.equal(f.root.hasAttribute('data-mobile-keyboard'),false);assert.equal(f.popup.hasAttribute('data-input-viewport'),false);
  const pc=fixture({mobile:false});pc.focus();assert.equal(pc.vv.count('resize'),0);
});
test('focus transfer retains geometry; blur, pagehide and repeated sessions clean listeners and state', () => {
  const f=fixture();f.focus();f.focus();assert.equal(f.vv.count('resize'),1);
  f.document.activeElement=null;f.fire(f.document,'focusout');f.settle();
  assert.equal(f.vv.count('resize'),0);assert.equal(f.vv.count('scroll'),0);assert.equal(f.window.count('scroll'),0);assert.equal(f.root.properties.size,0);
  f.document.activeElement=f.input;f.focus();f.fire(f.window,'pagehide');
  assert.equal(f.vv.count('resize'),0);assert.equal(f.popup.properties.size,0);
});
test('a popup closed during typing is not resized or scrolled after its input disconnects', () => {
  const f=fixture();f.focus();f.vv.height=400;f.fire(f.vv,'resize');f.input.isConnected=false;f.fire(f.vv,'resize');f.settle();
  assert.equal(f.popup.hasAttribute('data-input-viewport'),false);assert.equal(f.popup.scrollTop,100);
});
test('chat viewport sizing removes its desktop minimum only while the keyboard is visible', () => {
  const source=readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8');
  const definition=source.match(/function dmWorkspaceHeight\([^\n]+/)[0];
  const context=nicknameContext({});vm.runInContext(definition,context);
  assert.equal(context.dmWorkspaceHeight(300,188,12,undefined,true),100);
  assert.equal(context.dmWorkspaceHeight(180,188,12,undefined,true),0);
  assert.equal(context.dmWorkspaceHeight(300,188,78,undefined),180);
});
