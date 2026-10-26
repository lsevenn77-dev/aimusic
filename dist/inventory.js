// One presentation over the existing gift stock and player equipment records.
let unifiedInventoryState=null;
const inventorySection=raw=>new URLSearchParams(raw.split('?')[1]||'').get('section')==='active'?'active':'owned';
const inventoryHref=section=>'#inventory?section='+section;
function inventoryGiftGroups(items){
 const groups=new Map();for(const i of items){const key=JSON.stringify([i.gift_type,i.currency,i.source,i.available]);const group=groups.get(key);if(group){group.quantity++;group.ids.push(i.id);}else groups.set(key,{...i,quantity:1,ids:[i.id]});}return [...groups.values()];
}
function inventorySource(source){return ({purchase:'구매',reward:'이벤트 · 보상',admin:'이벤트 · 보상',admin_grant:'이벤트 · 보상',level:'레벨 보상',crew:'크루 보상',gift:'선물',event:'이벤트',crew_level:'크루 레벨 보상','crew-level':'크루 레벨 보상'})[source]||source||'보유 상품';}
function inventoryError(d,label){return d?.error?`<p class="mp-empty" role="alert">${label}을 불러오지 못했어요. ${esc(d.error)} <button class="text-link" data-inventory-retry>다시 시도</button></p>`:'';}
function inventoryFrameCard(i,p){return `<article class="player-item ${i.equipped?'is-equipped':''}" data-inventory-item="${esc(i.id)}"><div class="player-item-preview">${portrait({...p,profile_frame:i.item_key,profile_frame_artwork:i.artwork},'producer')}</div><div class="player-item-copy"><span class="player-item-status">${i.equipped?'사용 중':i.available?'사용 가능':'사용 제한'}</span><h2>${esc(i.name)}</h2><p>${esc(i.description||'')}</p><small>획득 경로 · ${esc(inventorySource(i.source))}</small>${i.granted_at?`<small>획득일 · ${myDate(i.granted_at)}</small>`:''}<small>${i.expires_at?'만료일 · '+myDate(i.expires_at):esc(i.usage||'기간 제한 없음')}</small>${i.reason?`<small class="inventory-reason">${esc(i.reason)}</small>`:''}</div><div class="inventory-item-actions"><button class="${i.equipped?'small-button':'primary-button'}" data-player-equip="${esc(i.equipped?'':i.id)}" ${!i.available&&!i.equipped?'disabled':''}>${i.equipped?'해제하기':i.available?'장착하기':'사용 제한'}</button>${i.equipped?'<button class="small-button" data-inventory-tab="owned">다른 상품으로 교체</button>':''}</div></article>`;}
function inventoryGiftCard(i){return `<article class="mp-stock-item" data-inventory-item="${esc(i.id)}"><img src="${esc(i.image)}" alt="${esc(i.gift_name)}"><h3>${esc(i.gift_name)}</h3><p>× ${i.quantity} · ${i.currency==='reward'?'무료 지급':i.currency==='gold'?'골드 구매':'실버 구매'}</p><p>획득 경로 · ${esc(inventorySource(i.source))}</p><p>${i.available?'사용 가능':'결제 확인 중'}</p><button class="small-button" data-inventory-send="${esc(i.id)}" data-gift-name="${esc(i.gift_name)}" ${i.available?'':'disabled'}>선물 사용</button></article>`;}
function inventoryPurchaseHTML(c){
 const catalog=[...(c.silver_gifts||[]),...(c.gifts||[])];
 return `${mySection('선물 보관 구매',`<div class="mp-stock-grid">${catalog.map(i=>`<article class="mp-stock-item"><img src="${esc(i.image)}" alt="${esc(i.name)}"><h3>${esc(i.name)}</h3><p>${number(i.gold||i.silver)} ${i.gold?'G':'S'}</p><button class="small-button" data-inventory-buy="${esc(i.id)}" data-gift-name="${esc(i.name)}" data-gift-price="${i.gold||i.silver}" data-gift-currency="${i.gold?'G':'S'}">보관 구매</button></article>`).join('')}</div>`)}${authConfig?.admin?`<details class="mp-card"><summary>관리자 · 이벤트 선물 지급</summary><form id="mp-gift-grant" class="upload-form"><label class="form-field">회원 공개 ID<input name="public_number" inputmode="numeric" pattern="[0-9]+" required></label><label class="form-field">선물<select name="gift_type">${catalog.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></label><label class="form-field">수량<input name="quantity" type="number" min="1" max="100" value="1" required></label><label class="form-field">지급 사유<input name="reason" maxlength="300" required></label><button class="primary-button">무료 보관 선물 지급</button><p class="form-error" role="alert"></p></form></details>`:''}`;
}
function inventoryTabs(s){
 const counts={owned:s.player.error||s.gifts.error?null:(s.player.inventory||[]).length+(s.gifts.items||[]).length,active:s.player.error?null:(s.player.inventory||[]).filter(i=>i.equipped).length};
 return [['owned','보유 상품'],['active','사용 중']].map(([key,label])=>`<button type="button" role="tab" id="inventory-tab-${key}" aria-controls="inventory-panel" aria-selected="${s.section===key}" tabindex="${s.section===key?0:-1}" data-inventory-tab="${key}">${label}<span>${counts[key]===null?'—':number(counts[key])}</span></button>`).join('');
}
function inventoryPanel(s){
 const frames=(s.player.inventory||[]).filter(i=>s.section==='owned'||i.equipped),gifts=s.section==='owned'?inventoryGiftGroups(s.gifts.items||[]):[];
 const errors=inventoryError(s.player,'꾸미기 상품')+(s.section==='owned'?inventoryError(s.gifts,'보관 선물'):'');
 const cards=frames.map(i=>inventoryFrameCard(i,s.profile.profile||{})).join('')+gifts.map(inventoryGiftCard).join('');
 return errors+(cards?`<div class="inventory-grid">${cards}</div>`:!errors?myEmpty(s.section==='active'?'사용 중인 상품이 없어요.':'보유한 상품이 없어요.'):'')+(s.section==='active'?'<a class="small-button inventory-browse" href="#inventory?section=owned">보유 상품 보기</a>':`<details class="mp-card inventory-purchase"><summary>선물 보관 구매</summary><p class="mp-form-note">보관 구매 시 골드·실버가 차감되고, 보낼 때 추가 차감되지 않아요. 무료 지급 선물은 현금 정산과 골드·실버 점수에 포함되지 않아요.</p>${inventoryError(s.catalog,'선물 목록')||inventoryPurchaseHTML(s.catalog)}</details>`);
}
async function unifiedInventoryView(raw){
 if(!me){returnRoute=location.hash;return {html:gate()};}
 const account=me.id,paths={player:'/api/me/player',profile:'/api/me/profile',gifts:'/api/me/gift-inventory',catalog:'/api/gifts/catalog'};
 const data=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>{try{return [key,await api(path,'GET',undefined,{fresh:true})];}catch(e){return [key,{error:e.message}];}})));
 const s={...data,section:inventorySection(raw),account,revision:apiRevision};
 return {unifiedInventory:s,giftInventory:true,html:`<div class="mp-manage-page unified-inventory" id="unified-inventory">${heading('인벤토리','보유 상품과 사용 중인 아이템을 한곳에서 관리해요.')}<a class="text-link" href="#profile?view=activity">마이페이지로 돌아가기</a>${s.profile.error?inventoryError(s.profile,'프로필'):`<section class="player-equipped-preview">${portrait({...s.profile.profile,...s.player.profile},'producer')}<div><h2>${esc(s.profile.profile.name)}</h2><p>${esc((s.player.inventory||[]).find(i=>i.equipped)?.name||'기본 프로필')} 사용 중</p></div></section>`}<div class="ml-tabs" role="tablist" aria-label="인벤토리 카테고리">${inventoryTabs(s)}</div><div id="inventory-panel" role="tabpanel" tabindex="0" aria-labelledby="inventory-tab-${s.section}">${inventoryPanel(s)}</div>${s.player.player?`<details class="mp-card inventory-level"><summary>내 레벨과 활동 안내</summary>${playerProgressHTML(s.player.player,false)}<ul>${(s.player.rules||[]).map(r=>`<li>${esc(r.label)} · +${r.xp} XP · ${esc(r.limit)}</li>`).join('')}</ul>${s.player.recent?.length?'<details><summary>최근 경험치 내역</summary>'+s.player.recent.slice(0,10).map(r=>`<p>${esc((s.player.rules||[]).find(x=>x.kind===r.kind)?.label||'음악 활동')} · ${myDate(r.created)} · +${number(r.amount)} XP</p>`).join('')+'</details>':''}${s.player.rewards?.length?'<p>달성할 수 있는 보상</p>'+s.player.rewards.map(i=>`<p>${esc(i.name)} · ${esc(i.description)}</p>`).join(''):''}</details>`:''}</div>`};
}
function bindUnifiedInventory(s){
 const root=$('#unified-inventory');if(!root||me?.id!==s.account)return;unifiedInventoryState=s;
 root.onclick=e=>{const tab=e.target.closest('[data-inventory-tab]');if(tab){s.focus=true;if(tab.dataset.inventoryTab===s.section){$('#inventory-tab-'+s.section)?.focus({preventScroll:true});return;}location.hash=inventoryHref(tab.dataset.inventoryTab);}if(e.target.closest('[data-inventory-retry]'))void render();};
 root.querySelector('.ml-tabs').onkeydown=e=>{if(e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();s.focus=true;location.hash=inventoryHref(e.key==='ArrowLeft'||e.key==='Home'?'owned':'active');};
 bindCategorySwipe($('#inventory-panel'),()=>s.section==='active'?1:0,2,index=>{location.hash=inventoryHref(index?'active':'owned');});
 const strip=root.querySelector('.ml-tabs'),active=strip.querySelector('[aria-selected="true"]');strip.scrollTo({left:Math.max(0,active.offsetLeft-(strip.clientWidth-active.offsetWidth)/2),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function refreshInventoryRoute(raw){
 const s=unifiedInventoryState,root=$('#unified-inventory'),section=inventorySection(raw);
 if(!s||!root||s.account!==me?.id||s.revision!==apiRevision||!/^inventory(?:\?|$)/.test(raw)||s.section===section)return false;
 s.section=section;root.querySelector('.ml-tabs').innerHTML=inventoryTabs(s);
 const old=$('#inventory-panel'),panel=document.createElement('div');panel.id='inventory-panel';panel.className='ml-enter';panel.setAttribute('role','tabpanel');panel.tabIndex=0;panel.setAttribute('aria-labelledby','inventory-tab-'+section);panel.innerHTML=inventoryPanel(s);old.replaceWith(panel);
 $('#main').dataset.route=raw;bindProfileManagement({unifiedInventory:s,giftInventory:true});icons();
 if(s.focus){$('#inventory-tab-'+section)?.focus({preventScroll:true});s.focus=false;}return true;
}
