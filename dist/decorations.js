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
function decorationProductImage(p){return p.kind==='PROFILE_FRAME'?p.assetPaths.overlay:p.assetPaths.roomCard;}
function shopShelf(id,title,items){
 return '<section class="shop-shelf" aria-labelledby="shop-'+id+'"><header><h2 id="shop-'+id+'">'+title+'</h2><div class="shop-arrows"><button class="small-button" type="button" data-shelf="'+id+'" data-direction="-1" aria-controls="shelf-'+id+'" aria-label="'+title+' 이전" disabled>‹</button><button class="small-button" type="button" data-shelf="'+id+'" data-direction="1" aria-controls="shelf-'+id+'" aria-label="'+title+' 다음">›</button></div><button type="button" class="text-link shop-expand" data-shelf-expand="'+id+'" aria-controls="shelf-'+id+'" aria-expanded="false" aria-label="'+title+' 전체보기">전체보기</button></header><div class="shop-track" id="shelf-'+id+'" tabindex="0" role="region" aria-label="'+title+' 상품 목록">'+items.map(p=>'<button type="button" class="shop-product" '+(p.sku?'data-decoration="'+esc(p.sku)+'"':'data-gift-buy="'+esc(p.id)+'"')+'><img src="'+esc(p.sku?decorationProductImage(p):p.image)+'" alt="" loading="lazy"><strong title="'+esc(p.name)+'">'+esc(p.name)+'</strong><span>'+number(p.sku?p.periodPrices.P7D:p.free?p.silver:p.gold)+' '+(p.free?'S':'G')+(p.sku?' / 7일':'')+'</span></button>').join('')+'</div></section>';
}
function shopBalancesHTML(wallet){
 return '<span class="shop-balance shop-balance-gold"><i class="gold-coin" aria-hidden="true">G</i><span>보유 골드</span><b data-shop-gold>'+number(wallet?.balance||0)+' G</b></span><span class="shop-balance shop-balance-silver"><img src="'+esc(AifectGifts.FREE_GIFT.image)+'" alt="" width="20" height="20"><span>보유 실버</span><b data-shop-silver>'+number(wallet?.free?.balance||0)+' S</b></span>';
}
async function finalGiftShopView(category){
 const [wallet,d,c]=await Promise.all([me?api('/api/gold','GET',undefined,{fresh:true}):null,api('/api/decorations','GET',undefined,{fresh:true}),api('/api/gifts/catalog')]);
 return '<div class="gift-dashboard shop-page"><header class="shop-heading"><h1>선물함</h1><div class="shop-balances" role="status" aria-label="보유 자산" aria-live="polite">'+shopBalancesHTML(wallet)+'</div><nav class="shop-actions" aria-label="선물함 관리"><a class="small-button" href="#gold">골드 충전</a><a class="small-button" href="#gifts/rewards">실버 받기</a><a class="small-button" href="#inventory">인벤토리</a></nav></header>'+
 shopShelf('gold','골드 상품',c.gifts)+shopShelf('silver','실버 상품',c.silver_gifts)+shopShelf('frames','테두리',d.products.filter(p=>p.kind==='PROFILE_FRAME'))+shopShelf('themes','테마',d.products.filter(p=>p.kind==='TALKING_ROOM_THEME'))+
 '<details class="shop-policy"><summary>선물 및 정산 안내</summary><p>'+esc(AifectGifts.GIFT_SETTLEMENT_NOTICE)+' 실버는 현금 정산·골드 전환 대상이 아니에요.</p><a class="text-link" href="#gold/history">보낸 선물 내역</a></details></div>';
}
let shopLayoutCleanup=()=>{};
function bindShopShelves(){
 shopLayoutCleanup();const root=$('.shop-page');if(!root)return;
 const controller=new AbortController(),rows=[...root.querySelectorAll('.shop-track')];
 const update=row=>{
  const width=row.clientWidth,gap=12,count=Math.max(1,Math.min(10,Math.floor((width+gap)/148)));
  row.style.setProperty('--shop-card-width',Math.min(148,(width-gap*(count-1))/count)+'px');
  const shelf=row.closest('.shop-shelf'),expanded=shelf.classList.contains('is-expanded');
  shelf.querySelector('.shop-arrows').hidden=expanded;
  shelf.querySelectorAll('[data-shelf]').forEach(b=>{b.disabled=expanded||(Number(b.dataset.direction)<0?row.scrollLeft<=1:row.scrollLeft+width>=row.scrollWidth-1);});
 };
 const observer=new ResizeObserver(entries=>entries.forEach(({target})=>update(target)));
 rows.forEach(row=>{observer.observe(row);row.addEventListener('scroll',()=>update(row),{passive:true,signal:controller.signal});update(row);});
 root.querySelectorAll('[data-shelf-expand]').forEach(button=>button.addEventListener('click',()=>{
  const row=$('#shelf-'+button.dataset.shelfExpand),shelf=row.closest('.shop-shelf'),expanded=shelf.classList.toggle('is-expanded');
  button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'접기':'전체보기';button.setAttribute('aria-label',shelf.querySelector('h2').textContent+' '+button.textContent);
  row.scrollLeft=0;update(row);
 },{signal:controller.signal}));
 shopLayoutCleanup=()=>{observer.disconnect();controller.abort();};
}
async function refreshShopBalances(){
 const root=$('.shop-page'),account=me?.id;if(!root||!account)return;
 try{const wallet=await api('/api/gold/balance','GET',undefined,{fresh:true});if(!root.isConnected||account!==me?.id)return;
  const gold=root.querySelector('[data-shop-gold]'),silver=root.querySelector('[data-shop-silver]');
  gold.textContent=number(wallet.balance)+' G';silver.textContent=number(wallet.silver_balance)+' S';
 }catch{/* Keep the last confirmed balance; the next route load retries. */}
}
window.addEventListener('focus',()=>void refreshShopBalances());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshShopBalances();});
async function giftPurchaseDialog(id){return shopPurchaseDialog({id});}

