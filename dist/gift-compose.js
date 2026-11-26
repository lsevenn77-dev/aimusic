function giftQuantityControls() {
 return `<div class="gift-compose-quantity" role="group" aria-labelledby="gift-compose-quantity-label">
  <span id="gift-compose-quantity-label" class="gift-compose-label">수량</span>
  <div class="gift-compose-quantity-row">
   <button type="button" data-gift-quantity="less" aria-label="수량 줄이기">−</button>
   <output aria-labelledby="gift-compose-quantity-label">1</output>
   <button type="button" data-gift-quantity="more" aria-label="수량 늘리기">+</button>
   <button type="button" data-gift-quantity="max" aria-label="최대 수량 선택">최대</button>
  </div>
 </div>`;
}

function giftRecipientField() {
 return `<section class="gift-compose-recipients">
  <label class="gift-compose-label" for="gift-compose-query">받는 사람</label>
  <input type="search" id="gift-compose-query" name="query" maxlength="60" autocomplete="off" autocapitalize="none"
    spellcheck="false" enterkeyhint="search" placeholder="닉네임 또는 ID 검색">
  <h3 id="gift-compose-people-title">추천 받는 사람</h3>
  <p class="gift-compose-people-status" role="status">불러오는 중…</p>
  <div class="gift-compose-people" role="group" aria-labelledby="gift-compose-people-title"></div>
 </section>`;
}

function bindGiftRecipients(form, {active, signal, selected}) {
 const search = form.elements.query;
 const list = form.querySelector('.gift-compose-people');
 const title = form.querySelector('#gift-compose-people-title');
 const status = form.querySelector('.gift-compose-people-status');
 let results = [], timer, request;

 function lookup(delay = 0) {
  clearTimeout(timer);
  request?.abort();
  const query = search.value.trim();
  const current = new AbortController();
  request = current;
  title.textContent = query ? '검색 결과' : '추천 받는 사람';
  list.replaceChildren();
  list.setAttribute('aria-busy', 'true');
  status.textContent = '불러오는 중…';
  results = [];
  timer = setTimeout(async () => {
   try {
    const params = new URLSearchParams({scope:'gift',q:query});
    const response = await api('/api/decorations/recipients?'+params, 'GET', undefined, {fresh:true,signal:current.signal});
    if (current.signal.aborted || !active()) return;
    results = query ? response.profiles : response.profiles.slice(0,6);
    list.innerHTML = results.map(p => `<button type="button" class="gift-compose-person" data-gift-person="${esc(p.id)}" aria-pressed="false">
     <span class="gift-compose-avatar" aria-hidden="true">${avatarImage(p,'producer',false,false)}</span>
     <span class="gift-compose-person-info"><strong>${esc(p.name)}</strong><small>${esc(p.public_id || p.public_number || 'ID 확인 중')}</small></span>
     <span class="gift-compose-check" aria-hidden="true">${icon('check',16)}</span>
    </button>`).join('');
    status.textContent = results.length ? '' : query ? AifectMessages.searchEmpty : '추천할 회원이 없습니다. 검색해서 선택해 주세요.';
   } catch (error) {
    if (current.signal.aborted || !active()) return;
    status.textContent = error instanceof TypeError ? '검색 서버에 연결할 수 없습니다.' : error.message;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'text-link gift-compose-retry';
    retry.textContent = '다시 시도';
    retry.onclick = () => lookup();
    list.append(retry);
   } finally {
    if (request === current && active()) list.removeAttribute('aria-busy');
   }
  }, delay);
 }

 search.oninput = event => {
  if (event.isComposing) return;
  selected(null);
  lookup(180);
 };
 search.onkeydown = event => {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  selected(null);
  lookup();
 };
 list.onclick = event => {
  const row = event.target.closest('[data-gift-person]');
  if (!row || !active()) return;
  selected(results.find(p => p.id === row.dataset.giftPerson));
  for (const option of list.querySelectorAll('[data-gift-person]')) {
   option.setAttribute('aria-pressed', String(option === row));
  }
  if (document.activeElement === search) search.blur();
 };
 signal.addEventListener('abort', () => {
  clearTimeout(timer);
  request?.abort();
 });
 lookup();
}

