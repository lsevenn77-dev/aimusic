import {brandLinks, wordmark} from '../shared/web-brand.js';

export const APP_STORE_URL = 'https://apps.apple.com/kr/app/id6819654764';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=kr.co.aifect.app';
const downloadURL = 'https://aifect.co.kr/download';

export function appStoreForRequest(request) {
  const agent = request.headers.get('user-agent') || '';
  const platform = (request.headers.get('sec-ch-ua-platform') || '').replaceAll('"', '');
  if (/iPhone|iPad|iPod/i.test(agent) || /^iOS$/i.test(platform)) return APP_STORE_URL;
  if (/Android/i.test(agent) || /^Android$/i.test(platform)) return PLAY_STORE_URL;
  return null;
}

const desktopPage = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>아이팩트 앱 다운로드 | AIFECT</title>
<meta name="description" content="휴대폰에서 열면 아이폰은 App Store, 안드로이드는 Google Play의 아이팩트 앱으로 자동 연결됩니다.">
<link rel="canonical" href="${downloadURL}">
<meta property="og:type" content="website"><meta property="og:title" content="아이팩트 앱 다운로드">
<meta property="og:description" content="내 휴대폰에 맞는 스토어로 바로 연결됩니다.">
<meta property="og:url" content="${downloadURL}"><meta property="og:image" content="https://aifect.co.kr/assets/brand/20261117/aifect-share.webp">
${brandLinks}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&amp;family=Noto+Sans+KR:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="/design-system.css"><link rel="stylesheet" href="/app-download.css">
<script defer src="/app-download.js"></script></head>
<body class="app-download"><header><a href="/#home" aria-label="AIFECT 홈"><img src="${wordmark}" alt="AIFECT" width="184" height="40"></a></header>
<main><p class="download-eyebrow">AIFECT APP</p><h1>아이팩트를<br>휴대폰에서 만나보세요</h1>
<p class="download-description">휴대폰에서 아래 링크를 열면<br>내 기기에 맞는 스토어로 바로 연결됩니다.</p>
<div class="download-link"><label for="download-url">앱 다운로드 링크</label><input id="download-url" type="url" readonly value="${downloadURL}" aria-label="공유할 앱 다운로드 링크"><button id="copy-download-link" type="button">링크 복사</button></div>
<p id="download-status" role="status" aria-live="polite">아이폰은 App Store · 안드로이드는 Google Play</p>
<noscript><p>아이패드에서 자동 연결되지 않으면 <a href="${APP_STORE_URL}">App Store에서 열기</a>를 눌러 주세요.</p></noscript>
<a class="download-web" href="/#home">웹에서 아이팩트 둘러보기 <span aria-hidden="true">→</span></a></main>
<footer><span>© AIFECT</span><nav aria-label="서비스 안내"><a href="/privacy">개인정보처리방침</a><a href="/contact">고객센터</a></nav></footer></body></html>`;

export function appDownloadRoute(request, path = new URL(request.url).pathname) {
  if (!['/download', '/download/'].includes(path)) return null;
  const headers = new Headers({'cache-control':'private, no-store', 'vary':'User-Agent, Sec-CH-UA-Platform', 'x-content-type-options':'nosniff'});
  if (!['GET', 'HEAD'].includes(request.method)) {
    headers.set('allow', 'GET, HEAD');
    return new Response(null, {status:405, headers});
  }
  const destination = appStoreForRequest(request);
  if (destination) {
    headers.set('location', destination);
    return new Response(null, {status:302, headers});
  }
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(request.method === 'HEAD' ? null : desktopPage, {headers});
}
