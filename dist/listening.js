const listeningAssetRoot='/assets/listening/v1/';
const listeningCoverFallback=listeningAssetRoot+'cover.webp';
const listeningDevices={
 'turntable-v1':'turntable',
 'projector-v1':'projector',
};

function listeningArtworkHTML(template,photo){
 const mode=AifectListening.displayListeningTemplate(template),device=listeningDevices[mode];
 const image='<img class="listening-photo" src="'+esc(photo||listeningCoverFallback)+'" alt="" decoding="async">';
 if(!device)return image;
 const src=listeningAssetRoot+device;
 const motion=device==='turntable'
  ?'<div class="listening-rain" aria-hidden="true">'+Array.from({length:10},()=>'<i></i>').join('')+'</div>'
  :'<div class="listening-beam" aria-hidden="true"></div><div class="listening-film" aria-hidden="true"></div>';
 return '<img class="listening-device" src="'+src+'-512.webp" srcset="'+src+'-512.webp 512w, '+src+'-1024.webp 1024w" sizes="(max-width: 800px) 94vw, 480px" alt="" decoding="async">'+
  '<div class="listening-photo-mask">'+image+'</div>'+motion;
}

function listeningSceneHTML(template,photo,duration=0,playable=true){
 const mode=AifectListening.displayListeningTemplate(template);
 return '<div class="listening-scene" data-listening-scene data-template="'+mode+'"><div class="listening-artwork" aria-hidden="true">'+listeningArtworkHTML(mode,photo)+'</div>'+
  '<p class="listening-caption" hidden></p><div class="listening-transport">'+
  '<button class="listening-toggle" type="button" aria-label="재생" aria-pressed="false"'+(playable?'':' disabled')+'>'+icon('player-play')+'</button>'+
  '<span data-listening-elapsed>0:00</span><input type="range" aria-label="재생 위치" min="0" max="'+(Number(duration)||0)+'" value="0" step=".1"'+(playable?'':' disabled')+'><span data-listening-duration>'+time(duration)+'</span></div></div>';
}

function bindListeningArtwork(scene,template,photo){
 const host=scene.querySelector('.listening-artwork');
 const draw=(choice,coverSource,render)=>{
  const mode=AifectListening.displayListeningTemplate(choice);
  scene.dataset.template=mode;
  if(render)host.innerHTML=listeningArtworkHTML(mode,coverSource);
  const device=host.querySelector('.listening-device'),cover=host.querySelector('.listening-photo');
  const badDevice=()=>{if(device.isConnected)draw(AifectListening.defaultListeningTemplate,coverSource,true);};
  const badPhoto=()=>{
   if(!cover.isConnected)return;
   if(mode!==AifectListening.defaultListeningTemplate)draw(AifectListening.defaultListeningTemplate,listeningCoverFallback,true);
   else if(cover.getAttribute('src')!==listeningCoverFallback)cover.src=listeningCoverFallback;
  };
  if(device){device.onerror=badDevice;if(device.complete&&!device.naturalWidth){badDevice();return;}}
  cover.onerror=badPhoto;
  if(cover.complete&&!cover.naturalWidth)badPhoto();
 };
 draw(template,photo,false);
 return (choice,coverSource)=>draw(choice,coverSource,true);
}

function listeningEditorHTML(template,photo,photoField,duration=0,playable=false){
 const mode=AifectListening.displayListeningTemplate(template);
 const choices=AifectListening.listeningTemplates.map(({id,label})=>{
  const sample=listeningDevices[id]||'cover';
  return '<button class="listening-choice" type="button" data-listening-template="'+id+'" aria-pressed="'+(id===mode)+'">'+
   '<img src="'+listeningAssetRoot+sample+'-thumb.webp" width="68" height="68" loading="lazy" alt=""><span>'+label+'</span><span class="listening-choice-check" aria-hidden="true">'+icon('check',12)+'</span></button>';
 }).join('');
 return '<div class="listening-editor">'+listeningSceneHTML(template,photo,duration,playable)+
  '<div class="listening-editor-fields">'+photoField+'<fieldset><legend>감상 화면</legend><div class="listening-choices">'+choices+'</div></fieldset></div></div>';
}

