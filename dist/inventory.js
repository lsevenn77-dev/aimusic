// Presentation over real ownership records. Filters never request or activate products.
let unifiedInventoryState=null;
const inventorySection=raw=>new URLSearchParams(raw.split('?')[1]||'').get('section')==='active'?'active':'owned';
const inventoryHref=section=>'#inventory?section='+section;
function inventoryGiftGroups(items){const groups=new Map();for(const i of items){const key=JSON.stringify([i.gift_type,i.currency,i.source,i.available]);const g=groups.get(key);if(g){g.quantity++;g.ids.push(i.id);}else groups.set(key,{...i,quantity:1,ids:[i.id]});}return [...groups.values()];}
function inventorySource(source){return ({purchase:'구매',decoration:'구매 · 선물 상품',decoration_stock:'구매 · 선물 상품',reward:'이벤트 · 보상',admin:'이벤트 · 보상',admin_grant:'이벤트 · 보상',level:'레벨 보상',crew:'크루 보상',gift:'선물',event:'이벤트',crew_level:'크루 레벨 보상','crew-level':'크루 레벨 보상'})[source]||'보유 상품';}
function inventoryError(d,label){return d?.error?`<p class="mp-empty" role="alert">${label}을 불러오지 못했습니다. ${esc(d.error)} <button class="text-link" data-inventory-retry>다시 시도</button></p>`:'';}
const inventoryClock=()=>globalThis.performance?.now?.()??Date.now();
function inventoryNow(s){return s.serverNow+(inventoryClock()-s.receivedAt)/1000;}
function inventoryItems(s){
 const frames=(s.player.inventory||[]).map(i=>({...i,name:i.name,image:i.artwork,category:'frames',status:i.paid||i.expires_at||i.equipped?'ACTIVE':'UNUSED'}));
 const rentals=[...(s.player.stored_decorations||[]),...(s.player.decorations||[])].map(i=>({...i,name:i.product.name,image:decorationProductImage(i.product),category:i.product.kind==='TALKING_ROOM_THEME'?'themes':'frames',status:i.stored?'UNUSED':'ACTIVE'}));
 const gifts=inventoryGiftGroups(s.gifts.items||[]).map(i=>({...i,name:i.gift_name,category:'gifts',status:'UNUSED',granted_at:i.created}));
 return [...frames,...rentals,...gifts].filter(i=>!i.expires_at||i.expires_at>inventoryNow(s));
}
function inventoryActions(i){
 if(!i.available)return '<button class="small-button" disabled>사용 제한</button>';
 if(i.category==='gifts')return `<button class="small-button" data-inventory-send="${esc(i.id)}" data-gift-name="${esc(i.name)}">선물 사용</button>`;
 if(i.category==='themes')return `<a class="small-button" href="#community?inventory_id=${encodeURIComponent(i.id)}">방에서 사용</a>`+(i.stored?`<button class="text-link" data-stored-decoration="${esc(i.id)}" data-mode="send">선물하기</button>`:'');
 if(i.stored)return `<button class="small-button" data-stored-decoration="${esc(i.id)}" data-mode="use">사용 시작</button><button class="text-link" data-stored-decoration="${esc(i.id)}" data-mode="send">선물하기</button>`;
 return `<button class="small-button" data-player-equip="${esc(i.equipped?'':i.id)}">${i.equipped?'해제하기':'장착하기'}</button>`;
}
function inventoryCard(i,s){
 return `<article class="inventory-product" data-inventory-item="${esc(i.id)}"><button class="inventory-product-detail" data-inventory-detail="${esc(i.id)}" aria-label="${esc(i.name)} 상세 정보"><span class="inventory-product-art"><img src="${esc(i.image)}" alt="" loading="lazy" decoding="async"></span><strong title="${esc(i.name)}">${esc(i.name)}${i.quantity>1?' × '+i.quantity:''}</strong></button><div class="inventory-product-copy">${rentalStatusHTML(i,inventoryNow(s))}<p class="inventory-remaining">${esc(rentalPeriodText(i,inventoryNow(s)))}</p></div><div class="inventory-product-actions">${inventoryActions(i)}</div></article>`;
}
function inventorySummary(s){
 const items=inventoryItems(s),count=list=>list.reduce((n,i)=>n+(i.quantity||1),0),known=!s.player.error&&!s.gifts.error;
 return [['전체 보유',count(items)],['사용 중',count(items.filter(i=>i.status==='ACTIVE'))],['미사용',count(items.filter(i=>i.status==='UNUSED'))]].map(([label,n])=>`<div><span>${label}</span><strong>${known?number(n):'—'}</strong></div>`).join('');
}
function inventoryTabs(s){
 const categories=[['all','전체'],['themes','테마'],['frames','프로필 꾸미기'],['gifts','선물']];
 return categories.map(([key,label])=>`<button type="button" role="tab" id="inventory-tab-${key}" aria-controls="inventory-products" aria-selected="${s.category===key}" tabindex="${s.category===key?0:-1}" data-inventory-category="${key}">${label}</button>`).join('');
}
function inventoryFiltered(s){
 const at=inventoryNow(s),items=inventoryItems(s).filter(i=>(s.category==='all'||s.category===i.category)&&(s.filter==='all'||s.filter==='unused'&&i.status==='UNUSED'||s.filter==='active'&&i.status==='ACTIVE'||s.filter==='expiring'&&i.expires_at>at&&i.expires_at-at<=3*86400));
 return items.sort((a,b)=>s.sort==='name'?a.name.localeCompare(b.name,'ko'):s.sort==='expiry'?(a.expires_at||Infinity)-(b.expires_at||Infinity)||(b.granted_at||0)-(a.granted_at||0):(b.granted_at||0)-(a.granted_at||0)||a.id.localeCompare(b.id));
}
function inventoryPanel(s){const items=inventoryFiltered(s);return inventoryError(s.player,'꾸미기 상품')+inventoryError(s.gifts,'보관 선물')+(items.length?`<div class="inventory-product-grid">${items.map(i=>inventoryCard(i,s)).join('')}</div>`:'<p class="inventory-empty" role="status">표시할 보유 상품이 없습니다.</p>');}
async function unifiedInventoryView(raw,readApi=api){
 if(!me){returnRoute=location.hash;return {html:gate()};}
 const paths={player:'/api/me/player',profile:'/api/me/profile',gifts:'/api/me/gift-inventory',catalog:'/api/gifts/catalog'};
 const data=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>{try{return [key,await readApi(path,'GET',undefined,{fresh:true})];}catch(e){return [key,{error:e.message}];}})));
 const s={...data,section:inventorySection(raw),category:'all',filter:inventorySection(raw)==='active'?'active':'all',sort:'recent',account:me.id,revision:apiRevision,serverNow:data.player.server_now||Date.now()/1000,receivedAt:inventoryClock()};
 return {unifiedInventory:s,giftInventory:true,html:`<div class="mp-manage-page unified-inventory" id="unified-inventory"><header class="inventory-heading">${heading('내 인벤토리','보유 상품을 확인하고 원하는 곳에 사용해 보세요.')}<a class="small-button" href="#gifts">상점으로</a></header><div class="inventory-summary" aria-label="보유 상품 요약">${inventorySummary(s)}</div><div class="ml-tabs inventory-categories" role="tablist" aria-label="상품 분류">${inventoryTabs(s)}</div><div class="inventory-tools"><label>상태<select data-inventory-filter aria-label="상품 상태"><option value="all">전체 상태</option><option value="unused">미사용</option><option value="active" ${s.filter==='active'?'selected':''}>사용 기간 중</option><option value="expiring">만료 임박</option></select></label><label>정렬<select data-inventory-sort aria-label="상품 정렬"><option value="recent">최근 획득순</option><option value="expiry">만료 임박순</option><option value="name">상품명순</option></select></label></div><div id="inventory-products" role="tabpanel" aria-labelledby="inventory-tab-all">${inventoryPanel(s)}</div><details class="mp-card inventory-purchase"><summary>선물 보관 구매</summary><p class="mp-form-note">보관 구매 시 골드·실버가 차감되고, 보낼 때 추가 차감되지 않습니다.</p>${inventoryError(s.catalog,'선물 목록')||inventoryPurchaseHTML(s.catalog)}</details>${s.player.player?`<details class="mp-card inventory-level"><summary>내 레벨과 활동 안내</summary>${playerProgressHTML(s.player.player,false)}<ul>${(s.player.rules||[]).map(r=>`<li>${esc(r.label)} · +${r.xp} XP · ${esc(r.limit)}</li>`).join('')}</ul>${(s.player.recent||[]).slice(0,10).map(r=>`<p>${myDate(r.created)} · +${number(r.amount)} XP</p>`).join('')}${(s.player.rewards||[]).map(i=>`<p>${esc(i.name)} · ${esc(i.description)}</p>`).join('')}</details>`:''}</div>`};
}
function paintInventory(s){
 const root=$('#unified-inventory');if(!root||s!==unifiedInventoryState)return;
 const summary=root.querySelector('.inventory-summary'),summaryHTML=inventorySummary(s);if(summary.innerHTML!==summaryHTML)summary.innerHTML=summaryHTML;
 const tabs=root.querySelector('.inventory-categories'),tabsHTML=inventoryTabs(s);if(tabs.innerHTML!==tabsHTML)tabs.innerHTML=tabsHTML;
 const panel=root.querySelector('#inventory-products'),html=inventoryPanel(s);if(panel.innerHTML!==html)panel.innerHTML=html;
 panel.setAttribute('aria-labelledby','inventory-tab-'+s.category);
}
function inventoryDetail(s,id){
 const i=inventoryItems(s).find(i=>i.id===id);if(!i)return;
 dialog(`<section class="inventory-detail"><h2>${esc(i.name)}</h2><img src="${esc(i.image)}" alt="${esc(i.name)}">${rentalStatusHTML(i,inventoryNow(s))}<p>${esc(rentalPeriodText(i,inventoryNow(s)))}</p>${i.description?'<p>'+esc(i.description)+'</p>':''}<dl><dt>획득 경로</dt><dd>${esc(inventorySource(i.source))}</dd><dt>획득일</dt><dd>${myDate(i.granted_at)}</dd>${i.activated_at?'<dt>사용 시작</dt><dd>'+myDate(i.activated_at)+'</dd>':''}${i.expires_at?'<dt>만료일</dt><dd>'+myDate(i.expires_at)+'</dd>':''}</dl>${i.stored?'<p>최초 사용 전에는 이용 기간이 줄어들지 않습니다.</p>':''}${i.reason?'<p>'+esc(i.reason)+'</p>':''}<div class="inventory-product-actions">${inventoryActions(i)}</div>${i.product||i.paid?'<button class="text-link" data-decoration="'+esc(i.item_key)+'">상품 정보 · 추가 구매</button>':''}</section>`);
 $('#dialog').classList.add('inventory-dialog');$('#dialog').addEventListener('close',()=>$('#dialog').classList.remove('inventory-dialog'),{once:true});
}
function bindUnifiedInventory(s){
 const root=$('#unified-inventory');if(!root||me?.id!==s.account)return;unifiedInventoryState=s;
 root.onclick=e=>{const category=e.target.closest('[data-inventory-category]');if(category){s.category=category.dataset.inventoryCategory;paintInventory(s);root.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});}const detail=e.target.closest('[data-inventory-detail]');if(detail)inventoryDetail(s,detail.dataset.inventoryDetail);if(e.target.closest('[data-inventory-retry]'))void render();};
 root.onchange=e=>{if(e.target.matches('[data-inventory-filter]'))s.filter=e.target.value;else if(e.target.matches('[data-inventory-sort]'))s.sort=e.target.value;else return;paintInventory(s);};
 root.querySelector('.inventory-categories').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...root.querySelectorAll('[data-inventory-category]')],at=tabs.findIndex(t=>t.dataset.inventoryCategory===s.category);e.preventDefault();tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(at+(e.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length].click();};
 let lastRead=inventoryClock(),busy=false;
 const refresh=async force=>{if(!root.isConnected||me?.id!==s.account||document.hidden||busy)return;paintInventory(s);if(!force&&inventoryClock()-lastRead<30000)return;busy=true;lastRead=inventoryClock();try{const [player,gifts]=await Promise.all([api('/api/me/player','GET',undefined,{fresh:true}),api('/api/me/gift-inventory','GET',undefined,{fresh:true})]);if(root.isConnected&&me?.id===s.account){s.player=player;s.gifts=gifts;s.serverNow=player.server_now;s.receivedAt=inventoryClock();s.revision=apiRevision;paintInventory(s);}}catch{/* Existing verified expirations still hide on the shared display clock. */}finally{busy=false;}};
 const tick=()=>void refresh(false),visible=()=>{if(!document.hidden)void refresh(true);};
 window.addEventListener('aifect:inventory-tick',tick);document.addEventListener('visibilitychange',visible);
 registerRouteCleanup(()=>{window.removeEventListener('aifect:inventory-tick',tick);document.removeEventListener('visibilitychange',visible);});
}
function refreshInventoryRoute(raw){
 const s=unifiedInventoryState;if(!s||!$('#unified-inventory')||s.account!==me?.id||s.revision!==apiRevision||!/^inventory(?:\?|$)/.test(raw))return false;
 s.section=inventorySection(raw);s.filter=s.section==='active'?'active':'all';$('#main').dataset.route=raw;$('#unified-inventory [data-inventory-filter]').value=s.filter;paintInventory(s);return true;
}

