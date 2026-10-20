// AIFECT voice presets. Values are intentionally modest; no pitch correction.
const VoiceAudio=(()=>{
 const presets=Object.freeze({original:{name:'원음',highpass:0,mud:0,presence:0,compress:false,wet:0},radio:{name:'라디오 클린',highpass:85,mud:-2,presence:1.2,compress:true,wet:0},studio:{name:'스튜디오',highpass:75,mud:-2,presence:1,compress:true,wet:0.06}});
 async function microphone(raw,preset='radio',level=1){
  const Context=window.AudioContext||window.webkitAudioContext;let ctx;
  try{
   if(!Context)throw Error('unsupported');ctx=new Context({latencyHint:'interactive'});let timer;try{await Promise.race([ctx.resume(),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('suspended')),500);})]);}finally{clearTimeout(timer);}if(ctx.state!=='running')throw Error('suspended');
   const source=ctx.createMediaStreamSource(raw),input=ctx.createGain(),analyser=ctx.createAnalyser(),destination=ctx.createMediaStreamDestination();analyser.fftSize=256;
   source.connect(input);input.gain.value=level;let nodes=[],effectSource,reverbGain;const setReverb=value=>{const wet=Math.max(0,Math.min(.07,value));if(wet&&!reverbGain){const delay=ctx.createDelay(.1);reverbGain=ctx.createGain();delay.delayTime.value=.045;effectSource.connect(delay);delay.connect(reverbGain);reverbGain.connect(analyser);nodes.push(delay,reverbGain);}if(reverbGain)reverbGain.gain.setTargetAtTime(wet,ctx.currentTime,.02);};
   const configure=key=>{const p=presets[key]||presets.radio;input.disconnect();for(const n of nodes)n.disconnect();nodes=[];reverbGain=null;let last=input;
    const append=n=>{last.connect(n);last=n;nodes.push(n);};
    if(p.highpass){const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=p.highpass;hp.Q.value=0.7;append(hp);const mud=ctx.createBiquadFilter();mud.type='peaking';mud.frequency.value=260;mud.Q.value=0.8;mud.gain.value=p.mud;append(mud);const clarity=ctx.createBiquadFilter();clarity.type='peaking';clarity.frequency.value=2800;clarity.Q.value=0.7;clarity.gain.value=p.presence;append(clarity);}
    if(p.compress){const comp=ctx.createDynamicsCompressor();comp.threshold.value=-19;comp.knee.value=18;comp.ratio.value=2.4;comp.attack.value=0.012;comp.release.value=0.16;append(comp);}
    effectSource=last;setReverb(p.wet);
    last.connect(analyser);analyser.connect(destination);
   };
   configure(preset);return {stream:destination.stream,analyser,context:ctx,setLevel:v=>input.gain.setTargetAtTime(Math.max(0,Math.min(1,v)),ctx.currentTime,0.015),setPreset:configure,setReverb,close(){source.disconnect();destination.stream.getTracks().forEach(t=>t.stop());void ctx.close().catch(()=>{});}};
  }catch{if(ctx)void ctx.close().catch(()=>{});return {stream:raw,fallback:true,setLevel(){},setPreset(){},setReverb(){},close(){}};}
 }
 function rms(analyser){const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);let energy=0;for(const n of data)energy+=((n-128)/128)**2;return Math.min(1,Math.max(0,Math.sqrt(energy/data.length)-.012)*5);}
 return {presets,microphone,rms};
})();
