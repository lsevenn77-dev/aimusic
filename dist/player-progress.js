function playerLevel(p){return p?.player_level||AifectPlayer.playerProgress(p?.player_xp).level;}
// Versioned, same-origin artwork comes from the server; no client item-key allowlist.
function playerFrameURL(p){
 if(!p?.profile_frame)return '';
 const path=p.profile_frame_artwork||AifectPlayer.PLAYER_ITEMS[p.profile_frame]?.artwork||'';
 return /^\/assets\/[A-Za-z0-9_./-]+\.(png|webp)(\?v=[A-Za-z0-9_-]+)?$/.test(path)&&!path.includes('..')?path:'';
}
function playerAvatarClass(p){return (p?.player_xp!=null||p?.player_level||playerFrameURL(p)?' player-avatar':'')+(playerFrameURL(p)?' player-has-frame':'');}
function playerBadgeHTML(p){
 const artwork=playerFrameURL(p),frame=artwork?'<img class="player-frame-artwork" src="'+esc(artwork)+'" alt="" aria-hidden="true" loading="lazy" decoding="async">':'';
 return frame+(p?.player_xp!=null||p?.player_level?'<b class="player-level-badge" aria-label="레벨 '+playerLevel(p)+'">'+playerLevel(p)+'</b>':'');
}
function playerProgressHTML(p,link=true){
 const progress=AifectPlayer.playerProgress(p?.player_xp??p?.xp),value=Math.round(progress.progress*100);
 return '<section class="player-progress-card" aria-label="내 플레이어 레벨"><div class="player-progress-title"><div><span class="eyebrow">MY LEVEL</span><h2>레벨 '+progress.level+'</h2></div><strong>'+number(progress.xp)+' <small>XP</small></strong></div><div class="player-xp-track" role="progressbar" aria-label="다음 레벨까지 경험치" aria-valuenow="'+value+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+value+'%"></span></div><div class="player-progress-caption"><span>'+(progress.next_xp===null?'최고 레벨에 도달했어요.':'다음 레벨까지 '+number(progress.remaining)+' XP')+'</span>'+(link?'<a href="#inventory">아이템 보관함 '+icon('chevron')+'</a>':'')+'</div></section>';
}
function playerInventoryHTML(d,p){
 const card=i=>'<article class="player-item '+(i.equipped?'is-equipped':'')+'"><div class="player-item-preview">'+portrait({...p,profile_frame:i.item_key,profile_frame_artwork:i.artwork},'producer')+'</div><div class="player-item-copy"><span class="player-item-status">'+(i.equipped?'장착 중':i.owned===false?'달성 보상':i.available?'보유 중':'사용 대기')+'</span><h2>'+esc(i.name)+'</h2><p>'+esc(i.description)+'</p><small>'+esc(i.reason||i.usage||'보유 아이템')+'</small></div>'+(i.owned===false?'':'<button class="'+(i.equipped?'small-button':'primary-button')+'" data-player-equip="'+esc(i.equipped?'':i.id)+'" '+(!i.available?'disabled':'')+'>'+(i.equipped?'해제하기':i.available?'장착하기':'사용 조건 확인')+'</button>')+'</article>';
 const owned=d.inventory.length,items=d.inventory.map(card).join(''),equipped=d.inventory.find(i=>i.equipped);
 const upcoming=(d.rewards||[]).length?'<section class="player-owned"><h2>달성할 수 있는 보상</h2>'+(d.rewards||[]).map(card).join('')+'</section>':'';
 return heading('아이템 보관함','음악으로 쌓은 경험치, 나를 표현하는 아이템')+'<a class="text-link" href="#profile">'+icon('back')+' 마이페이지</a><div class="player-inventory-layout"><div><section class="player-equipped-preview">'+portrait({...p,...d.profile},'producer')+'<div><span class="eyebrow">MY PROFILE</span><h2>'+esc(p.name||me.name)+'</h2><p>'+(equipped?esc(equipped.name)+' 사용 중':'기본 프로필을 사용하고 있어요.')+'</p></div></section>'+playerProgressHTML(d.player,false)+'<section class="player-owned"><h2>보유 아이템 <span>'+owned+'</span></h2>'+(owned?items:'<div class="player-inventory-empty">'+icon('users')+'<h3>첫 액자를 만나보세요</h3><p>크루에 가입하면 크루 전용 장식 액자를 무료로 드려요.</p><a class="primary-button" href="#community/crews?browse=1">크루 둘러보기</a></div>')+'</section>'+upcoming+'</div><aside class="player-guide"><h2>이렇게 레벨이 올라요</h2><p>듣고, 부르고, 함께 나누는 만큼.</p><ul>'+d.rules.map(r=>'<li><div><strong>'+esc(r.label)+'</strong><small>'+esc(r.limit)+'</small></div><b>+'+r.xp+' XP</b></li>').join('')+'</ul><p class="field-help">매일 활동은 한국 시간 자정에 새로 시작해요. 기존 공개곡도 반영되며, 같은 곡을 재공개해도 경험치는 중복 지급되지 않아요.</p>'+(d.recent.length?'<details><summary>최근 경험치 내역</summary><ul>'+d.recent.slice(0,10).map(r=>'<li><div><strong>'+esc(d.rules.find(x=>x.kind===r.kind)?.label||'음악 활동')+'</strong><small>'+new Date(r.created*1000).toLocaleDateString('ko-KR')+'</small></div><b>+'+r.amount+'</b></li>').join('')+'</ul></details>':'')+'</aside></div>';
}
async function playerView(base){
 if(base!=='inventory')return null;
 if(!me){returnRoute=location.hash;return {html:gate()};}
 const [d,profile]=await Promise.all([api('/api/me/player'),api('/api/me/profile')]);
 return {html:playerInventoryHTML(d,profile.profile)};
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-player-equip]');if(!button||button.disabled)return;
 const account=me?.id;button.disabled=true;
 try{
  const d=await api('/api/me/player/equipment','PUT',{frame_inventory_id:button.dataset.playerEquip||null});
  if(me?.id!==account)return;Object.assign(me,d.profile);updateAccount();toast(button.dataset.playerEquip?'액자를 장착했어요.':'액자를 해제했어요.');
  if(location.hash==='#inventory')await render();
 }catch(e){toast(e.message);}finally{button.disabled=false;}
});
