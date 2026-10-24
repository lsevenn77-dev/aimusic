import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/microphone-check.js',import.meta.url),'utf8');
function harness(){
 const targets=()=>{const listeners=new Map();return {addEventListener(k,f){listeners.set(k,f);},removeEventListener(k,f){if(listeners.get(k)===f)listeners.delete(k);},emit(k){listeners.get(k)?.();},listeners};};
 const node=()=>({gain:{value:1},connect(next){return next;},disconnect(){this.disconnected=true;}});
 const element=()=>({textContent:'',disabled:false,attrs:{},classList:{toggle(){},remove(){},add(){}},setAttribute(k,v){this.attrs[k]=v;}});
 const elements=new Map(),meter=element();meter.children=Array.from({length:16},element);elements.set('[role="meter"]',meter);
 const root={...element(),querySelector(k){if(!elements.has(k))elements.set(k,element());return elements.get(k);}};
 const frames=new Map(),contexts=[],tracks=[];let nextFrame=0,now=0,amplitude=0,requestCount=0;
 const document={...targets(),hidden:false},window={...targets()};
 const makeStream=()=>{const t={...targets(),label:'USB 마이크',readyState:'live',enabled:true,muted:false,stops:0,stop(){this.stops++;this.readyState='ended';}};tracks.push(t);return {getTracks:()=>[t],getAudioTracks:()=>[t]};};
 class Context{
  constructor(){this.state='running';this.destination=node();this.nodes=[];this.closes=0;contexts.push(this);}
  async resume(){}
  async close(){this.state='closed';this.closes++;}
  createMediaStreamSource(){const n=node();this.nodes.push(n);return n;}
  createGain(){const n=node();this.nodes.push(n);return n;}
  createAnalyser(){const n={...node(),getFloatTimeDomainData(data){data.fill(amplitude);}};this.nodes.push(n);return n;}
 }
 window.AudioContext=Context;
 const navigator={mediaDevices:{async getUserMedia(){requestCount++;return makeStream();}}};
 const sandbox={window,document,navigator,Float32Array,Math,performance:{now:()=>now},requestAnimationFrame(f){frames.set(++nextFrame,f);return nextFrame;},cancelAnimationFrame(id){frames.delete(id);}};
 vm.runInNewContext(source,sandbox);
 const controller=window.AifectMicrophoneCheck.bind(root);
 return {controller,window,document,navigator,root,elements,meter,contexts,tracks,makeStream,Context,get requests(){return requestCount;},get status(){return elements.get('[data-mic-status]').textContent;},get button(){return elements.get('[data-mic-toggle]');},tick(ms,value=amplitude){now+=ms;amplitude=value;const run=[...frames.values()];frames.clear();for(const f of run)f();},frames};
}
test('input test starts only on click, measures real samples, stays silent and closes on stop',async()=>{
 const h=harness();assert.equal(h.requests,0);await h.controller.start();assert.equal(h.requests,1);
 assert.equal(h.contexts[0].nodes[2].gain.value,0,'test never sends audible input to destination');
 h.tick(1000,.04);assert.ok(Number(h.meter.attrs['aria-valuenow'])>0);assert.match(h.status,/입력 감지/);
 h.tick(5000,0);assert.equal(h.meter.attrs['aria-valuenow'],'0');assert.match(h.status,/감지되지/);
 h.controller.stop();assert.equal(h.tracks[0].stops,1);assert.equal(h.contexts[0].state,'closed');assert.equal(h.frames.size,0);
});
test('silent connected input is never reported as detected; mute and physical disconnect are distinct',async()=>{
 const h=harness();await h.controller.start();h.tick(600);assert.doesNotMatch(h.status,/입력 감지됨/);
 h.tick(4500);assert.match(h.status,/연결됨.*감지되지/);h.tracks[0].muted=true;h.tick(600,.2);assert.match(h.status,/음소거/);assert.equal(h.meter.attrs['aria-valuenow'],'0');
 h.tracks[0].readyState='ended';h.tracks[0].emit('ended');assert.match(h.status,/끊겼/);assert.equal(h.frames.size,0);
});
test('denied, missing and busy devices recover the button and release the test audio context',async()=>{
 for(const [name,text] of [['NotAllowedError',/권한/],['NotFoundError',/마이크가 없/],['NotReadableError',/사용할 수 없/]]){
  const h=harness();h.navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(Error(name),{name});};await h.controller.start();
  assert.match(h.status,text);assert.equal(h.button.disabled,false);assert.equal(h.button.textContent,'마이크 켜기');assert.equal(h.contexts[0].state,'closed');
 }
});
test('cancelling a pending permission and leaving the page stops any late stream',async()=>{
 for(const action of ['stop','destroy']){
  const h=harness();let complete;h.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>complete=r);
  const pending=h.controller.start();h.controller[action]();assert.equal(h.contexts[0].state,'closed');
  complete(h.makeStream());await pending;assert.equal(h.tracks[0].stops,1);assert.equal(h.frames.size,0);
 }
});
test('recorder handoff releases test hardware but never stops borrowed recording tracks or context',async()=>{
 const h=harness();await h.controller.start();const borrowed=h.makeStream(),ctx=new h.Context();h.controller.prepare();h.controller.attach(borrowed,ctx);
 assert.equal(h.tracks[0].stops,1);assert.equal(h.button.disabled,true);h.tick(1000,.1);assert.match(h.status,/입력 감지/);
 h.controller.destroy();assert.equal(h.tracks[1].stops,0);assert.equal(ctx.state,'running');assert.equal(h.document.listeners.size,0);assert.equal(h.window.listeners.size,0);
});
test('an older permission rejection cannot cancel a new microphone request',async()=>{
 const h=harness();let rejectOld,completeNew;h.navigator.mediaDevices.getUserMedia=()=>new Promise((_,reject)=>rejectOld=reject);
 const old=h.controller.start();h.controller.stop();h.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>completeNew=resolve);
 const fresh=h.controller.start();rejectOld(Object.assign(Error('denied old request'),{name:'NotAllowedError'}));await old;
 assert.equal(h.contexts[1].state,'running');completeNew(h.makeStream());await fresh;h.tick(1000,.05);
 assert.match(h.status,/입력 감지/);assert.equal(h.tracks[0].stops,0);h.controller.destroy();
});
test('backgrounding ends testing without auto-reopening; context suspension is visible',async()=>{
 const h=harness();await h.controller.start();h.contexts[0].state='suspended';h.tick(1000,.1);assert.match(h.status,/일시정지/);
 h.document.hidden=true;h.document.emit('visibilitychange');assert.equal(h.tracks[0].stops,1);assert.match(h.status,/중지/);
 h.document.hidden=false;h.document.emit('visibilitychange');assert.equal(h.requests,1);assert.equal(h.frames.size,0);
});
test('unsupported environment does not request audio; failed meter setup also releases acquired hardware',async()=>{
 const h=harness();h.window.AudioContext=null;await h.controller.start();assert.equal(h.requests,0);assert.match(h.status,/브라우저/);
 const a=harness();a.Context.prototype.createAnalyser=()=>{throw Error('cannot analyse');};await a.controller.start();
 assert.equal(a.tracks[0].stops,1);assert.equal(a.contexts[0].state,'closed');assert.match(a.status,/확인하지/);
});