function inventoryPurchaseHTML(c){
 const catalog=[...(c.silver_gifts||[]),...(c.gifts||[])];
 return `${mySection('선물 보관 구매',`<div class="mp-stock-grid">${catalog.map(i=>`<article class="mp-stock-item"><img src="${esc(i.image)}" alt="${esc(i.name)}"><h3>${esc(i.name)}</h3><p>${number(i.gold||i.silver)} ${i.gold?'G':'S'}</p><button class="small-button" data-inventory-buy="${esc(i.id)}" data-gift-name="${esc(i.name)}" data-gift-price="${i.gold||i.silver}" data-gift-currency="${i.gold?'G':'S'}">보관 구매</button></article>`).join('')}</div>`)}${authConfig?.admin?`<details class="mp-card"><summary>관리자 · 이벤트 선물 지급</summary><form id="mp-gift-grant" class="upload-form"><label class="form-field">회원 공개 ID<input name="public_id" type="text" inputmode="text" pattern="[A-Za-z]{3}[0-9]{4}" minlength="7" maxlength="7" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="예: QXF7082" required></label><label class="form-field">선물<select name="gift_type">${catalog.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></label><label class="form-field">수량<input name="quantity" type="number" min="1" max="100" value="1" required></label><label class="form-field">지급 사유<input name="reason" maxlength="300" required></label><button class="primary-button">무료 보관 선물 지급</button><p class="form-error" role="alert"></p></form></details>`:''}`;
}
