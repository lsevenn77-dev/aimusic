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
const moreSettings={
 'SF':['꿈을 수리하는 궤도 공방','중력이 바뀌는 해저 도시','인간을 면접하는 로봇 법정','우주선의 씨앗 보관실','하루가 압축된 이주 행성','멸종 동물의 가상 보호구역'],
 '이세계물':['몬스터들이 운영하는 세무서','마법이 불법인 항구 도시','직업을 경매하는 공중 광장','환생자들의 분실물 센터','계절을 거래하는 국경역','용의 알을 돌보는 공동 주방','소환 계약을 해지하는 민원실','언어가 물건으로 변하는 사막'],
 '판타지':['달을 수선하는 대장간','그림자들이 사는 극장','바람을 기르는 온실','거인의 단추로 지은 마을','별자리가 내려오는 우물','마법을 잃은 축제의 무대'],
 '사극':['가뭄 속 수문 관리소','과거 시험 전날의 객주','가면극을 준비하는 장터','억울한 상소가 모인 서당','새 왕의 도장을 만드는 공방','사절단이 머무는 국경 초소'],
 '로맨스':['라이벌들의 꽃 경매장','동네 라디오의 임시 스튜디오','서로의 여행 가방이 바뀐 공항','철거를 앞둔 사진관','실수로 합석한 요리 수업','폐막 직전의 작은 전시회'],
 '액션':['폭풍 속 해상 구조선','붕괴 위험의 댐 제어실','추격을 피해 숨은 화물 창고','산불에 갇힌 관측소','폭주하는 배달 드론의 옥상','산사태 직전의 케이블카'],
 '코미디':['반려동물 통역 대회','초보 악당의 취업 면접','잘못 열린 동창회','말하는 냉장고 수리점','규칙이 바뀌는 보드게임 모임','외계인을 손님으로 맞은 미용실'],
 '첩보':['위장 결혼식의 대기실','사라진 필름을 찾는 극장','가짜 화폐 감정실','협상 전날의 대사관 주방','퇴직 요원들의 수선집','도청 장치가 섞인 경매장'],
 '공포':['내 목소리를 따라 하는 산장','문마다 시간이 다른 폐병원','손님 수가 줄지 않는 야간 버스','사진 속 사람이 사라지는 암실','박수가 멈추지 않는 빈 공연장','새벽마다 식탁이 차려지는 집'],
 '스릴러':['알리바이가 충돌하는 조사실','생방송이 끊긴 뉴스룸','익명 투표로 문이 열리는 대피소','목격자가 바뀌는 법정 복도','도주 차량을 고치는 정비소','거짓 경보가 울리는 기상 관제실'],
 '미스터리':['한 자리씩 늘어나는 식탁','없는 주소로 배달하는 우체국','매일 결말이 바뀌는 인형극장','동물이 증거를 가져오는 박물관','발자국이 거꾸로 남는 등대','사라진 악보를 찾는 음악 학교'],
 '일상':['첫 영업을 앞둔 푸드트럭','길고양이를 돌보는 주차장','주민들이 다투는 공동 텃밭','장마 전날의 자전거 수리점','야간 근무자의 휴게실','동네 운동회 준비실'],
 '감동':['청각 장애인을 위한 악기 공방','폐교의 마지막 급식실','새 출발을 준비하는 재활 정원','세대를 잇는 동네 합창 연습실','은퇴를 앞둔 소방서','낡은 간판을 복원하는 작업실']
};
export function isRandomDubbingIdea(value){return /^[\s([（]*?(랜덤|무작위|알아서|random)[\s)\]）.!]*$/i.test(String(value||''));}
export function randomDubbingIdea(options,previous='',random=Math.random){
 const pick=a=>a[Math.min(a.length-1,Math.floor(random()*a.length))];
 const places=options.genres.flatMap(g=>[...(settings[g]||settings.일상),...(moreSettings[g]||[])]);
 const trouble=['누군가 바꿔 놓은 규칙의 허점을 찾아야 한다','서로 반대인 목표를 잠시 숨기고 협력한다','자신이 만든 실수의 대가를 직접 치러야 한다','가장 믿었던 증거가 가짜라는 사실을 발견한다','구하려던 대상이 구출을 거부한다','돌려줄 수 없는 물건의 진짜 주인이 나타난다','승리할수록 소중한 것을 잃는 거래를 제안받는다','평범한 일에 모두가 다른 의미를 부여해 소동이 벌어진다','서로의 역할을 바꾸고 해결책을 찾아야 한다','금지된 질문에 답해야 탈출할 수 있다','끝난 줄 알았던 임무를 전혀 다른 방식으로 완수한다','적이라고 믿었던 상대에게 도움을 청해야 한다','좋은 의도로 숨긴 사실이 뜻밖의 문제를 일으킨다','큰 보상과 작은 약속 사이에서 선택한다','작은 우연을 계획으로 착각해 일이 커진다','쉽게 포기했던 도전을 다시 시작한다'];
 const ending=['대가를 받아들이는 씁쓸한 성공','주도권이 뒤바뀌는 통쾌한 반전','정답을 정하지 않는 여운','실패했지만 새로운 길을 찾는 마무리','처음의 농담이 사건을 해결하는 유쾌한 결말','아무도 예상하지 못한 제삼의 선택','숨겨진 진실이 밝혀지는 서늘한 결말','작은 행동으로 화해하는 따뜻한 결말','승리를 양보하며 성장하는 결말','모든 단서의 의미가 달라지는 반전'];
 const relation=['낯선 협력자','경쟁자','서로 빚진 사이','오래된 동료','고객과 전문가','실력과 경험이 반대인 파트너','비밀을 공유한 사이','서로를 오해한 이웃'];
 const mood=['경쾌한 소동','숨 막히는 심리전','담담한 관찰','모험의 경이로움','서툰 진심','긴박한 선택','재치 있는 논쟁','낯선 불안'];
 let value='';
 for(let n=0;n<8;n++){
  value=`${pick(places)}에서 ${options.roleCount}명이 ${pick(trouble)}. 관계의 출발점: ${pick(relation)}. ${options.genres.join(' · ')} 장르, ${options.mood&&options.mood!=='랜덤'?options.mood:pick(mood)}. 약 ${Math.round(options.minutes*60)}초. ${options.ending&&options.ending!=='랜덤'?options.ending:pick(ending)}. 인원이 1명이면 관계를 독백이나 전달받은 정보로 표현하고 배역을 늘리지 마세요. 소재를 자연스럽게 재해석하되 선택한 장르를 지켜주세요.`;
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
