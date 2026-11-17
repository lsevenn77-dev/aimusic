import { aboutIcon as icon } from './about-icons.js';
import { BUSINESS, PREMIUM, APP_PREMIUM, escapeHTML as esc } from '../shared/site-info.js';
import { WEB_GOLD_PACKS, WEB_GOLD_BONUS_PERCENT } from '../shared/gifts.js';
import { playlistLimit } from './membership.js';
import { uploadQuotaResult } from './upload-limits.js';

const routes = new Set(['/pricing','/privacy','/contact','/terms','/refund']);
export const isGuidePath = path => routes.has(path.replace(/\/$/,''));
const arrow = icon('arrow-right');
const money = n => n.toLocaleString('ko-KR');
const mail = subject => `mailto:${BUSINESS.email}?subject=${encodeURIComponent('[AIFECT] '+subject)}`;
const more = (label,body) => `<details class="guide-fold"><summary>${label}</summary><div>${body}</div></details>`;
const link = (href,text) => `<a class="guide-link" href="${href}">${text}${arrow}</a>`;
const tag = text => `<span class="guide-tag">${text}</span>`;

const privacyIndexLabels = {
  data: '수집 항목과 처리 목적',
  overseas: '국외 이전·처리',
  officer: '보호책임자 및 연락처',
};

function policyDocument(body, title, {label = title, indexLabels = {}} = {}) {
  const clauses = [...body.matchAll(/<section id="([\w-]+)"><h2>([^<]+)<\/h2>/g)];
  if (!clauses.length) return null;
  const intro = body.slice(0,clauses[0].index);
  const date = intro.match(/^<p class="legal-fine">[^<]+<\/p>/)?.[0] || '';
  const links = clauses.map(([,id,heading])=>{
    const numbered = heading.match(/^(\d+)\. (.+)$/);
    const name = indexLabels[id] ?? numbered?.[2] ?? heading;
    return `<a href="#${id}"><span aria-hidden="true">${numbered ? numbered[1].padStart(2,'0') : '＋'}</span>${esc(name)}</a>`;
  }).join('');
  const toc = `<nav aria-label="조항 목차" class="guide-index">${links}</nav>`;
  return {title, label, meta:date,
    body:`<div class="guide-reading"><aside class="guide-rail"><div class="guide-desktop-toc"><h2>${icon('list-music')}조항 목차</h2>${toc}</div><details class="guide-mobile-toc"><summary>전체 목차 보기</summary>${toc}</details></aside><article class="guide-clauses">${body.slice(date.length)}</article></div>`};
}

function plan(paid) {
  const member = paid ? {premium_until:Number.MAX_SAFE_INTEGER} : null;
  const limit = playlistLimit(member), uploads = uploadQuotaResult(member,0).limit;
  const rows = [
    ['음악 스트리밍',paid?'전체곡 · 최대 AAC 256kbps':'로그인 후 전체곡 · AAC 128kbps'],
    ['가사',paid?'전체 가사 · 싱크 가사 따라가기':'곡 상세에서 전체 가사'],
    ['내 플레이리스트',`최대 ${limit}개`],['제작곡 업로드',`월 ${uploads}곡`],
    ['커버곡 업로드','횟수 제한 없음'],['광고',paid?'없음':'감상·업로드 시 표시될 수 있음'],
    ['Premium 전용',paid?'가사 구간 이동 · 음색 보정 · 구간 재녹음':'제공하지 않음']
  ];
  const name=paid?'Premium':'FREE';
  return `<article id="plan-${paid?'premium':'free'}" class="guide-plan guide-card${paid?' is-premium':''}"><div class="guide-plan-name">${icon(paid?'disc-3':'headphones')}<h2>${name}</h2>${tag(paid?'월간 이용권':'무료 이용권')}</div><p class="guide-price">${paid?`<small>웹 월</small> ${money(PREMIUM.price)}`:'0'}<small>원</small></p><p class="guide-meta">${paid?'부가세 포함 · 매월 자동갱신':'기본 이용권 · 정기결제 없음'}</p>
    <dl class="guide-compare">${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${paid?`<p data-plan-note>${PREMIUM.catalogVisible?'가입 가능 여부는 내 구독에서 확인하세요.':'웹 Premium 신규 가입 준비 중'}</p><a class="guide-btn" data-plan-cta data-sales="${PREMIUM.catalogVisible}" href="/#membership">이용 혜택 · 내 구독 확인${arrow}</a>`:`<p>좋아요 · 창작자 팔로우 · 댓글</p>${link('/#account','무료로 시작하기')}`}</article>`;
}