function bindListeningEditor(form,settings){
 const scene=form?.querySelector('[data-listening-scene]');
 if(!scene)return;
 const buttons=[...form.querySelectorAll('[data-listening-template]')];
 let selected=settings.template,photo=settings.photo;
 form._listeningTemplate=AifectListening.isListeningTemplate(selected)?selected:undefined;
 const paintArtwork=bindListeningArtwork(scene,selected,photo);
 for(const choice of buttons)choice.onclick=()=>{
  selected=choice.dataset.listeningTemplate;
  form._listeningTemplate=selected;
  for(const button of buttons)button.setAttribute('aria-pressed',String(button===choice));
  paintArtwork(selected,photo);
  settings.onTemplate?.(selected);
 };
 bindWorkPhoto(form,settings.photoSession,{
  selectedFile:settings.selectedFile,
  onChange:settings.onPhotoChange,
  onPhoto(src){photo=src;paintArtwork(selected,photo);},
 });
 return scene;
}

function listeningSceneState(scene){
 const toggle=scene.querySelector('.listening-toggle'),range=scene.querySelector('input[type=range]'),
  elapsed=scene.querySelector('[data-listening-elapsed]'),duration=scene.querySelector('[data-listening-duration]'),caption=scene.querySelector('.listening-caption');
 return {toggle,range,paint(position,length,playing,line,scrubbing=false){
  if(toggle.getAttribute('aria-pressed')!==String(playing)){
   toggle.setAttribute('aria-pressed',String(playing));
   toggle.setAttribute('aria-label',playing?'일시정지':'재생');
   toggle.innerHTML=icon(playing?'player-pause':'player-play');
  }
  if(!scrubbing){range.max=length;range.value=position;}
  range.style.setProperty('--listening-progress',(Number(range.value)*100/Math.max(1,Number(range.max)))+'%');
  const shown=time(scrubbing?range.value:position),total=time(length);
  if(elapsed.textContent!==shown)elapsed.textContent=shown;
  if(duration.textContent!==total)duration.textContent=total;
  if(caption.textContent!==(line||''))caption.textContent=line||'';
  caption.hidden=!line;
 },motion(running){
  scene.toggleAttribute('data-listening-playing',running);
 }};
}

function bindListeningMotion(scene,controls,isPlaying,stopSignal){
 let visible=!('IntersectionObserver' in window);
 const paint=()=>controls.motion(visible&&!document.hidden&&isPlaying());
 const observer=visible?null:new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;paint();},{threshold:.01});
 observer?.observe(scene);
 document.addEventListener('visibilitychange',paint,{signal:stopSignal});
 stopSignal?.addEventListener('abort',()=>{observer?.disconnect();controls.motion(false);},{once:true});
 return paint;
}

let listeningPlayback=null;
function mountListeningPlayback(track,region){
 listeningPlayback?.abort.abort();
 listeningPlayback=null;
 const scene=region.querySelector('.work-listening [data-listening-scene]');
 if(!track||!scene)return;
 const dubbing=track.kind==='dubbing',abort=new AbortController(),signal=abort.signal;
 const state=listeningSceneState(scene),matches=()=>current?.id===track.id&&current.kind===track.kind;
 const active=()=>matches()&&!window.AifectAudioAds?.active;
 const playing=()=>active()&&!audio.paused&&!audio.ended;
 const artwork=dubbing?dubbingListeningArtwork(track):trackArtworkPath(track);
 bindListeningArtwork(scene,track.listening_template,artwork);
 const paintMotion=bindListeningMotion(scene,state,playing,signal);
 const transcript=dubbing?dubbingListeningCues(track):[];
 const captionAt=at=>{
  if(dubbing)return (current.listeningCues||transcript).find(line=>at>=line.start&&at<line.end)?.text||'';
  if(current?.lyrics_mode!=='synced')return '';
  if(hasFullLyrics(current))return currentCues[AifectLyrics.activeCueIndex(currentCues,at)]?.text||'';
  return lineAtTime(at)?.text||'';
 };
 const length=()=>active()?Number($('#seek')?.max)||track.duration:!dubbing&&!me?Math.min(60,track.duration):track.duration;
 const position=()=>active()?(audio.readyState?audio.currentTime:restoredPosition):0;
 let scrubbing=false,busy=false;
 const paint=()=>{
  if(!scene.isConnected){abort.abort();if(listeningPlayback?.abort===abort)listeningPlayback=null;return;}
  const at=position(),total=length()||0;
  state.paint(at,total,playing(),active()?captionAt(at):'',scrubbing);
  paintMotion();
 };
 listeningPlayback={abort,paint,operate};
 async function operate(seekTo){
  if(busy)return;
  const seeking=seekTo!==undefined;
  if(window.AifectAudioAds?.active){
   if(!seeking)window.AifectAudioAds.toggle();
   else toast('광고가 끝나면 곡의 재생 위치를 바꿀 수 있습니다.');
   paint();return;
  }
  busy=true;state.toggle.setAttribute('aria-busy','true');
  try{
   if(matches()&&(dubbing?(!current.listeningPreview||!track.recording?.final?.audioUrl):playSession&&preview===!me)){
    if(seeking){
     restoredPosition=Math.min(seekTo,length());audio.currentTime=restoredPosition;
    }else if(dubbing)await toggleDubbingPlayback();
    else if(audio.ended)await play(track.id);
    else if(audio.paused)await audio.play();
    else audio.pause();
   }else if(dubbing&&track.recording?.final?.audioUrl)await playDubbingEdition(track.id,track,null,seekTo||0);
   else if(dubbing)await playDubbingListeningPreview(track,seekTo||0,signal);
   else await play(track.id,null,seekTo??(matches()?restoredPosition:0));
  }catch(error){if(scene.isConnected)toast(error.message);}
  finally{busy=false;state.toggle.removeAttribute('aria-busy');paint();}
 }
 state.toggle.onclick=()=>operate();
 state.range.oninput=()=>{scrubbing=true;paint();};
 state.range.onchange=()=>{const to=Number(state.range.value);scrubbing=false;void operate(to);};
 state.range.onpointercancel=state.range.onblur=()=>{scrubbing=false;paint();};
 for(const event of ['timeupdate','play','pause','seeking','seeked','loadedmetadata','ended','emptied'])audio.addEventListener(event,paint,{signal});
 paint();
}

