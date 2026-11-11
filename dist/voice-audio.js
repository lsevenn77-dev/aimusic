// AIFECT voice presets. Values are intentionally modest; no pitch correction.
const VoiceAudio=(()=>{
 const presets=Object.freeze({original:{name:'원음',highpass:0,mud:0,presence:0,compress:false,wet:0},radio:{name:'라디오 클린',highpass:85,mud:-2,presence:1.2,compress:true,wet:0},studio:{name:'스튜디오',highpass:75,mud:-2,presence:1,compress:true,wet:0.06,delay:.045,feedback:.12},hall:{name:'홀',highpass:75,mud:-2,presence:1,compress:true,wet:.16,delay:.09,feedback:.48},karaoke:{name:'노래방',highpass:85,mud:-1,presence:1.5,compress:true,wet:.18,delay:.18,feedback:.35}});
 async function microphone(raw,preset='radio',level=1,mix){
  const Context=window.AudioContext||window.webkitAudioContext;let ctx,outgoing,audioStarted=false;
  try{
   if(!Context)throw Error('unsupported');ctx=new Context({latencyHint:'interactive'});let timer;try{await Promise.race([ctx.resume(),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('suspended')),500);})]);}finally{clearTimeout(timer);}if(ctx.state!=='running')throw Error('suspended');audioStarted=true;
   if(mix!==undefined){
    if(!ctx.audioWorklet||typeof AudioWorkletNode!=='function')throw Error('worklet unsupported');
    let timer;
    try{
     await Promise.race([
      ctx.audioWorklet.addModule('/vocal-worklet.js?v=20261017-tone-range'),
      new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('worklet timeout')),2000);})
     ]);
    }finally{clearTimeout(timer);}
    if(ctx.state!=='running')throw Error('suspended');
    const source=ctx.createMediaStreamSource(raw),input=ctx.createGain(),analyser=ctx.createAnalyser(),destination=ctx.createMediaStreamDestination();
    outgoing=destination.stream;
    const effects=new AudioWorkletNode(ctx,'aifect-vocal',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit',processorOptions:{mix}});
    analyser.fftSize=256;input.gain.value=level;
    source.connect(input).connect(effects).connect(analyser).connect(destination);
    let closed=false;
    const graph={
     stream:outgoing,analyser,context:ctx,supportsMix:true,
     setLevel:value=>input.gain.setTargetAtTime(Math.max(0,Math.min(2,value)),ctx.currentTime,.015),
     setMix(value){if(!closed&&graph.supportsMix)effects.port.postMessage(value);},
     // Legacy talk-room presets must not override the supplied recording mix.
     setPreset(){},setReverb(){},
     close(){
      if(closed)return;closed=true;
      effects.onprocessorerror=null;source.disconnect();input.disconnect();effects.disconnect();analyser.disconnect();effects.port.close?.();
      outgoing.getTracks().forEach(track=>track.stop());void ctx.close().catch(()=>{});
     }
    };
    effects.onprocessorerror=()=>{
     if(closed||!graph.supportsMix)return;
     graph.supportsMix=false;input.disconnect();effects.disconnect();effects.port.close?.();input.connect(analyser);
     graph.onMixError?.();
    };
    return graph;
   }
   const source=ctx.createMediaStreamSource(raw),input=ctx.createGain(),analyser=ctx.createAnalyser(),destination=ctx.createMediaStreamDestination();analyser.fftSize=256;outgoing=destination.stream;
   source.connect(input);input.gain.value=level;let nodes=[],effectSource,reverbGain,currentPreset=presets[preset]||presets.studio;const setReverb=value=>{const wet=Math.max(0,Math.min(.5,value));if(wet&&!reverbGain){const delay=ctx.createDelay(.3),feedback=ctx.createGain();reverbGain=ctx.createGain();delay.delayTime.value=currentPreset.delay||.045;feedback.gain.value=currentPreset.feedback||.12;effectSource.connect(delay);delay.connect(feedback).connect(delay);delay.connect(reverbGain);reverbGain.connect(analyser);nodes.push(delay,feedback,reverbGain);}if(reverbGain)reverbGain.gain.setTargetAtTime(wet,ctx.currentTime,.02);};
   const configure=key=>{const p=currentPreset=presets[key]||presets.studio;input.disconnect();for(const n of nodes)n.disconnect();nodes=[];reverbGain=null;let last=input;
    const append=n=>{last.connect(n);last=n;nodes.push(n);};
    if(p.highpass){const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=p.highpass;hp.Q.value=0.7;append(hp);const mud=ctx.createBiquadFilter();mud.type='peaking';mud.frequency.value=260;mud.Q.value=0.8;mud.gain.value=p.mud;append(mud);const clarity=ctx.createBiquadFilter();clarity.type='peaking';clarity.frequency.value=2800;clarity.Q.value=0.7;clarity.gain.value=p.presence;append(clarity);}
    if(p.compress){const comp=ctx.createDynamicsCompressor();comp.threshold.value=-19;comp.knee.value=18;comp.ratio.value=2.4;comp.attack.value=0.012;comp.release.value=0.16;append(comp);}
    effectSource=last;setReverb(p.wet);
    last.connect(analyser);
   };
   analyser.connect(destination);configure(preset);return {stream:destination.stream,analyser,context:ctx,setLevel:v=>input.gain.setTargetAtTime(Math.max(0,Math.min(1,v)),ctx.currentTime,0.015),setPreset:configure,setReverb,close(){source.disconnect();destination.stream.getTracks().forEach(t=>t.stop());void ctx.close().catch(()=>{});}};
  }catch{
   // Only missing processing APIs/effects may fall back to a raw microphone.
   // An existing audio session that cannot run may be held by another app;
   // resuming unsuccessfully or timing out must never bypass that restriction.
   const interrupted=!!Context&&(!audioStarted||ctx?.state!=='running');
   outgoing?.getTracks().forEach(track=>track.stop());if(ctx)void ctx.close().catch(()=>{});
   if(interrupted){raw.getAudioTracks().forEach(track=>track.enabled=false);throw Object.assign(new Error('기기 오디오를 시작하지 못했어요. 다른 앱의 오디오 사용이 끝난 뒤 마이크를 다시 켜주세요.'),{code:'AUDIO_INTERRUPTED'});}
   return {stream:raw,fallback:true,supportsMix:false,setLevel(){},setMix(){},setPreset(){},setReverb(){},close(){}};
  }
 }
 function rms(analyser){const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);let energy=0;for(const n of data)energy+=((n-128)/128)**2;return Math.min(1,Math.max(0,Math.sqrt(energy/data.length)-.012)*5);}
 function echoMix(style,intensity){return AifectKaraoke.presetMix(AifectKaraoke.defaultVocalMix(),style==='none'?'original':style,intensity);}
 return {presets,microphone,rms,echoMix};
})();
