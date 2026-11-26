const giftArt=g=>`<img class="gift-art" src="${esc(g.image)}" alt="" width="96" height="96" loading="lazy" decoding="async">`;
const giftButton=(t,cls='small-button gift-entry')=>me?.id===t.user_id?'':`<button class="${cls}" data-gift="${esc(t.id)}" aria-label="${esc(t.title)} 선물하기">${icon('gift')}<span>선물</span></button>`;
function giftCards(gifts,selected=null,selectable=false,withCoins=false){return `<div class="gift-catalog">${gifts.map(g=>`<${selectable?'button type="button"':'article'} class="gift-choice ${selected===g.id?'selected':''}" ${selectable?`data-gift-type="${g.id}" aria-pressed="${selected===g.id}"`:''}>${giftArt(g)}<strong>${esc(g.name)}</strong><span>${shopPrice(g.free?g.silver:g.gold,g.free?"S":"G")}</span></${selectable?'button':'article'}>`).join('')}</div>`;}
function freeRewardsHTML(s,compact=false){const labels={checkin:'오늘 출석',cover:'커버곡 공개',listen:'노래 5곡 감상',comment1:'첫 번째 댓글',comment2:'두 번째 댓글',comment3:'세 번째 댓글'};return `<section class="free-rewards"><div class="free-rewards-title">${shopCoin('S',32)}<div><strong>매일 모으는 작은 응원</strong><p>보유 실버 <b>${shopPrice(s?.balance,'S',20)}</b> · 하루 최대 10 s</p></div><span class="free-gift-badge">무료</span></div>${compact?'<details class="gift-reward-details"><summary>오늘의 보상 받기 · 최대 10 s</summary>':''}<div class="daily-gift-actions">${s?s.rewards.map(r=>`<div class="daily-gift-task"><span>${labels[r.kind]}<small>${r.kind==='listen'?'곡마다 60% 이상 · '+r.progress+'/5곡':r.kind==='cover'?'하루 1회':r.kind.startsWith('comment')?'3자 이상 · 하루 총 3회':'하루 1회'}</small></span><button type="button" class="small-button" data-claim-gift="${r.kind}" ${r.claimed||!r.eligible?'disabled':''}>${r.claimed?'✓ 받음':r.eligible?shopPrice(r.amount,'S')+' 받기':shopPrice(r.amount,'S')+' · '+r.progress+'/'+r.target}</button>${!r.claimed&&!r.eligible?`<a class="text-link" href="${r.kind==='cover'?'#karaoke':'#home'}">${r.kind==='cover'?'커버 공개하기':r.kind==='listen'?'음악 듣기':'곡에서 댓글 남기기'}</a>`:''}</div>`).join(''):'<a class="small-button" href="#account" data-close-dialog>로그인하고 받기</a>'}</div><p class="gift-fineprint">매일 0시(한국 시간) 보상 갱신 · 받은 실버는 누적됩니다.<br>1 s와 1 g는 각각 응원 순위 1점 · 실버는 현금 가치·골드 전환·수익 정산이 없습니다.</p>${compact?'</details>':''}</section>`;}
function giftShopHTML(d=null){
 const silver=AifectGifts.FREE_GIFT,gifts=d?.gifts||AifectGifts.GIFT_CATALOG;
 const silverGifts=d?.silver_gifts||AifectGifts.SILVER_GIFT_CATALOG;
 return `<div class="gift-dashboard"><header class="gift-shop-heading"><h1>상점</h1><div class="inline-actions"><a class="small-button" href="#gold">골드 충전·결제</a><a class="small-button" href="#gifts/rewards">오늘의 실버받기</a></div></header>
 <section class="gift-dashboard-section gift-silver-section" aria-labelledby="silver-gifts-title"><header class="gift-section-heading"><div class="gift-section-title">${shopCoin('S',24)}<h2 id="silver-gifts-title">실버 선물</h2></div><p><strong>작지만 특별한 마음, 실버로 전해 보세요.</strong><span>출석과 음악 활동으로 모으는 무료 응원입니다.</span></p><div class="gift-section-access"><span>보유 <strong>${shopPrice(d?.free?.balance||0,'S',20)}</strong></span><a class="gift-section-cta" href="#gifts/rewards">오늘의 실버 받기 ${icon('chevron')}</a></div></header>
 <div class="gift-catalog silver-catalog">${silverGifts.map(g=>`<button type="button" class="gift-choice" data-gift-buy="${esc(g.id)}">${giftArt(g)}<strong>${esc(g.name)}</strong><span>${shopPrice(g.silver,'S')}</span></button>`).join('')}</div><details class="gift-dashboard-policy"><summary>실버 선물이란?</summary><p>출석·음악 활동으로 하루 최대 10 s를 모을 수 있습니다. 1 s와 1 g는 응원 순위에 각각 1점으로 반영됩니다. 실버는 현금 정산·다이아 적립·골드 전환 대상이 아닙니다.</p></details></section>
 <section class="gift-dashboard-section gift-gold-section" aria-labelledby="gold-gifts-title"><header class="gift-section-heading"><div class="gift-section-title">${giftArt(AifectGifts.giftById('crown'))}<h2 id="gold-gifts-title">골드 선물</h2></div><p><strong>더 깊고 특별한 마음을 골드 선물로 전해 보세요.</strong><span>좋아하는 음악과 아티스트의 다음 무대를 응원합니다.</span></p><a class="gift-section-cta" href="#gold">${d?'보유 '+shopPrice(d.balance,'G',20):'골드 충전'} ${icon('chevron')}</a></header><div class="gift-catalog gift-dashboard-catalog">${gifts.map(g=>`<button type="button" class="gift-choice" data-gift-buy="${esc(g.id)}">${giftArt(g)}<strong>${esc(g.name)}</strong><span>${shopPrice(g.gold,'G')}</span></button>`).join('')}</div><details class="gift-dashboard-policy"><summary>골드 선물 수익 · 정산 안내</summary><p>${esc(AifectGifts.GIFT_SETTLEMENT_NOTICE)} 커버곡 선물은 가창자 70%·플랫폼 30%이며, 확정된 수익은 다이아로 적립됩니다.</p></details></section>
 ${d?.official_received?officialSupportHTML(d.official_received):''}<nav class="gift-dashboard-actions" aria-label="상점 관리"><a class="small-button" href="#gifts/rewards">오늘의 실버받기</a><a class="primary-button" href="#gold">${icon('wallet')} 골드 충전 · 결제</a><a class="small-button" href="#gold/history">${icon('list')} 보낸 선물 내역</a></nav><footer class="gift-dashboard-footer"><span>${icon('gift')} 선물은 아티스트에게 큰 힘이 되는 소중한 마음입니다.</span><em>Music brings us closer.</em></footer></div>`;
}
async function chooseGiftRecipient(type){
 const serial=++giftDialogSerial,roomGift=type?.roomGift;dialog('<section class="gift-recipient-dialog"><h2>선물 받을 사람</h2><p role="status">불러오는 중…</p></section>');
 try{await accountReady;if(!me){$('#dialog').close();returnRoute='#gifts';return askLogin();}const account=me.id;
  const d=roomGift?{profiles:roomGift.recipients.filter(p=>p?.id&&p.id!==me.profile_id)}:await api('/api/decorations/recipients','GET',undefined,{fresh:true});if(serial!==giftDialogSerial||!$('#dialog').open||account!==me?.id)return;
  dialog('<section class="gift-recipient-dialog"><h2>선물 받을 사람</h2><form id="gift-recipient-search"><label>'+(roomGift?'토킹룸 참여자 검색':'닉네임 검색')+'<input name="q" maxlength="60" type="search" required></label><button class="small-button">검색</button><p class="form-error" role="alert"></p></form><div class="gift-target-list" id="gift-recipient-results"></div></section>');
  const form=$('#gift-recipient-search'),list=$('#gift-recipient-results');
  let selecting=false;
  const paint=profiles=>{list.innerHTML=profiles.length?profiles.map(p=>'<button type="button" class="gift-target" data-gift-recipient="'+esc(p.id)+'"><span><strong>'+userNickname(p.name,{profileId:p.id,userId:p.user_id})+'</strong><small>이 회원에게 선물하기</small></span>'+icon('chevron')+'</button>').join(''):'<p>'+(roomGift?'선물할 참여자가 없습니다.':'닉네임으로 회원을 검색해 주세요.')+'</p>';list.querySelectorAll('[data-gift-recipient]').forEach(b=>b.onclick=async()=>{if(selecting||serial!==giftDialogSerial||account!==me?.id)return;selecting=true;try{if(roomGift)await roomGift.onRecipientChange?.(b.dataset.giftRecipient);if(serial===giftDialogSerial&&form.isConnected&&account===me?.id)await profileGiftDialog(b.dataset.giftRecipient,type);}catch(e){if(form.isConnected)formError(form).textContent=e.message;}finally{selecting=false;}});};paint(d.profiles);
  form.onsubmit=busyForm(form,async()=>{const query=form.elements.q.value.trim();const r=roomGift?{profiles:d.profiles.filter(p=>String(p.name||'').toLocaleLowerCase().includes(query.toLocaleLowerCase()))}:await api('/api/decorations/recipients?q='+encodeURIComponent(query),'GET',undefined,{fresh:true});if(serial===giftDialogSerial&&form.isConnected&&account===me?.id)paint(r.profiles);});
 }catch(e){if(serial===giftDialogSerial&&$('#dialog').open)dialog('<section class="gift-recipient-dialog"><h2>선물할 회원을 불러오지 못했습니다</h2><p role="alert">'+esc(e.message)+'</p></section>');}
}
function ownedGiftGroups(items = [], selectedId) {
 const groups = new Map();
 for (const item of items) {
  if (!item.giftable || !item.available) continue;
  let group = groups.get(item.gift_type);
  if (!group) {
   group = {id:item.id, name:item.gift_name, image:item.image, ids:[]};
   groups.set(item.gift_type, group);
  }
  if (item.id === selectedId) { group.id = item.id; group.ids.unshift(item.id); }
  else group.ids.push(item.id);
 }
 return [...groups.values()];
}