function pricing(body) {
  // Keep the origin's full disclosures, merchant review routes, and fragment IDs.
  const parts = [...body.matchAll(/<section id="([\w-]+)"><h2>([^<]+)<\/h2>([\s\S]*?)<\/section>/g)];
  const byId = new Map(parts.map(p=>[p[1],p]));
  if (!['gold-products','toss-test','creator-policy','subscription-revenue','app-pricing','cancel'].every(k=>byId.has(k))) return null;
  const aux = body.match(/<div class="support-actions">[\s\S]*?<\/div>$/)?.[0] || '';
  const block = (id,content) => `<section class="guide-block" id="${id}">${content}</section>`;
  const gold=byId.get('gold-products');
  const packs=`<div class="guide-packs">${WEB_GOLD_PACKS.map(p=>`<a class="guide-card guide-pack" href="/#gold?pack=${p.gold}"><span>기본 ${money(p.gold)}G</span><strong>${money(p.total_gold)} <small>G</small></strong><p>웹 추가 +${money(p.bonus_gold)}G</p><b>${money(p.price)}원 ${arrow}</b></a>`).join('')}</div>`;
  const creator=byId.get('creator-policy'), split=creator[3].indexOf('<h3>');
  const creatorCopy=split<0?creator[3]:creator[3].slice(0,split)+more('파트너 승급 · 다이아 전환 및 정산 조건',creator[3].slice(split));
  const renew=byId.get('subscription-revenue'),cancel=byId.get('cancel'),app=byId.get('app-pricing'),review=byId.get('toss-test');
  const extra = parts.filter(p=>!['gold-products','creator-policy','subscription-revenue','app-pricing','cancel','toss-test'].includes(p[1])).map(p=>more(p[2],`<div id="${p[1]}">${p[3]}</div>`)).join('');
  return {title:'AIFECT 이용권 안내',label:'이용권 · 가격',lead:'무료와 Premium의 감상·창작 혜택을 비교하고, 웹과 앱의 결제 조건을 확인하세요.',body:`<nav class="guide-plan-jump" aria-label="이용권별 혜택 바로가기"><a href="#plan-free"><b>FREE</b>0원</a><a href="#plan-premium"><b>Premium</b>웹 월 ${money(PREMIUM.price)}원</a></nav><div class="guide-plans">${plan(false)}${plan(true)}</div>
    <div class="guide-market" id="app-pricing"><div>${tag('모바일 앱')} <strong>앱 Premium 월 ${money(APP_PREMIUM.price)}원</strong><p>앱 상품 설정가입니다. 실제 판매 여부와 최종 가격은 Google Play·App Store에서 확인하세요.</p></div>${link('/pricing/app','앱마켓 상품 · 가격 안내')}</div>
    ${more('음질·가사와 이용 한도 자세히 보기','<p>비로그인은 공개곡 60초 미리듣기, 로그인 후에는 전체곡 감상이 가능합니다. 고음질 파일이 준비되지 않은 곡은 AAC 128kbps로 재생됩니다. 전체 가사는 가사가 등록된 곡에서, 자동 스크롤과 구간 이동은 싱크가 등록된 곡에서 이용할 수 있습니다. 하단 재생바 가사는 PC 웹 2줄, 모바일 웹 1줄로 표시됩니다.</p><p>플레이리스트 한도는 내가 직접 만든 목록에 적용됩니다. 제작곡 한도는 한국시간 기준 매월 적용됩니다.</p>')}${extra}
    ${block('gold-products',`<div class="guide-block-head"><h2>골드 충전</h2>${tag(`웹 +${WEB_GOLD_BONUS_PERCENT}%`)}</div>${gold[3].replace(/<div class="legal-table-wrap"[\s\S]*?<\/table><\/div>/,packs).replace('<a href="/#gold">','<a class="guide-btn" href="/#gold">')}`)}
    ${block('creator-policy',`<h2>창작자 수익 및 정산</h2>${creatorCopy}<div id="subscription-revenue">${more(renew[2],renew[3])}</div>`)}
    ${block('cancel',`<h2>결제·해지 안내</h2><p>Premium은 월 단위 정기결제이며 골드는 선택한 금액만 한 번 결제합니다.</p>${more('정기결제를 해지하면 음악과 플레이리스트는 어떻게 되나요?',cancel[3])}${more('앱마켓에서 결제한 상품은 어디서 관리하나요?',app[3]+'<p>앱 구독은 구매한 스토어의 구독 관리에서 확인하세요.</p>')}${more('환불은 어디에서 요청할 수 있나요?',`<p>결제한 경로에 따라 <a href="/refund">환불 · 해지 정책</a>을 확인한 후 <a href="${mail('환불·정기결제 해지 요청')}">고객센터에 요청</a>하세요.</p>`)}${aux}`)}
    <aside class="guide-review" id="toss-test">${more(review[2],review[3])}</aside>`};
}

