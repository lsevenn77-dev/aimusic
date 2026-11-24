// Cosmetics use server inventory. No ownership or purchases are stored in the browser.
async function bindGiftCategoryTabs(form,{recipientId,initial,serial,account,initialOwned}){
 const section=form.closest('.gift-dialog'),list=form.querySelector('.gift-options'),owned=list.querySelector('.gift-owned'),ui=form._giftUI;
 const ordinary=document.createElement('div');ordinary.className='gift-ordinary-products';
 for(const el of [...list.children])if(el!==owned)ordinary.append(el);list.append(ordinary);
 const extra=document.createElement('div');extra.className='gift-decoration-products';extra.hidden=true;list.append(extra);
 let catalog,selected,period=initial?.period||'P7D',busy=false,revision=0;
 // Keep each unresolved purchase/send pair when a member changes tabs or periods.
 const attempts=new Map(),active=()=>form.isConnected&&serial===giftDialogSerial&&account===me?.id;
 const fingerprint=()=>selected?.item?'inventory:'+selected.item.id:'purchase:'+selected?.p.sku+':'+period;
 function choose(p,item=null){
  if(busy||form._busy)return;selected={p,item};
  if(item)period=item.period_code;
  else if(!Number.isFinite(p.periodPrices[period]))period=Object.keys(catalog.periods).find(key=>Number.isFinite(p.periodPrices[key]));
  formError(form).textContent='';paint();
 }
 function paint(){
  const state=selected?attempts.get(fingerprint()):null;
  extra.querySelectorAll('[data-gift-decoration-index]').forEach(button=>{const yes=selected&&button.dataset.giftDecorationKey===(selected.item?.id||selected.p.sku);button.classList.toggle('selected',!!yes);button.setAttribute('aria-pressed',String(!!yes));});
  ui.setDecoration(selected?{...selected,period,periods:catalog.periods,bought:state?.bought||null,busy,setPeriod(value){if(busy||form._busy||state?.bought||selected.item||!Number.isFinite(selected.p.periodPrices[value]))return;period=value;formError(form).textContent='';paint();},send}:null);
  form._giftMeasure?.();
 }
 async function send(){
  if(busy||form._busy||!selected)return;if(!me)return askLogin();
  if(me.id!==account){formError(form).textContent='계정이 변경되었습니다. 다시 열어 주세요.';return;}
  const {p,item}=selected,key=fingerprint(),sentPeriod=period;
  let attempt=attempts.get(key);if(!attempt){attempt={buyKey:crypto.randomUUID(),sendKey:crypto.randomUUID(),bought:item?.id||null};attempts.set(key,attempt);}
  busy=true;form._busy=true;formError(form).textContent='';paint();
  try{
   if(!attempt.bought){
    const result=await api('/api/decorations/buy','POST',{sku:p.sku,period:sentPeriod,request_id:attempt.buyKey});attempt.bought=result.order.inventory_id;
    if(!active())return;
    // Only a server wallet response can change the displayed balance.
    await ui.refreshWallet().catch(()=>{});
   }
   if(!active())return;
   await api('/api/decorations/inventory/'+encodeURIComponent(attempt.bought)+'/send','POST',{profile_id:recipientId,request_id:attempt.sendKey,...(initial?.artistId?{artist_id:initial.artistId}:{})});
   if(!active())return;attempts.delete(key);$('#dialog').close();toast(p.name+'을 선물했습니다.');
  }catch(e){if(active())formError(form).textContent=e.message;}
  finally{busy=false;form._busy=false;if(active())paint();}
 }
 async function show(key){
  if(form._busy||busy||initial?.roomGift&&key!=='gifts')return;
  const version=++revision;
  section.querySelectorAll('[data-gift-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.giftCategory===key)));
  ordinary.hidden=key!=='gifts';owned.hidden=key!=='inventory';extra.hidden=key==='gifts';extra.innerHTML='';list.scrollTop=0;
  selected=null;ui.setCategory(key);paint();if(key==='gifts')return;
  extra.innerHTML='<p class="gift-owned-empty" role="status">불러오는 중…</p>';
  try{const result=await api('/api/decorations','GET',undefined,{fresh:true});if(!active()||version!==revision)return;catalog=result;
   const items=(key==='inventory'?catalog.inventory.filter(i=>i.stored&&i.available).map(i=>({p:catalog.products.find(p=>p.sku===i.item_key),item:i})):catalog.products.filter(p=>p.kind===(key==='frames'?'PROFILE_FRAME':'TALKING_ROOM_THEME')).map(p=>({p}))).filter(value=>value.p);
   extra.innerHTML=items.length?'<div class="gift-catalog">'+items.map(({p,item},i)=>{const starting=Number.isFinite(p.periodPrices.P7D)?'P7D':Object.keys(catalog.periods).find(code=>Number.isFinite(p.periodPrices[code]));return `<button type="button" class="gift-choice" data-gift-decoration-index="${i}" data-gift-decoration-key="${esc(item?.id||p.sku)}" aria-pressed="false"><img class="gift-art" src="${esc(p.assetPaths.overlay||p.assetPaths.roomCard)}" alt=""><strong>${esc(p.name)}</strong><span>${item?esc(catalog.periods[item.period_code]||item.period_code):(form._shopCoins?shopPrice(p.periodPrices[starting],p.currency||'G'):number(p.periodPrices[starting])+' G')+' / '+esc(catalog.periods[starting]||'')}</span></button>`;}).join('')+'</div>':key==='inventory'?'':'<p class="gift-owned-empty">선물할 상품이 없습니다.</p>';
   extra.querySelectorAll('[data-gift-decoration-index]').forEach(b=>b.onclick=()=>{const value=items[Number(b.dataset.giftDecorationIndex)];if(busy||form._busy||!value)return;choose(value.p,value.item);});
   if(key!=='inventory'){const value=items.find(v=>v.p.sku===initial?.sku)||items[0];if(value)choose(value.p);else{selected=null;paint();}}
   else{const value=items.find(v=>v.item.id===initial?.inventoryId);if(value)choose(value.p,value.item);}
   form._giftMeasure?.();
  }catch(e){if(active()&&version===revision){extra.innerHTML='<p class="gift-owned-empty" role="alert">'+esc(e.message)+'</p>';form._giftMeasure?.();}}
 }
 section.querySelectorAll('[data-gift-category]').forEach(b=>b.onclick=()=>show(b.dataset.giftCategory));
 form.querySelectorAll('[data-owned-gift]').forEach(b=>b.addEventListener('click',()=>{if(busy||form._busy||b.disabled)return;selected=null;ui.selectOrdinary();paint();}));
 await show(initial?.roomGift?'gifts':initial?.inventoryId||initial?.giftInventoryId?'inventory':initial?.sku?.startsWith('frame_')?'frames':initial?.sku?'themes':initialOwned?'inventory':'gifts');
}
function decorationProductImage(p){return p.kind==='PROFILE_FRAME'?p.assetPaths.overlay:p.assetPaths.roomCard;}
// One registered SKU already contains its duration variants; never group unrelated names.
function shopThemeProducts(products){return [...new Map(products.filter(p=>p.kind==='TALKING_ROOM_THEME').map(p=>[p.sku,p])).values()];}
function shopProductPeriods(p,periods){return Object.entries(periods).filter(([key])=>Number.isFinite(p.periodPrices[key])&&p.periodPrices[key]>=0);}
// Shared by the wallet and every product price; artwork never comes from a sample list.
function shopCoin(currency){
 const code=currency==='S'?'S':'G';
 return '<img class="shop-coin" src="/assets/shop/coin-'+code.toLowerCase()+'.svg" alt="'+code+'" width="24" height="24">';
}
// A shared presentation component; amounts/currency remain supplied by the catalog or wallet.
function shopPrice(amount,currency){return '<span class="shop-currency-amount">'+shopCoin(currency)+'<span>'+number(amount)+'</span></span>';}
function shopProductDisplayName(p){const name=String(p.name??'');return p.kind==='TALKING_ROOM_THEME'?name.replace(/\s*라운지\s*$/u,'')||name:name;}
function shopPopupContext(){return /^#(?:gifts(?:[/?]|$)|inventory(?:[/?]|$)|gift-inventory(?:[/?]|$))/.test(globalThis.location?.hash||'');}
function shopCurrencyText(text){return esc(text).replace(/(\d[\d,]*) ([GS])\b/g,(_,amount,code)=>shopPrice(Number(amount.replaceAll(',','')),code));}
function prepareShopPopup(modal,content){
 const own=content.querySelector('.shop-checkout,.shop-theme-preview,.decoration-dialog,.compact-purchase,#mp-inventory-buy,#mp-inventory-recipient');
 const related=shopPopupContext()&&content.querySelector('.gift-dialog,.gift-success,.gift-recipient-dialog,#gift-dialog-retry');
 modal.classList.toggle('shop-dialog',!!(own||related));
}
function shopIcon(name){
 if(['gift','image','search','wallet'].includes(name))return icon(name);
 if(name==='inventory')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></svg>';
 const path=name==='frame'?'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3':'M2 3h3l3 12h11l3-9H6M8 15l-1 3h12M9 21h.01M18 21h.01';
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';
}
function shopStartingPrice(p,periods){
 const days=code=>{const m=/^P(\d+)([DMY])$/.exec(code);return m?Number(m[1])*({D:1,M:30,Y:365})[m[2]]:Infinity;};
 const options=shopProductPeriods(p,periods).sort(([a],[b])=>p.periodPrices[a]-p.periodPrices[b]||days(a)-days(b));
 const first=options[0];if(!first)return '';
 return shopCoin(p.currency||'G')+'<span class="shop-price-value">'+number(p.periodPrices[first[0]])+'</span>';
}
function shopNormalizeSearch(value){return String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu,'');}
function shopCards(items,periods={}){
 return items.map(p=>{
  const theme=p.kind==='TALKING_ROOM_THEME',currency=p.free?'S':p.currency||'G';
  const category=p.sku?(theme?'themes':'frames'):'gifts';
  const action=p.sku?'data-decoration="'+esc(p.sku)+'"':'data-gift-buy="'+esc(p.id)+'"';
  const price=p.sku?shopStartingPrice(p,periods):shopCoin(currency)+'<span class="shop-price-value">'+number(p.free?p.silver:p.gold)+'</span>';
  const name=esc(shopProductDisplayName(p));
  const preview=p.previewLayout==='landscape'?p.assetPaths.roomDesktop:p.assetPaths?.roomMobile;
  return '<article class="shop-card '+(currency==='S'?'is-silver':'is-gold')+'" data-shop-category="'+category+'" data-shop-name="'+esc(p.name)+'">'+
   '<button type="button" class="shop-card-select" '+action+' aria-label="'+name+' 상품 선택"><img class="shop-card-art" src="'+esc(p.sku?decorationProductImage(p):p.image)+'" alt="" loading="lazy"><strong class="shop-card-name" title="'+name+'">'+name+'</strong></button>'+
   '<div class="shop-card-price">'+price+'</div><div class="shop-card-actions">'+
   (theme?'<button type="button" class="shop-card-preview" data-theme-preview="'+esc(preview||'')+'" data-theme-layout="'+(p.previewLayout==='landscape'?'landscape':'portrait')+'" data-theme-sku="'+esc(p.sku)+'" data-theme-name="'+name+'" aria-label="'+name+' 미리보기" '+(preview?'':'disabled')+'>미리보기</button>':'')+
   '<button type="button" class="shop-card-buy" '+action+' aria-label="'+name+' 구매하기">'+shopIcon('cart')+'<span>구매하기</span></button></div></article>';
 }).join('');
}
// Preview the registered room background in its declared orientation.
let shopPreviewCleanup=()=>{};
async function shopThemePreview(button){
 const src=button.dataset.themePreview;if(!src||button.disabled)return;
 const landscape=button.dataset.themeLayout==='landscape',orientation=landscape?'가로형':'세로형';
 const serial=++giftDialogSerial,image=new Image();button.disabled=true;button.setAttribute('aria-busy','true');
 try{
  image.src=src;await image.decode();
  if(!button.isConnected||serial!==giftDialogSerial)return;
  if(landscape?image.naturalWidth<=image.naturalHeight:image.naturalHeight<=image.naturalWidth)throw Error('방 배경을 확인할 수 없습니다.');
  shopPreviewCleanup();
  const price=button.closest('.shop-card')?.querySelector('.shop-card-price')?.innerHTML||'';
  const modal=$('#dialog'),controller=new AbortController();
  modal.classList.remove('gift-sheet');
  dialog('<section class="shop-theme-preview" aria-label="'+esc(button.dataset.themeName)+' 방 배경 미리보기"><img src="'+esc(src)+'" alt="'+esc(button.dataset.themeName)+' '+orientation+' 토킹룸 방 배경"><div class="shop-preview-info"><h2>'+esc(button.dataset.themeName)+'</h2><div class="shop-preview-purchase-row"><div class="shop-card-price">'+price+'</div><button type="button" class="shop-card-buy" data-product-gift="'+esc(button.dataset.themeSku)+'" aria-label="'+esc(button.dataset.themeName)+' 구매하기">'+shopIcon('cart')+'<span>구매하기</span></button></div></div></section>');
  const oldLabel=modal.getAttribute('aria-label');modal.setAttribute('aria-label',button.dataset.themeName+' 미리보기');
  modal.addEventListener('click',e=>{if(e.target!==modal)return;const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();},{signal:controller.signal});
  const close=()=>modal.close();window.addEventListener('popstate',close,{signal:controller.signal});window.addEventListener('hashchange',close,{signal:controller.signal});
  shopPreviewCleanup=()=>{controller.abort();if(oldLabel===null)modal.removeAttribute('aria-label');else modal.setAttribute('aria-label',oldLabel);};
  if(typeof registerRouteCleanup==='function')shopPreviewCleanup=registerRouteCleanup(shopPreviewCleanup);
  modal.addEventListener('close',()=>{if(modal.open)return;shopPreviewCleanup();if(button.isConnected)button.focus({preventScroll:true});},{signal:controller.signal});
  $('#dialog-close').focus({preventScroll:true});
 }catch{if(serial===giftDialogSerial)toast(orientation+' 방 배경을 불러오지 못했습니다.');}
 finally{button.disabled=false;button.removeAttribute('aria-busy');}
}
function shopBalancesHTML(wallet){
 return '<span class="shop-balance shop-balance-gold">'+shopCoin('G')+'<span>보유 골드</span><b data-shop-gold>'+number(wallet?.balance||0)+' G</b></span><span class="shop-balance shop-balance-silver">'+shopCoin('S')+'<span>보유 실버</span><b data-shop-silver>'+number(wallet?.free?.balance||0)+' S</b></span>';
}
// Category artwork comes from the same live catalog as the shelves below.
function shopBannerSlides(products){
 const slides=[{id:'gifts',title:'나만의 스타일을 완성해 보세요',label:'AIFECT 상점',heading:['나만의 스타일을','완성해 보세요'],description:'선물 · 테두리 · 테마로 더 특별한 AIFECT를 즐겨 보세요.',cta:'선물 둘러보기',art:[]}];
 for(const [id,kind,label,heading,description,cta] of [
  ['frames','PROFILE_FRAME','테두리',['나만의 테두리로','프로필을 꾸며 보세요'],'취향에 맞는 테두리로 개성을 더해 보세요.','테두리 둘러보기'],
  ['themes','TALKING_ROOM_THEME','테마',['우리 방의 분위기를','바꿔 보세요'],'마음에 드는 테마로 함께하는 공간을 꾸며 보세요.','테마 둘러보기']
 ]){
  const art=products.filter(p=>p.kind===kind&&decorationProductImage(p)).slice(0,3).map(p=>({src:decorationProductImage(p),name:p.name}));
  if(art.length)slides.push({id,title:heading.join(' '),label,heading,description,cta,art});
 }
 return slides;
}
function shopBannerHTML(banner){
 const intro=banner.id==='gifts';
 const art=intro?'<picture class="shop-banner-intro-art"><source media="(min-width:801px)" srcset="/images/shop/aifect_shop_banner_final.webp?v=115d346082e4" width="2172" height="469"><img src="/images/shop/aifect-store-banner-mobile.webp" width="1080" height="512" alt="" loading="eager" fetchpriority="high" decoding="async" draggable="false"></picture>':'<span class="shop-banner-gallery" aria-hidden="true">'+banner.art.map(p=>'<img src="'+esc(p.src)+'" alt="" loading="eager" decoding="async" draggable="false">').join('')+'</span>';
 return '<a class="home-feature-slide shop-banner-link" data-shop-banner="'+esc(banner.id)+'" href="#gifts/'+esc(banner.id)+'" aria-label="'+esc(banner.title+' · '+banner.cta)+'" draggable="false">'+art+'<span class="home-feature-copy shop-banner-copy"><span class="shop-banner-label">'+esc(banner.label)+'</span><span class="shop-banner-title">'+banner.heading.map(line=>'<span>'+esc(line)+'</span>').join('')+'</span><span class="shop-banner-description">'+esc(banner.description)+'</span><span class="shop-banner-cta">'+esc(banner.cta)+' <span aria-hidden="true">&gt;</span></span></span></a>';
}
async function finalGiftShopView(category,readApi=api){
 const [wallet,d,c]=await Promise.all([me?readApi('/api/gold','GET',undefined,{fresh:true}):null,readApi('/api/decorations','GET',undefined,{fresh:true}),readApi('/api/gifts/catalog')]);
 const active=['frames','themes'].includes(category)?category:'gifts';
 const tabs=[['gifts','선물','gift'],['frames','테두리','frame'],['themes','테마','image']];
 // The API catalog defines what is on sale. Retired legacy choices stay excluded.
 const products=[...c.gifts,...c.silver_gifts,...d.products.filter(p=>p.kind==='PROFILE_FRAME'),...shopThemeProducts(d.products)];
 return '<div class="shop-page" data-shop-active="'+active+'"><section class="shop-banner home-content-refresh" id="shop-banner" aria-label="AIFECT 상점 배너" data-shop-banners="'+esc(JSON.stringify(shopBannerSlides(products)))+'"></section>'+
 '<header class="shop-heading"><h1 class="shop-title">'+shopIcon('cart')+'<span>상점</span></h1><nav class="shop-actions" aria-label="상점 관리"><a href="#gold">'+shopIcon('wallet')+'<span>골드 충전</span></a><a href="#gifts/rewards">'+shopCoin('S')+'<span>실버 받기</span></a><a href="#inventory">'+shopIcon('inventory')+'<span>인벤토리</span></a></nav><div class="shop-balances" role="status" aria-label="보유 자산" aria-live="polite">'+shopBalancesHTML(wallet)+'</div></header>'+
 '<div class="shop-toolbar"><div class="shop-tabs aifect-main-tabs" role="tablist" aria-label="상점 카테고리">'+tabs.map(([id,label,glyph],index)=>'<button type="button" role="tab" id="shop-tab-'+id+'" data-shop-tab="'+id+'" data-tab-tone="'+['pink','mint','purple'][index]+'" aria-controls="shop-products" aria-selected="'+(id===active)+'" tabindex="'+(id===active?'0':'-1')+'">'+shopIcon(glyph)+'<span>'+label+'</span></button>').join('')+'</div><label class="shop-item-search">'+shopIcon('search')+'<input type="search" placeholder="아이템 검색" aria-label="아이템 검색" autocomplete="off"></label></div>'+
 '<div id="shop-products" class="shop-products" role="tabpanel" aria-labelledby="shop-tab-'+active+'" tabindex="0">'+shopCards(products,d.periods)+'</div><p class="shop-empty" role="status" hidden>검색 결과가 없습니다.</p></div>';
}
let shopLayoutCleanup=()=>{};
function bindShopShelves(){
 shopLayoutCleanup();const root=$('.shop-page');if(!root)return;
 const controller=new AbortController(),tabs=[...root.querySelectorAll('[data-shop-tab]')],input=root.querySelector('.shop-item-search input');
 const banner=root.querySelector('#shop-banner');
 const bannerCleanup=banner?mountFeatureCarousel(banner,JSON.parse(banner.dataset.shopBanners),{renderSlide:shopBannerHTML,label:'AIFECT 상점 안내',previousLabel:'이전 상점 배너',nextLabel:'다음 상점 배너',dotsLabel:'상점 배너 선택',initialId:root.dataset.shopActive,intervalMs:4000,syncAudio:false,pauseForDialogs:true}):null;
 const cards=[...root.querySelectorAll('.shop-card')].map(card=>({card,name:shopNormalizeSearch(card.dataset.shopName)}));
 const update=()=>{
  const active=root.dataset.shopActive,query=shopNormalizeSearch(input.value);let count=0;
  for(const {card,name} of cards){card.hidden=card.dataset.shopCategory!==active||!name.includes(query);if(!card.hidden)count++;}
  for(const tab of tabs){const selected=tab.dataset.shopTab===active;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
  root.querySelector('#shop-products').setAttribute('aria-labelledby','shop-tab-'+active);
  root.querySelector('.shop-empty').hidden=count>0;
 };
 for(const tab of tabs){
  tab.addEventListener('click',()=>{root.dataset.shopActive=tab.dataset.shopTab;update();},{signal:controller.signal});
  tab.addEventListener('keydown',event=>{
   const index=tabs.indexOf(tab),next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
   if(next===null)return;event.preventDefault();root.dataset.shopActive=tabs[next].dataset.shopTab;update();tabs[next].focus();
  },{signal:controller.signal});
 }
 input.addEventListener('input',update,{signal:controller.signal});
 input.addEventListener('search',update,{signal:controller.signal});
 // Shelf tabs keep the URL. A banner linking to that same URL must still select its category.
 banner?.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest('a[data-shop-banner]');
  if(!link||link.getAttribute('href')!==location.hash)return;
  event.preventDefault();root.dataset.shopActive=link.dataset.shopBanner;input.value='';update();
 },{signal:controller.signal});
 update();shopLayoutCleanup=()=>{controller.abort();bannerCleanup?.();};
 if(typeof registerRouteCleanup==='function')shopLayoutCleanup=registerRouteCleanup(shopLayoutCleanup);
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
  if(!p)throw Error('상품을 찾을 수 없습니다.');
  const periods=p.sku?shopProductPeriods(p,decorations.periods):[];
  const state={step:'purchase',period:initial.period||'P7D',quantity:1,recipient:null,message:'',query:'',profiles:[],searched:false,busy:false,uncertain:false,key:crypto.randomUUID(),search:0};
  if(p.sku&&!periods.some(([key])=>key===state.period))state.period=periods[0]?.[0];
  const cancel=e=>{if(state.busy)e.preventDefault();};$('#dialog').addEventListener('cancel',cancel);$('#dialog').addEventListener('close',()=>$('#dialog').removeEventListener('cancel',cancel),{once:true});
  const active=()=>serial===giftDialogSerial&&$('#dialog').open&&account===me?.id;
  const unit=p.free?'S':'G',image=p.sku?decorationProductImage(p):p.image;
  const price=()=>p.sku?p.periodPrices[state.period]:(p.free?p.silver:p.gold)*state.quantity;
  const balance=()=>p.free?wallet?.silver_balance||0:wallet?.balance||0;
  const valid=()=>p.sku?periods.some(([key])=>key===state.period):Number.isInteger(state.quantity)&&state.quantity>=1&&state.quantity<=100;
  const product=()=>{
   const name=esc(shopProductDisplayName(p)),img='<img src="'+esc(image)+'" alt="'+name+'">';
   const preview=state.step==='purchase'&&p.assetPaths?.effect?'<span class="frame-detail-layers">'+img+'</span>':img;
   return '<div class="shop-product-summary">'+preview+'<div><h3>'+name+'</h3>'+(state.step==='purchase'?'':'<p>'+esc(p.sku?decorations.periods[state.period]:state.quantity+'개')+'</p>')+'</div></div>';
  };
  const money=()=>'<div class="shop-money" aria-live="polite"><p><span>총 결제 금액</span><strong class="shop-value-payment '+(p.free?'is-silver':'is-gold')+'">'+shopPrice(price(),unit)+'</strong></p>'+(me?'<p class="shop-wallet-line"><span>보유 '+(unit==='S'?'실버':'골드')+'</span><strong>'+shopPrice(balance(),unit)+'</strong></p>':'')+(me&&balance()<price()?'<p class="shop-insufficient">잔액이 부족합니다. <a href="'+(p.free?'#gifts/rewards':'#gold')+'" data-close-dialog>'+(p.free?'실버 받기':'골드 충전')+'</a></p>':'')+'</div>';
  const resetKey=()=>{state.key=crypto.randomUUID();};
  function paint(){
   if(!active())return;
   const step=state.step,enough=balance()>=price(),within=p.free||price()<=AifectGifts.GIFT_MAX_GOLD;
   let body='',actions='';
   if(step==='purchase'){
    body=product()+money()+(p.sku?'<fieldset class="shop-periods"><legend>이용 기간</legend>'+periods.map(([k,v])=>'<label><input type="radio" name="period" value="'+k+'" '+(k===state.period?'checked':'')+'><span>'+v+'<small>'+shopPrice(p.periodPrices[k],unit)+'</small></span></label>').join('')+'</fieldset>':'<label class="shop-field" for="shop-quantity">수량</label><div class="shop-quantity"><button type="button" data-quantity="-1" aria-label="수량 줄이기">−</button><input id="shop-quantity" name="quantity" aria-label="수량" type="number" min="1" max="100" step="1" inputmode="numeric" value="'+state.quantity+'" required><button type="button" data-quantity="1" aria-label="수량 늘리기">+</button></div>');
    actions='<button type="button" class="small-button" data-step="recipient">선물하기</button><button class="primary-button" type="submit" '+(me&&(!valid()||!enough)?'disabled':'')+'>구매하기</button>';
   }else if(step==='recipient'){
    body=product()+'<label class="shop-field" for="shop-recipient">받는 사람</label><div class="shop-search"><input id="shop-recipient" name="q" type="search" maxlength="60" placeholder="닉네임 또는 고유 아이디 번호 검색" value="'+esc(state.query)+'"><button class="small-button" type="button" id="shop-search">검색</button></div><div class="shop-recipients" role="group" aria-label="검색 결과">'+(state.profiles.length?state.profiles.map(r=>'<button type="button" class="shop-recipient" data-recipient="'+esc(r.id)+'" aria-pressed="'+(state.recipient?.id===r.id)+'"><img src="'+esc(r.image_version?'/media/producer/'+encodeURIComponent(r.id)+'?v='+encodeURIComponent(r.image_version):DEFAULT_AVATAR)+'" alt=""><span><strong>'+esc(r.name)+'</strong><small>고유 ID '+esc(r.public_number??'미등록')+'</small></span><span class="shop-recipient-state">'+(state.recipient?.id===r.id?'선택됨':'선택')+'</span></button>').join(''):'<p class="field-help">'+(state.searched?AifectMessages.searchEmpty:'닉네임 또는 고유 아이디 번호로 검색해 주세요.')+'</p>')+'</div>';
    actions='<button type="button" class="small-button" data-step="purchase">뒤로</button><button class="primary-button" type="submit" '+(!state.recipient?'disabled':'')+'>메시지 입력</button>';
   }else if(step==='message'){
    body=product()+'<p class="shop-receiver">'+esc(state.recipient.name)+' <small>고유 ID '+esc(state.recipient.public_number)+'</small></p><label class="shop-field" for="shop-message">선물 메시지 <small>(선택)</small></label><textarea id="shop-message" name="message" rows="3" maxlength="2000" placeholder="함께 전하고 싶은 말을 적어 주세요.">'+esc(state.message)+'</textarea><p class="field-help">메시지는 기존 1:1 대화로 함께 전달됩니다. 최대 2,000자</p>';
    actions='<button type="button" class="small-button" data-step="recipient">뒤로</button><button class="primary-button" type="submit">최종 확인</button>';
   }else if(step==='review'){
    body=product()+'<dl class="shop-review"><div><dt>받는 사람</dt><dd>'+esc(state.recipient.name)+'</dd></div><div><dt>고유 ID 번호</dt><dd>'+esc(state.recipient.public_number)+'</dd></div><div><dt>'+(p.sku?'이용 기간':'수량')+'</dt><dd class="'+(p.sku?'shop-value-period':'')+'">'+(p.sku?esc(decorations.periods[state.period]):state.quantity+'개')+'</dd></div><div><dt>선물 메시지</dt><dd class="shop-note">'+(esc(state.message)||'없음')+'</dd></div></dl>'+money();
    actions='<button type="button" class="small-button" data-step="message" '+(state.uncertain?'disabled':'')+'>뒤로</button><button class="primary-button" type="submit" '+(!enough||!within?'disabled':'')+'>'+(state.uncertain?'전송 결과 다시 확인':'선물 보내기')+'</button>';
   }else{body=product()+'<p role="status">'+(state.sent?esc(state.recipient.name)+'님 (고유 ID '+esc(state.recipient.public_number)+')에게 선물을 보냈습니다.':'인벤토리에 상품을 보관했습니다.')+'</p>';actions='<button type="button" class="primary-button" data-close-dialog>확인</button>';}
   const top=step==='purchase'?'상품 구매하기':step==='review'?'선물 최종 확인':step==='done'?'완료':'선물하기';
   dialog('<section class="shop-checkout '+(p.sku?'is-duration':'is-quantity')+'" data-shop-category="'+(p.sku?(p.kind==='TALKING_ROOM_THEME'?'themes':'frames'):'gifts')+'"><h2 tabindex="-1">'+top+'</h2><form id="shop-order">'+body+(step==='purchase'&&!within?'<p class="field-help">선물은 한 번에 최대 100,000 G까지 보낼 수 있습니다.</p>':'')+'<div class="shop-checkout-actions">'+actions+'</div><p class="form-error" role="alert"></p></form></section>');
   const form=$('#shop-order');
   if(step==='purchase'&&p.assetPaths?.effect)frameEffects.set(form.querySelector('.frame-detail-layers>img'),p.assetPaths.effect);
   for(const b of form.querySelectorAll('[data-step]'))b.onclick=()=>{if(state.busy)return;if(b.dataset.step==='recipient'&&!me){$('#dialog').close();return askLogin();}if(step==='purchase'&&b.dataset.step==='recipient'){if(!valid()){formError(form).textContent=p.sku?'이용 기간을 확인해 주세요.':'수량을 확인해 주세요.';return;}return chooseGiftRecipient(p.sku?{sku:p.sku,period:state.period}:{id:p.id,quantity:state.quantity});}state.step=b.dataset.step;paint();};
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
    }catch(e){if(!active()||!form.isConnected)return;state.uncertain=sending&&(!e.status||e.status>=500);state.busy=false;paint();formError($('#shop-order')).textContent=e.message+(state.uncertain?' 같은 요청 번호로 전송 결과를 다시 확인해 주세요.':'');}
    finally{state.busy=false;$('#dialog-close').disabled=false;if(form.isConnected)for(const control of form.elements)control.disabled=false;}
   };
   $('.shop-checkout h2')?.focus();
  }
  paint();
 }catch(e){if(serial===giftDialogSerial&&$('#dialog').open)dialog('<section class="shop-checkout"><h2>상품을 열지 못했습니다</h2><p role="alert">'+esc(e.message)+'</p></section>');}
}
document.addEventListener('click',e=>{
 const preview=e.target.closest('[data-theme-preview]');if(preview){e.preventDefault();e.stopPropagation();void shopThemePreview(preview);return;}
 const b=e.target.closest('[data-gift-buy],[data-product-gift]');if(!b)return;e.preventDefault();
 if(b.dataset.giftBuy)void giftPurchaseDialog(b.dataset.giftBuy);else void shopPurchaseDialog({sku:b.dataset.productGift});
});
function decorationNav(active='gifts'){
 return '<nav class="v3-segments decoration-nav" aria-label="상점 카테고리">'+[['gifts','선물','#gifts'],['frames','테두리','#gifts/frames'],['themes','테마','#gifts/themes'],['inventory','인벤토리','#inventory']].map(([id,label,href])=>`<a href="${href}" ${id===active?'aria-current="page"':''}>${label}</a>`).join('')+'</nav>';
}
function decorationRemaining(expires,serverNow=Math.floor(Date.now()/1000)){
 if(!expires)return '기간 제한 없음';
 const seconds=expires-serverNow;
 return seconds<=0?'기간 만료':(seconds>=86400?Math.ceil(seconds/86400)+'일 남음':seconds>=3600?Math.ceil(seconds/3600)+'시간 남음':Math.ceil(seconds/60)+'분 남음')+' · '+new Date(expires*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+'까지';
}
function rentalPeriodText(item,at){
 const period=({P7D:'7일',P1M:'1개월',P3M:'3개월'})[item.period_code];
 if(item.status==='UNUSED'&&period)return period+' · 최초 사용부터';
 if(item.expires_at)return decorationRemaining(item.expires_at,at).split(' · ')[0];
 return item.paid||item.product&&item.status==='ACTIVE'?'이용 기간 확인 필요':item.usage||'기간 제한 없음';
}
function rentalStatusHTML(item,at){
 const status=item.status||(item.stored?'UNUSED':'ACTIVE'),expiring=status==='ACTIVE'&&item.expires_at>at&&item.expires_at-at<=3*86400;
 return '<span class="rental-status" data-status="'+status+'">'+(status==='UNUSED'?'미사용':item.expires_at?'사용 기간 중':'사용 가능')+'</span>'+(expiring?'<span class="rental-status is-expiring">만료 임박</span>':'')+(item.applied||item.equipped?'<span class="rental-status is-applied">적용 중</span>':'');
}
async function decorationShopView(category){
 const d=await api('/api/decorations','GET',undefined,{fresh:true});
 const kind=category==='frames'?'PROFILE_FRAME':'TALKING_ROOM_THEME';
 return heading('상점','내 프로필과 토킹룸을 꾸며 보세요.')+decorationNav(category)+`<section class="decoration-grid">${d.products.filter(p=>p.kind===kind).map(p=>{
  const item=d.inventory.find(i=>i.item_key===p.sku&&i.available)||d.inventory.find(i=>i.item_key===p.sku),image=decorationProductImage(p);
  return `<article class="decoration-card" data-decoration-card="${esc(p.sku)}"><img class="decoration-product-image ${kind==='PROFILE_FRAME'?'is-frame':''}" src="${esc(image)}" alt="${esc(p.name)}" loading="lazy"><h2>${esc(p.name)}</h2><p class="decoration-owned">${item?item.available?item.stored?'사용 전 보관 · '+d.periods[item.period_code]:decorationRemaining(item.expires_at,d.server_now):'기간 만료 · 다시 구매할 수 있습니다.':'미보유'}</p><label>이용 기간<select data-decoration-period aria-label="${esc(p.name)} 이용 기간">${Object.entries(d.periods).map(([key,label])=>`<option value="${key}">${label} · ${number(p.periodPrices[key])} G</option>`).join('')}</select></label><div class="decoration-actions"><button class="small-button" data-decoration="${esc(p.sku)}">자세히 보기</button><button class="primary-button" data-decoration="${esc(p.sku)}">구매</button></div></article>`;
 }).join('')}</section>`;
}
async function decorationDialog(sku,period='P7D'){return shopPurchaseDialog({sku,period});}
function storedDecorationsHTML(items=[]){
 return '<section class="player-owned decoration-inventory-section" aria-labelledby="inventory-purchased"><h2 id="inventory-purchased">구입한 상품 <span>'+items.length+'</span></h2><p class="field-help">구매하거나 선물받아 보관 중인 상품입니다. 사용 시작 전에는 기간이 줄어들지 않습니다.</p>'+(items.length?items.map(i=>`<article class="decoration-inventory-item" data-stored-item="${esc(i.id)}"><img class="${i.product.kind==='PROFILE_FRAME'?'is-frame':''}" src="${esc(decorationProductImage(i.product))}" alt="${esc(i.product.name)}"><div><h3>${esc(i.product.name)}</h3><p>${esc(({P7D:'7일',P1M:'1개월',P3M:'3개월'})[i.period_code])} · ${i.available?'사용 전 보관':'결제 확인 중'}</p><div class="decoration-actions"><button class="primary-button" data-stored-decoration="${esc(i.id)}" data-mode="use" ${i.available?'':'disabled'}>사용 시작</button><button class="small-button" data-stored-decoration="${esc(i.id)}" data-mode="send" ${i.available?'':'disabled'}>선물하기</button></div></div></article>`).join(''):'<p class="decoration-empty">보관 중인 상품이 없습니다.</p>')+'<a class="text-link" href="#gifts/frames">상품 보러 가기</a></section>';
}
function activeDecorationCardHTML(i){
 const frame=i.product.kind==='PROFILE_FRAME';
 const action=!i.available?'':frame?`<button class="${i.equipped?'small-button':'primary-button'}" data-player-equip="${esc(i.equipped?'':i.id)}">${i.equipped?'해제하기':'장착하기'}</button>`:'<a class="small-button" href="#community">토킹룸에서 사용하기</a>';
 return `<article class="decoration-inventory-item" data-active-item="${esc(i.id)}"><img class="${frame?'is-frame':''}" src="${esc(decorationProductImage(i.product))}" alt="${esc(i.product.name)}"><div><h3>${esc(i.product.name)}</h3><p>${i.available?frame?i.equipped?'착용 중':'미착용 · 기간 진행 중':'기간 진행 중':i.expires_at<=Date.now()/1000?'기간 만료':'사용 불가'}</p><p>${decorationRemaining(i.expires_at)}</p>${action}</div></article>`;
}
function decorationInventorySectionsHTML(d){
 const items=[...(d.inventory||[]).filter(i=>i.paid).map(i=>({...i,product:{name:i.name,kind:'PROFILE_FRAME',assetPaths:{overlay:i.artwork}}})),...(d.decorations||[])],active=items.filter(i=>i.available),ended=items.filter(i=>!i.available);
 return '<div class="decoration-inventory-sections">'+storedDecorationsHTML(d.stored_decorations)+'<section class="player-owned decoration-inventory-section" aria-labelledby="inventory-active"><h2 id="inventory-active">사용 중인 상품 <span>'+active.length+'</span></h2><p class="field-help">사용을 시작한 상품입니다. 테두리 착용을 해제해도 이용 기간은 계속 진행됩니다.</p>'+(active.length?active.map(activeDecorationCardHTML).join(''):'<p class="decoration-empty">사용 중인 상품이 없습니다.</p>')+'</section></div>'+(ended.length?'<details class="decoration-ended"><summary>만료·사용 불가 상품 '+ended.length+'</summary>'+ended.map(activeDecorationCardHTML).join('')+'</details>':'');
}
function fillRoomThemeChoices(form,options,selected=AifectPlayer.DEFAULT_ROOM_SKIN.sku,inventoryId=null){
 if(!options.themes)return;
 form._themeChoices=options.themes.filter(t=>t.selectable);form._themeServerNow=options.server_now||Date.now()/1000;form._themeReceivedAt=performance.now();
 const requested=inventoryId||new URLSearchParams(location.hash.split('?')[1]||'').get('inventory_id');
 const choice=form._themeChoices.find(t=>requested&&t.inventory_id===requested)||form._themeChoices.find(t=>t.sku===selected&&t.status!=='UNUSED')||form._themeChoices.find(t=>!t.paid);
 form.querySelector('.voice-backgrounds').innerHTML=form._themeChoices.map((t,index)=>`<label data-background="${esc(t.sku)}" class="decoration-theme-choice"><img src="${esc(t.assetPaths.roomCard)}" alt="" loading="lazy"><input type="radio" name="background" value="${esc(t.sku)}" data-theme-index="${index}" ${t===choice?'checked':''}><span>${esc(t.name)}<small>${t.paid?rentalStatusHTML(t,form._themeServerNow)+' '+esc(rentalPeriodText(t,form._themeServerNow)):'기본 · 무료'}</small></span></label>`).join('');
}
async function confirmRoomTheme(form){
 const radio=form.querySelector('[data-theme-index]:checked'),choice=form._themeChoices?.[Number(radio?.dataset.themeIndex)];
 if(!choice)return {};
 const at=form._themeServerNow+(performance.now()-form._themeReceivedAt)/1000;
 if(choice.expires_at&&choice.expires_at<=at)throw Error('테마 사용 기간이 종료되었습니다. 테마 목록을 다시 열어 주세요.');
 const payload={theme_sku:choice.sku,...(choice.inventory_id?{inventory_id:choice.inventory_id}:{})};
 if(choice.status!=='UNUSED')return payload;
 return new Promise(resolve=>{
  const modal=document.createElement('dialog');modal.className='rental-confirm';modal.setAttribute('aria-label','테마 사용 시작 확인');
  modal.innerHTML='<form method="dialog"><h2>테마를 사용하시겠습니까?</h2><p>이 테마를 사용하면 이용 기간이 시작됩니다.<br>시작한 이용 기간은 중지할 수 없습니다.</p><div class="rental-confirm-product"><img src="'+esc(choice.assetPaths.roomCard)+'" alt=""><div><strong>'+esc(choice.name)+'</strong><p>'+esc(rentalPeriodText(choice,at))+'</p></div></div><div class="rental-confirm-actions"><button class="small-button" value="cancel">취소</button><button class="small-button rental-start" value="start">사용 시작</button></div></form>';
  document.body.append(modal);modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close('cancel');}});
  const cancel=()=>modal.close('cancel');window.addEventListener('hashchange',cancel,{once:true});
  modal.addEventListener('close',()=>{const accepted=modal.returnValue==='start';window.removeEventListener('hashchange',cancel);modal.remove();resolve(accepted?{...payload,activate_theme:true}:null);},{once:true});modal.showModal();
 });
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-decoration]');if(!b)return;e.preventDefault();void decorationDialog(b.dataset.decoration,b.closest('[data-decoration-card]')?.querySelector('[data-decoration-period]')?.value||'P7D');});

