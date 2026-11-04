import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/voice-audio.js',import.meta.url),'utf8');
function fixture(fail=false,workletMode='ready'){
 const nodes=[],contexts=[],modules=[];
 const track={stop(){track.stopped=true;}},outputTrack={stop(){outputTrack.stopped=true;}};
 const raw={getAudioTracks:()=>[track],getTracks:()=>[track]};
 const parameter=()=>({value:0,setTargetAtTime(v){this.value=v;}});
 const node=kind=>{
  const n={kind,connections:[],connect(to){this.connections.push(to);return to;},disconnect(){this.connections=[];}};
  for(const key of ['gain','frequency','Q','threshold','knee','ratio','attack','release','delayTime'])n[key]=parameter();
  nodes.push(n);return n;
 };
 let finishModule;
 class Context{
  constructor(){
   this.state=fail?'suspended':'running';this.currentTime=0;contexts.push(this);
   if(workletMode!=='unsupported')this.audioWorklet={addModule:path=>{
    modules.push(path);
    if(workletMode==='reject')return Promise.reject(Error('module unavailable'));
    if(workletMode==='timeout')return new Promise(resolve=>{finishModule=resolve;});
    return Promise.resolve();
   }};
  }
  async resume(){}
  async close(){this.closed=true;this.state='closed';}
  createMediaStreamSource(){return node('source');}
  createGain(){return node('gain');}
  createAnalyser(){const n=node('analyser');n.getByteTimeDomainData=a=>a.fill(128);return n;}
  createMediaStreamDestination(){
   return Object.assign(node('destination'),{stream:{getAudioTracks:()=>[outputTrack],getTracks:()=>[outputTrack]}});
  }
  createBiquadFilter(){return node('filter');}
  createDynamicsCompressor(){return node('compressor');}
  createDelay(){return node('delay');}
 }
 class Worklet{
  constructor(context,name,options){
   const n=node('worklet');Object.assign(n,{context,name,options,messages:[]});
   n.port={postMessage:value=>n.messages.push(structuredClone(value)),close(){n.port.closed=true;}};
   return n;
  }
 }
 const c=vm.createContext({window:{AudioContext:Context},AudioWorkletNode:Worklet,Uint8Array,
  setTimeout:(fn,delay)=>setTimeout(fn,workletMode==='timeout'&&delay===2000?5:delay),clearTimeout});
 vm.runInContext(source+';this.audio=VoiceAudio;',c);
 return {audio:c.audio,nodes,raw,track,outputTrack,contexts,modules,finishModule:()=>finishModule?.()};
}
test('radio clean processes outgoing audio with EQ and compressor without local speaker monitoring',async()=>{const f=fixture(),graph=await f.audio.microphone(f.raw);assert.notEqual(graph.stream,f.raw);assert.ok(f.nodes.some(n=>n.kind==='compressor'));assert.equal(f.nodes.filter(n=>n.kind==='filter').length,3);assert.equal(f.nodes.some(n=>n.kind==='delay'),false);graph.setLevel(.4);assert.equal(f.nodes.find(n=>n.kind==='gain').gain.value,.4);assert.equal(f.audio.rms(graph.analyser),0);graph.close();assert.equal(f.track.stopped,undefined,'raw ownership stays with room client');});
test('preset switches reuse the same output stream, original bypasses EQ, studio adds modest wet path',async()=>{const f=fixture(),g=await f.audio.microphone(f.raw,'original'),stream=g.stream;assert.equal(f.nodes.some(n=>n.kind==='compressor'),false);g.setPreset('studio');assert.equal(g.stream,stream);assert.ok(f.nodes.some(n=>n.kind==='delay'));g.close();});
test('unsupported or suspended Web Audio safely returns raw microphone',async()=>{const f=fixture(true),g=await f.audio.microphone(f.raw);assert.equal(g.fallback,true);assert.equal(g.stream,f.raw);g.setLevel(.5);g.close();assert.equal(f.track.stopped,undefined);});

