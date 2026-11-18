const freeMembership=()=>({plan:'free',playlist_limit:null,playlists_unlimited:true,owned_count:0,active_ids:[],locked_count:0,full_lyrics:true,premium_until:null,checkout_available:false});
let member=freeMembership(),membershipTimer;
function setMembership(value){
 member=value||freeMembership();clearTimeout(membershipTimer);
 if(typeof refreshTakeEntitlement==='function')refreshTakeEntitlement();
 window.AifectAudioAds?.setMembership(member,me?.id);
 window.AifectUploadAds?.setMembership(member,me?.id);
 if(member.plan!=='premium'&&typeof clearFullLyrics==='function')clearFullLyrics();
 if(member.premium_until){const delay=member.premium_until*1000-Date.now();if(delay>0)membershipTimer=setTimeout(async()=>{try{await refreshLibrary(true);updateAccount();if(/^(#membership|#library|#playlist|#account)/.test(location.hash))await render();}catch{member={...member,plan:'free',full_lyrics:true,playlist_limit:null,playlists_unlimited:true};clearFullLyrics();if(typeof refreshTakeEntitlement==='function')refreshTakeEntitlement();}},Math.min(delay+100,2147483647));}
}
function membershipHTML(billing){
 const premium=inApp?AifectSite.APP_PREMIUM:AifectSite.PREMIUM;
 if(!inApp&&AifectSite.PREMIUM.catalogVisible===false)return heading('내 구독 관리','기존 이용권과 결제 내역을 확인하고 자동갱신을 관리하세요.')+`<div class="membership-page">${billingHTML(billing)}<section class="membership-support"><div class="membership-support-actions"><a class="small-button" href="#gold">골드 충전 상품 보기</a><a class="text-link" href="/refund" target="_blank" rel="noopener">환불 · 해지 정책</a>${me?'<a class="small-button" href="#library/playlists">내 플레이리스트 관리</a>':'<a class="primary-button" href="#account">무료로 시작하기</a>'}</div></section></div>`;
 return heading('나에게 맞는 AIFECT','전체곡은 무료로 듣고, 취향을 모으는 방법을 선택하세요.')+paymentKindTabs('premium')+`<div class="membership-page">${billingHTML(billing)}
  <div class="membership-grid" aria-label="무료 및 Premium 혜택 비교">
   <article class="surface membership-card" aria-labelledby="membership-free-title">
    <div class="membership-card-top"><span class="eyebrow">FREE</span><h2 id="membership-free-title">무료</h2><p class="membership-plan-description">좋아하는 음악과 함께하는 일상</p></div>
    <ul class="membership-benefits"><li>전체곡 AAC 128kbps 무료 감상</li><li>곡 상세에서 전체 가사 무료 열람</li><li>플레이리스트 · 마이박스 무제한</li><li>제작곡 업로드 매월 3곡 · 업로드 중 화면 광고</li><li>커버 업로드 무제한 · 완료 후 화면 광고</li><li>좋아요 · 추천 플레이리스트 저장</li></ul>
    <div class="membership-card-footer"><span class="plan-state ${member.plan==='free'?'is-current':''}">${member.plan==='free'?'현재 이용 중':'무료 플랜'}</span></div>
   </article>
   <article class="surface membership-card premium-card" aria-labelledby="membership-premium-title">
    <div class="membership-card-top"><span class="eyebrow">PREMIUM</span><h2 id="membership-premium-title">Premium</h2><p class="plan-price"><span>월 ${premium.price.toLocaleString('ko-KR')}원</span> <small>부가세 포함</small></p><p class="membership-plan-description">월 단위 자동갱신 구독 · 매월 ${premium.price.toLocaleString('ko-KR')}원 정기결제</p></div>
    <ul class="membership-benefits"><li>전체곡 AAC 256kbps 고음질 감상</li><li>싱크 가사 · 현재 줄 강조 · 자동 스크롤</li><li>가사를 누르면 해당 구간으로 이동</li><li>플레이리스트 · 마이박스 무제한</li><li>제작곡 업로드 매월 10곡</li><li>커버 업로드 무제한 · 광고 없음</li></ul>
    <div class="membership-card-footer"><span class="plan-state ${member.plan==='premium'?'is-current':''}">${member.plan==='premium'?'현재 이용 중':billing?.review_only?'심사 계정 · 카드 입력 화면 확인 가능':billing?.checkout_available?'지금 가입 가능':'가입 준비 중'}</span></div>
   </article>
  </div>
  <section class="membership-support" aria-label="이용권 안내">
   <p class="field-help">고음질 변환 중인 곡은 AAC 128kbps로 재생되며 재생바에 표시됩니다. 공개 플레이리스트도 개수 제한 없이 저장할 수 있어요. 일반·Premium 회원 모두 플레이리스트와 마이박스를 개수 제한 없이 사용할 수 있어요.</p>
   <div class="membership-support-actions"><nav class="plan-summary-links" aria-label="이용권 정책"><a href="/pricing" target="_blank" rel="noopener">상세 상품 정보</a><a href="/refund" target="_blank" rel="noopener">환불 · 해지 정책</a><a href="/terms" target="_blank" rel="noopener">이용약관</a></nav>${me?'<a class="small-button" href="#library/playlists">내 플레이리스트 관리</a>':'<a class="primary-button" href="#account">무료로 시작하기</a>'}</div>
  </section>
 </div>`;
}
function playlistQuotaHTML(){return '<p class="field-help">플레이리스트 · 마이박스는 개수 제한 없이 만들 수 있어요.</p>';}
function canCreatePlaylist(){return true;}
async function selectActivePlaylists(){toast('모든 플레이리스트를 개수 제한 없이 사용할 수 있어요.');}
function lockedPlaylistHTML(p){return heading(esc(p.name),'이 플레이리스트는 보관 중입니다.')+`<section class="surface membership-card"><h2>담아둔 음악은 그대로 있어요.</h2><p>${p.tracks}곡이 보관되어 있습니다. 사용할 목록으로 선택하면 다시 재생하고 편집할 수 있어요.</p><div class="inline-actions"><button class="primary-button" data-select-active>사용할 목록 선택</button><a class="small-button" href="#library/playlists">내 보관함</a><button class="text-link" data-delete-playlist="${p.id}">이 목록 삭제</button></div></section>`;}
document.addEventListener('click',e=>{if(e.target.closest('[data-select-active]'))selectActivePlaylists().catch(err=>toast(err.message));if(e.target.closest('[data-close-dialog]'))$('#dialog').close();});
