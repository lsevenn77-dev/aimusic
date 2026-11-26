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
 const decorations = groupInventoryUnits([...frames, ...rentals].filter(i => !i.expires_at || i.expires_at > inventoryNow(state)),
  i => i.stored ? JSON.stringify([i.item_key, i.period_code, i.acquisition, i.giftable, i.available]) : i.id);
 const gifts = inventoryGiftGroups((state.gifts.items||[]).map(item=>{
  if(item.expires_at&&item.expires_at<=inventoryNow(state))return {...item,available:false,giftable:false,expired:true};
  return item;
 })).map(i => ({...i,name:i.gift_name,category:'gifts'}));
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
 if(item.category==='gifts'&&item.expires_at){
  const formatDate=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
  labels.push(esc(item.expired?'사용 기한 만료':(item.expires_at-inventoryNow(state)<=3*86400?'만료 임박 · ':'')+formatDate.format(new Date(item.expires_at*1000))+' 종료'));
 }else if(item.expires_at||item.period_code)labels.push(esc(rentalPeriodText(item,inventoryNow(state))));
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
 return {player,gifts,serverNow:player.server_now || Date.now()/1000,receivedAt:inventoryClock()};
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
 if (state.painted !== html) {panel.innerHTML=html; state.painted=html;}
}
function bindUnifiedInventory(state) {
 const root = $('#unified-inventory');
 if (!root || me?.id !== state.account) return;
 unifiedInventoryState = state;
 let lastRead = inventoryClock(), sequence = 0;
 const refresh = async force => {
  if (!root.isConnected || me?.id !== state.account || document.hidden) return;
  paintInventory(state);
  if (!force && inventoryClock()-lastRead < 30000) return;
  const revision = apiRevision, ticket = ++sequence;
  lastRead = inventoryClock();
  const data = await readOwnedInventory(api);
  if (root.isConnected && state === unifiedInventoryState && state.account === me?.id && ticket === sequence && revision === apiRevision) {
   Object.assign(state,data,{revision}); paintInventory(state);
  }
 };
 root.onclick = e => {
  if (e.target.closest('[data-inventory-retry]')) return void refresh(true);
  const button = e.target.closest('[data-stock-send]');
  const item = button && inventoryItems(state).find(i => i.id === button.dataset.stockSend);
  if (item?.giftable && item.available) inventoryRecipientDialog(item,state);
 };
 const tick = () => void refresh(false), changed = () => void refresh(true);
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
 dialog(`<section class="stock-recipient"><h2>선물하기</h2>
  <div class="stock-selection"><img src="${esc(item.image)}" alt=""><div><strong>${esc(item.name)}</strong><small>보유 ×${number(item.quantity)}</small></div></div>
  <form id="stock-recipient-form"><label class="stock-field">수량<input type="number" name="quantity" value="1" min="1" max="${item.ids.length}" step="1" inputmode="numeric" required></label>
  <label class="stock-field">받는 사람 닉네임<input type="search" name="query" maxlength="60" autocomplete="off" placeholder="닉네임 검색"></label>
  <div class="stock-people" role="group" aria-label="회원 검색 결과"></div>
  <p class="form-error" role="alert"></p><button type="submit" class="primary-button" disabled>선물하기</button></form></section>`);
 const modal=$('#dialog'), form=$('#stock-recipient-form'), results=form.querySelector('.stock-people');
 const submit=form.querySelector('[type=submit]'), qty=form.elements.quantity, search=form.elements.query;
 const active=()=>form.isConnected && modal.open && giftDialogSerial===serial && me?.id===account;
 let profiles=[], recipient=null, searching=0, timer=0, busy=false, attempt=null;
 const valid=()=>Number.isInteger(qty.valueAsNumber) && qty.valueAsNumber>=1 && qty.valueAsNumber<=item.ids.length;
 const sync=()=>{submit.disabled=busy || !recipient || !valid();};
 const find = async ticket => {
  try {
   const response=await api('/api/decorations/recipients?q='+encodeURIComponent(search.value.trim()),'GET',undefined,{fresh:true});
   if (!active() || ticket!==searching) return;
   profiles=response.profiles.filter(p=>p.id!==me.profile_id && p.user_id!==account);
   results.innerHTML=profiles.length ? profiles.map(p=>`<button type="button" class="stock-person" data-profile-choice="${esc(p.id)}" aria-pressed="false"><span class="stock-avatar">${avatarImage(p,'producer',false)}</span><span><strong${premiumNameAttribute(p.id,p.user_id)}>${esc(p.name)}</strong><small>${esc(p.public_id || p.public_number || '')}</small></span></button>`).join('') : '<p class="field-help">'+(search.value.trim()?AifectMessages.searchEmpty:'닉네임으로 회원을 검색해 주세요.')+'</p>';
  } catch(e) {
   if (active() && ticket===searching) {results.innerHTML='<button type="button" class="text-link" data-search-retry>검색 다시 시도</button>'; formError(form).textContent=e.message;}
  }
 };
 const lookup=delay=>{
  clearTimeout(timer);recipient=null;profiles=[];sync();formError(form).textContent='';results.textContent='불러오는 중…';
  const ticket=++searching; timer=setTimeout(()=>void find(ticket),delay);
 };
 search.oninput=()=>lookup(180);
 search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();lookup(0);}};
 results.onclick=e=>{
  if (busy) return;
  if (e.target.closest('[data-search-retry]')) return lookup(0);
  const button=e.target.closest('[data-profile-choice]');
  if (!button) return;
  recipient=profiles.find(p=>p.id===button.dataset.profileChoice);
  for(const row of results.querySelectorAll('[data-profile-choice]')) row.setAttribute('aria-pressed',String(row===button));
  formError(form).textContent='';sync();
 };
 qty.oninput=sync;
 const setBusy=value=>{busy=value;qty.disabled=value;search.disabled=value;results.inert=value;sync();};
 form.onsubmit=async e=>{
  e.preventDefault();if (!active() || busy || !recipient || !valid()) return;
  const quantity=qty.valueAsNumber, ids=item.ids.slice(0,quantity), target=recipient;
  const fingerprint=JSON.stringify([ids,target.id]);
  if (attempt?.fingerprint!==fingerprint) attempt={fingerprint,key:crypto.randomUUID()};
  setBusy(true);formError(form).textContent='';
  try {
   if (!await confirmGiftTransfer({name:item.name,image:item.image,quantity,recipient:target.name}) || !active()) return;
   const url=item.category==='gifts'?'/api/me/gift-inventory/':'/api/decorations/inventory/';
   await api(url+encodeURIComponent(ids[0])+'/send','POST',{inventory_ids:ids,profile_id:target.id,request_id:attempt.key});
   if (active()) finishGiftTransfer();
  } catch(error) {if(active()) formError(form).textContent=error.message;}
  finally {if(active())setBusy(false);}
 };
 modal.addEventListener('close',()=>clearTimeout(timer),{once:true});
 lookup(0);
}
