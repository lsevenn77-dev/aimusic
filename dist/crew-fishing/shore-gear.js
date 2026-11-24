const key = 'aifect.phone.fishing-shop.v1';
export const items = [
  {id:'sturdy', type:'rod', name:'튼튼한 낚시대', currency:'S', price:100, luck:5, grip:[77,1376], eye:[1073,54]},
  {id:'star', type:'rod', name:'별빛 낚시대', currency:'S', price:500, luck:10, grip:[77,1376], eye:[1089,53]},
  {id:'moon', type:'rod', name:'달무리 낚시대', currency:'G', price:200, luck:15, grip:[88,1376], eye:[1079,54]},
  {id:'aurora', type:'rod', name:'오로라 낚시대', currency:'G', price:500, luck:20, grip:[77,1376], eye:[1084,63]},
  {id:'worm', type:'bait', name:'기본 미끼', currency:'S', price:100, luck:3, seconds:1, anchor:[.29,.145]},
  {id:'shrimp', type:'bait', name:'반짝 새우 미끼', currency:'S', price:500, luck:5, seconds:3, anchor:[.53,.185]},
  {id:'mint', type:'bait', name:'민트 웜 미끼', currency:'G', price:200, luck:7, seconds:4, anchor:[.85,.05]},
  {id:'neon', type:'bait', name:'네온 루어', currency:'G', price:500, luck:10, seconds:5, anchor:[.16,.60]}
];
export const itemById = id => items.find(item => item.id === id);
export const artUrl = item => './art/gear-' + item.id + '-' + item.type + '.webp';
const initial = () => ({owned:['star'], rod:'star', bait:null, S:1200, G:1400});
export function inventory() {
  const raw = localStorage.getItem(key);
  return raw === null ? initial() : JSON.parse(raw);
}
export function loadout() {
  let state;
  try { state = inventory(); } catch { state = initial(); }
  return {rod:itemById(state.rod) || itemById('star'), bait:itemById(state.bait)};
}
export function changeEquipment(id, action) {
  return navigator.locks.request(key, () => {
    const state = inventory(), item = itemById(id);
    if (!item) throw Error('장비를 찾을 수 없습니다.');
    const owned = state.owned.includes(id);
    if (action === 'buy') {
      if (owned) return state;
      if (state[item.currency] < item.price) throw Error('테스트 잔액이 부족합니다.');
      state[item.currency] -= item.price;
      state.owned.push(id);
    } else if (action === 'equip' && owned) {
      state[item.type] = id;
    } else if (action === 'remove' && item.type === 'bait' && state.bait === id) {
      state.bait = null;
    } else throw Error('먼저 장비를 구매해 주세요.');
    localStorage.setItem(key, JSON.stringify(state));
    return state;
  });
}
