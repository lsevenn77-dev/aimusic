const giftArt=g=>`<img class="gift-art" src="${esc(g.image)}" alt="" width="96" height="96" loading="lazy" decoding="async">`;
const giftButton=(t,cls='small-button gift-entry')=>me?.id===t.user_id?'':`<button class="${cls}" data-gift="${esc(t.id)}" aria-label="${esc(t.title)} 선물하기">${icon('gift')}<span>선물</span></button>`;
function giftCards(gifts,selected=null,selectable=false){return `<div class="gift-catalog">${gifts.map(g=>`<${selectable?'button type="button"':'article'} class="gift-choice ${selected===g.id?'selected':''}" ${selectable?`data-gift-type="${g.id}" aria-pressed="${selected===g.id}"`:''}>${giftArt(g)}<strong>${esc(g.name)}</strong><span>${number(g.free?g.silver:g.gold)} ${g.free?"S":"G"}</span></${selectable?'button':'article'}>`).join('')}</div>`;}
function freeRewardsHTML(s,compact=false){const labels={checkin:'오늘 출석',cover:'커버곡 공개',listen:'노래 5곡 감상',comment1:'첫 번째 댓글',comment2:'두 번째 댓글',comment3:'세 번째 댓글'};return `<section class="free-rewards"><div class="free-rewards-title">${giftArt(AifectGifts.FREE_GIFT)}<div><strong>매일 모으는 작은 응원</strong><p>보유 실버 <b>${number(s?.balance)} S</b> · 하루 최대 10 S</p></div><span class="free-gift-badge">무료</span></div>${compact?'<details class="gift-reward-details"><summary>오늘의 보상 받기 · 최대 10 S</summary>':''}<div class="daily-gift-actions">${s?s.rewards.map(r=>`<div class="daily-gift-task"><span>${labels[r.kind]}<small>${r.kind==='listen'?'곡마다 60% 이상 · '+r.progress+'/5곡':r.kind==='cover'?'하루 1회':r.kind.startsWith('comment')?'3자 이상 · 하루 총 3회':'하루 1회'}</small></span><button type="button" class="small-button" data-claim-gift="${r.kind}" ${r.claimed||!r.eligible?'disabled':''}>${r.claimed?'✓ 받음':r.eligible?r.amount+' S 받기':r.amount+' S · '+r.progress+'/'+r.target}</button>${!r.claimed&&!r.eligible?`<a class="text-link" href="${r.kind==='cover'?'#karaoke':'#home'}">${r.kind==='cover'?'커버 공개하기':r.kind==='listen'?'음악 듣기':'곡에서 댓글 남기기'}</a>`:''}</div>`).join(''):'<a class="small-button" href="#account" data-close-dialog>로그인하고 받기</a>'}</div><p class="gift-fineprint">매일 0시(한국 시간) 보상 갱신 · 받은 실버는 누적돼요.<br>1 S와 1 G는 각각 응원 순위 1점 · 실버는 현금 가치·골드 전환·수익 정산이 없어요.</p>${compact?'</details>':''}</section>`;}
function giftShopHTML(d=null){
 const silver=AifectGifts.FREE_GIFT,gifts=d?.gifts||AifectGifts.GIFT_CATALOG;
 const silverGifts=d?.silver_gifts||AifectGifts.SILVER_GIFT_CATALOG;
 return `<div class="gift-dashboard"><header class="gift-shop-heading"><h1>상점</h1><div class="inline-actions"><a class="small-button" href="#gold">골드 충전·결제</a><a class="small-button" href="#gifts/rewards">오늘의 실버받기</a></div></header>
 <section class="gift-dashboard-section gift-silver-section" aria-labelledby="silver-gifts-title"><header class="gift-section-heading"><div class="gift-section-title">${giftArt(silver)}<h2 id="silver-gifts-title">실버 선물</h2></div><p><strong>작지만 특별한 마음, 실버로 전해보세요.</strong><span>출석과 음악 활동으로 모으는 무료 응원이에요.</span></p><div class="gift-section-access"><span>보유 <strong>${number(d?.free?.balance||0)} S</strong></span><a class="gift-section-cta" href="#gifts/rewards">오늘의 실버 받기 ${icon('chevron')}</a></div></header>
 <div class="gift-catalog silver-catalog">${silverGifts.map(g=>`<button type="button" class="gift-choice" data-gift-buy="${esc(g.id)}">${giftArt(g)}<strong>${esc(g.name)}</strong><span>${number(g.silver)} S</span></button>`).join('')}</div><details class="gift-dashboard-policy"><summary>실버 선물이란?</summary><p>출석·음악 활동으로 하루 최대 10 S를 모을 수 있어요. 1 S와 1 G는 응원 순위에 각각 1점으로 반영돼요. 실버는 현금 정산·다이아 적립·골드 전환 대상이 아니에요.</p></details></section>
 <section class="gift-dashboard-section gift-gold-section" aria-labelledby="gold-gifts-title"><header class="gift-section-heading"><div class="gift-section-title">${giftArt(AifectGifts.giftById('crown'))}<h2 id="gold-gifts-title">골드 선물</h2></div><p><strong>더 깊고 특별한 마음을 골드 선물로 전해보세요.</strong><span>좋아하는 음악과 아티스트의 다음 무대를 응원해요.</span></p><a class="gift-section-cta" href="#gold">${d?'보유 '+number(d.balance)+' G':'골드 충전'} ${icon('chevron')}</a></header><div class="gift-catalog gift-dashboard-catalog">${gifts.map(g=>`<button type="button" class="gift-choice" data-gift-buy="${esc(g.id)}">${giftArt(g)}<strong>${esc(g.name)}</strong><span>${number(g.gold)} G</span></button>`).join('')}</div><details class="gift-dashboard-policy"><summary>골드 선물 수익 · 정산 안내</summary><p>${esc(AifectGifts.GIFT_SETTLEMENT_NOTICE)} 커버곡 선물은 가창자 70%·플랫폼 30%이며, 확정된 수익은 다이아로 적립돼요.</p></details></section>
 ${d?.official_received?officialSupportHTML(d.official_received):''}<nav class="gift-dashboard-actions" aria-label="상점 관리"><a class="small-button" href="#gifts/rewards">오늘의 실버받기</a><a class="primary-button" href="#gold">${icon('wallet')} 골드 충전 · 결제</a><a class="small-button" href="#gold/history">${icon('list')} 보낸 선물 내역</a></nav><footer class="gift-dashboard-footer"><span>${icon('gift')} 선물은 아티스트에게 큰 힘이 되는 소중한 마음입니다.</span><em>Music brings us closer.</em></footer></div>`;
}
async function chooseGiftRecipient(type){
 const serial=++giftDialogSerial,roomGift=type?.roomGift;dialog('<section class="gift-recipient-dialog"><h2>선물 받을 사람</h2><p role="status">불러오는 중…</p></section>');
 try{await accountReady;if(!me){$('#dialog').close();returnRoute='#gifts';return askLogin();}const account=me.id;
  const d=roomGift?{profiles:roomGift.recipients.filter(p=>p?.id&&p.id!==me.profile_id)}:await api('/api/decorations/recipients','GET',undefined,{fresh:true});if(serial!==giftDialogSerial||!$('#dialog').open||account!==me?.id)return;
  dialog('<section class="gift-recipient-dialog"><h2>선물 받을 사람</h2><form id="gift-recipient-search"><label>'+(roomGift?'토킹룸 참여자 검색':'닉네임 검색')+'<input name="q" maxlength="60" type="search" required></label><button class="small-button">검색</button><p class="form-error" role="alert"></p></form><div class="gift-target-list" id="gift-recipient-results"></div></section>');
  const form=$('#gift-recipient-search'),list=$('#gift-recipient-results');
  let selecting=false;
  const paint=profiles=>{list.innerHTML=profiles.length?profiles.map(p=>'<button type="button" class="gift-target" data-gift-recipient="'+esc(p.id)+'"><span><strong>'+esc(p.name)+'</strong><small>이 회원에게 선물하기</small></span>'+icon('chevron')+'</button>').join(''):'<p>'+(roomGift?'선물할 참여자가 없어요.':'닉네임으로 회원을 검색해주세요.')+'</p>';list.querySelectorAll('[data-gift-recipient]').forEach(b=>b.onclick=async()=>{if(selecting||serial!==giftDialogSerial||account!==me?.id)return;selecting=true;try{if(roomGift)await roomGift.onRecipientChange?.(b.dataset.giftRecipient);if(serial===giftDialogSerial&&form.isConnected&&account===me?.id)await profileGiftDialog(b.dataset.giftRecipient,type);}catch(e){if(form.isConnected)formError(form).textContent=e.message;}finally{selecting=false;}});};paint(d.profiles);
  form.onsubmit=busyForm(form,async()=>{const query=form.elements.q.value.trim();const r=roomGift?{profiles:d.profiles.filter(p=>String(p.name||'').toLocaleLowerCase().includes(query.toLocaleLowerCase()))}:await api('/api/decorations/recipients?q='+encodeURIComponent(query),'GET',undefined,{fresh:true});if(serial===giftDialogSerial&&form.isConnected&&account===me?.id)paint(r.profiles);});
 }catch(e){if(serial===giftDialogSerial&&$('#dialog').open)dialog('<section class="gift-recipient-dialog"><h2>선물할 회원을 불러오지 못했어요</h2><p role="alert">'+esc(e.message)+'</p></section>');}
}
function ownedGiftGroups(items=[],selectedId=null){
 const groups=new Map();
 for(const item of items){const key=item.gift_type+':'+!!item.available;const group=groups.get(key);if(group){group.quantity++;if(item.id===selectedId)groups.set(key,{...item,quantity:group.quantity});}else groups.set(key,{...item,quantity:1});}
 return [...groups.values()].sort((a,b)=>Number(b.available)-Number(a.available));
}
function ownedGiftCards(inventory,selectedId=null){
 const groups=ownedGiftGroups(inventory?.items||[],selectedId);
 return `<section class="gift-owned" aria-labelledby="gift-owned-title"><div class="gift-catalog-heading"><h3 id="gift-owned-title">보유 아이템</h3><span>추가 차감 없음</span></div>${inventory?.error?'<p class="gift-owned-empty" role="status">보유 아이템을 불러오지 못했어요. <button type="button" class="text-link" data-gift-inventory-retry>다시 불러오기</button></p>':!me?'<p class="gift-owned-empty">로그인하면 보유한 선물을 볼 수 있어요.</p>':!groups.length?'<p class="gift-owned-empty">보유한 선물이 없어요.</p>':`<div class="gift-catalog gift-owned-catalog">${groups.map(g=>`<button type="button" class="gift-choice" data-owned-gift="${esc(g.id)}" aria-pressed="false" ${g.available?'':'disabled'}>${giftArt(g)}<strong>${esc(g.gift_name)}</strong><span>보유 ${number(g.quantity)}개</span>${g.available?'':'<small>사용 불가</small>'}</button>`).join('')}</div>`}</section>`;
}
let giftDialogSerial=0;
// Measure the actual first two card rows; never size this dialog to the full page.
function bindGiftCompactLayout(form){
 if(typeof document==='undefined'||typeof ResizeObserver!=='function'||!form?.closest)return;
 const section=form.closest('.gift-dialog--compact'),modal=$('#dialog'),list=form.querySelector('.gift-options'),footer=form.querySelector('.gift-checkout');
 if(!section||!modal||!list||!footer)return;
 let frame=0,stopped=false,revealSelection=true;
 const clean=()=>{if(stopped)return;stopped=true;if(frame)cancelAnimationFrame(frame);resize.disconnect();changes?.disconnect();hostChanges?.disconnect();window.removeEventListener('resize',schedule);modal.removeEventListener('close',clean);};
 const measure=()=>{
  frame=0;if(!form.isConnected||!modal.open){clean();return;}
  const cards=[...list.querySelectorAll('.gift-choice')].filter(el=>el.getClientRects().length),rows=[];
  for(const card of cards){const r=card.getBoundingClientRect();if(!rows.some(top=>Math.abs(top-r.top)<2))rows.push(r.top);}
  rows.sort((a,b)=>a-b);
  if(rows.length){const bottom=Math.max(...cards.map(el=>el.getBoundingClientRect()).filter(r=>r.top<(rows[2]??Infinity)-2).map(r=>r.bottom)),style=getComputedStyle(list),height=Math.ceil(bottom-list.getBoundingClientRect().top+list.scrollTop+(parseFloat(style.paddingBottom)||0));if(height>0&&list.style.getPropertyValue('--gift-dialog-rows-height')!==height+'px')list.style.setProperty('--gift-dialog-rows-height',height+'px');}
  if(revealSelection){
   const selected=cards.find(el=>el.classList.contains('selected')||el.getAttribute('aria-pressed')==='true');
   if(selected){
    const card=selected.getBoundingClientRect(),viewport=list.getBoundingClientRect();
    if(card.top<viewport.top||card.bottom>viewport.bottom){const previous=Math.max(...cards.map(el=>el.getBoundingClientRect().top).filter(top=>top<card.top-2)),top=Number.isFinite(previous)?previous:card.top;list.scrollTop=Math.max(0,list.scrollTop+top-viewport.top-(parseFloat(getComputedStyle(list).paddingTop)||0));}
    revealSelection=false;
   }
  }
  const outerHeight=el=>{if(!el)return 0;const style=getComputedStyle(el);return el.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);};
  const fixed=[section.querySelector('header'),section.querySelector('.gift-category-tabs'),footer].reduce((n,el)=>n+outerHeight(el),0),rowHeight=Math.min(list.scrollHeight,parseFloat(list.style.getPropertyValue('--gift-dialog-rows-height'))||214),maximum=parseFloat(getComputedStyle(modal).maxHeight),available=(Number.isFinite(maximum)?maximum:Math.min(720,(window.visualViewport?.height||window.innerHeight)-24))-2;
  const current=section.classList.contains('gift-dialog--scroll-all');section.classList.toggle('gift-dialog--scroll-all',fixed+rowHeight+(current?12:0)>available);
 };
 const schedule=()=>{if(!frame&&!stopped)frame=requestAnimationFrame(measure);};
 const resize=new ResizeObserver(schedule);resize.observe(section);resize.observe(footer);
 let grids=new Set();const observeGrids=()=>{const next=new Set(list.querySelectorAll('.gift-catalog'));for(const grid of grids)if(!next.has(grid))resize.unobserve(grid);for(const grid of next)if(!grids.has(grid))resize.observe(grid);grids=next;};observeGrids();
 const changes=typeof MutationObserver==='function'?new MutationObserver(()=>{observeGrids();schedule();}):null;changes?.observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
 const hostChanges=typeof MutationObserver==='function'?new MutationObserver(()=>{if(!form.isConnected)clean();}):null;const host=$('#dialog-content');if(host)hostChanges?.observe(host,{childList:true});
 window.addEventListener('resize',schedule,{passive:true});modal.addEventListener('close',clean);form._giftMeasure=schedule;form._giftCleanup=clean;schedule();
}
function giftCompactRecipient(profile,canChange){
 const image=typeof avatarImage==='function'?avatarImage(profile,'producer',false,false):'';
 return `<${canChange?'button type="button"':'div'} class="gift-recipient" id="gift-recipient"${canChange?' aria-label="받는 사람 변경"':''}><span class="gift-recipient-avatar">${image}</span><strong>${esc(profile.name)}</strong>${canChange?icon('chevron'):''}</${canChange?'button':'div'}>`;
}
async function giftDialog(tid,initial=null,personal=false){
 const serial=++giftDialogSerial,route=globalThis.location?.hash,roomGift=initial?.roomGift;
 const fromMessage=personal&&route?.split('?')[0]==='#dm/'+tid;
 if(roomGift&&(!personal||typeof roomGift.send!=='function'||!roomGift.recipients?.some(p=>p.id===tid))){toast('선물할 토킹룸 참여자를 다시 선택해주세요.');return;}
 if(personal&&me?.profile_id===tid){toast('본인에게는 선물할 수 없어요.');return;}
 try{
  await accountReady;const account=me?.id;
  let [wallet,track,inventory]=await Promise.all([me?api('/api/gold','GET',undefined,{fresh:true}):Promise.resolve(null),api('/api/'+(personal?'producers/':'tracks/')+encodeURIComponent(tid)),me&&!roomGift?api('/api/me/gift-inventory','GET',undefined,{fresh:true}).catch(()=>({error:true})):Promise.resolve({items:[]})]);
  if(serial!==giftDialogSerial||route!==globalThis.location?.hash||account!==me?.id)return;
  const t=personal?{user_id:track.profile.user_id,producer:track.profile.display_name||track.profile.name,title:'직접 선물'}:track.track;if(!personal)remember([t]);
  const reason=t.gift_block_reason||(me&&me.id===t.user_id?(personal?'본인에게는 선물할 수 없어요.':'내 작품에는 선물할 수 없어요.'):'');if(reason){toast(reason);return;}
  const silverGifts=wallet?.silver_gifts||AifectGifts.SILVER_GIFT_CATALOG,gifts=wallet?.gifts||AifectGifts.GIFT_CATALOG,choices=roomGift?gifts:[...silverGifts,...gifts];
  const recipientId=personal?track.profile.id||tid:t.producer_id,groups=ownedGiftGroups(inventory?.items||[],initial?.giftInventoryId),initialType=typeof initial==='string'?initial:initial?.id;
  const profile={id:recipientId,name:t.producer,image_version:personal?track.profile.image_version:t.producer_image_version};
  let chosen=choices.some(g=>g.id===initialType)?initialType:roomGift?gifts[0]?.id:'silver-letter',quantity=Number.isInteger(initial?.quantity)&&initial.quantity>=1&&initial.quantity<=100?initial.quantity:1;
  let owned=roomGift||initial?.inventoryId?null:initial?.giftInventoryId?groups.find(g=>g.id===initial.giftInventoryId&&g.available)||null:choices.some(g=>g.id===initialType)||initial?.sku?null:groups.find(g=>g.available)||null,confirmOwned=false,category=roomGift?'gifts':initial?.inventoryId||initial?.giftInventoryId?'inventory':initial?.sku?'decorations':owned?'inventory':'gifts',decoration=null;
  const ownedRequests=new Map(),purchaseRequests=new Map();
  $('#gift-form')?._giftCleanup?.();
  dialog(`<section class="gift-dialog gift-dialog--compact"><header class="gift-dialog-header"><h2>선물하기</h2>${giftCompactRecipient(profile,personal)}</header><nav class="gift-category-tabs" aria-label="선물 카테고리">${[['gifts','선물'],['frames','테두리'],['themes','테마'],['inventory','인벤토리']].map(([key,label])=>`<button type="button" class="small-button" data-gift-category="${key}" aria-pressed="false"${roomGift&&key!=='gifts'?' disabled aria-disabled="true"':''}>${label}</button>`).join('')}</nav><form id="gift-form"><div class="gift-options gift-dialog-scroll" tabindex="0" role="region" aria-label="선물 선택">${ownedGiftCards(inventory,initial?.giftInventoryId)}${giftCards(choices,null,true)}<details class="gift-policy-details"${roomGift?' hidden':''}><summary>선물 수익 · 정산 안내</summary><p class="gift-fineprint">${esc(AifectGifts.GIFT_SETTLEMENT_NOTICE)} 실버 선물은 수익 정산에 반영되지 않아요.</p></details></div><div class="gift-checkout gift-dialog-footer"><div id="gift-decoration-detail" class="gift-extra-detail" hidden></div><div class="gift-send-summary gift-summary-sr-only" id="gift-send-summary" aria-live="polite"></div><p class="gift-fineprint gift-summary-sr-only" id="gift-send-notice">선택한 수량만큼 차감돼요. 보낸 선물은 직접 취소할 수 없어요.</p><p class="gift-context-detail" id="gift-detail" hidden></p><div class="gift-footer-grid"><span class="gift-balance-cell" data-currency="G"><span class="gift-currency-icon gold-coin" aria-hidden="true">G</span><strong id="gift-balance-g">${number(wallet?.balance||0)} G</strong></span><a class="gift-charge-button" href="#gold" data-close-dialog>${icon('plus')}<span>충전하기</span></a><label class="gift-quantity"><span class="gift-summary-sr-only">선물 수량</span><select id="gift-quantity" aria-label="선물 수량" aria-describedby="gift-send-summary">${Array.from({length:100},(_,i)=>`<option value="${i+1}">${i+1}개</option>`).join('')}</select>${icon('chevron')}</label><span class="gift-balance-cell" data-currency="S"><span class="gift-currency-icon" aria-hidden="true"><img src="${esc(AifectGifts.FREE_GIFT.image)}" alt=""></span><strong id="gift-balance-s">${number(wallet?.free?.balance||0)} S</strong></span><a class="gift-silver-button" href="#rewards" data-close-dialog>${icon('gift')}<span>오늘의 실버받기</span></a><button type="submit" class="gift-send-button" id="gift-send" aria-describedby="gift-send-summary gift-send-notice">${icon('gift')}<span class="gift-send-label">선물하기</span></button></div><button type="button" class="small-button" id="gift-owned-cancel" hidden>선택으로 돌아가기</button><p class="form-error" role="alert"></p></div></form></section>`);
  const form=$('#gift-form'),input=$('#gift-quantity'),summary=$('#gift-send-summary'),detail=$('#gift-detail'),notice=$('#gift-send-notice'),cancel=$('#gift-owned-cancel'),send=$('#gift-send'),decorationDetail=$('#gift-decoration-detail');
  const setSend=(label,disabled,description)=>{const text=send.querySelector?.('.gift-send-label');if(text)text.textContent=label;else send.textContent=label;send.disabled=disabled;send.setAttribute?.('aria-label',description||label);};
  const showDetail=(text,visible)=>{if(detail){detail.textContent=text;detail.hidden=!visible;}};
  const update=()=>{
   if(!form.isConnected)return;
   form.querySelectorAll('[data-owned-gift]').forEach(b=>{const selected=!decoration&&category==='inventory'&&b.dataset.ownedGift===owned?.id;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
   form.querySelectorAll('[data-gift-type]').forEach(b=>{const selected=!decoration&&category==='gifts'&&!owned&&b.dataset.giftType===chosen;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
   if(cancel)cancel.hidden=!confirmOwned||!!decoration;
   if(decorationDetail)decorationDetail.hidden=!decoration;
   if(decoration){
    const {p,item,period,periods,bought,busy,setPeriod}=decoration,cost=item||bought?0:p?.periodPrices?.[period],valid=Number.isFinite(cost)&&cost>=0,enough=(wallet?.balance||0)>=cost;
    input.value='1';input.disabled=true;
    if(decorationDetail){decorationDetail.innerHTML=p?`<strong>${esc(p.name)}</strong>${item?`<span>${esc(periods[item.period_code]||item.period_code)} · 보유 상품 · 추가 차감 없음</span>`:`<label>이용 기간<select id="gift-decoration-period" ${busy||bought?'disabled':''}>${Object.entries(periods).filter(([key])=>Number.isFinite(p.periodPrices[key])).map(([key,label])=>`<option value="${key}" ${key===period?'selected':''}>${esc(label)} · ${number(p.periodPrices[key])} G</option>`).join('')}</select></label>`}${bought&&!item?'<p>구매한 상품이 보관되어 있어요. 추가 차감 없이 전송을 다시 시도할 수 있어요.</p>':''}`:'선물할 상품을 선택해주세요.';const select=decorationDetail.querySelector?.('select');if(select)select.onchange=()=>setPeriod(select.value);}
    summary.innerHTML=p?`${esc(p.name)} · ${item||bought?'추가 차감 없음':'총 '+number(cost)+' G'} · ${esc(t.producer)}님에게 선물`:'선물할 상품을 선택해주세요.';
    showDetail(!valid?'가격을 확인해주세요.':!enough?'골드가 부족해요.':cost?'총 '+number(cost)+' G · 보낸 뒤 '+number((wallet?.balance||0)-cost)+' G':'',!!p&&(!valid||!enough||!!cost));
    if(notice)notice.textContent='보낸 선물은 직접 취소할 수 없어요.';
    setSend(busy?'보내는 중…':'선물하기',!!form._busy||!!busy||(!p)||!!me&&(!valid||!enough),summary.textContent||'선물하기');form._giftMeasure?.();return;
   }
   if(category==='frames'||category==='themes'||category==='inventory'&&!owned){input.value='1';input.disabled=true;summary.textContent='선물할 상품을 선택해주세요.';showDetail('',false);setSend('선물하기',true);form._giftMeasure?.();return;}
   input.disabled=!!owned||!!form._busy;input.value=owned?'1':String(quantity);
   if(owned){
    summary.innerHTML=`<span>${esc(owned.gift_name)} × 1<small>${esc(t.producer)}님의 프로필에 보내요</small></span><strong>추가 차감 없음</strong>`;
    if(notice)notice.textContent=confirmOwned?'보유 선물 1개를 사용합니다. 보내면 취소할 수 없어요.':'보유 선물 1개를 사용해요. 실버·골드는 차감되지 않아요.';
    showDetail(`${owned.gift_name} 1개 · 추가 차감 없음${confirmOwned?' · 확인 후 전송':''}`,true);
    setSend(form._busy?'보내는 중…':confirmOwned?'확인하고 보내기':'선물하기',!!form._busy||!recipientId||!owned.available,`${owned.gift_name} 보유 선물 1개 ${confirmOwned?'확인하고 ':''}보내기`);form._giftMeasure?.();return;
   }
   if(notice)notice.textContent='선택한 수량만큼 차감돼요. 보낸 선물은 직접 취소할 수 없어요.';
   const g=choices.find(g=>g.id===chosen),free=!!g?.free,balance=free?(wallet?.free?.balance||0):(wallet?.balance||0),valid=!!g&&Number.isInteger(quantity)&&quantity>=1&&quantity<=100,cost=(free?g.silver:g?.gold)*quantity,within=free||cost<=AifectGifts.GIFT_MAX_GOLD,enough=balance>=cost,unit=free?'S':'G';
   summary.innerHTML=!valid?'수량은 1개부터 100개까지 선택해주세요.':!within?'한 번에 최대 100,000 G까지 보낼 수 있어요.':me?`<span>${esc(g.name)} × ${quantity}<small>총 ${number(cost)} ${unit} 차감</small></span><strong>${enough?`보낸 뒤 ${number(balance-cost)} ${unit}`:free?'실버가 부족해요':'골드가 부족해요'}</strong>`:'로그인하고 마음을 전해보세요.';
   const context=!me?'로그인하고 선물할 수 있어요.':!valid?'수량을 확인해주세요.':!within?'한 번에 최대 100,000 G까지 보낼 수 있어요.':!enough?`${unit==='S'?'실버':'골드'}가 부족해요.`:`${g.name} ${quantity}개 · 총 ${number(cost)} ${unit}`,needsContext=!me||!valid||!within||!enough||quantity>1;
   showDetail(roomGift?'토킹룸에서는 골드 선물만 보낼 수 있어요.'+(needsContext?' '+context:''):context,!!roomGift||needsContext);
   setSend(form._busy?'보내는 중…':'선물하기',!!form._busy||!!me&&(!valid||!within||!enough),!me?'로그인하고 선물하기':`${g?.name||'선물'} ${quantity}개 · ${number(cost)} ${unit} 선물하기`);form._giftMeasure?.();
  };
  form._giftUI={
   setCategory(key){if(roomGift&&key!=='gifts')return;category=key;decoration=null;confirmOwned=false;if(key==='gifts')owned=null;if(key==='inventory'&&!owned&&!initial?.inventoryId)owned=initial?.giftInventoryId?groups.find(g=>g.id===initial.giftInventoryId&&g.available)||null:groups.find(g=>g.available)||null;update();},
   setDecoration(value){if(roomGift&&value)return;decoration=value;confirmOwned=false;update();},
   selectOrdinary(){decoration=null;category='inventory';update();},
   async refreshWallet(){if(!me)return;const value=await api('/api/gold','GET',undefined,{fresh:true});if(form.isConnected&&serial===giftDialogSerial&&account===me?.id){wallet=value;const gold=$('#gift-balance-g'),silver=$('#gift-balance-s');if(gold)gold.textContent=number(wallet.balance||0)+' G';if(silver)silver.textContent=number(wallet.free?.balance||0)+' S';update();}},
   update,
  };
  update();
  const retry=form.querySelector('[data-gift-inventory-retry]');if(retry)retry.onclick=()=>{if(!form._busy)void giftDialog(tid,initial,personal);};
  if(cancel)cancel.onclick=()=>{if(form._busy)return;confirmOwned=false;update();};
  const recipientButton=$('#gift-recipient');if(personal&&recipientButton)recipientButton.onclick=()=>{if(form._busy)return;const selection=roomGift?{id:chosen,quantity,roomGift}:decoration?.p?decoration.item||decoration.bought?{inventoryId:decoration.item?.id||decoration.bought}:{sku:decoration.p.sku,period:decoration.period}:owned?{giftInventoryId:owned.id}:{id:chosen,quantity};return chooseGiftRecipient(selection);};
  form.querySelectorAll('[data-owned-gift]').forEach(b=>b.onclick=()=>{if(form._busy||b.disabled)return;decoration=null;category='inventory';owned=groups.find(g=>g.id===b.dataset.ownedGift&&g.available)||null;confirmOwned=false;formError(form).textContent='';update();});
  const changeQuantity=n=>{if(form._busy)return;quantity=n;input.value=String(n);formError(form).textContent='';update();};input.oninput=()=>changeQuantity(Number(input.value));input.onchange=input.oninput;
  form.querySelectorAll('[data-gift-type]').forEach(b=>b.onclick=()=>{if(form._busy)return;decoration=null;category='gifts';owned=null;confirmOwned=false;chosen=b.dataset.giftType;formError(form).textContent='';update();});
  const submit=busyForm(form,async()=>{
   if(!me){$('#dialog').close();return askLogin();}if(account!==me?.id)throw new Error('로그인 계정이 변경됐어요. 선물창을 다시 열어주세요.');
   if(owned){
    if(!owned.available||!recipientId)throw new Error('선물할 프로필을 확인해주세요.');if(!confirmOwned){confirmOwned=true;return;}
    const sent=owned;let key=ownedRequests.get(sent.id);if(!key){key=crypto.randomUUID();ownedRequests.set(sent.id,key);}setSend('보내는 중…',true);
    await api('/api/me/gift-inventory/'+encodeURIComponent(sent.id)+'/send','POST',{profile_id:recipientId,request_id:key,...(fromMessage?{from_message:true}:{}),...(!personal?{track_id:tid}:/^#(?:inventory|gift-inventory|gifts)\b/.test(route)?{}:{from_profile:true})});
    if(serial!==giftDialogSerial||!form.isConnected||account!==me?.id)return;
    dialog(`<section class="gift-success"><div class="gift-celebration">${giftArt(sent)}</div><h2>${esc(sent.gift_name)} 1개를 보냈어요</h2><p>${esc(t.producer)}님의 프로필에 전달했어요.</p><p>보유 선물 사용 · 실버·골드 추가 차감 없음</p><button class="primary-button" data-close-dialog>확인</button></section>`);await render();return;
   }
   if(category!=='gifts')throw Error('선물할 상품을 선택해주세요.');
   if(!Number.isInteger(quantity)||quantity<1||quantity>100)throw new Error('수량을 확인해주세요.');
   const g=choices.find(g=>g.id===chosen),sentQuantity=quantity;if(!g)throw Error('선물을 선택해주세요.');const fingerprint=chosen+':'+sentQuantity;let key=purchaseRequests.get(fingerprint);if(!key){key=crypto.randomUUID();purchaseRequests.set(fingerprint,key);}setSend('보내는 중…',true);
   const shopCheckout=personal&&/^#gifts(?:[/?]|$)/.test(route);
   const r=roomGift?await roomGift.send({profile_id:recipientId,gift_type:chosen,quantity:sentQuantity,request_id:key}):await api(shopCheckout?'/api/gifts/checkout':`/api/${personal?'producers':'tracks'}/${tid}/gifts`,'POST',{...(shopCheckout?{profile_id:recipientId}:{}),gift_type:chosen,quantity:sentQuantity,request_id:key,...(fromMessage?{from_message:true}:{}),...(g.free?{silver:g.silver*sentQuantity}:{gold:g.gold*sentQuantity})});
   if(serial!==giftDialogSerial||!form.isConnected||account!==me?.id)return;
   if(roomGift){$('#dialog').close();toast(`${g.name} ${sentQuantity}개를 ${t.producer}님에게 선물했어요.`);return;}
   dialog(`<section class="gift-success"><div class="gift-celebration">${giftArt(g)}</div><span class="eyebrow">THANK YOU FOR YOUR ENCORE</span><h2>${esc(g.name)} ${sentQuantity}개를 보냈어요</h2><p>${esc(t.producer)}${personal?'님에게':'님의 「'+esc(t.title)+'」에'}<br>응원이 전해졌어요.</p><p>${r.gift.free?`남은 실버 ${number(r.free_balance)} S · 수익 정산 없음`:`남은 골드 ${number(r.balance)} G`}</p><button class="primary-button" data-close-dialog>계속 음악 듣기</button></section>`);await render();
  });
  form.onsubmit=async ev=>{if(form._busy){ev.preventDefault();return;}if(decoration){ev.preventDefault();return decoration.send?.();}const pending=submit(ev);if(form._busy)update();await pending;if(form.isConnected&&serial===giftDialogSerial&&account===me?.id)update();};
  bindGiftCompactLayout(form);
  await bindGiftCategoryTabs(form,{recipientId,initial,serial,account,initialOwned:!!owned});
 }catch(e){if(serial===giftDialogSerial&&route===globalThis.location?.hash){dialog(`<h2>상점을 열지 못했어요</h2><p role="alert">${esc(e.message)}</p><button type="button" class="primary-button" id="gift-dialog-retry">다시 시도</button>`);const retry=$('#gift-dialog-retry');if(retry)retry.onclick=()=>giftDialog(tid,initial,personal);}}
}
function bindGiftClaims(root,onChange=()=>{}){if(!root)return;root.onclick=async e=>{const b=e.target.closest('[data-claim-gift]');if(!b||b.disabled||root._busy||$('#gift-form')?._busy)return;root._busy=true;b.disabled=true;b.textContent='받는 중…';try{const s=await api('/api/gifts/free/claim','POST',{kind:b.dataset.claimGift});if(!root.isConnected)return;root.innerHTML=freeRewardsHTML(s,root.id==='gift-rewards');onChange(s);toast('실버를 받았어요. 좋아하는 음악에 보내보세요.');}catch(err){toast(err.message);b.disabled=false;b.textContent='다시 받기';}finally{root._busy=false;}};}
async function profileGiftDialog(pid,initial='star'){return giftDialog(pid,initial,true);}
