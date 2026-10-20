// Local suggestions do not consume AI quota or Gold.
const settings={
 'SF':['고장 난 우주 정거장','미래에서 도착한 음성 메시지','기억을 보관하는 연구소'],
 '이세계물':['낯선 세계의 여관','현실로 돌아가는 마지막 문','말하는 지도를 발견한 시장'],
 '판타지':['소원을 보관하는 마법 상점','시간이 멈춘 숲','잃어버린 용의 도서관'],
 '사극':['비 내리는 궁궐 기록고','암행어사가 찾은 주막','새벽의 성문'],
 '로맨스':['막차가 끊긴 정류장','첫눈이 내리는 서점','오래된 편지가 도착한 카페'],
 '액션':['탈출 직전의 열차','정전된 지하 통로','마지막 구조 신호가 잡힌 건물'],
 '코미디':['예약이 뒤바뀐 식당','가짜 탐정 사무소','엉뚱한 물건이 배달된 집'],
 '첩보':['암호가 틀린 비밀 접선 장소','기차 안의 작전실','이중 신분이 드러난 호텔'],
 '공포':['불 꺼진 학교 방송실','같은 층만 반복되는 엘리베이터','아무도 없는 심야 편의점'],
 '스릴러':['사라진 승객의 열차 칸','비밀 녹음이 발견된 사무실','한밤중 전화가 울리는 집'],
 '미스터리':['매일 다른 책이 놓이는 도서관','보내는 이가 없는 편지함','시계가 멈춘 골목'],
 '일상':['비 오는 동네 세탁소','폐점 직전의 작은 카페','이사를 앞둔 옥상'],
 '감동':['오래된 사진을 복원하는 가게','마지막 공연을 준비하는 연습실','다시 문을 여는 동네 영화관']
};
export function randomDubbingIdea(options,previous='',random=Math.random){
 const pick=a=>a[Math.min(a.length-1,Math.floor(random()*a.length))];
 const places=options.genres.flatMap(g=>settings[g]||settings.일상);
 const trouble=['서로 다르게 기억하는 사건을 마주한다','주인을 알 수 없는 물건을 발견한다','오늘 안에 전달해야 할 말을 꺼내지 못한다','예상치 못한 부탁을 받고 선택의 기로에 선다'];
 const ending=['뜻밖의 오해를 풀며 마무리','작은 단서로 반전을 남기는 결말','서로의 진심을 알아보는 따뜻한 결말','다음 만남을 약속하는 열린 결말'];
 let value='';
 for(let n=0;n<8;n++){
  value=`${pick(places)}에서 ${options.roleCount}명이 ${pick(trouble)}. ${options.genres.join(' · ')} 분위기로, 대화와 행동이 중심인 약 ${Math.round(options.minutes*60)}초의 이야기. ${pick(ending)}로 써주세요.`;
  if(value!==previous)return value;
 }
 return `${places[(places.indexOf(value)+1)%places.length]||places[0]}에서 ${options.roleCount}명이 작은 비밀을 함께 지켜내는 ${options.genres.join(' · ')} 이야기. 약 ${Math.round(options.minutes*60)}초, 유쾌한 반전으로 마무리해주세요.`;
}
export function simpleDubbingText(script,sceneId){
 return script.lines.filter(l=>l.sceneId===sceneId).map(l=>`${String.fromCharCode(65+script.roles.findIndex(r=>r.id===l.roleId))}: ${l.text}`).join('\n');
}
// Reconcile unchanged lines first so existing timing, IDs and sound anchors survive.
export function applySimpleDubbingText(script,sceneId,text){
 const s=structuredClone(script),old=s.lines.filter(l=>l.sceneId===sceneId),used=new Set();
 const parsed=[];
 for(const [index,raw] of text.split(/\r?\n/).entries()){
  if(!raw.trim())continue;
  const m=raw.match(/^\s*([A-Za-z])\s*[:：]\s*(.*)$/);
  if(!m){
   if(!parsed.length)throw new Error(`${index+1}번째 줄을 A: 대사 형식으로 적어주세요.`);
   const last=parsed.at(-1);
   last.text+='\n'+raw.trim();
   if(last.text.length>700)throw new Error(`${index+1}번째 대사는 700자까지 적을 수 있어요.`);
   continue;
  }
  const role=s.roles[m[1].toUpperCase().charCodeAt(0)-65];
  if(!role)throw new Error(`${index+1}번째 줄의 ${m[1].toUpperCase()} 배역이 없어요.`);
  if(!m[2].trim())throw new Error(`${index+1}번째 줄에 대사를 적어주세요.`);
  if(m[2].length>700)throw new Error(`${index+1}번째 대사는 700자까지 적을 수 있어요.`);
  parsed.push({roleId:role.id,text:m[2].trim()});
 }
 if(parsed.length+s.lines.length-old.length>120)throw new Error('대사는 최대 120개까지 적을 수 있어요.');
 const matched=parsed.map(p=>{const l=old.find(l=>!used.has(l.id)&&l.roleId===p.roleId&&l.text===p.text);if(l)used.add(l.id);return l;});
 const next=parsed.map((p,i)=>{
  let l=matched[i];
  if(!l){l=old[i];if(l&&!used.has(l.id)&&l.roleId===p.roleId)used.add(l.id);else l=null;}
  return {...(l||{id:crypto.randomUUID(),sceneId,emotion:'자연스럽게',direction:'',durationSeconds:Math.max(2,Math.min(40,Math.ceil(p.text.length/5))),gapSeconds:1}),...p};
 });
 s.lines=s.scenes.flatMap(sc=>sc.id===sceneId?next:s.lines.filter(l=>l.sceneId===sc.id));
 s.lines.forEach((l,i)=>l.order=i+1);
 const ids=new Set(s.lines.map(l=>l.id));s.soundCues=s.soundCues.filter(c=>ids.has(c.lineId)&&(!c.endLineId||ids.has(c.endLineId)));
 return s;
}
