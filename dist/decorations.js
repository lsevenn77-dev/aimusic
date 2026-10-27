// Cosmetics use server inventory. No ownership or purchases are stored in the browser.
async function bindGiftCategoryTabs(form,{recipientId,initial,serial,account,initialOwned}){
 const section=form.closest('.gift-dialog'),list=form.querySelector('.gift-options'),checkout=form.querySelector('.gift-checkout'),owned=list.querySelector('.gift-owned');
 const ordinary=document.createElement('div');ordinary.className='gift-ordinary-products';
 for(const el of [...list.children])if(el!==owned)ordinary.append(el);list.append(ordinary);
 const extra=document.createElement('div');extra.className='gift-decoration-products';extra.hidden=true;list.append(extra);
 const extraCheckout=document.createElement('div');extraCheckout.className='gift-checkout gift-decoration-checkout';extraCheckout.hidden=true;form.append(extraCheckout);
 let catalog,selected,period=initial?.period||'P7D',buyKey=crypto.randomUUID(),sendKey=crypto.randomUUID(),bought=null,busy=false;

 function choose(p,item=null){if(busy)return;selected={p,item};bought=null;buyKey=crypto.randomUUID();sendKey=crypto.randomUUID();paint();}
 function paint(){
  const p=selected?.p;extraCheckout.innerHTML=p?`<strong>${esc(p.name)}</strong>${selected.item?'<p>보유 상품 · 추가 차감 없음</p>':`<label>이용 기간<select id="gift-decoration-period">${Object.entries(catalog.periods).map(([k,v])=>`<option value="${k}" ${k===period?'selected':''}>${v} · ${number(p.periodPrices[k])} G</option>`).join('')}</select></label>`}<p class="field-help">${bought?'구매 완료 · 인벤토리에 보관됨. 선물 전송을 다시 시도할 수 있어요.':'보내기를 누르면 선택한 상품을 전달합니다.'}</p><div class="compact-actions"><a class="small-button" href="#gold" data-close-dialog>충전하기</a><button type="button" class="primary-button" id="gift-decoration-send">${bought?'선물 전송 다시 시도':'선물하기'}</button></div><p class="form-error" role="alert"></p>`:'<p>선물할 상품을 선택해주세요.</p>';
  const select=extraCheckout.querySelector('select');if(select)select.onchange=()=>{period=select.value;buyKey=crypto.randomUUID();};
  const send=extraCheckout.querySelector('#gift-decoration-send');if(send)send.onclick=async()=>{
   if(busy||form._busy)return;if(!me)return askLogin();busy=true;send.disabled=true;if(select)select.disabled=true;
   try{if(me.id!==account)throw Error('계정이 변경됐어요. 다시 열어주세요.');
    if(!bought)bought=selected.item?.id||(await api('/api/decorations/buy','POST',{sku:p.sku,period,request_id:buyKey})).order.inventory_id;
    if(serial!==giftDialogSerial||!form.isConnected||me?.id!==account)return;
    await api('/api/decorations/inventory/'+encodeURIComponent(bought)+'/send','POST',{profile_id:recipientId,request_id:sendKey});
    if(serial!==giftDialogSerial||!form.isConnected||me?.id!==account)return;$('#dialog').close();toast(p.name+'을 선물했어요.');
   }catch(e){if(form.isConnected){paint();extraCheckout.querySelector('.form-error').textContent=e.message;}}finally{busy=false;if(send.isConnected)send.disabled=false;}
  };
 }
 async function show(key){
  if(form._busy||busy)return;
  section.querySelectorAll('[data-gift-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.giftCategory===key)));
  ordinary.hidden=key!=='gifts';owned.hidden=key!=='inventory';extra.hidden=key==='gifts';checkout.hidden=!['gifts','inventory'].includes(key);extraCheckout.hidden=['gifts','inventory'].includes(key);extra.innerHTML='';
  selected=null;paint();if(key==='gifts')return;
  try{catalog=await api('/api/decorations','GET',undefined,{fresh:true});if(!form.isConnected||serial!==giftDialogSerial)return;
   const current=section.querySelector('[data-gift-category][aria-pressed=true]')?.dataset.giftCategory;if(current!==key)return;
   const items=key==='inventory'?catalog.inventory.filter(i=>i.stored&&i.available).map(i=>({p:catalog.products.find(p=>p.sku===i.item_key),item:i})):catalog.products.filter(p=>p.kind===(key==='frames'?'PROFILE_FRAME':'TALKING_ROOM_THEME')).map(p=>({p}));
   extra.innerHTML='<div class="gift-catalog">'+items.map(({p,item},i)=>`<button type="button" class="gift-choice" data-gift-decoration-index="${i}"><img class="gift-art" src="${esc(p.assetPaths.overlay||p.assetPaths.roomCard)}" alt=""><strong>${esc(p.name)}</strong><span>${item?catalog.periods[item.period_code]:number(p.periodPrices.P7D)+' G / 7일'}</span></button>`).join('')+'</div>';
   extra.querySelectorAll('button').forEach(b=>b.onclick=()=>{const value=items[Number(b.dataset.giftDecorationIndex)];if(busy||form._busy)return;checkout.hidden=true;extraCheckout.hidden=false;choose(value.p,value.item);});
   if(key!=='inventory'){const value=items.find(v=>v.p.sku===initial?.sku)||items[0];if(value)choose(value.p);else{selected=null;paint();}}
  }catch(e){extra.textContent=e.message;}
 }
 section.querySelectorAll('[data-gift-category]').forEach(b=>b.onclick=()=>void show(b.dataset.giftCategory));
 // Keep existing ordinary-gift and owned-gift submission handlers intact.
 form.addEventListener('submit',e=>{if(checkout.hidden){e.preventDefault();e.stopImmediatePropagation();}},true);
 form.querySelectorAll('[data-owned-gift]').forEach(b=>b.addEventListener('click',()=>{extraCheckout.hidden=true;checkout.hidden=false;}));
 await show(initial?.sku?.startsWith('frame_')?'frames':initial?.sku?'themes':initialOwned?'inventory':'gifts');
}
async function finalGiftShopView(category){
 const [wallet,d]=await Promise.all([me?api('/api/gold'):null,api('/api/decorations','GET',undefined,{fresh:true})]);
 const sections=[['PROFILE_FRAME','프로필 테두리','frames'],['TALKING_ROOM_THEME','토킹룸 테마','themes']].map(([kind,title,id])=>`<section class="gift-dashboard-section" id="gift-section-${id}"><header class="gift-section-heading"><h2>${title}</h2></header><div class="gift-catalog decoration-shop-row" tabindex="0" aria-label="${title}">${d.products.filter(p=>p.kind===kind).map(p=>`<article class="gift-shop-product"><button type="button" class="gift-choice" data-decoration="${esc(p.sku)}"><img class="gift-art ${kind==='PROFILE_FRAME'?'is-frame':''}" src="${esc(kind==='PROFILE_FRAME'?p.assetPaths.overlay:p.assetPaths.roomCard)}" alt="" loading="lazy"><strong>${esc(p.name)}</strong><span>${number(p.periodPrices.P7D)} G / 7일</span></button><button type="button" class="text-link" data-product-gift="${esc(p.sku)}">선물하기</button></article>`).join('')}</div></section>`).join('');
 let html=giftShopHTML(wallet).replace('<nav class="gift-dashboard-actions"',sections+'<nav class="gift-dashboard-actions"');
 html=html.replaceAll(/(<button type="button" class="gift-choice" data-gift-buy="([^"]+)">.*?<\/button>)/gs,(_,card,id)=>`<article class="gift-shop-product">${card}<button type="button" class="text-link" data-gift-shop="${id}">선물하기</button></article>`);
 return html;
}
async function giftPurchaseDialog(id){
 const serial=++giftDialogSerial,account=me?.id;
 dialog('<h2>상품 구매하기</h2><p role="status">불러오는 중…</p>');
 try{
  const [catalog,wallet]=await Promise.all([api('/api/gifts/catalog'),me?api('/api/gold'):null]);
  if(serial!==giftDialogSerial||!$('#dialog').open)return;
  const g=[...(catalog.gifts||[]),...(catalog.silver_gifts||[])].find(g=>g.id===id);if(!g)throw Error('상품을 찾을 수 없어요.');
  const unit=g.free?'S':'G',price=g.free?g.silver:g.gold,balance=g.free?wallet?.free?.balance:wallet?.balance;
  let requestId=crypto.randomUUID();
  dialog(`<section class="compact-purchase"><h2>상품 구매하기</h2><form id="gift-purchase"><div class="compact-product">${giftArt(g)}<div><h3>${esc(g.name)}</h3><p>구매한 선물은 인벤토리에 보관돼요.</p></div></div><label class="form-field">수량<input name="quantity" type="number" min="1" max="100" value="1" required></label><p id="compact-gift-total" aria-live="polite"></p><button type="button" class="small-button" id="compact-gift-send">다른 사람에게 선물하기</button><div class="compact-actions"><a class="small-button" href="${g.free?'#gifts/rewards':'#gold'}" data-close-dialog>${g.free?'오늘의 실버받기':'충전하기'}</a><button class="primary-button" type="submit">구매하기</button></div><p class="form-error" role="alert"></p></form></section>`);
  const form=$('#gift-purchase'),submit=form.querySelector('[type=submit]');
  const update=()=>{const n=Number(form.elements.quantity.value);$('#compact-gift-total').textContent=`보유 ${number(balance||0)} ${unit} · 총 ${number(price*n)} ${unit}`;submit.disabled=!!me&&(!Number.isInteger(n)||n<1||n>100||price*n>(balance||0));};
  form.oninput=()=>{if(form._busy)return;requestId=crypto.randomUUID();update();};update();
  $('#compact-gift-send').onclick=()=>{if(!form._busy)void chooseGiftRecipient(id);};
  form.onsubmit=busyForm(form,async()=>{if(!me){$('#dialog').close();return askLogin();}if(me.id!==account)throw Error('계정이 변경됐어요. 다시 열어주세요.');const quantity=Number(form.elements.quantity.value);await api('/api/me/gift-inventory/buy','POST',{gift_type:id,quantity,request_id:requestId});if(serial!==giftDialogSerial||!form.isConnected||me?.id!==account)return;$('#dialog').close();toast('인벤토리에 보관했어요.');location.hash='#inventory';});
 }catch(e){if(serial===giftDialogSerial&&$('#dialog').open)dialog('<h2>상품을 열지 못했어요</h2><p role="alert">'+esc(e.message)+'</p>');}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-gift-buy],[data-product-gift]');if(!b)return;e.preventDefault();e.stopPropagation();if(b.dataset.giftBuy)void giftPurchaseDialog(b.dataset.giftBuy);else void chooseGiftRecipient({sku:b.dataset.productGift,period:'P7D'});});
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
  dialog(`<section class="gift-dialog decoration-dialog"><header><h2>상품 구매하기</h2></header><form id="decoration-order"><div class="gift-options"><div class="compact-product"><img class="decoration-detail-image" src="${esc(image)}" alt=""><div><h3>${esc(p.name)}</h3><p>구매한 상품은 인벤토리에 보관돼요.</p></div></div><fieldset class="compact-periods"><legend>이용 기간 선택</legend>${Object.entries(d.periods).map(([key,label])=>`<label><input type="radio" name="period" value="${key}" ${key===period?'checked':''}><span>${label}<strong>${number(p.periodPrices[key])} G</strong></span></label>`).join('')}</fieldset><button type="button" class="small-button" id="compact-decoration-gift">다른 사람에게 선물하기</button></div><div class="gift-checkout"><div class="gift-send-summary" id="decoration-total"></div><p class="gift-fineprint">인벤토리에서 사용 시작·선물하기를 선택하세요. 사용 전에는 기간이 줄어들지 않아요.</p><div class="compact-actions"><a class="small-button" href="#gold" data-close-dialog>충전하기</a><button class="primary-button gift-send-button" type="submit">${me?'구매하기':'로그인하고 이용하기'}</button></div><p class="form-error" role="alert"></p></div></form></section>`);
  const form=$('#decoration-order'),submit=form.querySelector('button[type="submit"]');$('#compact-decoration-gift').onclick=()=>chooseGiftRecipient({sku,period:form.elements.period.value});
  const update=()=>{const cost=p.periodPrices[form.elements.period.value];$('#decoration-total').textContent=`${number(cost)} G · 보유 ${number(wallet?.balance||0)} G`;submit.disabled=!!me&&(wallet?.balance||0)<cost;};
  form.onchange=()=>{if(form._busy)return;requestId=crypto.randomUUID();update();};
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
 form.querySelector('.voice-backgrounds').innerHTML=options.themes.filter(t=>t.selectable).map(t=>`<label data-background="${esc(t.paid?'navy':t.sku)}" class="${t.paid?'decoration-theme-choice':''} ${t.selectable?'':'is-locked'}">${t.paid?`<img src="${esc(t.assetPaths.roomCard)}" alt="">`:''}<input type="radio" name="background" value="${esc(t.sku)}" ${t.sku===selected?'checked':''} ${t.selectable?'':'disabled'}><span>${esc(t.name)}${t.paid?'<small>'+(t.selectable?'보유 중':'잠김 · 미보유/만료')+'</small>':''}</span></label>`).join('');
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
