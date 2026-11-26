// 가입 경로(유입 출처) 기록 — server/signup-source.js 로 넣는다.
// 1) 사이트에 ?src=yt 처럼 들어오면 첫 방문 출처를 쿠키(aifect_src, 30일)로 남긴다.
// 2) 새 계정을 만들 때 그 쿠키 값을 users.signup_source 에 한 번만 기록한다.
const SRC_RE = /^[a-z0-9_-]{1,24}$/;
const COOKIE = 'aifect_src';

export function cleanSource(value) {
  const v = String(value || '').trim().toLowerCase();
  return SRC_RE.test(v) ? v : null;
}

function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function sourceFromRequest(req) {
  return cleanSource(readCookie(req, COOKIE));
}

// 페이지 응답에 출처 쿠키를 붙인다. 이미 출처 쿠키가 있으면(첫 방문 우선) 그대로 둔다.
export function withSourceCookie(req, response) {
  const url = new URL(req.url);
  const src = cleanSource(url.searchParams.get('src')) || cleanSource(url.searchParams.get('utm_source'));
  const previous = sourceFromRequest(req);
  if (!src || (previous && previous !== 'no_referrer')) return response;
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'private, no-store');
  headers.append('set-cookie', `${COOKIE}=${src}; Path=/; Max-Age=2592000; SameSite=None; Secure`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// 새로 만든 계정에만 기록한다(이미 값이 있으면 덮어쓰지 않음). 출처가 없으면 fallback(예: 앱 전용 로그인 'app').
export async function rememberSignupSource(env, req, userId, fallback = null) {
  const src = sourceFromRequest(req) || fallback;
  if (!src || !userId) return;
  await env.DB.prepare('UPDATE users SET signup_source=? WHERE id=? AND signup_source IS NULL').bind(src, userId).run();
}
