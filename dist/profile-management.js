async function myGalleryView(pid,readApi=api){
 if(!pid)return {html:heading('사진을 찾을 수 없습니다')};
 const [g,p]=await Promise.all([readApi('/api/producers/'+encodeURIComponent(pid)+'/gallery'),readApi('/api/producers/'+encodeURIComponent(pid)+'/preview')]);
 return {html:`<div class="mp-manage-page">${heading('갤러리',p.profile.name+'의 사진')}<div class="inline-actions"><a class="small-button" href="${g.can_manage?'#profile':'#producer/'+esc(pid)}">프로필로 돌아가기</a>${g.can_manage?`<button class="primary-button" data-profile-photo-add="${esc(pid)}" ${g.photos.length>=g.limit?'disabled':''}>사진 등록</button>`:''}</div><section class="mp-card">${g.photos.length?`<div class="mp-gallery-grid">${g.photos.map((p,i)=>`<figure><button class="profile-gallery-photo" data-gallery-photo="${esc(p.url)}" data-photo-label="사진 ${i+1}" aria-label="사진 ${i+1} 크게 보기"><img src="${esc(p.url)}" alt="사진 ${i+1}"></button>${g.can_manage?`<div class="mp-gallery-actions"><button class="text-link" data-photo-privacy="${esc(p.id)}" data-photo-profile="${esc(pid)}" data-photo-public="${!p.is_public}">${p.is_public?'공개 · 비공개로 변경':'비공개 · 공개로 변경'}</button><button class="text-link" data-profile-photo-delete="${esc(p.id)}" data-profile-photo-owner="${esc(pid)}">삭제</button></div>`:''}</figure>`).join('')}</div>`:myEmpty('등록된 사진이 없습니다.')}</section></div>`};
}
async function myRelationsView(readApi=api){
 if(!me){returnRoute=location.hash;return {html:gate()};}
 const d=await readApi('/api/me/relations','GET',undefined,{fresh:true});
 return {html:`<div class="mp-manage-page">${heading('나의 관계','신청과 수락으로 시작하는 우리만의 관계')}<a class="text-link" href="#profile?view=activity">마이페이지로 돌아가기</a><p class="mp-form-note">관계는 기본 비공개입니다. 두 사람 모두 공개에 동의해야 다른 회원에게 보입니다.<br>수락 이후 메시지 5 · 댓글 5 · 좋아요 1 · 선물 5 XP가 활동 종류별, 보낸 사람별 하루 한 번 적립됩니다. 하루 기준은 한국 시간입니다. 레벨 2는 100 XP, 이후 레벨은 100 × (레벨−1)² XP부터 시작합니다.</p><section class="mp-card">${d.relations.length?d.relations.map(r=>`<article data-list-row class="mp-manage-row"><a class="mp-mini-avatar" href="#producer/${esc(r.profile_id)}">${avatarImage({id:r.profile_id,name:r.name,image_version:r.image_version})}</a><div><a href="#producer/${esc(r.profile_id)}"><strong>${userNickname(r.name,{profileId:r.profile_id})}</strong></a><small>${r.state==='pending'?(r.incoming?'받은 관계 신청':'상대의 수락을 기다리고 있습니다'):('Lv.'+r.level+' · '+number(r.xp)+' XP · '+(r.public?'양측 공개 동의':'비공개'))}</small>${r.state==='accepted'?`<progress value="${r.progress}" max="1" aria-label="관계 경험치"></progress>`:''}</div><div class="inline-actions">${r.state==='pending'&&r.incoming?`<button class="primary-button" data-relation-action="accept" data-relation-id="${esc(r.id)}">수락</button><button class="small-button" data-relation-action="decline" data-relation-id="${esc(r.id)}">거절</button>`:r.state==='accepted'?`<button class="small-button" data-relation-action="share" data-relation-id="${esc(r.id)}" data-relation-share="${!r.share}">${r.share?'공개 동의 취소':'공개에 동의'}</button>`:''}<button class="text-link" data-relation-action="end" data-relation-id="${esc(r.id)}">${r.state==='pending'?'신청 취소':'관계 종료'}</button></div></article>`).join(''):myEmpty('다른 회원의 프로필에서 관계를 신청해 보세요.')}</section></div>`};
}
async function myGiftInventoryView(readApi=api){return unifiedInventoryView(location.hash.slice(1),readApi);}
function bindProfileManagement(view){
 if(view?.unifiedInventory)bindUnifiedInventory(view.unifiedInventory);

}
document.addEventListener('click',async e=>{
 const privacy=e.target.closest('[data-photo-privacy]');if(privacy){e.preventDefault();privacy.disabled=true;try{await api('/api/producers/'+encodeURIComponent(privacy.dataset.photoProfile)+'/gallery/'+encodeURIComponent(privacy.dataset.photoPrivacy),'PATCH',{is_public:privacy.dataset.photoPublic==='true'});await render();}catch(err){toast(err.message);}finally{privacy.disabled=false;}return;}
 const b=e.target.closest('[data-mp-relation-request],[data-relation-action],[data-inventory-buy],[data-inventory-send]');if(!b)return;e.preventDefault();if(!me)return askLogin();
 if(b.dataset.mpRelationRequest){b.disabled=true;try{await api('/api/me/relations','POST',{profile_id:b.dataset.mpRelationRequest});toast('관계 신청을 보냈습니다. 나의 관계에서 확인할 수 있습니다.');}catch(err){toast(err.message);}finally{b.disabled=false;}return;}
 if(b.dataset.relationAction){
  const action=b.dataset.relationAction;if(action==='end'&&!confirm('관계를 종료할까요? 공개 동의도 함께 해제됩니다.'))return;
  b.disabled=true;try{await api('/api/me/relations/'+encodeURIComponent(b.dataset.relationId),'PATCH',{action,...(action==='share'?{public:b.dataset.relationShare==='true'}:{})});await render();}catch(err){toast(err.message);}finally{b.disabled=false;}return;
 }
 if(b.dataset.inventoryBuy){
  const gift=b.dataset.inventoryBuy,key=crypto.randomUUID(),price=Number(b.dataset.giftPrice),currency=b.dataset.giftCurrency;
  dialog(`<h2>${esc(b.dataset.giftName)} 보관 구매</h2><form id="mp-inventory-buy"><label class="form-field">수량<input name="quantity" type="number" min="1" max="100" value="1" required></label><p id="mp-buy-total">총 ${shopPrice(price,currency)}</p><p class="field-help">구매를 누르면 잔액이 차감되고 인벤토리에 보관됩니다. 보관 구매 후에는 개별 취소할 수 없습니다.</p><button class="primary-button">구매하고 보관하기</button><p class="form-error" role="alert"></p></form>`);
  const f=$('#mp-inventory-buy'),account=me.id;f.elements.quantity.oninput=()=>{$('#mp-buy-total').innerHTML='총 '+shopPrice(price*Number(f.elements.quantity.value),currency);};
  f.onsubmit=busyForm(f,async fd=>{
   await api('/api/me/gift-inventory/buy','POST',{gift_type:gift,quantity:Number(fd.get('quantity')),request_id:key});
   if(f.isConnected&&$('#dialog').open&&me?.id===account)finishGiftTransfer('선물을 보관했습니다.');
  });return;
 }
 if(b.dataset.inventorySend){
  const item=b.dataset.inventorySend;let recipient=null;
  dialog(`<h2>${esc(b.dataset.giftName)} 사용</h2><form id="mp-inventory-recipient"><label class="form-field">받는 회원의 공개 ID<input name="public_id" type="text" inputmode="text" pattern="[A-Za-z]{3}[0-9]{4}" minlength="7" maxlength="7" autocapitalize="characters" autocomplete="off" spellcheck="false" required placeholder="예: QXF7082"></label><button class="small-button">회원 확인</button><p class="form-error" role="alert"></p></form><div id="mp-recipient-confirm"></div>`);
  const f=$('#mp-inventory-recipient');f.onsubmit=busyForm(f,async fd=>{recipient=await api('/api/me/gift-inventory/recipient?public_id='+encodeURIComponent(String(fd.get('public_id')||'').trim().toUpperCase()),'GET',undefined,{fresh:true});const p=recipient.profile;$('#mp-recipient-confirm').innerHTML=`<p><strong>${userNickname(p.name,{profileId:p.id,userId:p.user_id})}</strong> · ID: ${esc(p.public_id||'발급 확인 중')}</p><p class="field-help">보관 선물 1개를 사용합니다. 잔액은 추가 차감되지 않습니다.</p><button class="primary-button" id="mp-confirm-send">이 회원에게 선물하기</button><p role="alert" id="mp-send-error"></p>`;$('#mp-confirm-send').onclick=()=>profileGiftDialog(p.id,{giftInventoryId:item});});
 }
});