function refreshListeningCaptions(){listeningPlayback?.paint();}

function listeningBackHTML(fallback){
 return '<a class="text-link listening-back" data-listening-back href="'+fallback+'">'+icon('chevron')+' 돌아가기</a>';
}

function bindListeningPage(region,work){
 const panel=region.querySelector('.work-listening');
 if(!panel)return;
 const back=panel.querySelector('[data-listening-back]');
 back.onclick=event=>{
  const previous=window.navigation?.entries().find(entry=>entry.index===window.navigation.currentEntry.index-1);
  if(previous?.url&&new URL(previous.url).origin===location.origin){event.preventDefault();history.back();}
 };
 const add=panel.querySelector('[data-listening-add]');
 if(add)add.onclick=async()=>{
  if(!me){askLogin();return;}
  if(add.disabled)return;
  const account=me.id;
  add.disabled=true;
  try{
   const ready=await checkPlaylistUnification();
   if(!add.isConnected||account!==me?.id)return;
   if(!ready)throw new Error('플레이리스트에 담기를 이용할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
   await selectPlaylistForItem({kind:work.kind,content_id:work.id,content:work});
  }catch(error){if(add.isConnected)toast(error.message);}
  finally{if(add.isConnected)add.disabled=false;}
 };
 const comment=panel.querySelector('[data-listening-comment]');
 if(comment){
  const form=panel.querySelector('#comment-form,#dubbing-comment-form');
  comment.onclick=()=>{
   const expanded=comment.getAttribute('aria-expanded')!=='true';
   comment.setAttribute('aria-expanded',String(expanded));
   form.classList.toggle('listening-comment-open',expanded);
   if(expanded){form.scrollIntoView({block:'nearest'});form.querySelector('textarea')?.focus({preventScroll:true});}
  };
 }
 const join=panel.querySelector('[data-listening-join]');
 if(join)join.onclick=async()=>{
  if(!me){askLogin();return;}
  if(join.disabled)return;
  const account=me.id,id=encodeURIComponent(work.id);
  join.disabled=true;
  try{
   if(work.kind==='dubbing'){
    const {project}=await api('/api/dubbing/projects/'+id,'GET',undefined,{fresh:true});
    if(!join.isConnected||me?.id!==account)return;
    if(!project.canParticipate)throw new Error('참여할 수 있는 배역이 없거나 모집이 마감되었습니다.');
    if(project.casting?.isRoot||project.casting?.combination){
     const root=encodeURIComponent(project.rootId);
     const casting=await api('/api/dubbing/casting/'+root,'GET',undefined,{fresh:true});
     if(!join.isConnected||me?.id!==account)return;
     const joiningCombination=project.id!==project.rootId;
     const combo=joiningCombination&&casting.combinations.find(item=>item.id===project.id&&item.state!=='complete');
     if(!casting.canStart||joiningCombination&&(!combo||combo.count>=casting.root.roleCount||combo.members.some(member=>member.user_id===account)))
      throw new Error('참여할 수 있는 배역이 없거나 모집이 마감되었습니다.');
     location.hash=playHref('dubbing','join')+'&project='+root+(joiningCombination?'&target='+id:'');
    }else location.hash='dubbing/'+id+'?script=1&join=1';
   }else{
    const {track,duet}=await api('/api/duets/'+id,'GET',undefined,{fresh:true});
    if(!join.isConnected||me?.id!==account||duet.parent_id!==work.id)return;
    location.hash='sing/'+encodeURIComponent(track.id)+'?duet='+id;
   }
  }catch(error){if(join.isConnected&&me?.id===account)toast(error.message);}
  finally{if(join.isConnected)join.disabled=false;}
 };
}

function listeningActionHTML({label,symbol,attributes,extra='',cls=''}) {
 return '<button type="button" class="small-button listening-action '+cls+'" '+attributes+'>'+
  songActionIcon(symbol)+'<span>'+label+'</span>'+extra+'</button>';
}

function coverListeningHTML(t,comments,gifts){
 const id=esc(t.id),on=liked(t.id);
 const type=t.cover_mode==='duet'?'듀엣':'커버';
 const action=listeningActionHTML;
 const buttons=[
  action({label:'좋아요',symbol:'heart',attributes:'data-like="'+id+'" aria-pressed="'+on+'"',cls:on?'is-active':'',extra:'<span class="sr-only" data-like-count>'+number(t.likes||0)+'</span>'}),
  action({label:'가사',symbol:'lyrics',attributes:'id="lyrics-expand" data-track="'+id+'" aria-expanded="false"',cls:'listening-desktop-action'}),
  action({label:'댓글',symbol:'message',attributes:'data-listening-comment aria-controls="comment-form" aria-expanded="false"',cls:'listening-mobile-action'}),
  action({label:'담기',symbol:'plus',attributes:'data-listening-add="'+id+'" aria-haspopup="dialog"'}),
  action({label:'선물',symbol:'gift',attributes:t.gift_block_reason?'disabled title="'+esc(t.gift_block_reason)+'"':'data-gift="'+id+'" aria-haspopup="dialog"'}),
  action({label:'공유',symbol:'share-2',attributes:'data-song-share="'+id+'" aria-haspopup="dialog"'}),
 ];
 return '<article class="work-listening">'+listeningBackHTML('#play')+'<section class="listening-hero">'+
  listeningSceneHTML(t.listening_template,trackArtworkPath(t),t.duration)+
  '<div class="listening-work-info"><div class="listening-title"><h1>'+esc(t.title)+'</h1><span>'+type+'</span></div>'+
  '<div class="listening-credit">'+credits(t)+'</div>'+
  (t.description?'<p class="listening-note">'+esc(t.description)+'</p>':'')+
  (t.duet_joinable?'<div class="listening-participation"><button type="button" class="small-button" data-listening-join>'+icon('mic',18)+' 참여하기</button></div>':'')+
  '<div class="listening-actions">'+buttons.join('')+'</div></div></section>'+
  '<div class="listening-detail"><div class="song-main-column">'+songDetailLyricsHTML()+
  '<section class="surface comments-panel"><div class="section-heading"><h2>댓글</h2></div>'+songCommentComposerHTML()+
  '<div id="comments" data-track="'+id+'">'+commentsHTML(comments,t)+'</div></section></div>'+
  '<aside class="song-sidebar">'+giftsPanelHTML(gifts,'응원 순위',{track:t})+'</aside></div></article>';
}

function dubbingListeningArtwork(project){
 return project.posterUrl||AifectDubbing.dubbingGenreArtwork(project.script.genres);
}

function dubbingListeningPlayable(project){
 return !!(project.recording?.final?.audioUrl||project.sound?.state==='ready'&&project.sound.audioUrl);
}

function dubbingListeningCues(project){
 if(!project.recording?.final?.audioUrl)return [];
 if(project.recording.final.captions?.length)return project.recording.final.captions;
 const script=project.script,offsets=project.casting?.combination?.offsets||{};
 const text=new Map(script.lines.map(line=>[line.id,line.text]));
 const timeline=AifectListening.dubbingRecordingWindows(script);
 return timeline.lines.map(line=>{
  const offset=offsets[line.id]||0;
  return {id:line.id,start:Math.max(0,line.start+offset),end:Math.min(timeline.duration,line.recordEnd+offset),text:text.get(line.id)};
 }).sort((a,b)=>a.start-b.start);
}

let dubbingListeningObjectUrl=null;
async function playDubbingListeningPreview(project,start,signal){
 if(!dubbingListeningPlayable(project))return;
 if(typeof typedPlaylistPlayback!=='undefined'&&typedPlaylistPlayback)clearTypedPlaylist();
 const serial=++playSerial,id=encodeURIComponent(project.id);
 let url=project.sound.audioUrl,cues=[],temporary=false;
 if(project.casting?.isRoot||project.casting?.combination){
  const detail=await api('/api/dubbing/casting/'+id+'/lines','GET',undefined,{fresh:true,signal});
  const takes=detail.lines.filter(line=>line.audioUrl);
  if(takes.length){
   const sampleRate=32000,ctx=new OfflineAudioContext(2,Math.ceil(detail.duration*sampleRate),sampleRate);
   const mix=async(url,from,until)=>{
    const response=await fetch(url,{credentials:'same-origin',signal});
    if(!response.ok)throw new Error('미리 듣기 음원을 불러오지 못했습니다.');
    const buffer=await ctx.decodeAudioData(await response.arrayBuffer());
    const length=Math.min(until-from,buffer.duration);
    if(length<=0)return;
    const source=ctx.createBufferSource();source.buffer=buffer;
    source.connect(ctx.destination);source.start(from,0,length);
   };
   await mix(detail.backgroundUrl,0,detail.duration);
   for(const line of takes){
    if(serial!==playSerial||signal.aborted)return;
    const offset=detail.offsets[line.id]||0,from=Math.max(0,line.start+offset);
    const until=Math.min(detail.duration,line.recordEnd+offset,from+line.duration);
    await mix(line.audioUrl,from,until);
    cues.push({start:from,end:until,text:line.text});
   }
   const result=await ctx.startRendering();
   if(serial!==playSerial||signal.aborted)return;
   const wav=AifectKaraoke.encodeWav([result.getChannelData(0),result.getChannelData(1)],sampleRate);
   url=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
   temporary=true;
  }
 }
 if(serial!==playSerial||signal.aborted){if(temporary)URL.revokeObjectURL(url);return;}
 window.AifectAudioAds?.cancel();countAdListening();audio.pause();void report();
 stopCastingPreview();stopCastingAudio();
 if(temporary){
  if(dubbingListeningObjectUrl)URL.revokeObjectURL(dubbingListeningObjectUrl);
  dubbingListeningObjectUrl=url;
  const release=()=>{
   if(audio.getAttribute('src')===url)return;
   URL.revokeObjectURL(url);
   if(dubbingListeningObjectUrl===url)dubbingListeningObjectUrl=null;
   audio.removeEventListener('emptied',release);
   audio.removeEventListener('loadstart',release);
  };
  audio.addEventListener('emptied',release);
  audio.addEventListener('loadstart',release);
 }
 loadDubbingPlayer(project,start,{url,cues,label:cues.length?'참여 더빙 미리 듣기':'배경 오디오'});
 await toggleDubbingPlayback();
}

function paintSingInheritedStatus(s){
 if(sing!==s)return;
 const status=$('[data-inherited-photo-status]');
 if(!status)return;
 status.hidden=!s.inheritedCoverRequest&&!s.inheritedCoverError;
 status.querySelector('span').textContent=s.inheritedCoverError||'참여할 작품의 커버사진을 확인하고 있습니다.';
 status.querySelector('button').hidden=!s.inheritedCoverError;
}

function loadSingInheritedPhoto(s){
 if(!s.parent||s.inheritedCoverFile)return;
 if(s.inheritedCoverRequest)return s.inheritedCoverRequest;
 const partner=s.data.duet.partner;
 const path=partner.artwork_id?trackArtworkPath(partner):listeningCoverFallback;
 const abort=new AbortController();
 s.inheritedCoverAbort=abort;
 s.inheritedCoverError='';
 const pending=(async()=>{
  try{
   const response=await fetch(path,{credentials:'same-origin',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)])});
   if(!response.ok)throw new Error();
   const blob=await response.blob();
   const file=new File([blob],'작품 커버사진',{type:blob.type});
   await optimizeUploadImage(file,{allowFallback:true});
   if(sing!==s)return;
   s.inheritedCoverFile=file;
   $('#sing-upload-form')?._paintInheritedPhoto?.();
  }catch{
   if(sing===s)s.inheritedCoverError='커버사진을 불러오지 못했습니다. 다시 시도하거나 사용할 사진을 선택해 주세요.';
  }finally{
   if(s.inheritedCoverRequest===pending)s.inheritedCoverRequest=null;
   if(s.inheritedCoverAbort===abort)s.inheritedCoverAbort=null;
   paintSingInheritedStatus(s);
  }
 })();
 s.inheritedCoverRequest=pending;
 paintSingInheritedStatus(s);
 return pending;
}

