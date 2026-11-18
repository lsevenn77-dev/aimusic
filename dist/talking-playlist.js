// A desktop view of the existing room transport. It never issues music commands.
function talkingPlaylistItems(music){
 if(!Array.isArray(music?.queue))return null;
 // The existing server rejects duplicate track IDs; index is the transport's
 // authoritative selection. Do not sort the queue or derive it from audio.paused.
 return music.queue.map((track,index)=>({track,index,current:index===music.index}));
}
function paintTalkingPlaylistLikes(root=document){
 for(const button of root.querySelectorAll('.talk-playlist [data-like]')){
  const label=liked(button.dataset.like)?'좋아요 취소':'좋아요';
  button.title=label;button.setAttribute('aria-label',label);
 }
}
Object.assign(VoiceRoomClient.prototype,{
 paintTalkingEmptyTitle(){
  if(this.liveMode||this.state?.music?.queue?.[this.state.music.index])return;
  const title=this.host.querySelector('.talk-track strong');
  if(title)title.textContent=this.host.hasAttribute('data-room-pc-controls')?'재생할 곡이 없어요':'선택된 곡이 없어요';
 },
 paintTalkingPlaylist(){
  if(this.liveMode)return;
  const panel=this.host.querySelector('.talk-playlist');if(!panel)return;
  if(!panel._bound){
   panel._bound=true;
   panel.addEventListener('click',event=>{
    const button=event.target.closest('button[data-like],button[data-add]');if(!button)return;
    event.preventDefault();event.stopPropagation();
    if(button.disabled||button.getAttribute('aria-busy')==='true')return;
    button.disabled=true;button.setAttribute('aria-busy','true');
    void this.safe(async()=>{
     try{
      await accountReady;
      if(button.dataset.like){
       // Room transport records omit catalogue fields. Keep the global library
       // complete, including eligibility, rather than caching a partial record.
       if(!trackMap.has(button.dataset.like)){
        const data=await api('/api/tracks/'+encodeURIComponent(button.dataset.like));remember([data.track]);
       }
       await toggleLike(button);
      }else await addToPlaylist(button.dataset.add);
     }finally{button.disabled=false;button.removeAttribute('aria-busy');paintInteractions();}
    });
   },{signal:this.talkViewEvents.signal});
  }
  const items=talkingPlaylistItems(this.state?.music),rows=panel.querySelector('.talk-playlist-rows'),status=panel.querySelector('.talk-playlist-status');
  const owner=this.state?.members?.find(member=>member.id===this.state.room?.host_id)||this.state?.members?.find(member=>member.role==='host');
  panel.querySelector('[data-talk-count]').textContent=items?items.length+'곡':'—';
  const host=panel.querySelector('[data-talk-host]');host.textContent=owner?'방장 '+owner.name:'방장 확인 중';host.title=host.textContent;
  status.hidden=!!items?.length;rows.hidden=!items?.length;
  status.textContent=items?'방장이 등록한 곡이 없어요.':'재생목록을 불러오는 중이에요.';
  panel.setAttribute('aria-busy',String(items===null));
  if(!items)return;
  const scroll=rows.scrollTop,previous=new Map([...rows.children].map(row=>[row.dataset.trackId,row]));
  for(const {track,index,current} of items){
   let row=previous.get(track.id);previous.delete(track.id);
   if(!row){
    row=document.createElement('li');row.className='talk-playlist-row';row.dataset.trackId=track.id;
    row.innerHTML='<span class="talk-playlist-number"></span><img class="talk-playlist-cover" alt=""><span class="talk-playlist-info"><span class="talk-playlist-credit"><strong></strong><span></span></span><small class="talk-playlist-current">현재 곡</small></span><button type="button" data-like="'+esc(track.id)+'">'+icon('ui-heart')+'</button><button type="button" data-add="'+esc(track.id)+'" title="내 플레이리스트에 담기" aria-label="내 플레이리스트에 담기">'+icon('ui-plus-action')+'</button>';
   }
   row.querySelector('.talk-playlist-number').textContent=index+1;
   const art=row.querySelector('img'),src=track.cover||trackArtworkPath(track);if(art.getAttribute('src')!==src)art.src=src;
   const credit=roomTrackCredit(track),info=row.querySelector('.talk-playlist-credit');
   info.querySelector('strong').textContent=track.title;info.querySelector('span').textContent=credit?' · '+credit:'';info.title=[track.title,credit].filter(Boolean).join(' · ');
   row.querySelector('.talk-playlist-current').hidden=!current;row.classList.toggle('is-current',current);
   if(current)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');
   if(rows.children[index]!==row)rows.insertBefore(row,rows.children[index]||null);
  }
  for(const row of previous.values())row.remove();
  rows.scrollTop=scroll;paintInteractions();
 }
});
