// One server-owned menu for web and native clients. Gameplay/score rules stay
// in each game service; this catalog controls discovery, never entitlements.
const games = [
 {id:'rhythm',title:'리듬게임',subtitle:'Double Tap',art:'/crew-rhythm/cover.webp'},
 {id:'jump',title:'점프게임',subtitle:'별빛 점프',art:'/crew-jump-art/arcade-cheer.webp'},
 {id:'racing',title:'레이싱게임',subtitle:'크루 레이싱',art:'/crew-racing/cover.svg'},
 {id:'fishing',title:'낚시게임',subtitle:'별물결 낚시터',art:'/crew-fishing/art/shore.svg'}
];
const DAY=86400000,WEEK=7*DAY,KST=9*3600000;
const ids=value=>[...new Set(String(value).split(',').map(s=>s.trim()).filter(id=>games.some(g=>g.id===id)))];
export function crewGameCatalog(env={},crew,ms=Date.now()){
 const local=new Date(ms+KST),date=local.toISOString().slice(0,10);
 const monday=Date.parse(date)-(local.getUTCDay()+6)%7*DAY;
 const week=new Date(monday).toISOString().slice(0,10);
 const mode=env.CREW_GAME_MENU_MODE==='weekly'?'weekly':'test';
 const rotation=env.CREW_GAME_ROTATION===undefined?games.map(g=>g.id):ids(env.CREW_GAME_ROTATION);
 const configured=env.CREW_GAME_ROTATION_ANCHOR||'2026-11-02';
 const anchor=/^\d{4}-\d{2}-\d{2}$/.test(configured)?Date.parse(configured):NaN;
 const validAnchor=Number.isFinite(anchor)&&new Date(anchor).toISOString().slice(0,10)===configured&&new Date(anchor).getUTCDay()===1;
 const index=validAnchor?Math.floor((monday-anchor)/WEEK):-1;
 const selected=env.CREW_GAME_VISIBLE_IDS!==undefined?ids(env.CREW_GAME_VISIBLE_IDS):mode==='test'?games.map(g=>g.id):index>=0&&rotation.length?[rotation[index%rotation.length]]:[];
 const encoded=encodeURIComponent(crew);
 return {title:'이번 주 클랜게임',mode,week,ends_at:(monday-KST+WEEK)/1000,server_now:ms/1000,
  games:selected.map(id=>({...games.find(g=>g.id===id),route:`game/${id}/${crew}`,
   href:id==='jump'?`#crew-jump/${encoded}`:`/crew-${id}/?from=crew&crew=${encoded}`}))};
}