async function ensureSingListeningPhoto(s){
 if(s.parent&&!s.coverFile&&!s.inheritedCoverFile){
  await loadSingInheritedPhoto(s);
  if(!s.inheritedCoverFile&&sing===s)throw new Error(s.inheritedCoverError||'커버사진을 불러오지 못했습니다.');
 }
}

function bindSingListening(s,scene){
 s.listeningMotion?.abort();
 if(!scene)return;
 const abort=new AbortController(),state=listeningSceneState(scene);
 const motion=bindListeningMotion(scene,state,()=>s.state==='playing',abort.signal);
 s.listeningMotion=abort;
 s.listeningControls={state,motion};
 const stop=()=>{stopPreview();updateTransport();drawLyrics(s.cursor);};
 state.toggle.onclick=()=>{
  if(sing!==s||singBusy(s)||s.modeSwitchPending)return;
  if(s.state==='playing'){stop();return;}
  const start=s.crop?.start||0,end=s.crop?.end??reviewDuration(s);
  void previewMix(s.cursor>=end-.05?start:Math.max(start,s.cursor),end,{fade:!!s.crop});
 };
 const move=()=>{
  if(sing!==s||singBusy(s))return;
  const playing=s.state==='playing',from=Number(state.range.value)+(s.crop?.start||0);
  if(playing)stopPreview();
  s.cursor=from;
  drawLyrics(from);
  if(playing)void previewMix(from,s.crop?.end??reviewDuration(s),{fade:!!s.crop});
 };
 state.range.oninput=()=>state.paint(Number(state.range.value),Number(state.range.max),s.state==='playing',null,true);
 state.range.onchange=move;
 paintSingListening(s,s.cursor);
}