async function storedDecorationDialog(itemId,mode){
 if(!me)return askLogin();if(!['use','send'].includes(mode))return;
 const account=me.id,serial=++giftDialogSerial;
 const d=await api('/api/decorations','GET',undefined,{fresh:true});if(serial!==giftDialogSerial||account!==me?.id)return;
 const item=d.inventory.find(i=>i.id===itemId&&i.stored&&i.available);if(!item)return toast('사용 가능한 보관 상품을 다시 확인해 주세요.');
 if(mode==='send')return chooseGiftRecipient({inventoryId:item.id});
 if(item.product.kind==='TALKING_ROOM_THEME'){location.hash='community?inventory_id='+encodeURIComponent(item.id);$('#dialog')?.close();return;}
 const sending=mode==='send';let recipient=null,search=0,key=crypto.randomUUID();
 dialog(`<section class="gift-dialog decoration-dialog"><header><h2>${esc(item.product.name)} ${sending?'선물하기':'사용 시작'}</h2><p>${esc(d.periods[item.period_code])} · 추가 골드 차감 없음</p></header><form id="stored-decoration-form"><div class="shop-product-summary"><img src="${esc(decorationProductImage(item.product))}" alt="${esc(item.product.name)}"></div><div class="gift-options">${sending?'<label class="form-field">회원 이름<input name="member_name" type="search" maxlength="60" autocomplete="off" placeholder="닉네임으로 검색"></label><button class="small-button" type="button" id="stored-find">회원 검색</button><p class="field-help">팔로우하거나 대화한 회원을 선택하거나, 닉네임으로 검색하세요.</p><div class="gift-target-list decoration-recipient-list" id="stored-members" aria-label="선물 받을 회원"></div><p id="stored-recipient" role="status">선물 받을 회원을 선택해 주세요.</p>':'<p>지금부터 이용 기간이 시작됩니다. 이미 사용 중인 같은 상품은 남은 기간에 연장됩니다.</p><p>사용을 시작한 상품은 선물할 수 없습니다.</p>'}</div><div class="gift-checkout"><button type="submit" class="primary-button">${sending?'선택한 회원에게 선물하기':'확인하고 사용 시작'}</button><p class="form-error" role="alert"></p></div></form></section>`);
 const form=$('#stored-decoration-form'),button=form.querySelector('button[type="submit"]');button.disabled=sending;
 if(sending){
  const input=form.elements.member_name,list=$('#stored-members'),status=$('#stored-recipient');
  const clear=()=>{recipient=null;key=crypto.randomUUID();button.disabled=true;status.textContent='선물 받을 회원을 선택해 주세요.';};
  const find=async()=>{
   if(form._busy)return;const seq=++search;clear();list.textContent='회원을 불러오는 중…';formError(form).textContent='';
   try{const r=await api('/api/decorations/recipients?q='+encodeURIComponent(input.value.trim()),'GET',undefined,{fresh:true});if(seq!==search||!form.isConnected||serial!==giftDialogSerial||account!==me?.id)return;
    list.innerHTML=r.profiles.length?r.profiles.map(p=>`<button type="button" class="gift-target" data-decoration-recipient="${esc(p.id)}" aria-pressed="false"><img data-avatar-profile="${esc(p.id)}" src="${esc(p.image_version?'/media/producer/'+encodeURIComponent(p.id)+'?v='+encodeURIComponent(p.image_version):DEFAULT_AVATAR)}" alt=""><span><strong>${userNickname(p.name,{profileId:p.id})}</strong><small>이 회원 선택</small></span></button>`).join(''):'<p class="field-help">선택할 회원이 없습니다. 닉네임으로 검색해 주세요.</p>';
    list.querySelectorAll('[data-decoration-recipient]').forEach(b=>b.onclick=()=>{if(form._busy)return;recipient=r.profiles.find(p=>p.id===b.dataset.decorationRecipient);key=crypto.randomUUID();for(const choice of list.querySelectorAll('[data-decoration-recipient]'))choice.setAttribute('aria-pressed',String(choice===b));status.textContent=recipient.name+'님에게 선물합니다.';button.disabled=false;});
   }catch(e){if(seq===search&&form.isConnected){list.textContent='회원을 불러오지 못했습니다.';formError(form).textContent=e.message;}}
  };
  input.oninput=()=>{search++;clear();list.innerHTML='';};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void find();}};
  $('#stored-find').onclick=()=>void find();void find();
 }
 const submit=busyForm(form,async()=>{
  if(account!==me?.id)throw Error('로그인 계정이 변경되었습니다.');if(sending&&!recipient)throw Error('받는 회원을 선택해 주세요.');
  const receiver=recipient;for(const el of form.elements)el.disabled=true;
  await api('/api/decorations/inventory/'+encodeURIComponent(itemId)+'/'+mode,'POST',{request_id:key,...(sending?{profile_id:receiver.id}:{})});
  if(serial!==giftDialogSerial||!form.isConnected||account!==me?.id)return;
  $('#dialog').close();toast(sending?receiver.name+'님에게 상품을 선물했습니다.':'이용 기간이 시작되었습니다.');window.dispatchEvent(new Event('aifect:equipment'));await render();
 });
 form.onsubmit=async e=>{if(form._busy){e.preventDefault();return;}await submit(e);if(form.isConnected){for(const el of form.elements)el.disabled=false;button.disabled=sending&&!recipient;}};
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-stored-decoration]');if(!b||b.disabled)return;e.preventDefault();void storedDecorationDialog(b.dataset.storedDecoration,b.dataset.mode).catch(e=>toast(e.message));});
