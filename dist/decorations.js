// Cosmetics use server inventory. No ownership or purchases are stored in the browser.
function decorationNav(active='gifts'){
 return '<nav class="v3-segments decoration-nav" aria-label="선물함 카테고리">'+[['gifts','선물','#gifts'],['frames','테두리','#gifts/frames'],['themes','테마','#gifts/themes'],['inventory','인벤토리','#inventory']].map(([id,label,href])=>`<a href="${href}" ${id===active?'aria-current="page"':''}>${label}</a>`).join('')+'</nav>';
}
function decorationRemaining(expires,serverNow=Math.floor(Date.now()/1000)){
 if(!expires)return '기간 제한 없음';
 const seconds=expires-serverNow;
 return seconds<=0?'기간 만료':(seconds>=86400?Math.ceil(seconds/86400)+'일 남음':seconds>=3600?Math.ceil(seconds/3600)+'시간 남음':Math.ceil(seconds/60)+'분 남음')+' · '+new Date(expires*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+'까지';
}
async function decorationShopView(category){
 const d=await api('/api/decorations','GET',undefined,{fresh:true});
 const kind=category==='frames'?'PROFILE_FRAME':'TALKING_ROOM_THEME';
 return heading('선물함','내 프로필과 토킹룸을 꾸며보세요.')+decorationNav(category)+`<section class="decoration-grid">${d.products.filter(p=>p.kind===kind).map(p=>{
  const item=d.inventory.find(i=>i.item_key===p.sku&&i.available)||d.inventory.find(i=>i.item_key===p.sku),image=p.assetPaths.thumbnail||p.assetPaths.roomCard;
  return `<article class="decoration-card" data-decoration-card="${esc(p.sku)}"><img class="decoration-product-image ${kind==='PROFILE_FRAME'?'is-frame':''}" src="${esc(image)}" alt="${esc(p.name)}" loading="lazy"><h2>${esc(p.name)}</h2><p class="decoration-owned">${item?item.available?item.stored?'사용 전 보관 · '+d.periods[item.period_code]:decorationRemaining(item.expires_at,d.server_now):'기간 만료 · 다시 구매할 수 있어요.':'미보유'}</p><label>이용 기간<select data-decoration-period aria-label="${esc(p.name)} 이용 기간">${Object.entries(d.periods).map(([key,label])=>`<option value="${key}">${label} · ${number(p.periodPrices[key])} G</option>`).join('')}</select></label><div class="decoration-actions"><button class="small-button" data-decoration="${esc(p.sku)}">자세히 보기</button><button class="primary-button" data-decoration="${esc(p.sku)}">구매</button></div></article>`;
 }).join('')}</section>`;
}
async function decorationDialog(sku,period='P7D'){
 const serial=++giftDialogSerial,account=me?.id;
 $('#dialog').classList.add('gift-sheet');dialog('<section class="gift-dialog"><h2>꾸미기 아이템</h2><p role="status">상품 정보를 불러오는 중…</p></section>');
 try{
  const [d,wallet]=await Promise.all([api('/api/decorations','GET',undefined,{fresh:true}),me?api('/api/gold/balance','GET',undefined,{fresh:true}):null]);
  if(serial!==giftDialogSerial||!$('#dialog').open)return;
  const p=d.products.find(p=>p.sku===sku);if(!p)throw Error('상품을 찾을 수 없어요.');
  let requestId=crypto.randomUUID();const image=p.assetPaths.thumbnail||p.assetPaths.roomCard;
  dialog(`<section class="gift-dialog decoration-dialog"><header><h2>${esc(p.name)}</h2><p>구매한 상품은 인벤토리에 보관돼요.</p></header><form id="decoration-order"><div class="gift-options"><img class="decoration-detail-image" src="${esc(image)}" alt="${esc(p.name)}">${p.kind==='TALKING_ROOM_THEME'?'<p>PC·모바일 배경과 방 목록 카드가 함께 적용돼요. 방장만 사용할 수 있어요.</p>':'<p>인벤토리에서 착용하거나 해제할 수 있어요.</p>'}<label class="form-field">이용 기간<select name="period">${Object.entries(d.periods).map(([key,label])=>`<option value="${key}" ${key===period?'selected':''}>${label} · ${number(p.periodPrices[key])} G</option>`).join('')}</select></label></div><div class="gift-checkout"><div class="gift-send-summary" id="decoration-total"></div><p class="gift-fineprint">구매 후 인벤토리에서 사용을 시작하거나 회원을 선택해 선물할 수 있어요. 사용 시작 전에는 기간이 줄어들지 않아요.</p><button class="primary-button gift-send-button" type="submit">${me?'구매하기':'로그인하고 이용하기'}</button><p class="form-error" role="alert"></p></div></form></section>`);
  const form=$('#decoration-order'),submit=form.querySelector('button[type="submit"]');
  const update=()=>{const cost=p.periodPrices[form.elements.period.value];$('#decoration-total').textContent=`${number(cost)} G · 보유 ${number(wallet?.balance||0)} G`;submit.disabled=!!me&&(wallet?.balance||0)<cost;};
  form.elements.period.onchange=()=>{if(form._busy)return;requestId=crypto.randomUUID();update();};
  update();const send=busyForm(form,async()=>{
   if(!me){$('#dialog').close();return askLogin();}if(me.id!==account)throw Error('로그인 계정이 변경됐어요. 다시 열어주세요.');
   const selectedPeriod=form.elements.period.value;for(const el of form.elements)el.disabled=true;
   await api('/api/decorations/buy','POST',{sku,period:selectedPeriod,request_id:requestId});
   if(!form.isConnected||serial!==giftDialogSerial||me?.id!==account)return;
   $('#dialog').close();toast(p.name+'을 인벤토리에 보관했어요.');
   if(location.hash==='#inventory')await render();else location.hash='#inventory';
  });
  form.onsubmit=async e=>{if(form._busy){e.preventDefault();return;}await send(e);if(form.isConnected){for(const el of form.elements)el.disabled=false;update();}};
 }catch(e){if(serial===giftDialogSerial&&$('#dialog').open)dialog('<h2>상품을 열지 못했어요</h2><p role="alert">'+esc(e.message)+'</p>');}
}
function storedDecorationsHTML(items=[]){
 return '<section class="player-owned decoration-inventory-section" aria-labelledby="inventory-purchased"><h2 id="inventory-purchased">구입한 상품 <span>'+items.length+'</span></h2><p class="field-help">구매하거나 선물받아 보관 중인 상품이에요. 사용 시작 전에는 기간이 줄어들지 않아요.</p>'+(items.length?items.map(i=>`<article class="decoration-inventory-item" data-stored-item="${esc(i.id)}"><img class="${i.product.kind==='PROFILE_FRAME'?'is-frame':''}" src="${esc(i.product.assetPaths.thumbnail||i.product.assetPaths.roomCard)}" alt="${esc(i.product.name)}"><div><h3>${esc(i.product.name)}</h3><p>${esc(({P7D:'7일',P1M:'1개월',P3M:'3개월'})[i.period_code])} · ${i.available?'사용 전 보관':'결제 확인 중'}</p><div class="decoration-actions"><button class="primary-button" data-stored-decoration="${esc(i.id)}" data-mode="use" ${i.available?'':'disabled'}>사용 시작</button><button class="small-button" data-stored-decoration="${esc(i.id)}" data-mode="send" ${i.available?'':'disabled'}>선물하기</button></div></div></article>`).join(''):'<p class="decoration-empty">보관 중인 상품이 없어요.</p>')+'<a class="text-link" href="#gifts/frames">상품 보러 가기</a></section>';
}
function activeDecorationCardHTML(i){
 const frame=i.product.kind==='PROFILE_FRAME';
 const action=!i.available?'':frame?`<button class="${i.equipped?'small-button':'primary-button'}" data-player-equip="${esc(i.equipped?'':i.id)}">${i.equipped?'해제하기':'장착하기'}</button>`:'<a class="small-button" href="#community">토킹룸에서 사용하기</a>';
 return `<article class="decoration-inventory-item" data-active-item="${esc(i.id)}"><img class="${frame?'is-frame':''}" src="${esc(i.product.assetPaths.thumbnail||i.product.assetPaths.overlay||i.product.assetPaths.roomCard)}" alt="${esc(i.product.name)}"><div><h3>${esc(i.product.name)}</h3><p>${i.available?frame?i.equipped?'착용 중':'미착용 · 기간 진행 중':'기간 진행 중':i.expires_at<=Date.now()/1000?'기간 만료':'사용 불가'}</p><p>${decorationRemaining(i.expires_at)}</p>${action}</div></article>`;
}
function decorationInventorySectionsHTML(d){
 const items=[...(d.inventory||[]).filter(i=>i.paid).map(i=>({...i,product:{name:i.name,kind:'PROFILE_FRAME',assetPaths:{overlay:i.artwork}}})),...(d.decorations||[])],active=items.filter(i=>i.available),ended=items.filter(i=>!i.available);
 return '<div class="decoration-inventory-sections">'+storedDecorationsHTML(d.stored_decorations)+'<section class="player-owned decoration-inventory-section" aria-labelledby="inventory-active"><h2 id="inventory-active">사용 중인 상품 <span>'+active.length+'</span></h2><p class="field-help">사용을 시작한 상품이에요. 테두리 착용을 해제해도 이용 기간은 계속 진행돼요.</p>'+(active.length?active.map(activeDecorationCardHTML).join(''):'<p class="decoration-empty">사용 중인 상품이 없어요.</p>')+'</section></div>'+(ended.length?'<details class="decoration-ended"><summary>만료·사용 불가 상품 '+ended.length+'</summary>'+ended.map(activeDecorationCardHTML).join('')+'</details>':'');
}
function fillRoomThemeChoices(form,options,selected='navy'){
 if(!options.themes)return;
 form.querySelector('.voice-backgrounds').innerHTML=options.themes.map(t=>`<label data-background="${esc(t.paid?'navy':t.sku)}" class="${t.paid?'decoration-theme-choice':''} ${t.selectable?'':'is-locked'}">${t.paid?`<img src="${esc(t.assetPaths.roomCard)}" alt="">`:''}<input type="radio" name="background" value="${esc(t.sku)}" ${t.sku===selected?'checked':''} ${t.selectable?'':'disabled'}><span>${esc(t.name)}${t.paid?'<small>'+(t.selectable?'보유 중':'잠김 · 미보유/만료')+'</small>':''}</span></label>`).join('');
 if(!options.themes.some(t=>t.sku===selected&&t.selectable))form.elements.background.value='navy';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-decoration]');if(!b)return;e.preventDefault();void decorationDialog(b.dataset.decoration,b.closest('[data-decoration-card]')?.querySelector('[data-decoration-period]')?.value||'P7D');});

async function storedDecorationDialog(itemId,mode){
 if(!me)return askLogin();if(!['use','send'].includes(mode))return;
 const account=me.id,serial=++giftDialogSerial;
 const d=await api('/api/decorations','GET',undefined,{fresh:true});if(serial!==giftDialogSerial||account!==me?.id)return;
 const item=d.inventory.find(i=>i.id===itemId&&i.stored&&i.available);if(!item)return toast('사용 가능한 보관 상품을 다시 확인해주세요.');
 const sending=mode==='send';let recipient=null,search=0,key=crypto.randomUUID();
 dialog(`<section class="gift-dialog decoration-dialog"><header><h2>${esc(item.product.name)} ${sending?'선물하기':'사용 시작'}</h2><p>${esc(d.periods[item.period_code])} · 추가 골드 차감 없음</p></header><form id="stored-decoration-form"><div class="gift-options">${sending?'<label class="form-field">회원 이름<input name="member_name" type="search" maxlength="60" autocomplete="off" placeholder="닉네임으로 검색"></label><button class="small-button" type="button" id="stored-find">회원 검색</button><p class="field-help">팔로우하거나 대화한 회원을 선택하거나, 닉네임으로 검색하세요.</p><div class="gift-target-list decoration-recipient-list" id="stored-members" aria-label="선물 받을 회원"></div><p id="stored-recipient" role="status">선물 받을 회원을 선택해주세요.</p>':'<p>지금부터 이용 기간이 시작됩니다. 이미 사용 중인 같은 상품은 남은 기간에 연장됩니다.</p><p>사용을 시작한 상품은 선물할 수 없어요.</p>'}</div><div class="gift-checkout"><button type="submit" class="primary-button">${sending?'선택한 회원에게 선물하기':'확인하고 사용 시작'}</button><p class="form-error" role="alert"></p></div></form></section>`);
 const form=$('#stored-decoration-form'),button=form.querySelector('button[type="submit"]');button.disabled=sending;
 if(sending){
  const input=form.elements.member_name,list=$('#stored-members'),status=$('#stored-recipient');
  const clear=()=>{recipient=null;key=crypto.randomUUID();button.disabled=true;status.textContent='선물 받을 회원을 선택해주세요.';};
  const find=async()=>{
   if(form._busy)return;const seq=++search;clear();list.textContent='회원을 불러오는 중…';formError(form).textContent='';
   try{const r=await api('/api/decorations/recipients?q='+encodeURIComponent(input.value.trim()),'GET',undefined,{fresh:true});if(seq!==search||!form.isConnected||serial!==giftDialogSerial||account!==me?.id)return;
    list.innerHTML=r.profiles.length?r.profiles.map(p=>`<button type="button" class="gift-target" data-decoration-recipient="${esc(p.id)}" aria-pressed="false"><img data-avatar-profile="${esc(p.id)}" src="${esc(p.image_version?'/media/producer/'+encodeURIComponent(p.id)+'?v='+encodeURIComponent(p.image_version):DEFAULT_AVATAR)}" alt=""><span><strong>${esc(p.name)}</strong><small>이 회원 선택</small></span></button>`).join(''):'<p class="field-help">선택할 회원이 없어요. 닉네임으로 검색해주세요.</p>';
    list.querySelectorAll('[data-decoration-recipient]').forEach(b=>b.onclick=()=>{if(form._busy)return;recipient=r.profiles.find(p=>p.id===b.dataset.decorationRecipient);key=crypto.randomUUID();for(const choice of list.querySelectorAll('[data-decoration-recipient]'))choice.setAttribute('aria-pressed',String(choice===b));status.textContent=recipient.name+'님에게 선물합니다.';button.disabled=false;});
   }catch(e){if(seq===search&&form.isConnected){list.textContent='회원을 불러오지 못했어요.';formError(form).textContent=e.message;}}
  };
  input.oninput=()=>{search++;clear();list.innerHTML='';};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void find();}};
  $('#stored-find').onclick=()=>void find();void find();
 }
 const submit=busyForm(form,async()=>{
  if(account!==me?.id)throw Error('로그인 계정이 변경됐어요.');if(sending&&!recipient)throw Error('받는 회원을 선택해주세요.');
  const receiver=recipient;for(const el of form.elements)el.disabled=true;
  await api('/api/decorations/inventory/'+encodeURIComponent(itemId)+'/'+mode,'POST',{request_id:key,...(sending?{profile_id:receiver.id}:{})});
  if(serial!==giftDialogSerial||!form.isConnected||account!==me?.id)return;
  $('#dialog').close();toast(sending?receiver.name+'님에게 상품을 선물했어요.':'이용 기간이 시작됐어요.');window.dispatchEvent(new Event('aifect:equipment'));await render();
 });
 form.onsubmit=async e=>{if(form._busy){e.preventDefault();return;}await submit(e);if(form.isConnected){for(const el of form.elements)el.disabled=false;button.disabled=sending&&!recipient;}};
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-stored-decoration]');if(!b||b.disabled)return;e.preventDefault();void storedDecorationDialog(b.dataset.storedDecoration,b.dataset.mode).catch(e=>toast(e.message));});
