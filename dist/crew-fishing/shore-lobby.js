import {fishingLobby as officialLobby} from './lobby.js';
import {items, itemById, artUrl, inventory, changeEquipment} from './shore-gear.js';

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = new URL('./shore-shop.css', import.meta.url).href;
document.head.append(style);

const icon = id => '<svg class="fl-icon" aria-hidden="true"><use href="./art/lobby-icons.svg#'+id+'"/></svg>';
const fmt = value => value.toLocaleString('ko-KR');
export function fishingLobby(lobby, cast) {
  return `<nav class="fs-tabs" aria-label="별물결 낚시터">
    <button type="button" data-fs-tab="lobby" aria-controls="fs-lobby" aria-pressed="true">대기실</button>
    <button type="button" data-fs-tab="shop" aria-controls="fs-shop" aria-pressed="false">낚시 상점</button>
  </nav><div id="fs-lobby">${officialLobby(lobby,cast)}</div><div id="fs-shop" hidden></div>`;
}
function card(item,state) {
  const owned = state.owned.includes(item.id), equipped = state[item.type] === item.id;
  const action = equipped ? (item.type === 'bait' ? 'remove' : '') : owned ? 'equip' : 'buy';
  const label = equipped ? (item.type === 'bait' ? '장착 해제' : '장착 중') : owned ? '장착하기' : '구매하기';
  return `<article class="fs-item" data-equipped="${equipped}">
    <div class="fs-art fs-art-${item.type}"><img src="${artUrl(item)}" alt="" decoding="async"></div>
    <div class="fs-info"><h3>${item.name}</h3>
    <div class="fs-price"><span class="fs-coin ${item.currency}" aria-hidden="true">${item.currency}</span>${fmt(item.price)} ${item.currency}</div>
    <div class="fs-perks"><span>행운 +${item.luck}</span>${item.seconds ? '<span>입질 −'+item.seconds+'초</span>':''}</div></div>
    <button class="fs-action" data-fs-item="${item.id}" data-fs-action="${action}" aria-label="${item.name} ${label}" ${action?'':'disabled'}>${label}</button>
  </article>`;
}
function renderShop(root,state) {
  const sections = [['rod','낚시대','hook'],['bait','미끼','fish']].map(([type,title,symbol])=>
    `<section class="fs-section"><h2>${icon(symbol)} ${title}</h2>
      ${items.filter(item=>item.type===type).map(item=>card(item,state)).join('')}</section>`).join('');
  root.innerHTML = `<div class="fl-layout fs-layout">
    <section class="fl-hero fl-card fs-hero"><div class="fl-intro"><small>AIFECT CREW GAMES</small><h1>별물결 낚시터</h1><p>낚시 전용 상점</p></div>
    <div class="fs-wallet" aria-label="이 기기의 테스트 잔액"><b>테스트 잔액</b><span><i class="fs-coin S">S</i> ${fmt(state.S)} S</span><span><i class="fs-coin G">G</i> ${fmt(state.G)} G</span></div></section>
    ${sections}<details class="fs-rules"><summary>장비 효과 안내</summary><p>스킨은 모든 낚시에 표시됩니다. 연습 낚시에서는 낚시대와 미끼의 행운 합계만큼의 확률(%)로 한 번 더 추첨해 높은 등급을 선택합니다. 미끼는 입질 대기를 최소 1초까지 줄여 줍니다.</p></details>
    <div class="fs-feedback" role="status" aria-live="polite"></div></div>`;
}
function showTab(tab) {
  const lobby = document.getElementById('fs-lobby'), shop = document.getElementById('fs-shop');
  if (!lobby || !shop) return false;
  const opening = tab === 'shop';
  if (opening) {
    try { renderShop(shop,inventory()); }
    catch { shop.textContent = '테스트 상점 정보를 불러오지 못했습니다. 대기실로 돌아가 다시 열어 주세요.'; }
  }
  lobby.hidden = opening;
  shop.hidden = !opening;
  for (const b of document.querySelectorAll('.fs-tabs button')) b.setAttribute('aria-pressed', String(b.dataset.fsTab === tab));
  window.scrollTo(0,0);
  return true;
}
window.aifectFishingShopBack = () => {
  const shop = document.getElementById('fs-shop');
  return !!shop && !shop.hidden && showTab('lobby');
};
document.addEventListener('click',async event=>{
  const tab = event.target.closest('[data-fs-tab]');
  if (tab) { showTab(tab.dataset.fsTab); return; }
  const button = event.target.closest('button[data-fs-item]');
  const root = button?.closest('#fs-shop');
  if (!root || root.hidden || button.disabled) return;
  const item = itemById(button.dataset.fsItem), action = button.dataset.fsAction;
  button.disabled = true;
  try {
    const state = await changeEquipment(item.id,action);
    if (!root.isConnected || root.hidden) return;
    renderShop(root,state);
    const status = root.querySelector('[role=status]');
    status.textContent = item.name + (action==='buy'?' 구매 완료':action==='equip'?' 장착 완료':' 장착 해제');
    root.querySelector('[data-fs-item="'+item.id+'"]:not(:disabled)')?.focus({preventScroll:true});
  } catch {
    button.disabled = false;
    root.querySelector('[role=status]').textContent = '변경을 저장하지 못했습니다. 잔액을 확인하고 다시 시도해 주세요.';
  }
});
window.addEventListener('storage',()=>{const root=document.getElementById('fs-shop');if(root && !root.hidden)renderShop(root,inventory());});
