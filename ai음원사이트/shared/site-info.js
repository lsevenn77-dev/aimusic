// Public merchant information confirmed by the site owner.
export const BUSINESS = Object.freeze({
  name: '모티브', registration: '832-29-01450',
  address: '경기도 안산시 상록구 구룡체육관로 22 403호',
  email: 'lsevenn88@gmail.com', representative: '이종석', phone: '070-8098-8730',
  commerceRegistration: '', commerceStatus: '미신고',
});
export const PREMIUM = Object.freeze({name: 'AIFECT Premium', price: 4900, currency: 'KRW', interval: 'month', taxIncluded: true, checkoutAvailable: false});
export const POLICY_VERSION = '2026-09-16';
// Karaoke MR / cover license accepted per track. Bump when the clause text changes; older consents keep their version.
export const KARAOKE_TERMS_VERSION = '2026-09-24';
export const KARAOKE_TERMS_TEXT = '이 곡을 AIFECT 노래방에 MR(반주)로 제공하고, 다른 이용자가 이 곡을 커버해 AIFECT에 공개하는 것을 허락합니다. 이 허락에 필요한 권리를 보유하고 있습니다.';
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const policyLinks = [['/pricing','이용권 · 가격'],['/terms','이용약관'],['/privacy','개인정보처리방침'],['/refund','환불 · 해지 정책'],['/contact','고객센터']];
export function businessDetailsHTML(){
  const items=[['상호',BUSINESS.name],['대표자',BUSINESS.representative],['사업자등록번호',BUSINESS.registration],['주소',BUSINESS.address],['통신판매업 신고',BUSINESS.commerceRegistration || BUSINESS.commerceStatus],['고객센터 전화',BUSINESS.phone]];
  return `<dl class="business-details">${items.filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}<div><dt>고객센터 이메일</dt><dd><a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a></dd></div></dl>`;
}
export function businessFooterHTML(){
  return `<div class="footer-heading"><strong>AIFECT</strong><span>AI + EFFECT</span></div><p class="footer-product">전체곡 무료 감상 · <a href="/pricing" target="_blank" rel="noopener">Premium 월 ${PREMIUM.price.toLocaleString('ko-KR')}원</a> (부가세 포함)</p><nav class="policy-links" aria-label="서비스 정책">${policyLinks.map(([url,label])=>`<a href="${url}" target="_blank" rel="noopener"${url==='/privacy'?' class="privacy-link"':''}>${label}</a>`).join('')}</nav>${businessDetailsHTML()}<p class="footer-copyright">© ${POLICY_VERSION.slice(0,4)} ${BUSINESS.name}. AIFECT.</p>`;
}