function paintSingListening(s,t){
 if(!s.listeningControls||$('#sing-upload-form')?.hidden)return;
 const start=s.crop?.start||0,end=s.crop?.end??reviewDuration(s);
 const cues=s.data.words||[],index=K().wordAt(cues,t).line,line=cues[index];
 const until=line?.e??line?.w?.at(-1)?.e??cues[index+1]?.s??end;
 const text=line&&t>=line.s&&t<until?line.w.map(word=>word.t).join(' '):'';
 s.listeningControls.state.paint(Math.min(Math.max(0,t-start),end-start),end-start,s.state==='playing',text);
 s.listeningControls.motion();
}

function dubbingListeningHTML(p,gifts){
 const id=esc(p.id),action=listeningActionHTML,on=!!p.community?.liked;
 const canPlay=dubbingListeningPlayable(p),showSave=p.state==='complete'&&!!p.recording?.final?.audioUrl;
 const actions=[
  action({label:'좋아요',symbol:'heart',attributes:'id="dubbing-like" aria-pressed="'+on+'"',cls:on?'is-active':'',extra:'<span class="sr-only" data-like-count>'+number(p.community?.likes||0)+'</span>'}),
  action({label:'대사',symbol:'lyrics',attributes:'data-listening-transcript aria-controls="dubbing-listening-transcript" aria-expanded="false"',cls:'listening-desktop-action'}),
  action({label:'댓글',symbol:'message',attributes:'data-listening-comment aria-controls="dubbing-comment-form" aria-expanded="false"',cls:'listening-mobile-action'}),
  action({label:'담기',symbol:'plus',attributes:showSave?'data-listening-add aria-haspopup="dialog"':'disabled title="완성된 더빙을 담을 수 있습니다."'}),
  action({label:'선물',symbol:'gift',attributes:gifts.gift_block_reason?'disabled title="'+esc(gifts.gift_block_reason)+'"':'data-dubbing-listening-gift aria-haspopup="dialog"'}),
  action({label:'공유',symbol:'share-2',attributes:'data-dubbing-listening-share aria-haspopup="dialog"'}),
 ];
 const occupied=p.roles.filter(role=>role.claimed||role.participant).length;
 const participation=p.canParticipate?'<div class="listening-participation"><span>참여 '+occupied+'/'+p.roles.length+'개 배역</span>'+
  '<button type="button" class="small-button" data-listening-join>'+icon('mic',18)+' 참여하기</button></div>':'';
 const cast='<span>'+userNickname(p.ownerName,{userId:p.ownerId})+'</span>';
 const timeline=dubbingListeningCues(p);
 const list=p.script.lines.map(line=>{
  const role=p.roles.find(role=>role.id===line.roleId)?.name||'';
  const cue=timeline.find(cue=>cue.id===line.id);
  const label='<strong>'+esc(role)+'</strong> '+esc(line.text);
  return '<li>'+(cue&&canPlay?'<button type="button" class="text-link" data-listening-dubbing-seek="'+cue.start+'" aria-label="'+time(cue.start)+' '+esc(role)+' '+esc(line.text)+'">'+label+'</button>':label)+'</li>';
 }).join('');
 const manage='#dubbing/'+id+'?manage=1';
 return '<article class="work-listening">'+listeningBackHTML('#karaoke/dubbing?tab=discover')+
  '<section class="listening-hero">'+listeningSceneHTML(p.listening_template,dubbingListeningArtwork(p),p.duration,canPlay)+
  '<div class="listening-work-info"><div class="listening-title"><h1>'+esc(p.title)+'</h1><span>더빙</span></div>'+
  '<div class="listening-credit">'+cast+'</div>'+(p.listening_description?'<p class="listening-note">'+esc(p.listening_description)+'</p>':'')+
  participation+'<div class="listening-actions">'+actions.join('')+'</div><div class="inline-actions listening-work-links">'+
  (p.isOwner?'<a class="text-link" href="'+manage+'">작품 관리</a>':'<button type="button" class="text-link" data-dubbing-rights-report>권리 침해 신고</button>')+
  '<a class="text-link listening-mobile-action" href="'+manage+'">대본 보기</a></div></div></section>'+
  '<div class="listening-detail"><div class="song-main-column"><section id="dubbing-listening-transcript" class="surface listening-transcript" hidden>'+
  '<h2>대사</h2><ol>'+list+'</ol></section>'+dubbingCommunityHTML(p,{listening:true})+'</div>'+
  '<aside class="song-sidebar"><section class="surface song-support-rank" data-dubbing-gift-ranking="'+id+'">'+songSupportRankingHTML(gifts,'작품')+'</section>'+
  songSupportCardsHTML()+'</aside></div></article>';
}

