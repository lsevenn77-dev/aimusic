(() => {
  const ua = navigator.userAgent;
  if (window.top !== window || /AIFECT-(Android|iOS|Mobile)|; wv\)|bot\b|crawler|spider/i.test(ua)) return;
  if (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/.test(ua)) return;
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
      body: JSON.stringify({ day, token: state.token }), signal: AbortSignal.timeout(10000) });
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
