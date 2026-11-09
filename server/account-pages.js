import {BUSINESS, escapeHTML as esc, businessFooterHTML} from '../shared/site-info.js';

const supportLink = subject => 'mailto:'+BUSINESS.email+'?subject='+encodeURIComponent('[AIFECT] '+subject);
const recovery = `<p>가입할 때 사용한 로그인 방법을 선택해 주세요.</p>
<section><h2>이메일과 비밀번호로 가입한 경우</h2><p>로그인된 기기가 있고 현재 비밀번호를 알고 있다면 <a href="/#account">계정 설정</a>에서 변경할 수 있습니다. 비밀번호를 잊었다면 가입 이메일과 활동명을 적어 고객센터에 본인 확인 절차를 문의해 주세요.</p>
<p><a href="${supportLink('이메일 계정 로그인 도움 요청')}">이메일 계정 복구 문의</a></p><p>비밀번호, 인증 코드, 카드번호는 보내지 마세요.</p></section>
<section><h2>소셜 계정으로 가입한 경우</h2><p>가입한 서비스에서 계정을 복구한 뒤 AIFECT 로그인 화면에서 같은 서비스로 계속해 주세요.</p><ul><li><a href="https://accounts.google.com/signin/recovery">Google 계정 복구</a></li><li><a href="https://accounts.kakao.com/">카카오계정 찾기</a></li><li><a href="https://iforgot.apple.com/">Apple 계정 복구</a></li></ul></section><a href="/#account">로그인으로 돌아가기</a>`;

function deleteContent(user){
 const details = `<p>삭제하면 로그인 정보와 프로필, 올린 작품, 댓글과 메시지를 복구할 수 없습니다. 연결된 파일은 서버에서 순차적으로 삭제합니다.</p>
 <p>웹 정기결제는 자동갱신이 중단됩니다. Apple·Google 구독은 해당 스토어에서 직접 해지해 주세요. 계정 삭제에 따른 자동 환불은 없습니다.</p>
 <p>거래·환불·정산 및 분쟁 처리에 필요한 기록은 <a href="/privacy#retention">개인정보처리방침의 보유 기간</a>에 따라 보관합니다.</p>`;
 if(!user)return details+`<section><h2>삭제 신청</h2><p>AIFECT에 로그인한 뒤 계정 설정에서 ‘계정 삭제’를 선택해 주세요.</p><a href="/#account/delete">로그인하고 계정 확인하기</a></section>
 <p>로그인이 어렵다면 <a href="${supportLink('회원 탈퇴·개인정보 삭제 요청')}">고객센터에 삭제 요청</a>을 보내 본인 확인을 진행할 수 있습니다.</p>`;
 return details+`<form id="delete-account" data-account="${esc(user.id)}" autocomplete="off">
 <h2>삭제할 계정</h2><p><strong>${esc(user.name)}</strong> · ${esc(user.email?.endsWith('.invalid')?'소셜 로그인 계정':user.email||'')}</p>
 <label for="delete-confirmation">영구 삭제에 동의하면 아래에 <strong>DELETE</strong>를 입력해 주세요.</label>
 <input id="delete-confirmation" name="confirmation" required pattern="DELETE" maxlength="6" spellcheck="false" autocomplete="off">
 <button type="submit" id="delete-submit" disabled>계정 영구 삭제</button> <a href="/#account">취소</a><p id="delete-status" role="alert"></p>
 <noscript>계정을 삭제하려면 자바스크립트를 켜거나 고객센터에 문의해 주세요.</noscript></form>`;
}

export function accountPageRoute(req,path,user=null){
 if(!['/account/delete','/account/recovery'].includes(path)||!['GET','HEAD'].includes(req.method))return null;
 const deleting=path==='/account/delete', title=deleting?'AIFECT 계정 삭제':'로그인 · 비밀번호 복구 도움말';
 const body=deleting?deleteContent(user):recovery;
 const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | AIFECT</title><link rel="canonical" href="https://aifect.co.kr${path}"><link rel="stylesheet" href="/design-system.css"><link rel="stylesheet" href="/policies.css"><link rel="stylesheet" href="/scroll-top.css"><script defer src="/scroll-top.js"></script><link rel="stylesheet" href="/brand.css">${user?'<script defer src="/account-deletion.js"></script>':''}</head><body class="legal-site"><header class="legal-header"><a class="legal-brand" href="/#home" aria-label="AIFECT 홈"><img class="aifect-wordmark-logo" src="/assets/aifect-wordmark.svg" width="148" height="36" alt="AIFECT"></a><a href="/#account">내 계정</a></header><main class="legal-content account-help"><h1>${title}</h1>${body}</main><footer class="page-footer">${businessFooterHTML()}</footer></body></html>`;
 return new Response(req.method==='HEAD'?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin','content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'"}});
}