function bindDubbingListeningPage(region,p){
 const panel=region.querySelector('.work-listening');
 if(!panel)return;
 const share=panel.querySelector('[data-dubbing-listening-share]');
 share.onclick=()=>shareWorkByMessage({...p,kind:'dubbing',genres:p.script.genres,artist:p.ownerName});
 const gift=panel.querySelector('[data-dubbing-listening-gift]');
 if(gift)gift.onclick=async()=>{
  if(!me){askLogin();return;}
  if(gift.disabled)return;
  const account=me.id;
  gift.disabled=true;
  try{
   const data=await api('/api/dubbing/projects/'+encodeURIComponent(p.id)+'/gifts','GET',undefined,{fresh:true});
   if(!gift.isConnected||me?.id!==account)return;
   if(data.gift_block_reason)throw new Error(data.gift_block_reason);
   await giftDialog(data.recipient_profile_id,{dubbingId:p.id},true);
  }catch(error){if(gift.isConnected)toast(error.message);}
  finally{if(gift.isConnected)gift.disabled=false;}
 };
 const transcript=panel.querySelector('[data-listening-transcript]'),lines=panel.querySelector('.listening-transcript');
 transcript.onclick=()=>{
  lines.hidden=!lines.hidden;
  transcript.setAttribute('aria-expanded',String(!lines.hidden));
 };
 lines.onclick=event=>{
  const button=event.target.closest('[data-listening-dubbing-seek]');
  if(button)void listeningPlayback?.operate(Number(button.dataset.listeningDubbingSeek));
 };
 bindDubbingCommunity(p,panel);
}