function support() {
  const types=[
    ['headphones','일반 이용 문의','음악 감상, 보관함, 서비스 이용 방법을 문의하세요.','서비스 이용 문의'],
    ['wallet','결제 및 환불·구독 해지','이용권, 골드 결제 내역이나 구독 해지를 문의하세요.','환불·정기결제 해지 요청'],
    ['shield-check','개인정보 및 계정 삭제','개인정보 열람·정정, 탈퇴 또는 계정 삭제를 요청하세요.','개인정보 열람·삭제·탈퇴 요청'],
    ['flag','콘텐츠 신고 및 권리 침해','신고할 곡이나 게시물의 링크와 사유를 알려주세요.','콘텐츠 권리 침해 신고'],
    ['settings','오류 및 기술 문제','문제가 생긴 화면과 기기, 브라우저 또는 앱 버전을 알려주세요.','오류 및 기술 문제']
  ];
  const help=[['/pricing','이용권 · 가격'],['/refund','환불 · 해지 정책'],['/privacy','개인정보처리방침'],['/account/recovery','로그인 · 비밀번호 도움말'],['/account/delete','계정 삭제'],['/#membership','내 구독 관리'],['/terms','이용약관']];
  return {title:'무엇을 도와드릴까요?',label:'고객센터',lead:'이용 문의와 신고·환불·계정 관련 요청 안내',body:`<div class="guide-support"><section><h2>문의 유형 선택</h2><div class="guide-requests">${types.map(([i,t,d,s])=>`<article class="guide-card guide-request"><span class="guide-tile">${icon(i)}</span><div><h3>${t}</h3><p>${d}</p></div><a class="guide-btn" aria-label="${t} 이메일 문의" href="${mail(s)}">문의하기${arrow}</a></article>`).join('')}</div></section>
    <aside class="guide-support-side"><div class="guide-card guide-contact"><span class="guide-label">연락처</span><h2>고객센터</h2><a class="guide-address" href="mailto:${BUSINESS.email}">${BUSINESS.email}</a><button type="button" data-copy-email="${BUSINESS.email}" class="guide-btn" hidden>이메일 주소 복사</button><span role="status" data-copy-status></span><div class="guide-phone">전화 <a href="tel:${BUSINESS.phone}">${BUSINESS.phone}</a></div></div>
    <div class="guide-help"><h2>자주 찾는 도움말</h2>${help.map(([url,label])=>link(url,label)).join('')}</div></aside></div>
    <section class="guide-block"><h2>문의 전 준비해주세요</h2><p>회신받을 이메일과 문의 내용을 적어주세요. 관련 곡·페이지 링크가 있으면 함께 보내주세요. 오류 문의에는 발생 시점, 기기와 앱·브라우저 버전, 재현 순서가 도움이 됩니다.</p><p>비밀번호, 카드번호, 주민등록번호는 보내지 마세요. 이메일 문의는 접수 순서에 따라 확인하며, 법정 처리 기한이 있는 요청은 해당 기한에 따라 처리합니다.</p></section>`};
}

// Same presentation boundary as /about: both supported renderers supply the
// branded header, policy nav, SEO, business footer and full legal document.
export function guidePresentation(html,path) {
  path=path.replace(/\/$/,'');
  if (!routes.has(path)) return html;
  const shell=/<header class="legal-header">(<a class="legal-brand"[\s\S]*?<\/a>)(<a href="[^"]+">[^<]+<\/a>)<\/header><main class="legal-content">[\s\S]*?<h1>([^<]+)<\/h1><p class="legal-lead">([^<]+)<\/p>(<nav class="legal-toc"[^>]*>[\s\S]*?<\/nav>)([\s\S]*?)<\/main>/;
  const match=html.match(shell);
  if (!match) return html;
  const [,brand,back,title,lead,nav,body]=match;
  let page;
  switch (path) {
    case '/pricing': page = pricing(body); break;
    case '/contact': page = support(); break;
    case '/privacy': page = policyDocument(body, title, {label:'개인정보', indexLabels:privacyIndexLabels}); break;
    default: page = policyDocument(body, title);
  }
  if (!page) return html;
  const menu=nav.replace('legal-toc','guide-nav').replace(/ aria-current="page"/g,'').replace(`href="${path}"`,`href="${path}" aria-current="page"`);
  const header=`<header class="guide-header"><div class="guide-wrap guide-bar">${brand}${back.replace('<a ','<a class="guide-back" ').replace('>음악',`>${icon('headphones')}음악`)}</div></header><div class="guide-nav-shell"><div class="guide-wrap">${menu}</div></div>`;
  const main=`<main id="guide-main" class="guide-wrap guide-main"><header class="guide-heading"><p class="guide-label">서비스 안내 <span aria-hidden="true">/</span> ${page.label}</p><h1>${page.title}</h1><p>${page.lead||lead}</p>${page.meta||''}</header>${page.body}</main>`;
  return html.replace(match[0],()=>header+main).replace('class="legal-site"','class="legal-site guide-page"')
    .replace('<script defer src="/footer-layout.js"></script>','')
    .replace('<script defer src="/scroll-top.js"></script>','')
    .replace('family=Manrope:wght@200&family=Noto+Sans+KR:wght@400','family=DM+Sans:wght@400;500;600;700&amp;family=Noto+Sans+KR:wght@400;500;600;700')
    .replace('</head>','<link rel="stylesheet" href="/ui-region-scale.css"><link rel="stylesheet" href="/guide-pages.css?v=2"><script defer src="/guide-pages.js?v=1"></script></head>')
    .replace('<header class="guide-header">','<header id="guide-top" class="guide-header">')
    .replace('</main>','<a class="guide-up guide-btn" href="#guide-top">↑ 맨 위로</a></main>');
}
