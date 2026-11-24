(async()=>{
 const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
 const report=async values=>fetch('/qa/result',{method:'POST',body:JSON.stringify(values)});
 const advance=async action=>{await fetch('/qa/advance',{method:'POST',body:action});};
 const wait=async(predicate,ms=7000)=>{const until=Date.now()+ms;do{if(predicate())return true;await sleep(70);}while(Date.now()<until);return false;};
 const rect=node=>{const r=node.getBoundingClientRect();return {cx:r.x+r.width/2,cy:r.y+r.height/2,width:r.width,height:r.height};};
 // Pseudo elements don't expose DOMRect. Mirror their *computed* geometry into
 // an inert temporary sibling with the same containing block and transform.
 function rings(button,photo){
  const shape=rect(photo.querySelector('img')||photo),results=[];
  for(const host of [button,photo])for(const pseudo of ['::before','::after']){
   const cs=getComputedStyle(host,pseudo);
   if(['none','normal'].includes(cs.content)||cs.display==='none'||cs.position!=='absolute')continue;
   const copy=document.createElement('span');copy.style.all='initial';
   for(const key of ['display','position','left','right','top','bottom','width','height','box-sizing','margin','padding','border','transform','transform-origin','transform-box','translate','scale','rotate'])copy.style.setProperty(key,cs.getPropertyValue(key));
   copy.style.visibility='hidden';host.append(copy);const r=rect(copy);copy.remove();
   if(r.width<20||r.height<20||parseFloat(cs.borderRadius)===0)continue;
   results.push({host:host.className,pseudo,dx:+(r.cx-shape.cx).toFixed(2),dy:+(r.cy-shape.cy).toFixed(2),width:r.width,animation:cs.animationName});
  }
  return results;
 }
 function mark(id,label){const marker=document.createElement('span');marker.id=id;marker.textContent=label;marker.className='sr-only';voiceController.host.append(marker);}
 let events=0;
 document.addEventListener('pointerdown',ev=>{if(ev.isTrusted)events++;},true);
 try{
  await report({phase:'waiting for room',nativeAudio:!!window.AifectNativeTalkAudio,ua:navigator.userAgent});
  if(!await wait(()=>typeof voiceController!=='undefined'&&voiceController?.joined&&voiceController.ws?.readyState===1,15000))throw Error('room join/socket timeout: '+document.querySelector('#main')?.innerText?.slice(0,300));
  const c=voiceController,log=document.querySelector('#voice-chat'),photoForHost=()=>document.querySelector('#voice-seats [data-level-user="host"] .room-member-photo');
  let touchTop;
  log.addEventListener('touchstart',e=>{if(e.isTrusted)touchTop=log.scrollTop;},{passive:true});
  log.addEventListener('touchend',e=>{if(e.isTrusted&&touchTop!=null){const from=touchTop;setTimeout(()=>{if(log.scrollTop<from-10)mark('sim-room-chat-scrolled','이전 대화 스크롤 확인됨');report({trustedChatSwipe:{from,to:log.scrollTop,range:log.scrollHeight-log.clientHeight}});},500);}}, {passive:true});
  await wait(()=>log.children.length>=50&&photoForHost()?.querySelector('img')?.complete);
  await sleep(500);
  const photo=photoForHost(),img=photo.querySelector('img'),chat=log.children[0];
  const chatCount=log.children.length,span=log.scrollHeight-log.clientHeight;
  const oldScroll=Math.min(100,Math.floor(span/3));
  log.scrollTop=oldScroll;await sleep(200);const topBefore=log.scrollTop;
  await advance('mic');if(!await wait(()=>c.state.members.find(p=>p.id==='host').muted===false))throw Error('mic snapshot did not arrive');
  const sameOn=img===photoForHost()?.querySelector('img'),imgLoaded=img.naturalWidth>0;
  // Inject only the input meter samples. The production timer marks is-speaking.
  const meterData=new Uint8Array(256).fill(160);
  c.meters.set('host',{analyser:{fftSize:256,getByteTimeDomainData:b=>b.set(meterData),getFloatTimeDomainData:b=>b.fill(.25)},source:{disconnect(){}}});c.startLevels();
  const button=document.querySelector('[data-level-user="host"]');
  await wait(()=>button.classList.contains('is-speaking'),1000);
  const wave=rings(button,photoForHost()),speaking=button.classList.contains('is-speaking');
  c.meters.delete('host');
  await advance('mic');await wait(()=>c.state.members.find(p=>p.id==='host').muted);const sameOff=img===photoForHost()?.querySelector('img');
  await advance('message');await wait(()=>log.children.length>chatCount);await sleep(350);
  const after=log.scrollTop;
  await report({phase:'waiting for host music',joined:c.state.self,host:c.state.room.host_id,entered:!!document.querySelector('#main[data-room-entered]'),avatar:{sameOn,sameOff,imgLoaded},wave,speaking,
   chat:{initial:chatCount,final:log.children.length,span,rect:log.getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight],oldScroll,topBefore,after,retainedNode:chat===log.children[0],overflow:getComputedStyle(log).overflowY,touchAction:getComputedStyle(log).touchAction},visibleTitle:document.querySelector('#voice-title')?.innerText});
  const signals=[];
  await advance('music');
  await wait(()=>!!c.musicAudio,6000);const a=c.musicAudio;
  if(!a)throw Error('host music snapshot did not create audio');
  let analyser,peak=0;
  for(let i=0;i<30;i++){
   const ctx=c.levelContext;
   if(!analyser&&a.voiceGain&&ctx?.state==='running'){
    analyser=ctx.createAnalyser();analyser.fftSize=1024;a.voiceGain.connect(analyser);
   }
   if(analyser){const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);const rms=Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length);peak=Math.max(peak,rms);}
   if(i%4===0)signals.push({seconds:+a.currentTime.toFixed(3),paused:a.paused,ready:a.readyState,volume:a.volume,muted:a.muted,context:ctx?.state||null,gestures:events,rms:+peak.toFixed(4)});
   await sleep(250);
  }
  analyser?.disconnect();
  const noTouch=signals.filter(s=>s.gestures===0&&!s.paused&&s.ready>=2);
  const progressing=noTouch.length>=2&&noTouch.at(-1).seconds-noTouch[0].seconds>.5;
  const ok=sameOn&&sameOff&&imgLoaded&&speaking&&wave.length>0&&wave.every(r=>Math.abs(r.dx)<=2&&Math.abs(r.dy)<=2)&&span>100&&Math.abs(topBefore-after)<=2&&log.children.length>chatCount&&progressing&&(peak>.001||(!a.voiceGain&&!a.muted&&a.volume>0));
  if(ok)mark('sim-room-qa-finished','토킹룸 측정 완료');
  await report({phase:'finished',passed:ok,audio:{samples:signals,outputPath:a.voiceGain?'web-audio-gain':'native-media-element',maxRms:peak,advancedWithoutTouch:noTouch.length>=2&&noTouch.at(-1).seconds-noTouch[0].seconds>.5,notice:c.musicNoticeText||'',error:a.error?.code||null}});
 }catch(err){await report({phase:'failed',failure:err.stack||err.message});}
})();