async function refreshDubbingGiftRanking(id){
 const panel=$('[data-dubbing-gift-ranking]'),account=me?.id;
 if(panel?.dataset.dubbingGiftRanking!==id)return;
 const ticket=panel._readTicket=(panel._readTicket||0)+1;
 try{
  const data=await api('/api/dubbing/projects/'+encodeURIComponent(id)+'/gifts','GET',undefined,{fresh:true});
  if(panel.isConnected&&me?.id===account&&panel._readTicket===ticket)panel.innerHTML=songSupportRankingHTML(data,'작품');
 }catch{/* Keep showing the most recent confirmed ranking. */}
}

function dubbingListeningSettingsHTML(p,{recorder=false}={}){
 const photo=dubbingListeningArtwork(p);
 return '<form class="dubbing-listening-settings" data-dubbing-listening-settings>'+
  (recorder?'':'<h3>감상 화면</h3>')+
  listeningEditorHTML(p.listening_template,photo,workPhotoField(photo),p.duration,recorder||dubbingListeningPlayable(p))+
  '<label class="form-field">한마디 (선택)<textarea name="listening_description" maxlength="1000" rows="2" placeholder="감상 화면에 남길 한마디를 적어 주세요.">'+esc(p.listening_description||'')+'</textarea></label>'+
  '<p class="form-error" role="alert"></p>'+
  (recorder?'':'<button type="submit" class="small-button">감상 설정 저장</button>')+'</form>';
}

