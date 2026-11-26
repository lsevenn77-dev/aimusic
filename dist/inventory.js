let unifiedInventoryState = null;
const inventoryClock = () => globalThis.performance?.now?.() ?? Date.now();
const inventoryNow = state => state.serverNow + (inventoryClock() - state.receivedAt) / 1000;
const inventorySections = [['gifts', '선물'], ['frames', '테두리'], ['themes', '테마']];

// Keep the actual row IDs. A displayed quantity never authorizes a transfer.
function groupInventoryUnits(items, keyFor) {
 const groups = new Map();
 for (const item of items) {
  const key = keyFor(item);
  if (!groups.has(key)) groups.set(key, {...item, quantity:0, ids:[]});
  const group = groups.get(key);
  group.ids.push(item.id);
  group.quantity++;
 }
 return [...groups.values()];
}
function inventoryGiftGroups(items) {
 return groupInventoryUnits(items, i => JSON.stringify([i.gift_type, i.grant_origin, i.expires_at, !!i.giftable, !!i.available]));
}
function inventoryItems(state) {
 const frames = (state.player.inventory || []).map(i => ({...i, image:i.artwork, category:'frames'}));
 const rentals = [...(state.player.stored_decorations || []), ...(state.player.decorations || [])].map(i => ({
  ...i, name:i.product.name, image:i.product.assetPaths.thumbnail || decorationProductImage(i.product),
  category:i.product.kind === 'TALKING_ROOM_THEME' ? 'themes' : 'frames',
  status:i.stored ? 'UNUSED' : 'ACTIVE'
 }));
 const at=inventoryNow(state);
 const decorations = groupInventoryUnits([...frames, ...rentals].filter(i => (!i.expires_at || i.expires_at > at) &&
  (!i.reward_deadline || i.reward_deadline > at)), i => i.stored ?
  JSON.stringify([i.item_key, i.period_code, i.acquisition, i.reward_deadline, i.season_ends_at, i.giftable, i.available]) : i.id);
 const gifts = inventoryGiftGroups((state.gifts.items||[]).filter(i=>!i.expired&&(!i.expires_at||i.expires_at>at)))
  .map(i => ({...i,name:i.gift_name,category:'gifts'}));
 return [...gifts, ...decorations].sort((a,b) => Number(!!b.equipped) - Number(!!a.equipped));
}
function inventoryActions(item) {
 const id = esc(item.id);
 const send = item.giftable && item.available ? '<button type="button" class="stock-gift" data-stock-send="'+id+'">선물하기</button>' : '';
 if (item.category === 'gifts') return send || '<button disabled>'+(item.expired?'사용 기한 만료':'선물 제한')+'</button>';
 if (!item.available) return '<button disabled>사용 제한</button>';
 if (item.category === 'themes') return '<a href="#community?inventory_id='+encodeURIComponent(item.id)+'">사용하기</a>'+send;
 if (item.stored) return '<button type="button" data-stored-decoration="'+id+'" data-mode="use">사용하기</button>'+send;
 const premiumGuard = item.equipped && item.source === 'premium' ? ' data-remove-premium-frame="'+id+'"' : '';
 return '<button type="button" data-player-equip="'+(item.equipped ? '' : id)+'"'+premiumGuard+'>'+(item.equipped ? '해제하기' : '사용하기')+'</button>'+send;
}
function inventoryCard(item,state) {
 const labels = [];
 if (item.equipped) labels.push('<span class="stock-equipped">'+(item.category==='frames'?'착용 중':'사용 중')+'</span>');
 const deadline=item.reward_deadline||item.expires_at,at=inventoryNow(state);
 if(item.category!=='gifts'&&item.stored&&item.period_code){
  const duration=rentalPeriodText(item,at);if(duration)labels.push(esc(duration));
 }
 if(deadline){
  const exact=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short',hourCycle:'h23'}).format(deadline*1000)+' KST';
  const remaining=decorationRemaining(deadline,at).split(' · ')[0];
  const name=item.category==='gifts'?'사용 기한':item.stored?'사용 시작 기한':'이용 종료';
  labels.push('<time class="'+(deadline-at<=3*86400?'stock-expiring':'')+'" datetime="'+new Date(deadline*1000).toISOString()+
   '" title="'+esc(name+' '+exact)+'">'+esc((deadline-at<=3*86400?'만료 임박 · ':'')+remaining)+' <small>'+esc(name+' '+exact)+'</small></time>');
 }
 if((item.acquisition==='event'||item.grant_origin==='event'))labels.push('이벤트 지급');
 if(item.acquisition==='admin'||item.grant_origin==='admin')labels.push('운영 지급');
 if (item.acquisition === 'received') labels.push('받은 선물');
 if (item.acquisition === 'mixed') labels.push('받은 선물 포함');
 const quantity = item.category === 'gifts' || item.quantity > 1 ? '<span class="stock-quantity" aria-label="보유 '+item.quantity+'개">×'+number(item.quantity)+'</span>' : '';
 return `<article class="inventory-product${item.equipped && item.category==='frames'?' is-equipped':''}" data-inventory-item="${esc(item.id)}">
  <div class="inventory-product-art"><img src="${esc(item.image)}" alt="" loading="lazy" decoding="async"></div>
  <strong class="stock-title" title="${esc(item.name)}">${esc(item.name)}</strong>${quantity}
  ${labels.length?'<p class="stock-meta">'+labels.join(' · ')+'</p>':''}
  <div class="stock-actions">${inventoryActions(item)}</div></article>`;
}
function inventoryPanel(state) {
 const failures = [[state.player,'테두리·테마'],[state.gifts,'선물']].filter(([data]) => data.error)
  .map(([data,label]) => '<p class="mp-empty" role="alert">'+label+' 목록을 불러오지 못했습니다. '+esc(data.error)+' <button class="text-link" data-inventory-retry>다시 시도</button></p>').join('');
 const items = inventoryItems(state);
 const sections = inventorySections.map(([key,title]) => {
  const cards = items.filter(i => i.category === key);
  return cards.length ? '<section data-stock-section="'+key+'"><h2>'+title+'</h2><div class="inventory-product-grid">'+cards.map(i => inventoryCard(i,state)).join('')+'</div></section>' : '';
 }).join('');
 return failures + sections || '<div class="inventory-empty"><p>보유한 아이템이 없습니다.</p><a class="small-button" href="#gifts">상점으로</a></div>';
}
async function readOwnedInventory(readApi) {
 const read = path => readApi(path,'GET',undefined,{fresh:true}).catch(e => ({error:e.message}));
 const [player,gifts] = await Promise.all([read('/api/me/player'),read('/api/me/gift-inventory')]);
 return {player,gifts,serverNow:player.server_now || gifts.server_now || Date.now()/1000,receivedAt:inventoryClock()};
}
async function unifiedInventoryView(raw,readApi=api) {
 if (!me) {returnRoute=location.hash; return {html:gate()};}
 const account = me.id;
 const state = {...await readOwnedInventory(readApi),account,revision:apiRevision};
 return {unifiedInventory:state, html:`<div class="mp-manage-page unified-inventory" id="unified-inventory">
  <header class="inventory-heading"><h1>인벤토리</h1><a class="small-button" href="#gifts">상점으로</a></header>
  <div id="inventory-products">${inventoryPanel(state)}</div></div>`};
}
function paintInventory(state) {
 const panel = $('#unified-inventory #inventory-products');
 if (!panel || state !== unifiedInventoryState) return;
 const html = inventoryPanel(state);
 if (state.painted === html) return;
 const scroll=document.scrollingElement, top=scroll?.scrollTop, main=$('#main'), localTop=main?.scrollTop;
 panel.innerHTML=html;state.painted=html;
 if(scroll&&scroll.scrollTop!==top)scroll.scrollTop=top;
 if(main&&main.scrollTop!==localTop)main.scrollTop=localTop;
}
function bindUnifiedInventory(state) {
 const root = $('#unified-inventory');
 if (!root || me?.id !== state.account) return;
 unifiedInventoryState = state;
 state.painted=inventoryPanel(state);
 const paths={player:'/api/me/player',gifts:'/api/me/gift-inventory'};
 const lastRead={player:inventoryClock(),gifts:inventoryClock()},sequence={player:0,gifts:0};
 const refresh = async (force,detail) => {
  if (!root.isConnected || me?.id !== state.account || document.hidden&&!detail) return;
  paintInventory(state);
  const revision=apiRevision, keys=detail?.kind?[detail.kind]:Object.keys(paths);
  await Promise.all(keys.map(async key=>{
   if(!force&&inventoryClock()-lastRead[key]<30000)return;
   const ticket=++sequence[key];lastRead[key]=inventoryClock();
   try{
    const data=await api(paths[key],'GET',undefined,{fresh:true});
    if(!root.isConnected||state!==unifiedInventoryState||state.account!==me?.id||ticket!==sequence[key]||revision!==apiRevision)return;
    if(data.server_now){state.serverNow=data.server_now;state.receivedAt=inventoryClock();}
    state[key]=data;state.revision=revision;paintInventory(state);
   }catch{if(ticket===sequence[key])lastRead[key]=inventoryClock()-25000;}
  }));
 };
 root.onclick = e => {
  if (e.target.closest('[data-inventory-retry]')) return void refresh(true);
  const button = e.target.closest('[data-stock-send]');
  const item = button && inventoryItems(state).find(i => i.id === button.dataset.stockSend);
  if (item?.giftable && item.available) inventoryRecipientDialog(item,state);
 };
 const tick = () => void refresh(false), changed = event => void refresh(true,event.detail);
 window.addEventListener('aifect:inventory-tick',tick);
 window.addEventListener('aifect:inventory-changed',changed);
 document.addEventListener('visibilitychange',changed);
 registerRouteCleanup(() => {
  window.removeEventListener('aifect:inventory-tick',tick);
  window.removeEventListener('aifect:inventory-changed',changed);
  document.removeEventListener('visibilitychange',changed);
  if (unifiedInventoryState === state) unifiedInventoryState=null;
 });
}
function refreshInventoryRoute(raw) {
 const s = unifiedInventoryState;
 if (!s || !$('#unified-inventory') || s.account !== me?.id || s.revision !== apiRevision || !/^inventory(?:\?|$)/.test(raw)) return false;
 $('#main').dataset.route=raw; paintInventory(s); return true;
}