// Both forms use the same controls and retry handling. Each supplies its own
// limits, summary, and existing server transaction.
function bindGiftCompose(form, {serial, account, initialQuantity = 1, maximum, summary, transfer, refresh}) {
 const modal = $('#dialog'), close = $('#dialog-close'), error = formError(form);
 const submit = form.querySelector('[type="submit"]');
 const label = submit.textContent;
 const field = form.querySelector('.gift-compose-quantity');
 const quantityOutput = field.querySelector('output');
 const less = field.querySelector('[data-gift-quantity="less"]');
 const more = field.querySelector('[data-gift-quantity="more"]');
 const max = field.querySelector('[data-gift-quantity="max"]');
 const controls = new AbortController();
 const route = location.hash;
 const active = () => form.isConnected && modal.open && serial === giftDialogSerial && me?.id === account && route === location.hash;
 let quantity = initialQuantity, recipient, busy = false, pending;

 function update(count = quantity) {
  const available = maximum();
  if (!pending) quantity = Math.max(1, Math.min(count, available));
  quantityOutput.value = number(quantity);
  less.disabled = busy || !!pending || quantity <= 1;
  max.disabled = more.disabled = busy || !!pending || quantity >= available;
  submit.disabled = busy || !pending && (!recipient || quantity > available);
  summary(quantity, available);
 }

 function changeQuantity(count) {
  if (!active() || busy || pending) return;
  error.textContent = '';
  update(count);
 }
 less.onclick = () => changeQuantity(quantity-1);
 more.onclick = () => changeQuantity(quantity+1);
 max.onclick = () => changeQuantity(maximum());
 bindGiftRecipients(form, {active,signal:controls.signal,selected(profile) {
  if (busy || pending) return;
  recipient = profile;
  error.textContent = '';
  update();
 }});

 function setBusy(value) {
  busy = value;
  close.disabled = value;
  if (value) submit.setAttribute('aria-busy','true');
  else submit.removeAttribute('aria-busy');
  form.elements.query.disabled = value || !!pending;
  form.querySelector('.gift-compose-people').inert = value || !!pending;
  submit.textContent = value ? '처리 중…' : pending ? '거래 결과 다시 확인' : label;
  update();
 }
 form.onsubmit = async event => {
  event.preventDefault();
  if (!active() || busy || !pending && (!recipient || quantity > maximum())) return;
  setBusy(true);
  error.textContent = '';
  try {
   if (!pending) {
    const {path,body,review} = transfer(quantity,recipient);
    if (!await confirmGiftTransfer({...review,composeAction:label}) || !active()) return;
    pending = {path,body:{...body,request_id:crypto.randomUUID()}};
   }
   await api(pending.path,'POST',pending.body);
   pending = undefined;
   if (active()) finishGiftTransfer();
  } catch (reason) {
   const uncertain = !!pending && (!reason.status || reason.status === 408 || reason.status >= 500);
   if (!uncertain) pending = undefined;
   if (active()) error.textContent = uncertain ?
    reason.message+' 같은 요청 번호로 거래 결과를 다시 확인해 주세요.' : reason.message;
   if (!uncertain && active() && refresh && [404,409].includes(reason.status)) {
    try { await refresh(); } catch { /* Keep the transaction failure visible. */ }
   }
  } finally {
   if (active()) setBusy(false);
   else close.disabled = false;
  }
 };
 modal.addEventListener('cancel', event => {
  if (busy && active()) event.preventDefault();
 }, {signal:controls.signal});
 modal.addEventListener('click', event => {
  if (event.target === modal && !busy && active()) modal.close();
 }, {signal:controls.signal});
 modal.addEventListener('close', () => {
  if (!active()) controls.abort();
 }, {signal:controls.signal});
 update();
 form.closest('.gift-compose').querySelector('h2').focus({preventScroll:true});
 return update;
}
