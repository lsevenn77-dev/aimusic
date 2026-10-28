// Presentation only: existing delegated actions keep their permissions and APIs.
function playerCredit(track){return track.kind==='cover'?track.producer||'':track.artist||track.producer||'';}
function renderPlayerActions(track){
 const credit=playerCredit(track),id=esc(track.id);
 document.querySelector('#player-action-meta').innerHTML=cover(track,'mini-cover')+'<div><strong title="'+esc(track.title)+'">'+esc(track.title)+'</strong><span title="'+esc(credit)+'">'+esc(credit)+'</span></div>';
 const gift=giftButton(track,'icon-button player-gift').replace('<span>선물</span>','').replace('<button ','<button title="선물하기" ');
 document.querySelector('#player-actions').innerHTML='<button type="button" class="icon-button" data-like="'+id+'" aria-label="좋아요" title="좋아요" aria-pressed="'+liked(track.id)+'">'+icon('heart')+'</button>'+gift+'<button type="button" class="icon-button" data-add="'+id+'" aria-label="플레이리스트 추가" title="플레이리스트 추가">'+icon('list-plus')+'</button><a class="icon-button player-comments" href="#song/'+id+'?comments=1" aria-label="댓글 보기" title="댓글 보기">'+icon('player-comment')+'</a>';
 window.AifectPlayerShell?.close();
}
(() => {
 const player=document.querySelector('.player'),seek=document.querySelector('#seek');
 const lyrics=document.querySelector('#player-lyrics-toggle'),more=document.querySelector('#player-more');
 const extension=document.querySelector('#player-extension'),actions=document.querySelector('#player-action-panel'),hud=document.querySelector('#player-lyric');
 if(!player||!seek)return;
 const volumeToggle=document.querySelector('#player-volume-toggle');
 let view='none',scrubbing=false,toolsOpen=false;
 function setTools(open){
  toolsOpen=open;player.dataset.playerTools=String(open);volumeToggle.setAttribute('aria-expanded',String(open));
 }
 volumeToggle.addEventListener('click',()=>{const next=!toolsOpen;setView('none');setTools(next);});
 document.addEventListener('click',event=>{if(!player.contains(event.target))setTools(false);});
 function paintTransport(){if(!window.AifectAudioAds?.active&&audio.paused)document.querySelector('#play-toggle').innerHTML=icon('play');}
 audio.addEventListener('pause',paintTransport);paintTransport();

 function setView(next){
  setTools(false);view=next;player.dataset.playerView=view;player.classList.toggle('show-lyrics',view==='lyrics');
  extension.hidden=view==='none';actions.hidden=view!=='actions';
  for(const [button,name] of [[lyrics,'lyrics'],[more,'actions']]){button.setAttribute('aria-pressed',String(view===name));button.setAttribute('aria-expanded',String(view===name));}
 }
 window.AifectPlayerShell={close:()=>setView('none')};
 document.querySelector('#player-panel-close')?.addEventListener('click',()=>{setView('none');lyrics.focus();});
 lyrics.addEventListener('click',()=>{if(hud.hidden){toast('아직 등록된 가사가 없어요.');return;}setView(view==='lyrics'?'none':'lyrics');});
 more.addEventListener('click',()=>{if(current)setView(view==='actions'?'none':'actions');});
 player.addEventListener('keydown',event=>{if(event.key==='Escape'&&toolsOpen){setTools(false);volumeToggle.focus();event.stopPropagation();return;}if(event.key==='Escape'&&view!=='none'){const trigger=view==='lyrics'?lyrics:more;setView('none');trigger.focus();event.stopPropagation();}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))setView('none');});
 function paintProgress(){
  if(scrubbing)return;
  const max=Number(seek.max)||0,value=Math.max(0,Math.min(max,Number(audio.currentTime)||0));
  seek.style.setProperty('--seek-progress',(max?value/max*100:0)+'%');
  seek.setAttribute('aria-valuetext',time(value)+' / '+time(max));seek.title=time(value)+' / '+time(max);
 }
 for(const event of ['timeupdate','loadedmetadata','durationchange','emptied','seeked'])audio.addEventListener(event,paintProgress);
 seek.addEventListener('pointerdown',()=>{scrubbing=true;});
 for(const event of ['pointerup','pointercancel'])document.addEventListener(event,()=>{scrubbing=false;paintProgress();});
 seek.addEventListener('input',()=>{const max=Number(seek.max)||0,value=Number(seek.value)||0;seek.style.setProperty('--seek-progress',(max?Math.max(0,Math.min(100,value/max*100)):0)+'%');seek.setAttribute('aria-valuetext',time(value)+' / '+time(max));seek.title=time(value)+' / '+time(max);});
 for(const id of ['player-close','player-collapse','queue-toggle'])document.getElementById(id)?.addEventListener('click',()=>setView('none'));
 new MutationObserver(()=>{if(player.classList.contains('audio-ad-active')&&view!=='none')setView('none');}).observe(player,{attributes:true,attributeFilter:['class']});
 setView('none');
})();