function storedGiftCard(group, attribute) {
 return `<button type="button" class="gift-choice" ${attribute}="${esc(group.id)}" aria-pressed="false">${giftArt(group)}<strong title="${esc(group.name)}">${esc(group.name)}</strong><span>×${number(group.ids.length)}</span></button>`;
}

function giftInventorySection(title, cards) {
 return cards ? `<section class="gift-owned-section"><h3>${title}</h3><div class="gift-catalog gift-owned-catalog">${cards}</div></section>` : '';
}

function confirmGiftTransfer({name,image,recipient,quantity,amount,currency,started = false}) {
 const sheet = document.createElement('dialog');
 sheet.className = 'gift-transfer-confirm';
 sheet.setAttribute('aria-labelledby', 'gift-transfer-title');
 sheet.setAttribute('aria-describedby', 'gift-transfer-question gift-transfer-notice');
 const payment = amount == null ? '' : `<p class="gift-confirm-cost">결제 금액 ${shopPrice(amount, currency)}</p>`;
 const period = started ? '<p>남은 이용 기간이 그대로 이전됩니다.</p>' : '';
 sheet.innerHTML = `<form method="dialog"><h2 id="gift-transfer-title">선물하기</h2>${giftArt({image})}
  <p id="gift-transfer-question"><strong>${esc(recipient)}</strong>님에게<br>${esc(name)} ${number(quantity)}개를 선물하시겠습니까?</p>
  ${payment}${period}<p id="gift-transfer-notice">보낸 선물은 취소할 수 없습니다.</p>
  <div class="gift-confirm-actions"><button type="submit" value="cancel" class="small-button" autofocus>취소</button><button type="submit" value="send" class="primary-button">선물하기</button></div></form>`;
 const owner = $('#dialog');
 return new Promise(resolve => {
  const cancel = () => { if (sheet.open) sheet.close('cancel'); };
  sheet.addEventListener('close', () => {
   window.removeEventListener('hashchange', cancel);
   owner?.removeEventListener('close', cancel);
   sheet.remove();
   resolve(sheet.returnValue === 'send');
  }, {once:true});
  window.addEventListener('hashchange', cancel);
  owner?.addEventListener('close', cancel);
  sheet.addEventListener('click', event => { if (event.target === sheet) cancel(); });
  document.body.append(sheet);
  sheet.showModal();
 });
}