test('live recording effects use the shared worklet on the outgoing track and update without republishing',async()=>{
 const f=fixture(),mix={room:.4,size:.6,echo:.1,tone:0};
 const graph=await f.audio.microphone(f.raw,'radio',.7,mix),output=graph.stream;
 assert.equal(graph.supportsMix,true);assert.notEqual(output,f.raw);
 assert.deepEqual(f.modules,['/vocal-worklet.js?v=20261017-tone-range']);
 const sourceNode=f.nodes.find(n=>n.kind==='source'),input=f.nodes.find(n=>n.kind==='gain'),worklet=f.nodes.find(n=>n.kind==='worklet'),destination=f.nodes.find(n=>n.kind==='destination');
 assert.equal(worklet.name,'aifect-vocal');assert.equal(worklet.options.processorOptions.mix,mix);
 assert.deepEqual(sourceNode.connections,[input]);assert.deepEqual(input.connections,[worklet]);
 assert.deepEqual(worklet.connections,[graph.analyser]);assert.deepEqual(graph.analyser.connections,[destination]);
 assert.equal(f.nodes.some(n=>n.kind==='filter'||n.kind==='compressor'||n.kind==='delay'),false);
 const next={...mix,echo:.25};graph.setMix(next);assert.deepEqual(worklet.messages,[next]);assert.equal(graph.stream,output);
 graph.setPreset('original');graph.setReverb(0);assert.deepEqual(worklet.messages,[next],'legacy setters cannot clear the recording mix');
 graph.setLevel(1.4);assert.equal(input.gain.value,1.4);
 graph.close();assert.equal(f.track.stopped,undefined);assert.equal(f.outputTrack.stopped,true);assert.equal(f.contexts[0].closed,true);
 assert.deepEqual(sourceNode.connections,[]);assert.deepEqual(worklet.connections,[]);assert.equal(worklet.port.closed,true);
 graph.setMix(mix);assert.deepEqual(worklet.messages,[next]);
});

test('unavailable live worklet returns the raw mic without keeping a context or stopping its owner track',async()=>{
 for(const mode of ['unsupported','reject','timeout']){
  const f=fixture(false,mode),graph=await f.audio.microphone(f.raw,'studio',1,{room:.5});
  assert.equal(graph.supportsMix,false,mode);assert.equal(graph.fallback,true,mode);assert.equal(graph.stream,f.raw,mode);
  assert.equal(f.contexts[0].closed,true,mode);assert.equal(f.track.stopped,undefined,mode);
  graph.setMix({room:.2});graph.close();f.finishModule();await Promise.resolve();
  assert.equal(f.nodes.some(n=>n.kind==='worklet'),false,'late module completion cannot construct a stale graph');
 }
});

test('a runtime worklet failure keeps the same outgoing track and analyser with dry audio',async()=>{
 const f=fixture(),graph=await f.audio.microphone(f.raw,'radio',1,{room:.5}),output=graph.stream;
 const worklet=f.nodes.find(n=>n.kind==='worklet'),input=f.nodes.find(n=>n.kind==='gain');
 let notified=0;graph.onMixError=()=>notified++;
 worklet.onprocessorerror();
 assert.equal(graph.supportsMix,false);assert.equal(graph.stream,output);assert.deepEqual(input.connections,[graph.analyser]);
 assert.deepEqual(worklet.connections,[]);assert.equal(worklet.port.closed,true);assert.equal(notified,1);
 graph.setMix({room:.2});assert.deepEqual(worklet.messages,[]);worklet.onprocessorerror();assert.equal(notified,1);
 assert.equal(f.outputTrack.stopped,undefined);assert.equal(f.track.stopped,undefined);
 graph.close();assert.equal(f.outputTrack.stopped,true);assert.equal(f.contexts[0].closed,true);
});

test('studio, hall and karaoke change delay/feedback while retaining one outgoing analyser connection',async()=>{
 const f=fixture(),graph=await f.audio.microphone(f.raw,'studio'),delays=[];
 for(const style of ['studio','hall','karaoke','studio']){graph.setPreset(style);graph.setReverb(.3);delays.push(f.nodes.filter(n=>n.kind==='delay').at(-1).delayTime.value);assert.equal(graph.analyser.connections.length,1);}
 assert.equal(new Set(delays).size,3);assert.equal(delays[0],delays[3]);
 const mixes=['studio','hall','karaoke'].map(s=>JSON.stringify(f.audio.echoMix(s,.5)));assert.equal(new Set(mixes).size,3);graph.close();
});
