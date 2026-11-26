(() => {
  const ua = navigator.userAgent;
  if (window.top !== window || /AIFECT-(Android|iOS|Mobile)|; wv\)|bot\b|crawler|spider/i.test(ua)) return;
  if (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/.test(ua)) return;
  // Read only the source tag and referring host; never transmit a full landing or referrer URL.
  function landingSource() {
    const page = new URL(location.href);
    const fragment = new URLSearchParams(page.hash.split('?')[1] || '');
    for (const name of ['src', 'utm_source']) {
      for (const params of [page.searchParams, fragment]) {
        const value = (params.get(name) || '').trim().toLowerCase();
        if (/^[a-z0-9_-]{1,24}$/.test(value)) return value;
      }
    }
    let host = '';
    try { host = new URL(document.referrer).hostname.toLowerCase(); } catch {}
    const matches = domain => host === domain || host.endsWith('.' + domain);
    if (matches('aifect.co.kr') || host === page.hostname) return 'internal';
    // Authentication providers return the user to our app. That return is not an acquisition.
    if (['accounts.google.com','kauth.kakao.com','appleid.apple.com'].some(matches)) return 'internal';
    for (const [channel, domains] of [
      ['youtube',['youtu.be','youtube.com']], ['ig',['instagram.com']],
      ['naver',['naver.com','naver.me']], ['google',['google.com','google.co.kr']],
      ['kakao',['kakao.com','kakaocdn.net']], ['daum',['daum.net']],
      ['facebook',['facebook.com','fb.com']], ['x',['x.com','twitter.com','t.co']],
      ['tiktok',['tiktok.com']], ['bing',['bing.com']]
    ]) if (domains.some(matches)) return channel;
    if (host) return 'other_referral';
    if (/KAKAOTALK/i.test(ua)) return 'kakao_browser';
    if (/Instagram/i.test(ua)) return 'ig_browser';
    return 'no_referrer';
  }
  const source = landingSource();
  // Keep the first identifiable signup source for 30 days across email and social login.
  const prior = document.cookie.match(/(?:^|; *)aifect_src=([^;]+)/)?.[1];
  if ((!prior || prior === 'no_referrer') && source !== 'internal' && prior !== source)
    document.cookie = 'aifect_src=' + source + '; Path=/; Max-Age=2592000; SameSite=None; Secure';
  const key = 'aifect.dailyVisit';
  let pending = false;
  let completed;
  let skew = 0;
  async function report() {
    if (document.visibilityState !== 'visible' || document.prerendering || /^#(?:admin|ops)(?:[/?]|$)/.test(location.hash)) return;
    const day = Math.floor((Date.now() + 32400000) / 86400000) + skew;
    if (completed === day) return;
    let state;
    try { state = JSON.parse(localStorage.getItem(key)); } catch { /* Missing or old local state. */ }
    if (state?.day !== day || typeof state.token !== 'string') {
      state = { day, token: crypto.randomUUID() };
      localStorage.setItem(key, JSON.stringify(state));
    }
    if (state.sent) { completed = day; return; }
    const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, token: state.token, source }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) return;
    const result = await response.json();
    if (result.recorded && result.day === day) {
      completed = day;
      localStorage.setItem(key, JSON.stringify({ ...state, sent: true }));
    } else if (Number.isSafeInteger(result.day)) skew += result.day - day;
  }
  async function check() {
    if (pending || document.visibilityState !== 'visible') return;
    pending = true;
    try { if (navigator.locks) await navigator.locks.request(key, report); else await report(); }
    catch { /* Storage or network unavailable. Retry when the page is visible. */ }
    finally { pending = false; }
  }
  for (const event of ['pageshow','hashchange','online']) window.addEventListener(event, check);
  document.addEventListener('visibilitychange', check);
  setInterval(check, 60000);
  check();
})();