function inventoryRecipientDialog(item,state) {
 const serial = ++giftDialogSerial, account = state.account;
 const consumable = item.category === 'gifts';
 let ownedIds = item.ids;
 dialog(`<section class="gift-compose inventory-gift-popup">
  <header class="gift-compose-header"><h2 tabindex="-1">인벤토리 선물하기</h2></header>
  <form id="inventory-gift-form">
   <div class="gift-compose-body">
    <div class="gift-compose-product"><img src="${esc(item.image)}" alt="">
     <div><strong>${esc(item.name)}</strong><p>보유 수량 <span data-gift-stock>${number(ownedIds.length)}개</span></p></div>
    </div>
    ${giftQuantityControls()}
    ${giftRecipientField()}
   </div>
   <footer class="gift-compose-footer">
    <p class="gift-compose-total"><span>선물 후 보유 수량</span><strong data-gift-remaining aria-live="polite"></strong></p>
    <p class="gift-compose-notice" data-gift-unavailable hidden>선물할 수 있는 보유 수량이 없습니다.</p>
    <p class="form-error" role="alert"></p>
    <button type="submit" class="gift-compose-submit" disabled>선물하기</button>
   </footer>
  </form></section>`);
 const form = $('#inventory-gift-form');
 const stock = form.querySelector('[data-gift-stock]');
 const remaining = form.querySelector('[data-gift-remaining]');
 const unavailable = form.querySelector('[data-gift-unavailable]');
 bindGiftCompose(form,{
  serial, account, maximum:() => ownedIds.length,
  summary(quantity, available) {
   const count = number(Math.max(0,available-quantity))+'개';
   if (remaining.textContent !== count) remaining.textContent = count;
   stock.textContent = number(available)+'개';
   unavailable.hidden = available > 0;
  },
  transfer(quantity, recipient) {
   const ids = ownedIds.slice(0,quantity);
   const endpoint = consumable ? '/api/me/gift-inventory/' : '/api/decorations/inventory/';
   return {
    path:endpoint+encodeURIComponent(ids[0])+'/send',
    body:{inventory_ids:ids,profile_id:recipient.id},
    review:{name:item.name,image:item.image,quantity,recipient:recipient.name}
   };
  },
  async refresh() {
   const stock = await api(consumable?'/api/me/gift-inventory':'/api/me/player','GET',undefined,{fresh:true});
   const data = {gifts:consumable?stock:{},player:consumable?{}:stock,serverNow:stock.server_now||Date.now()/1000,receivedAt:inventoryClock()};
   const available = new Set(inventoryItems(data).filter(i=>i.available && i.giftable).flatMap(i=>i.ids));
   ownedIds = ownedIds.filter(id=>available.has(id));
  }
 });
}
