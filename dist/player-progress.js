function playerLevel(p){return p?.player_level||AifectPlayer.playerProgress(p?.player_xp).level;}
// Versioned, same-origin artwork comes from the server; no client item-key allowlist.
function playerFrameURL(p){
 if(!p?.profile_frame)return '';
 const path=p.profile_frame_artwork||AifectPlayer.PLAYER_ITEMS[p.profile_frame]?.artwork||'';
 if(!/^\/assets\/[A-Za-z0-9_./-]+\.(png|webp)(\?v=[A-Za-z0-9_-]+)?$/.test(path)||path.includes('..'))return '';
 // The first paint uses the same photo-centered canvas as async equipment.
 return AifectPlayer.frameDisplayAssets?.(path).overlay||path;
}
function playerAvatarClass(p){return (p?.player_xp!=null||p?.player_level||playerFrameURL(p)?' player-avatar':'')+(playerFrameURL(p)?' player-has-frame':'');}
function playerBadgeHTML(p){
 const artwork=playerFrameURL(p),frame=artwork?'<img class="player-frame-artwork" src="'+esc(artwork)+'" alt="" aria-hidden="true" loading="lazy" decoding="async">':'';
 return frame+(p?.player_xp!=null||p?.player_level?'<b class="player-level-badge" aria-label="레벨 '+playerLevel(p)+'">'+playerLevel(p)+'</b>':'');
}
function playerProgressHTML(p,link=true){
 const progress=AifectPlayer.playerProgress(p?.player_xp??p?.xp),value=Math.round(progress.progress*100);
 return '<section class="player-progress-card" aria-label="내 플레이어 레벨"><div class="player-progress-title"><div><span class="eyebrow">MY LEVEL</span><h2>레벨 '+progress.level+'</h2></div><strong>'+number(progress.xp)+' <small>XP</small></strong></div><div class="player-xp-track" role="progressbar" aria-label="다음 레벨까지 경험치" aria-valuenow="'+value+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+value+'%"></span></div><div class="player-progress-caption"><span>'+(progress.next_xp===null?'최고 레벨에 도달했어요.':'다음 레벨까지 '+number(progress.remaining)+' XP')+'</span>'+(link?'<a href="#inventory">인벤토리 '+icon('chevron')+'</a>':'')+'</div></section>';
}
async function playerView(base,readApi=api){return base==='inventory'?unifiedInventoryView(location.hash.slice(1),readApi):null;}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-player-equip]');if(!button||button.disabled)return;
 const account=me?.id;button.disabled=true;
 try{
  const d=await api('/api/me/player/equipment','PUT',{frame_inventory_id:button.dataset.playerEquip||null});
  if(me?.id!==account)return;Object.assign(me,d.profile);updateAccount();window.dispatchEvent(new Event('aifect:equipment'));toast(button.dataset.playerEquip?'액자를 장착했어요.':'액자를 해제했어요.');
  if(location.hash.split('?')[0]==='#inventory')await render();
 }catch(e){toast(e.message);}finally{button.disabled=false;}
});