function finishGiftTransfer() {
 $('#dialog').close();
 toast('선물을 보냈습니다.');
 window.dispatchEvent(new Event('aifect:inventory-changed'));
 if (typeof refreshShopBalances === 'function') void refreshShopBalances();
}
let giftDialogSerial=0;
function giftCompactRecipient(profile,canChange){
 const image=typeof avatarImage==='function'?avatarImage(profile,profile.kind||'producer',false,false):'';
 return `<${canChange?'button type="button"':'div'} class="gift-recipient" id="gift-recipient"${canChange?' aria-label="받는 사람 변경"':''}><span class="gift-recipient-avatar">${image}</span><strong>${userNickname(profile.name,{profileId:profile.kind==='artist'?null:profile.id,artistId:profile.id,entityType:profile.kind})}</strong>${canChange?icon('chevron'):''}</${canChange?'button':'div'}>`;
}
async function giftDialog(tid, initial = null, personal = false) {
 const serial = ++giftDialogSerial, route = globalThis.location?.hash, roomGift = initial?.roomGift;
 const artistId = personal ? initial?.artistId : null;
 const fromMessage = !artistId && personal && (initial?.fromMessage === true || route?.split('?')[0] === '#dm/'+tid);
 if (roomGift && (!personal || typeof roomGift.send !== 'function' || !roomGift.recipients?.some(p => p.id === tid))) {
  toast('선물할 토킹룸 참여자를 다시 선택해 주세요.'); return;
 }
 if (personal && me?.profile_id === tid) { toast('본인에게는 선물할 수 없습니다.'); return; }
 try {
  await accountReady;
  const account = me?.id;
  const current = () => serial === giftDialogSerial && route === globalThis.location?.hash && account === me?.id;
  const [walletData,track,inventory] = await Promise.all([
   me ? api('/api/gold','GET',undefined,{fresh:true}) : null,
   api(artistId ? '/api/artist-preview/'+encodeURIComponent(artistId) : '/api/'+(personal?'producers/':'tracks/')+encodeURIComponent(tid)+(personal?'?gift_summary=0':'')),
   me && !roomGift ? api('/api/me/gift-inventory','GET',undefined,{fresh:true}).catch(() => ({error:true,items:[]})) : {items:[]}
  ]);
  if (!current()) return;
  if (artistId && track.profile.producer_id !== tid) { toast('아티스트의 소속이 변경되었습니다. 프로필을 다시 열어 주세요.'); return; }
  const t = personal ? {user_id:track.profile.user_id, producer:track.profile.display_name || track.profile.name} : track.track;
  if (!personal) remember([t]);
  const reason = t.gift_block_reason || (me && me.id === t.user_id ? personal ? '본인에게는 선물할 수 없습니다.' : '내 작품에는 선물할 수 없습니다.' : '');
  if (reason) { toast(reason); return; }
  let wallet = walletData;
  const gold = wallet?.gifts || AifectGifts.GIFT_CATALOG, silver = wallet?.silver_gifts || AifectGifts.SILVER_GIFT_CATALOG;
  const choices = roomGift ? gold : [...gold,...silver];
  const groups = ownedGiftGroups(inventory.items,initial?.giftInventoryId);
  const initialType = typeof initial === 'string' ? initial : initial?.id;
  const explicitChoice = choices.find(g => g.id === initialType);
  const recipientId = artistId ? track.profile.producer_id : personal ? track.profile.id || tid : t.producer_id;
  const profile = {kind:artistId?'artist':'producer',id:artistId||recipientId,name:t.producer,image_version:personal?track.profile.image_version:t.producer_image_version};
  let chosen = explicitChoice || gold[0] || silver[0];
  let owned = groups.find(g => g.id === initial?.giftInventoryId) || null;
  if (!roomGift && !explicitChoice && !initial?.sku && !initial?.inventoryId && !initial?.giftInventoryId) owned = groups[0] || null;
  let category = owned || initial?.inventoryId || initial?.giftInventoryId ? 'inventory' : 'gifts', decoration = null;
  let quantity = Number.isInteger(initial?.quantity) && initial.quantity > 0 ? initial.quantity : 1;
  const requests = new Map();
  const context = {...(artistId ? {artist_id:artistId} : {}), ...(fromMessage ? {from_message:true} : {}),
   ...(!personal ? {track_id:tid} : !artistId && !fromMessage && !/^#(?:inventory|gift-inventory|gifts)\b/.test(route) ? {from_profile:true} : {})};
  const ownedHTML = inventory.error ? '<p class="gift-owned-empty" role="alert">보유 아이템을 불러오지 못했습니다. <button type="button" class="text-link" data-gift-inventory-retry>다시 불러오기</button></p>' :
   giftInventorySection('선물',groups.map(g => storedGiftCard(g,'data-owned-gift')).join(''));
  $('#gift-form')?._giftCleanup?.();
  const initialOptions = Array.from({length:100},(_,i) => `<option value="${i+1}">${i+1}개</option>`).join('');
  dialog(`<section class="gift-dialog gift-dialog--compact"><header class="gift-dialog-header"><h2>선물하기</h2>${giftCompactRecipient(profile,personal && !artistId)}</header>
   <nav class="gift-category-tabs" aria-label="선물 카테고리">${[['gifts','선물'],['frames','테두리'],['themes','테마'],['inventory','인벤토리']].map(([key,label]) =>
    `<button type="button" class="small-button" data-gift-category="${key}" aria-pressed="false"${roomGift && key !== 'gifts'?' disabled aria-disabled="true"':''}>${label}</button>`).join('')}</nav>
   <form id="gift-form"><div class="gift-options gift-dialog-scroll" tabindex="0" role="region" aria-label="선물 선택">
    <div class="gift-ordinary-products">${giftCards(choices,null,true,true)}<details class="gift-policy-details"${roomGift?' hidden':''}><summary>선물 수익 · 정산 안내</summary><p class="gift-fineprint">${esc(AifectGifts.GIFT_SETTLEMENT_NOTICE)} 실버 선물은 수익 정산에 반영되지 않습니다.</p></details></div>
    <div class="gift-owned" hidden>${ownedHTML}</div><div class="gift-decoration-products" hidden></div>
   </div><div class="gift-checkout gift-dialog-footer">
    <div id="gift-decoration-detail" class="gift-extra-detail" hidden></div><span class="gift-summary-sr-only" id="gift-send-summary" aria-live="polite"></span>
    <p class="gift-context-detail" id="gift-detail" hidden></p><div class="gift-footer-grid">
    <span class="gift-balance-cell" id="gift-balance-g" data-currency="G">${shopPrice(wallet?.balance||0,'G',20)}</span>
    <a class="gift-charge-button" href="#gold" data-close-dialog><span>충전하기</span></a>
    <label class="gift-quantity"><span class="gift-summary-sr-only">선물 수량</span><select id="gift-quantity" aria-label="선물 수량">${initialOptions}</select>${icon('chevron')}</label>
    <span class="gift-balance-cell" id="gift-balance-s" data-currency="S">${shopPrice(wallet?.free?.balance||0,'S',20)}</span>
    <a class="gift-silver-button" href="#rewards" data-close-dialog>${icon('gift')}<span>오늘의 실버받기</span></a>
    <button type="submit" class="gift-send-button" id="gift-send" aria-describedby="gift-send-summary">${icon('gift')}<span class="gift-send-label">선물하기</span></button></div>
    <p class="form-error" role="alert"></p></div></form></section>`);
  const form = $('#gift-form'), input = $('#gift-quantity'), send = $('#gift-send'), summary = $('#gift-send-summary');
  const detail = $('#gift-detail'), periodBox = $('#gift-decoration-detail'), footer = form.querySelector('.gift-checkout');
  const active = () => current() && form.isConnected && $('#dialog').open;
  let maxOptions = 100;
  function selection() {
   if (category === 'inventory') {
    if (decoration?.item) {
     const {p,item} = decoration;
     return {name:p.name,image:p.assetPaths.thumbnail||p.assetPaths.roomCard||p.assetPaths.overlay,ids:item.ids,path:'/api/decorations/inventory/'};
    }
    return owned ? {...owned,path:'/api/me/gift-inventory/'} : null;
   }
   if (decoration) {
    const {p,period} = decoration;
    return {name:p.name,image:p.assetPaths.thumbnail||p.assetPaths.roomCard||p.assetPaths.overlay,unit:p.currency,price:p.periodPrices[period]};
   }
   return category === 'gifts' && chosen ? {name:chosen.name,image:chosen.image,unit:chosen.free?'S':'G',price:chosen.free?chosen.silver:chosen.gold} : null;
  }
  function update() {
   if (!form.isConnected) return;
   const item = selection(), stored = category === 'inventory';
   footer?.classList.toggle('gift-footer--inventory',stored);
   form.querySelectorAll('[data-owned-gift]').forEach(b => {
    const yes = stored && !decoration && b.dataset.ownedGift === owned?.id;
    b.classList.toggle('selected',yes); b.setAttribute('aria-pressed',String(yes));
   });
   form.querySelectorAll('[data-gift-type]').forEach(b => {
    const yes = category === 'gifts' && b.dataset.giftType === chosen?.id;
    b.classList.toggle('selected',yes); b.setAttribute('aria-pressed',String(yes));
   });
   const max = stored ? item?.ids?.length || 0 : decoration ? 1 : 100;
   if (maxOptions !== max) {
    input.innerHTML = Array.from({length:Math.max(1,max)},(_,i) => `<option value="${i+1}">${i+1}개</option>`).join('');
    maxOptions = max;
   }
   input.disabled = !!form._busy || max <= 1;
   input.value = String(quantity);
   const amount = item?.price * quantity;
   const validQty = Number.isInteger(quantity) && quantity >= 1 && quantity <= max;
   const exceeds = !stored && !decoration && item?.unit === 'G' && amount > AifectGifts.GIFT_MAX_GOLD;
   const balance = item?.unit === 'S' ? wallet?.free?.balance : wallet?.balance;
   const insufficient = !stored && me && (balance || 0) < amount;
   if (summary) summary.textContent = item ? item.name+' '+quantity+'개 · '+t.producer+'님에게 선물' : '선물할 상품을 선택해 주세요.';
   if (periodBox) {
    periodBox.hidden = !decoration || stored;
    if (!periodBox.hidden) {
     const {p,period,periods} = decoration;
     periodBox.innerHTML = `<label>이용 기간<select id="gift-decoration-period" ${form._busy?'disabled':''}>${shopProductPeriods(p,periods).map(([key,label]) => `<option value="${esc(key)}" ${period===key?'selected':''}>${esc(label)} · ${number(p.periodPrices[key])} ${p.currency.toLowerCase()}</option>`).join('')}</select></label>`;
     const select = periodBox.querySelector('select');
     select.onchange = () => decoration.setPeriod(select.value);
    }
   }
   if (detail) {
    const status = !item || stored ? '' : !me ? '로그인하고 선물할 수 있습니다.' : !validQty ? '수량을 확인해 주세요.' :
     exceeds ? '한 번에 최대 100,000 g까지 보낼 수 있습니다.' : insufficient ? (item.unit==='S'?'실버':'골드')+'가 부족합니다.' : '';
    const roomNote = roomGift ? '토킹룸에서는 골드 선물만 보낼 수 있습니다.' : '';
    detail.textContent = [roomNote,status].filter(Boolean).join(' ');
    detail.hidden = !detail.textContent;
   }
   send.disabled = !!form._busy || !recipientId || !item || !validQty || exceeds || !!insufficient;
   send.setAttribute('aria-label',item ? item.name+' '+quantity+'개 선물하기' : '선물하기');
  }
  form._giftUI = {
   setCategory(key,first) {
    category = key; decoration = null;
    if (!first || key !== 'inventory') owned = null;
    if (!first) quantity = 1;
    update();
   },
   setDecoration(value) {
    if (decoration?.item?.id !== value.item?.id || decoration?.p?.sku !== value.p.sku) quantity = 1;
    owned = null; decoration = value; update();
   },
   async refreshWallet() {
    const value = await api('/api/gold','GET',undefined,{fresh:true});
    if (!active()) return;
    wallet = value;
    $('#gift-balance-g').innerHTML = shopPrice(wallet.balance||0,'G',20);
    $('#gift-balance-s').innerHTML = shopPrice(wallet.free?.balance||0,'S',20);
    update();
   }
  };
  input.onchange = input.oninput = () => { if (!form._busy) { quantity = Number(input.value); formError(form).textContent=''; update(); } };
  form.querySelectorAll('[data-owned-gift]').forEach(b => b.onclick = () => {
   if (form._busy) return;
   category = 'inventory'; decoration = null; owned = groups.find(g => g.id === b.dataset.ownedGift);
   quantity = 1; formError(form).textContent = ''; update();
  });
  form.querySelectorAll('[data-gift-type]').forEach(b => b.onclick = () => {
   if (form._busy) return;
   category = 'gifts'; owned = decoration = null; chosen = choices.find(g => g.id === b.dataset.giftType);
   quantity = 1; formError(form).textContent = ''; update();
  });
  const change = $('#gift-recipient');
  if (personal && !artistId && change) change.onclick = () => {
   if (form._busy) return;
   const next = decoration?.item ? {inventoryId:decoration.item.id} : decoration ? {sku:decoration.p.sku,period:decoration.period} :
    owned ? {giftInventoryId:owned.id} : {id:chosen?.id};
   return chooseGiftRecipient({...next,quantity,...(roomGift?{roomGift}:{}),...(fromMessage?{fromMessage:true}:{})});
  };
  const retry = form.querySelector('[data-gift-inventory-retry]');
  if (retry) retry.onclick = () => { if (!form._busy) void giftDialog(tid,initial,personal); };
  form.onsubmit = async event => {
   event.preventDefault();
   if (form._busy || send.disabled) return;
   if (!me) { $('#dialog').close(); return askLogin(); }
   if (!current()) { formError(form).textContent = '로그인 계정이 변경되었습니다. 선물창을 다시 열어 주세요.'; return; }
   const item = selection(), count = quantity;
   if (!item) return;
   form._busy = true; formError(form).textContent = ''; update();
   try {
    const stored = category === 'inventory';
    const accepted = await confirmGiftTransfer({name:item.name,image:item.image,recipient:t.producer,quantity:count,...(!stored?{amount:item.price*count,currency:item.unit}:{})});
    if (!accepted || !active()) return;
    let path, body;
    if (stored) {
     const ids = item.ids.slice(0,count);
     path = item.path+encodeURIComponent(ids[0])+'/send';
     body = {profile_id:recipientId,...context,...(ids.length>1?{inventory_ids:ids}:{})};
    } else if (decoration) {
     path = '/api/decorations/gift';
     body = {sku:decoration.p.sku,period:decoration.period,profile_id:recipientId,...context};
    } else {
     const checkout = !artistId && personal && /^#gifts(?:[/?]|$)/.test(route);
     path = roomGift ? 'room' : checkout ? '/api/gifts/checkout' : '/api/'+(personal?'producers':'tracks')+'/'+encodeURIComponent(tid)+'/gifts';
     body = {gift_type:chosen.id,quantity:count,...(roomGift||checkout?{profile_id:recipientId}:{}),
      ...(!roomGift?{...(artistId?{artist_id:artistId}:{}),...(fromMessage?{from_message:true}:{}),[chosen.free?'silver':'gold']:item.price*count}:{})};
    }
    const fingerprint = JSON.stringify([path,body]);
    if (!requests.has(fingerprint)) requests.set(fingerprint,crypto.randomUUID());
    body.request_id = requests.get(fingerprint);
    if (roomGift) await roomGift.send(body);
    else await api(path,'POST',body);
    if (active()) finishGiftTransfer();
   } catch (e) {
    if (active()) formError(form).textContent = e.message;
   } finally {
    form._busy = false;
    if (active()) update();
   }
  };
  update();
  if (typeof bindRoomGiftWallet==='function' && typeof voiceController!=='undefined' && voiceController?.joined) bindRoomGiftWallet(form);
  await bindGiftCategoryTabs(form,{recipientId,initial,serial,account,initialOwned:!!owned,inventory,groups});
  if (active()) form.querySelector('.gift-choice.selected')?.scrollIntoView({block:'nearest'});
 } catch (e) {
  if (serial!==giftDialogSerial || route!==globalThis.location?.hash) return;
  dialog(`<h2>상점을 열지 못했습니다</h2><p role="alert">${esc(e.message)}</p><button type="button" class="primary-button" id="gift-dialog-retry">다시 시도</button>`);
  const retry = $('#gift-dialog-retry'); if (retry) retry.onclick = () => giftDialog(tid,initial,personal);
 }
}
function bindGiftClaims(root,onChange=()=>{}){if(!root)return;root.onclick=async e=>{const b=e.target.closest('[data-claim-gift]');if(!b||b.disabled||root._busy||$('#gift-form')?._busy)return;root._busy=true;b.disabled=true;b.textContent='받는 중…';try{const s=await api('/api/gifts/free/claim','POST',{kind:b.dataset.claimGift});if(!root.isConnected)return;root.innerHTML=freeRewardsHTML(s,root.id==='gift-rewards');onChange(s);toast('실버를 받았습니다. 좋아하는 음악에 보내 보세요.');}catch(err){toast(err.message);b.disabled=false;b.textContent='다시 받기';}finally{root._busy=false;}};}
async function profileGiftDialog(pid,initial='star'){return giftDialog(pid,initial,true);}
