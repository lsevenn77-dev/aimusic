// Presentation controls leave the playback queue and audio session untouched.
(() => {
 const player=document.querySelector('.player'),seek=document.querySelector('#seek');
 const lyrics=document.querySelector('#player-lyrics-toggle'),more=document.querySelector('#player-more');
 if(!player||!seek)return;
 lyrics?.addEventListener('click',()=>{
  if(document.querySelector('#player-lyric').hidden){toast('아직 등록된 가사가 없어요.');return;}
  const shown=player.classList.toggle('show-lyrics');
  lyrics.setAttribute('aria-pressed',String(shown));
 });
 more?.addEventListener('click',()=>{
  if(!current)return;
  dialog('<h2>'+esc(current.title)+'</h2><div class="player-song-menu">'+document.querySelector('#player-actions').innerHTML+'</div>');
 });
 function paintProgress(){
  const max=Number(seek.max)||0,value=Math.max(0,Math.min(max,Number(audio.currentTime)||0));
  seek.style.setProperty('--seek-progress',(max?value/max*100:0)+'%');
  seek.setAttribute('aria-valuetext',time(value)+' / '+time(max));
 }
 for(const event of ['timeupdate','loadedmetadata','durationchange','emptied','seeked'])audio.addEventListener(event,paintProgress);
 seek.addEventListener('input',()=>{
  const max=Number(seek.max)||0;
  seek.style.setProperty('--seek-progress',(max?Math.max(0,Math.min(100,Number(seek.value)/max*100)):0)+'%');
 });
 if(typeof matchMedia==='function')matchMedia('(max-width:800px)').addEventListener('change',()=>updateSyncedLyrics(true));
})();
