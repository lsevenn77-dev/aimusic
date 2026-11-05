// Presentation only: the existing engine, queue, permissions and action handlers remain shared.
function playerCredit(track){return track.kind==='cover'?track.producer||'':hasArtist(track)?track.artist:track.producer||'';}
function playerClock(seconds){const v=Number.isFinite(Number(seconds))?Math.max(0,Math.floor(Number(seconds))):0,h=Math.floor(v/3600),m=Math.floor(v/60)%60,s=String(v%60).padStart(2,'0');return h?h+':'+String(m).padStart(2,'0')+':'+s:Math.floor(v/60)+':'+s;}
function renderPlayerActions(track){
 const id=esc(track.id),credit=playerCredit(track),details=document.querySelector('.player-track-details');
 document.querySelector('#now-playing').innerHTML='<a href="#song/'+id+'" aria-label="'+esc(track.title)+' 곡 보기">'+cover(track,'mini-cover')+'</a><div class="player-metadata"><strong title="'+esc(track.title)+'">'+esc(track.title)+'</strong><div class="player-meta-line"><span class="player-credit" title="'+esc(credit)+'">'+esc(credit)+'</span></div></div>';
 document.querySelector('.player-meta-line').append(details);
 // Genre precedes the stable clock in visual and reading order.
 details.append(document.querySelector('.player-clock'));
 document.querySelector('#player-genre').textContent=track.genre||'';
 const gift=giftButton(track,'icon-button player-gift').replace('<span>선물</span>','<span class="player-action-label">선물하기</span>').replace('<button ','<button title="선물하기" ')||'<button type="button" class="icon-button player-gift" disabled aria-label="내 곡에는 선물할 수 없어요" title="내 곡에는 선물할 수 없어요">'+icon('gift')+'<span class="player-action-label">선물하기</span></button>';
 document.querySelector('#player-actions').innerHTML='<button type="button" class="icon-button" data-like="'+id+'" aria-label="좋아요" title="좋아요" aria-pressed="'+liked(track.id)+'">'+icon('heart')+'<span class="player-action-label">좋아요</span></button>'+gift+'<button type="button" class="icon-button" data-add="'+id+'" aria-label="플레이리스트" title="플레이리스트">'+icon('list-plus')+'<span class="player-action-label">플레이리스트</span></button><a class="icon-button player-comments" href="#song/'+id+'?comments=1" aria-label="댓글보기" title="댓글보기">'+icon('player-comment')+'<span class="player-action-label">댓글보기</span></a><button type="button" class="icon-button" data-share="'+id+'" aria-label="공유하기" title="공유하기">'+icon('share')+'<span class="player-action-label">공유하기</span></button>';
 window.AifectPlayerShell?.refresh();
}
(() => {
 const player=document.querySelector('.player'),seek=document.querySelector('#seek');if(!player||!seek)return;
 const lyrics=document.querySelector('#player-lyrics-toggle'),more=document.querySelector('#player-more'),extension=document.querySelector('#player-extension'),panel=document.querySelector('#player-action-panel');
 const actions=document.querySelector('#player-actions'),inline=document.querySelector('#player-inline-actions'),volumeToggle=document.querySelector('#player-volume-toggle'),transport=document.querySelector('.player-buttons');
 const utilities=document.querySelector('.player-utility-buttons'),shuffleButton=document.querySelector('#shuffle'),repeatButton=document.querySelector('#repeat');
 let view='none',scrubbing=false,layout='compact',previousVolume=audio.volume>0?audio.volume:.75;
 const utilityPanel=document.querySelector('#player-utility-panel'),volumeBox=document.querySelector('.player-volume-box'),volume=document.querySelector('#volume'),controls=document.querySelector('.player-controls');
 function paintMute(){
  if(audio.volume>0)previousVolume=audio.volume;
  const muted=audio.muted||audio.volume===0,label=muted?'음소거 해제':'음소거';
  volumeToggle.innerHTML=icon(muted?'volume-off':'volume');
  volumeToggle.setAttribute('aria-pressed',String(muted));volumeToggle.setAttribute('aria-label',label);volumeToggle.title=label;
  volume.value=String(audio.volume);volume.style.setProperty('--ds-range-progress',audio.volume*100+'%');
  window.AifectAudioAds?.volume(muted?0:audio.volume);
 }
 volumeToggle.addEventListener('click',()=>{
  if(audio.muted||audio.volume===0){if(audio.volume===0)audio.volume=previousVolume;audio.muted=false;}else audio.muted=true;
  paintMute();
 });
 audio.addEventListener('volumechange',paintMute);
 volume.addEventListener('input',()=>{
  audio.volume=Math.max(0,Math.min(1,Number(volume.value)));audio.muted=false;paintMute();
 });
 function paintView(){
  const visible=view==='lyrics'||view==='actions';
  player.dataset.playerView=view;player.classList.toggle('show-lyrics',view==='lyrics');extension.hidden=!visible;panel.hidden=view!=='actions';
  for(const [button,name] of [[lyrics,'lyrics'],[more,'actions']]){button.setAttribute('aria-pressed',String(view===name));button.setAttribute('aria-expanded',String(view===name&&visible));}
 }
 function setView(next){view=next;paintView();}
 function paintModes(){
  // Legacy global .is-active forces one colour with !important. Use semantic modes here.
  shuffleButton.classList.remove('is-active');repeatButton.classList.remove('is-active');shuffleButton.setAttribute('aria-pressed',String(shuffle));
  repeatButton.dataset.repeatMode=String(repeatMode);repeatButton.setAttribute('aria-pressed',String(!!repeatMode));
  repeatButton.innerHTML=icon('repeat').replace('</svg>',(repeatMode===2?'<text class="repeat-one" x="12" y="15" text-anchor="middle">1</text>':'')+'</svg>');
  repeatButton.title=['반복 끔','전체 반복','한 곡 반복'][repeatMode];repeatButton.setAttribute('aria-label',repeatButton.title);
 }
 function measureLayout(){
  const width=player.clientWidth;if(!width)return;
  const style=getComputedStyle(player),available=width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),gap=parseFloat(style.columnGap)||0;
  player.dataset.playerSmall=String(width<700);
  player.dataset.playerNarrow=String(width<308);
  // Equal side columns fix the transport's visual centre. Measure live controls
  // in each presentation instead of estimating text widths or viewport breakpoints.
  controls.insertBefore(lyrics,more);
  inline.append(actions);volumeBox.prepend(volumeToggle,volume);controls.insertBefore(utilityPanel,lyrics);
  transport.prepend(shuffleButton);transport.append(repeatButton);
  layout='compact';
  for(const candidate of ['labels','icons']){
   player.dataset.playerLayout=candidate;
   const side=(available-parseFloat(getComputedStyle(player).gridTemplateColumns.split(' ')[1])-2*gap)/2;
   const right=[...controls.children].filter(el=>getComputedStyle(el).display!=='none');
   const needed=right.reduce((sum,el)=>sum+el.getBoundingClientRect().width,0)+Math.max(0,right.length-1)*(parseFloat(getComputedStyle(controls).columnGap)||0);
   if(side>=Math.max(170,needed)){layout=candidate;break;}
  }
  player.dataset.playerLayout=layout;
  const destination=layout==='compact'?panel:inline;if(actions.parentElement!==destination)destination.append(actions);
  if(layout==='compact'){
   if(shuffleButton.parentElement!==utilities)utilities.prepend(shuffleButton,repeatButton);
   utilities.prepend(volumeToggle,volume);
   if(width<308)utilities.append(lyrics);
   if(utilityPanel.parentElement!==panel)panel.prepend(utilityPanel);
  }
  else {
   if(shuffleButton.parentElement!==transport){transport.prepend(shuffleButton);transport.append(repeatButton);}
   volumeBox.prepend(volumeToggle,volume);
  }
  // Drop the clock before truncating a long title within the left information column.
  const title=document.querySelector('.player-metadata strong');
  player.dataset.playerTimeHidden='false';
  if(title)player.dataset.playerTimeHidden=String(title.scrollWidth>title.clientWidth);
  paintView();
 }
 window.AifectPlayerShell={close:()=>setView('none'),refresh:()=>{measureLayout();paintModes();},paintModes,get scrubbing(){return scrubbing;}};
 lyrics.addEventListener('click',()=>{
  if(!current)return;
  setView(view==='lyrics'?'none':'lyrics');
  openPlayerLyrics();
 });
 document.querySelector('#player-lyric')?.addEventListener('click',event=>{
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();openPlayerLyrics();
 });
 more.addEventListener('click',()=>{if(current)setView(view==='actions'?'none':'actions');});
 player.addEventListener('keydown',event=>{if(event.key==='Escape'){if(view!=='none'){const trigger=view==='lyrics'?lyrics:more;setView('none');trigger.focus();}event.stopPropagation();}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))setView('none');});
 function paintProgress(previewValue){
  if(window.AifectAudioAds?.active)return;
  let max=Number(seek.max);if(!Number.isFinite(max)||max<=0)max=Number.isFinite(audio.duration)?Math.max(0,audio.duration):0;
  const supplied=typeof previewValue==='number'?previewValue:Number(audio.currentTime),value=Math.max(0,Math.min(max,Number.isFinite(supplied)?supplied:0));
  if(scrubbing&&typeof previewValue!=='number')return;
  seek.max=max;seek.disabled=!max;if(!scrubbing)seek.value=value;
  seek.style.setProperty('--seek-progress',(max?value/max*100:0)+'%');
  const label=playerClock(value)+' / '+playerClock(max);seek.setAttribute('aria-valuetext',label);seek.title=label;
  // Reserve both sides from the duration, including the transition into hours.
  document.querySelector('.player-clock').style.setProperty('--player-clock-width',Math.max(13,playerClock(max).length*2+3)+'ch');
  document.querySelector('#elapsed').textContent=playerClock(value);document.querySelector('#duration').textContent=playerClock(max);
 }
 for(const event of ['timeupdate','loadedmetadata','durationchange','emptied','seeked'])audio.addEventListener(event,()=>paintProgress());
 seek.addEventListener('pointerdown',event=>{scrubbing=true;try{seek.setPointerCapture?.(event.pointerId);}catch{}});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])seek.addEventListener(event,()=>{scrubbing=false;paintProgress();});
 for(const event of ['pointerup','pointercancel'])document.addEventListener(event,()=>{scrubbing=false;paintProgress();});
 seek.addEventListener('input',()=>paintProgress(Number(seek.value)));
 document.querySelector('#player-close').addEventListener('click',()=>setView('none'));
 let layoutFrame=0;
 new ResizeObserver(()=>{if(!layoutFrame)layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;measureLayout();});}).observe(player);
 paintMute();paintModes();setView('none');measureLayout();
})();