function bindDubbingListeningSettings(form,p,onChange){
 if(!form)return null;
 const scene=bindListeningEditor(form,{template:p.listening_template,photo:dubbingListeningArtwork(p),onTemplate:onChange,onPhotoChange:onChange});
 form.elements.listening_description.oninput=()=>onChange?.();
 const submit=async(fields=new FormData(form))=>{
  if(form._photoPending)throw new Error('커버사진을 확인하고 있습니다. 잠시 뒤 다시 저장해 주세요.');
  const note=fields.get('listening_description')||'';
  if(!form._photo&&note===p.listening_description&&(!form._listeningTemplate||form._listeningTemplate===p.listening_template))return;
  const route='/api/dubbing/projects/'+encodeURIComponent(p.id);
  if(form._photo){
   const image=await optimizeUploadImage(form._photo);
   const response=await fetch(route+'/poster',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':image.type},body:image});
   const result=await response.json();
   if(!response.ok||!result.posterUrl)throw new Error(result.error||'커버사진을 저장하지 못했습니다.');
   invalidateReads();
   p.posterUrl=result.posterUrl;
   form.querySelector('.work-photo-preview').dataset.savedSrc=result.posterUrl;
   form._clearWorkPhoto();
  }
  if(note!==p.listening_description||(form._listeningTemplate&&form._listeningTemplate!==p.listening_template)){
   const {project}=await api(route+'/listening','PUT',{revision:p.revision,listening_template:form._listeningTemplate,listening_description:note});
   Object.assign(p,project);
  }
  if(typeof markMyWorkChanged==='function')markMyWorkChanged('dubbing:'+p.id);
  if(current?.kind==='dubbing'&&current.id===p.id){
   current.posterUrl=p.posterUrl;renderPlayerActions(current);
  }
 };
 form._saveListening=submit;
 form.onsubmit=busyForm(form,async fields=>{await submit(fields);toast('감상 설정을 저장했습니다.');});
 return scene;
}

function bindDubbingListeningSettingsPreview(scene,p){
 if(!scene||!dubbingListeningPlayable(p))return;
 const state=listeningSceneState(scene),abort=new AbortController(),signal=abort.signal;
 const isCurrent=()=>current?.id===p.id&&current.kind==='dubbing';
 const isPlaying=()=>isCurrent()&&!audio.paused&&!audio.ended;
 const cadence=bindListeningMotion(scene,state,isPlaying,signal);
 const cues=dubbingListeningCues(p);
 const paint=()=>{
  if(!scene.isConnected){abort.abort();return;}
  const position=isCurrent()?audio.currentTime:0;
  const cue=(current?.listeningCues||cues).find(line=>position>=line.start&&position<line.end);
  state.paint(position,p.duration,isPlaying(),isCurrent()?cue?.text:'');
  cadence();
 };
 const observer=new MutationObserver(()=>{if(!scene.isConnected)abort.abort();});
 observer.observe($('#main'),{childList:true,subtree:true});
 signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
 const run=async to=>{
  try{
   if(isCurrent()){
    if(to===undefined)await toggleDubbingPlayback();
    else audio.currentTime=to;
   }else if(p.recording?.final?.audioUrl)await playDubbingEdition(p.id,p,null,to||0);
   else await playDubbingListeningPreview(p,to||0,signal);
  }catch(error){if(scene.isConnected)toast(error.message);}
 };
 state.toggle.onclick=()=>run();
 state.range.onchange=()=>run(Number(state.range.value));
 for(const event of ['timeupdate','play','pause','seeked','ended','emptied'])audio.addEventListener(event,paint,{signal});
 paint();
}
