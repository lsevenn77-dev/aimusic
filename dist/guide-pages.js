(() => {
  const nav = document.querySelector('.guide-nav');
  const selected = nav?.querySelector('[aria-current="page"]');
  const showTab = () => {
    if (!selected || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft += selected.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - selected.offsetWidth)/2;
  };
  showTab();
  document.fonts?.ready.then(showTab);
  const toc = document.querySelector('.guide-rail');
  if (toc) {
    const mobile = toc.querySelector('details');
    const links = [...toc.querySelectorAll('a[href^="#"]')];
    const items = [...document.querySelectorAll('.guide-clauses section[id]')];
    let scheduled = false;
    const update = () => {
      scheduled = false;
      let current = items[0];
      for (const item of items) {
        if (item.getBoundingClientRect().top > 48) break;
        current = item;
      }
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = items.at(-1);
      for (const a of links) {
        if (a.hash === '#'+current.id) a.setAttribute('aria-current','location');
        else a.removeAttribute('aria-current');
      }
      const active = toc.querySelector('.guide-desktop-toc [aria-current="location"]');
      if (active && active.parentElement.clientHeight) {
        const pane = active.parentElement, p = pane.getBoundingClientRect(), r = active.getBoundingClientRect();
        if (r.top < p.top) pane.scrollTop += r.top - p.top;
        else if (r.bottom > p.bottom) pane.scrollTop += r.bottom - p.bottom;
      }
    };
    const schedule = () => {if (!scheduled) {scheduled=true;requestAnimationFrame(update);}};
    addEventListener('scroll',schedule,{passive:true});
    addEventListener('resize',schedule);
    toc.addEventListener('click',e=>{
      const a=e.target.closest('a[href^="#"]');
      if (!a) return;
      if (mobile?.open) mobile.open=false;
      const target=document.getElementById(a.hash.slice(1));
      if (target) {target.tabIndex=-1;target.focus({preventScroll:true});}
    });
    update();
  }
  const copy = document.querySelector('[data-copy-email]');
  if (copy) {
    copy.hidden=false;
    copy.addEventListener('click',async()=>{
      const address = document.querySelector('.guide-address'), status = document.querySelector('[data-copy-status]');
      try {
        await navigator.clipboard.writeText(copy.dataset.copyEmail);
        status.textContent='이메일 주소를 복사했습니다.';
      } catch {
        const range=document.createRange();range.selectNodeContents(address);
        const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
        let copied=false;
        try {copied=document.execCommand('copy');} catch {copied=false;}
        status.textContent=copied?'이메일 주소를 복사했습니다.':'선택된 이메일 주소를 복사해주세요.';
      }
    });
  }
  const cta=document.querySelector('[data-plan-cta]');
  if (cta) {
    const get=async path=>{
      const response=await fetch(path,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new Error('상태 확인 불가');
      return response.json();
    };
    const describe=async()=>{
      const [{membership},billing]=await Promise.all([get('/api/membership'),get('/api/billing/status')]);
      if (!membership || !billing) return;
      const note=document.querySelector('[data-plan-note]');
      const active=membership.plan==='premium', sub=billing.subscription;
      if (active || sub) {
        cta.firstChild.textContent=active?'내 이용권 관리':'내 구독·결제 내역 확인';
        note.textContent=active?(sub?.renewing?'Premium 이용 중 · 자동갱신 설정됨':sub?.state==='active'?'Premium 이용 중 · 자동갱신 해지됨':'Premium 이용 중'):'기존 구독 내역을 확인할 수 있습니다.';
      } else if (cta.dataset.sales==='true' && billing.checkout_available===true && !billing.review_only && !window.Capacitor?.isNativePlatform?.()) {
        cta.firstChild.textContent='이용 혜택 · 가입 조건 확인';
        note.textContent='가입 조건과 결제 일정은 내 구독에서 확인하세요.';
      } else {
        cta.firstChild.textContent='이용 혜택 · 내 구독 확인';
        note.textContent='웹 Premium 신규 가입 준비 중';
      }
    };
    describe().catch(()=>{}); // Keep the read-only, server-rendered management link on failure.
  }
})();