// One dialog and one state object for purchase → recipient → note → review.
async function shopPurchaseDialog(initial){
 const serial=++giftDialogSerial;await accountReady;const account=me?.id;
 $('#dialog').classList.remove('gift-sheet');
 dialog('<section class="shop-checkout"><h2>상품 구매하기</h2><p role="status">불러오는 중…</p></section>');
 try{
  const [catalog,decorations,wallet]=await Promise.all([api('/api/gifts/catalog'),api('/api/decorations','GET',undefined,{fresh:true}),me?api('/api/gold/balance','GET',undefined,{fresh:true}):null]);
  if(serial!==giftDialogSerial||!$('#dialog').open||account!==me?.id)return;
  const p=initial.sku?decorations.products.find(p=>p.sku===initial.sku):[...catalog.gifts,...catalog.silver_gifts].find(p=>p.id===initial.id);
  if(!p)throw Error('상품을 찾을 수 없어요.');
  const state={step:'purchase',period:initial.period||'P7D',quantity:1,recipient:null,message:'',query:'',profiles:[],searched:false,busy:false,uncertain:false,key:crypto.randomUUID(),search:0};
  const cancel=e=>{if(state.busy)e.preventDefault();};$('#dialog').addEventListener('cancel',cancel);$('#dialog').addEventListener('close',()=>$('#dialog').removeEventListener('cancel',cancel),{once:true});
  const active=()=>serial===giftDialogSerial&&$('#dialog').open&&account===me?.id;
  const unit=p.free?'S':'G',image=p.sku?decorationProductImage(p):p.image;
  const price=()=>p.sku?p.periodPrices[state.period]:(p.free?p.silver:p.gold)*state.quantity;
  const balance=()=>p.free?wallet?.silver_balance||0:wallet?.balance||0;
  const valid=()=>p.sku?Object.hasOwn(p.periodPrices,state.period):Number.isInteger(state.quantity)&&state.quantity>=1&&state.quantity<=100;
  const product=()=>'<div class="shop-product-summary"><img src="'+esc(image)+'" alt="'+esc(p.name)+'"><div><h3>'+esc(p.name)+'</h3><p>'+(state.step==='purchase'?'구매한 상품은 인벤토리에 보관돼요.':p.sku?decorations.periods[state.period]:state.quantity+'개')+'</p></div></div>';
  const money=()=>'<div class="shop-money" aria-live="polite"><p><span>보유 '+(p.free?'실버':'골드')+'</span><b>'+number(balance())+' '+unit+'</b></p><p><span>총 결제 금액</span><strong>'+number(price())+' '+unit+'</strong></p>'+(me&&balance()<price()?'<p class="shop-insufficient">잔액이 부족해요. <a href="'+(p.free?'#gifts/rewards':'#gold')+'" data-close-dialog>'+(p.free?'실버 받기':'골드 충전')+'</a></p>':'')+'</div>';
  const resetKey=()=>{state.key=crypto.randomUUID();};
  function paint(){
   if(!active())return;
   const step=state.step,enough=balance()>=price(),within=p.free||price()<=AifectGifts.GIFT_MAX_GOLD;
   let body='',actions='';
   if(step==='purchase'){
    body=product()+(p.sku?'<fieldset class="shop-periods"><legend>이용 기간</legend>'+Object.entries(decorations.periods).map(([k,v])=>'<label><input type="radio" name="period" value="'+k+'" '+(k===state.period?'checked':'')+'><span>'+v+'<small>'+number(p.periodPrices[k])+' G</small></span></label>').join('')+'</fieldset>':'<label class="shop-field" for="shop-quantity">수량</label><div class="shop-quantity"><button type="button" data-quantity="-1" aria-label="수량 줄이기">−</button><input id="shop-quantity" name="quantity" aria-label="수량" type="number" min="1" max="100" step="1" inputmode="numeric" value="'+state.quantity+'" required><button type="button" data-quantity="1" aria-label="수량 늘리기">+</button></div>')+money();
    actions='<button type="button" class="small-button" data-step="recipient">선물하기</button><button class="primary-button" type="submit" '+(me&&(!valid()||!enough)?'disabled':'')+'>구매하기</button>';
   }else if(step==='recipient'){
    body=product()+'<label class="shop-field" for="shop-recipient">받는 사람</label><div class="shop-search"><input id="shop-recipient" name="q" type="search" maxlength="60" placeholder="닉네임 또는 고유 아이디 번호 검색" value="'+esc(state.query)+'"><button class="small-button" type="button" id="shop-search">검색</button></div><div class="shop-recipients" role="group" aria-label="검색 결과">'+(state.profiles.length?state.profiles.map(r=>'<button type="button" class="shop-recipient" data-recipient="'+esc(r.id)+'" aria-pressed="'+(state.recipient?.id===r.id)+'"><img src="'+esc(r.image_version?'/media/producer/'+encodeURIComponent(r.id)+'?v='+encodeURIComponent(r.image_version):DEFAULT_AVATAR)+'" alt=""><span><strong>'+esc(r.name)+'</strong><small>고유 ID '+esc(r.public_number??'미등록')+'</small></span><span class="shop-recipient-state">'+(state.recipient?.id===r.id?'선택됨':'선택')+'</span></button>').join(''):'<p class="field-help">'+(state.searched?'검색 결과가 없어요.':'닉네임 또는 고유 아이디 번호로 검색해주세요.')+'</p>')+'</div>';
    actions='<button type="button" class="small-button" data-step="purchase">뒤로</button><button class="primary-button" type="submit" '+(!state.recipient?'disabled':'')+'>메시지 입력</button>';
   }else if(step==='message'){
    body=product()+'<p class="shop-receiver">'+esc(state.recipient.name)+' <small>고유 ID '+esc(state.recipient.public_number)+'</small></p><label class="shop-field" for="shop-message">선물 메시지 <small>(선택)</small></label><textarea id="shop-message" name="message" rows="3" maxlength="2000" placeholder="함께 전하고 싶은 말을 적어주세요.">'+esc(state.message)+'</textarea><p class="field-help">메시지는 기존 1:1 대화로 함께 전달돼요. 최대 2,000자</p>';
    actions='<button type="button" class="small-button" data-step="recipient">뒤로</button><button class="primary-button" type="submit">최종 확인</button>';
   }else if(step==='review'){
    body=product()+'<dl class="shop-review"><div><dt>받는 사람</dt><dd>'+esc(state.recipient.name)+'</dd></div><div><dt>고유 ID 번호</dt><dd>'+esc(state.recipient.public_number)+'</dd></div><div><dt>'+(p.sku?'이용 기간':'수량')+'</dt><dd>'+(p.sku?esc(decorations.periods[state.period]):state.quantity+'개')+'</dd></div><div><dt>선물 메시지</dt><dd class="shop-note">'+(esc(state.message)||'없음')+'</dd></div></dl>'+money();
    actions='<button type="button" class="small-button" data-step="message" '+(state.uncertain?'disabled':'')+'>뒤로</button><button class="primary-button" type="submit" '+(!enough||!within?'disabled':'')+'>'+(state.uncertain?'전송 결과 다시 확인':'선물 보내기')+'</button>';
   }else{body=product()+'<p role="status">'+(state.sent?esc(state.recipient.name)+'님 (고유 ID '+esc(state.recipient.public_number)+')에게 선물을 보냈어요.':'인벤토리에 상품을 보관했어요.')+'</p>';actions='<button type="button" class="primary-button" data-close-dialog>확인</button>';}
   const top=step==='purchase'?'상품 구매하기':step==='review'?'선물 최종 확인':step==='done'?'완료':'선물하기';
   dialog('<section class="shop-checkout"><h2 tabindex="-1">'+top+'</h2><form id="shop-order">'+body+(step==='purchase'&&!within?'<p class="field-help">선물은 한 번에 최대 100,000 G까지 보낼 수 있어요.</p>':'')+'<div class="shop-checkout-actions">'+actions+'</div><p class="form-error" role="alert"></p></form></section>');
   const form=$('#shop-order');
   for(const b of form.querySelectorAll('[data-step]'))b.onclick=()=>{if(state.busy)return;if(b.dataset.step==='recipient'&&!me){$('#dialog').close();return askLogin();}state.step=b.dataset.step;paint();};
   form.querySelectorAll('[name=period]').forEach(r=>r.onchange=()=>{if(state.busy)return;state.period=r.value;resetKey();paint();});
   const qty=form.querySelector('[name=quantity]');
   const quantity=n=>{if(state.busy)return;state.quantity=n;resetKey();paint();};
   if(qty)qty.oninput=()=>{if(state.busy)return;state.quantity=Number(qty.value);resetKey();form.querySelector('.shop-money').outerHTML=money();form.querySelector('[type=submit]').disabled=!!me&&(!valid()||balance()<price());form.querySelectorAll('[data-quantity]').forEach(b=>b.disabled=b.dataset.quantity==='-1'?state.quantity<=1:state.quantity>=100);};
   form.querySelectorAll('[data-quantity]').forEach(b=>{b.disabled=b.dataset.quantity==='-1'?state.quantity<=1:state.quantity>=100;b.onclick=()=>quantity(Math.max(1,Math.min(100,state.quantity+Number(b.dataset.quantity))));});
   const input=form.querySelector('[name=q]');
   async function search(){
    if(state.busy)return;const seq=++state.search;state.query=input.value.trim();state.recipient=null;state.searched=true;resetKey();
    const button=form.querySelector('#shop-search');button.disabled=true;
    try{const r=await api('/api/decorations/recipients?q='+encodeURIComponent(state.query),'GET',undefined,{fresh:true});if(active()&&seq===state.search&&state.step==='recipient'){state.profiles=r.profiles;paint();}}
    catch(e){if(active()&&seq===state.search&&form.isConnected)formError(form).textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}
   }
   if(input){input.oninput=()=>{state.query=input.value;state.search++;state.recipient=null;state.profiles=[];form.querySelector('.shop-recipients').innerHTML='';form.querySelector('[type=submit]').disabled=true;};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void search();}};form.querySelector('#shop-search').onclick=()=>void search();}
   form.querySelectorAll('[data-recipient]').forEach(b=>b.onclick=()=>{state.recipient=state.profiles.find(r=>r.id===b.dataset.recipient);resetKey();paint();});
   const note=form.querySelector('[name=message]');if(note)note.oninput=()=>{state.message=note.value;resetKey();};
   form.onsubmit=async e=>{
    e.preventDefault();if(state.busy)return;
    if(!me){$('#dialog').close();return askLogin();}
    if(!active())return;
    if(step==='recipient'){if(state.recipient){state.step='message';paint();}return;}
    if(step==='message'){state.step='review';paint();return;}
    if(!['purchase','review'].includes(step)||!valid())return;
    state.busy=true;$('#dialog-close').disabled=true;for(const control of form.elements)control.disabled=true;
    const sending=step==='review';
    const body={request_id:state.key,...(p.sku?{sku:p.sku,period:state.period}:{gift_type:p.id,quantity:state.quantity}),...(sending?{profile_id:state.recipient.id,message:state.message}:{})};
    try{
     await api(p.sku?sending?'/api/decorations/gift':'/api/decorations/buy':sending?'/api/gifts/checkout':'/api/me/gift-inventory/buy','POST',body);
     if(!active())return;state.sent=sending;state.step='done';state.uncertain=false;state.busy=false;paint();void refreshShopBalances();$('#dialog').addEventListener('close',()=>void render(),{once:true});
    }catch(e){if(!active()||!form.isConnected)return;state.uncertain=sending&&(!e.status||e.status>=500);state.busy=false;paint();formError($('#shop-order')).textContent=e.message+(state.uncertain?' 같은 요청 번호로 전송 결과를 다시 확인해주세요.':'');}
    finally{state.busy=false;$('#dialog-close').disabled=false;if(form.isConnected)for(const control of form.elements)control.disabled=false;}
   };
   $('.shop-checkout h2')?.focus();
  }
  paint();
 }catch(e){if(serial===giftDialogSerial&&$('#dialog').open)dialog('<section class="shop-checkout"><h2>상품을 열지 못했어요</h2><p role="alert">'+esc(e.message)+'</p></section>');}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-gift-buy],[data-product-gift],[data-shelf]');if(!b)return;e.preventDefault();
 if(b.dataset.shelf){const row=$('#shelf-'+b.dataset.shelf),stride=row.firstElementChild.getBoundingClientRect().width+12,step=Math.max(1,Math.floor((row.clientWidth+12)/stride))*stride;row.scrollBy({left:Number(b.dataset.direction)*step,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return;}
 if(b.dataset.giftBuy)void giftPurchaseDialog(b.dataset.giftBuy);else void shopPurchaseDialog({sku:b.dataset.productGift});
});
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
  const item=d.inventory.find(i=>i.item_key===p.sku&&i.available)||d.inventory.find(i=>i.item_key===p.sku),image=decorationProductImage(p);
  return `<article class="decoration-card" data-decoration-card="${esc(p.sku)}"><img class="decoration-product-image ${kind==='PROFILE_FRAME'?'is-frame':''}" src="${esc(image)}" alt="${esc(p.name)}" loading="lazy"><h2>${esc(p.name)}</h2><p class="decoration-owned">${item?item.available?item.stored?'사용 전 보관 · '+d.periods[item.period_code]:decorationRemaining(item.expires_at,d.server_now):'기간 만료 · 다시 구매할 수 있어요.':'미보유'}</p><label>이용 기간<select data-decoration-period aria-label="${esc(p.name)} 이용 기간">${Object.entries(d.periods).map(([key,label])=>`<option value="${key}">${label} · ${number(p.periodPrices[key])} G</option>`).join('')}</select></label><div class="decoration-actions"><button class="small-button" data-decoration="${esc(p.sku)}">자세히 보기</button><button class="primary-button" data-decoration="${esc(p.sku)}">구매</button></div></article>`;
 }).join('')}</section>`;
}
async function decorationDialog(sku,period='P7D'){return shopPurchaseDialog({sku,period});}
function storedDecorationsHTML(items=[]){
 return '<section class="player-owned decoration-inventory-section" aria-labelledby="inventory-purchased"><h2 id="inventory-purchased">구입한 상품 <span>'+items.length+'</span></h2><p class="field-help">구매하거나 선물받아 보관 중인 상품이에요. 사용 시작 전에는 기간이 줄어들지 않아요.</p>'+(items.length?items.map(i=>`<article class="decoration-inventory-item" data-stored-item="${esc(i.id)}"><img class="${i.product.kind==='PROFILE_FRAME'?'is-frame':''}" src="${esc(decorationProductImage(i.product))}" alt="${esc(i.product.name)}"><div><h3>${esc(i.product.name)}</h3><p>${esc(({P7D:'7일',P1M:'1개월',P3M:'3개월'})[i.period_code])} · ${i.available?'사용 전 보관':'결제 확인 중'}</p><div class="decoration-actions"><button class="primary-button" data-stored-decoration="${esc(i.id)}" data-mode="use" ${i.available?'':'disabled'}>사용 시작</button><button class="small-button" data-stored-decoration="${esc(i.id)}" data-mode="send" ${i.available?'':'disabled'}>선물하기</button></div></div></article>`).join(''):'<p class="decoration-empty">보관 중인 상품이 없어요.</p>')+'<a class="text-link" href="#gifts/frames">상품 보러 가기</a></section>';
}
function activeDecorationCardHTML(i){
 const frame=i.product.kind==='PROFILE_FRAME';
 const action=!i.available?'':frame?`<button class="${i.equipped?'small-button':'primary-button'}" data-player-equip="${esc(i.equipped?'':i.id)}">${i.equipped?'해제하기':'장착하기'}</button>`:'<a class="small-button" href="#community">토킹룸에서 사용하기</a>';
 return `<article class="decoration-inventory-item" data-active-item="${esc(i.id)}"><img class="${frame?'is-frame':''}" src="${esc(decorationProductImage(i.product))}" alt="${esc(i.product.name)}"><div><h3>${esc(i.product.name)}</h3><p>${i.available?frame?i.equipped?'착용 중':'미착용 · 기간 진행 중':'기간 진행 중':i.expires_at<=Date.now()/1000?'기간 만료':'사용 불가'}</p><p>${decorationRemaining(i.expires_at)}</p>${action}</div></article>`;
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
