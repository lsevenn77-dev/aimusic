export {SUBSCRIPTION_REVENUE_POLICY} from './subscription-revenue.js';
// Public merchant information confirmed by the site owner.
export const BUSINESS = Object.freeze({
  name: '모티브', registration: '832-29-01450',
  address: '경기도 안산시 상록구 구룡체육관로 22 403호',
  email: 'lsevenn88@gmail.com', representative: '이종석', phone: '070-8098-8730',
  commerceRegistration: '2026-경기안산-1860', commerceStatus: '신고 완료',
});
export const PREMIUM = Object.freeze({name: 'AIFECT Premium', price: 4900, currency: 'KRW', interval: 'month', taxIncluded: true, checkoutAvailable: false});
export const APP_PREMIUM = Object.freeze({...PREMIUM, price: 5900});
export const POLICY_VERSION = '2026-10-11';
// Karaoke MR / cover license accepted per track. Bump when the clause text changes; older consents keep their version.
export const KARAOKE_TERMS_VERSION = '2026-09-24';
export const ORIGINAL_UPLOAD_TERMS_VERSION = '2026-11-02.1';
export const ORIGINAL_UPLOAD_TERMS_TEXT = 'AI로 제작한 이 음원과 가사·이미지를 업로드하고 공개할 권리가 있으며, 무단 복제물이나 허락 없이 복제한 타인의 음성을 사용하지 않았습니다. AIFECT에서 반주(MR)를 만들고 다른 이용자가 커버를 제작·공개하는 데 동의합니다. 또한 아이팩트가 직접 운영하는 게임과 웹사이트에서 이 음원을 사용할 수 있도록 비독점적으로 허락합니다.';
export const AI_UPLOAD_RIGHTS_NOTE = 'Suno 무료 플랜으로 만든 곡은 기본적으로 비상업적 용도로만 이용할 수 있어요. 다른 AI로 만든 곡도 제작 당시 요금제와 약관에서 상업적 이용과 위 이용허락이 가능한지 확인해주세요.';
export const KARAOKE_TERMS_TEXT = '이 곡을 AIFECT 노래방에 MR(반주)로 제공하고, 다른 이용자가 이 곡을 커버해 AIFECT에 공개하는 것을 허락합니다. 이 허락에 필요한 권리를 보유하고 있습니다.';
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const policyLinks = [['/pricing','이용권 · 가격'],['/terms','이용약관'],['/privacy','개인정보처리방침'],['/refund','환불 · 해지 정책'],['/contact','고객센터']];
export function businessDetailsHTML(){
  const items=[['상호',BUSINESS.name],['대표자',BUSINESS.representative],['사업자등록번호',BUSINESS.registration],['주소',BUSINESS.address],['통신판매업 신고',BUSINESS.commerceRegistration || BUSINESS.commerceStatus],['고객센터 전화',BUSINESS.phone]];
  return `<dl class="business-details">${items.filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}<div><dt>고객센터 이메일</dt><dd><a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a></dd></div></dl>`;
}
export function businessFooterHTML(){
  const details = items => '<dl class="business-details">'+items.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+escapeHTML(value)+'</dd></div>').join('')+'</dl>';
  return `<div class="footer-top"><p class="footer-product"><span class="footer-free">전체곡 무료 감상</span><span class="footer-dot" aria-hidden="true"> · </span><span class="footer-premium"><a href="/pricing" target="_blank" rel="noopener">Premium 월 ${PREMIUM.price.toLocaleString('ko-KR')}원</a> <small class="footer-vat">(부가세 포함)</small></span></p><a class="footer-logo" href="/#home" aria-label="AIFECT 홈"><img src="/assets/aifect-wordmark.svg?v=20261007-reference" width="148" height="36" alt="AIFECT"></a></div><nav class="policy-links" aria-label="서비스 안내 및 정책">${[['/music','공개 음악'],['/about','AIFECT 소개'],...policyLinks].map(([url,label])=>`<a href="${url}" target="_blank" rel="noopener"${url==='/privacy'?' class="privacy-link"':''}>${label}</a>`).join('')}</nav><div class="footer-business">${details([['상호',BUSINESS.name],['대표자',BUSINESS.representative],['사업자등록번호',BUSINESS.registration],['통신판매업 신고',BUSINESS.commerceRegistration || BUSINESS.commerceStatus]])}<div class="footer-contact">${details([['주소',BUSINESS.address]])}<a href="tel:${BUSINESS.phone}" aria-label="고객센터 전화 ${BUSINESS.phone}">고객센터 전화 ${BUSINESS.phone}</a><a href="mailto:${BUSINESS.email}" aria-label="고객센터 이메일 ${BUSINESS.email}">이메일 ${BUSINESS.email}</a><p class="footer-copyright">© ${POLICY_VERSION.slice(0,4)} ${BUSINESS.name}. AIFECT.</p></div></div>`;
}
