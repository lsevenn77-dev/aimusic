export const CARS = [
  {id:'c2', name:'선셋쿠페', currency:'S', price:0, speedBonus:0},
  {id:'c3', name:'옐로머슬', currency:'S', price:200, speedBonus:2},
  {id:'c5', name:'아머머슬', currency:'S', price:500, speedBonus:4},
  {id:'c4', name:'포뮬러', currency:'G', price:50, speedBonus:6},
  {id:'c1', name:'화이트 GT', currency:'G', price:100, speedBonus:8},
  {id:'pearl', name:'펄크루저', currency:'G', price:200, speedBonus:10}
];
export const SPEED_RULES = 'kart2';

export function raceCalendar(ms = Date.now()) {
  const day = 86400000, date = new Date(ms + 9 * 3600000);
  const monday = Date.parse(date.toISOString().slice(0,10)) - ((date.getUTCDay()+6)%7)*day;
  const weeks = (monday - Date.UTC(2026,10,2))/(7*day);
  return {week:new Date(monday).toISOString().slice(0,10),course:['riverside','harbor','coast'][((weeks%3)+3)%3]};
}
