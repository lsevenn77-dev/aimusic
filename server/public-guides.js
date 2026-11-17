import {aboutIcon as icon} from './about-icons.js';
import {CREW_ACTIVITIES, CREW_GENRES, CREW_JOIN_LABELS} from '../shared/crew-tags.js';

const listening = [
 ['음악 찾기','listening-find','발견 화면의 통합 검색창과 기분별 탐색',1018,635,
  '찾는 곡이 있다면 공개 음악에서 곡명이나 활동명을 입력하세요. 장르를 고르고 제작곡·커버·듀엣을 바꾸어 같은 장르의 다른 목소리도 찾아보세요.',
  '앱의 홈에서는 제작곡을, 플레이의 둘러보기에서는 회원이 부른 작품을 만날 수 있어요.'],
 ['음악 감상','listening-play','공개곡의 활동명과 듣기 버튼이 있는 앱 곡 화면',1019,526,
  '커버 이미지나 제목을 누르면 곡 상세가 열려요. 공개 상세의 미리듣기에서 재생·일시정지하거나 재생 위치를 옮길 수 있어요.',
  '앱 곡 화면에서는 듣기를 누르세요. 비회원은 최대 1분까지, 로그인한 회원은 공개된 전체곡을 무료로 들을 수 있어요.'],
 ['플레이리스트','listening-playlist','테스트 계정에서 연 플레이리스트에 추가 창',385,303,
  '로그인한 뒤 제작곡의 저장 버튼을 눌러 내 플레이리스트를 선택하세요. 새 플레이리스트 만들기로 목록을 만들 수도 있어요.',
  '내 목록에서 곡 메뉴의 플레이리스트에서 제거를 선택하세요. 재생 순서 편집에서 화살표로 순서를 바꾸고 순서 저장을 누르면 돼요.'],
 ['내 보관함','listening-library','테스트 계정의 내 보관함에 표시된 좋아요, 최근 감상, 플레이리스트 탭',634,508,
  '마이의 내 보관함에서 좋아요를 누른 음악과 최근 감상한 곡, 내 플레이리스트를 다시 열어보세요.',
  '지금 듣는 순서를 바꾸려면 곡 메뉴에서 다음에 재생 또는 재생목록 맨 뒤에 추가를 선택하세요.']
];
const recording = [
 ['곡 선택','recording-choose','플레이의 노래 목록에서 녹음할 곡을 고르는 화면',1018,477,
  '플레이에서 노래를 열고 부를 곡을 선택하세요. 제작자가 노래방 참여를 허용하고 반주와 가사가 준비된 곡이 표시돼요.',
  '로그인한 뒤 이어폰을 연결하고 녹음에 사용할 마이크의 접근을 허용하세요.'],
 ['녹음 방식 선택','recording-mode','노래 설정의 솔로와 듀엣 녹음 선택 화면',538,270,
  '혼자 부를 때는 솔로, 함께 부를 때는 듀엣을 선택하세요. 듀엣을 시작하는 사람은 파트 나누기에서 가사마다 내 파트·상대 파트·함께 부르기를 지정할 수 있어요.',
  '모집된 듀엣에 참여할 때는 파트 보기로 배분을 확인하고, 먼저 녹음한 목소리에 맞춰 불러보세요.'],
 ['녹음 및 결과 확인','recording-record','웹 녹음 화면의 현재 가사와 양쪽 시간 표시, 녹음 조작부',618,814,
  '녹음 시작을 누르고 현재 가사와 파트 표시를 따라 부르세요. 진행 막대 왼쪽은 현재 위치, 오른쪽은 곡 전체 길이예요.',
  '잠시 멈추려면 일시정지, 같은 녹음을 계속하려면 재개를 누르세요. 완료 후 음원 편집의 재생 버튼으로 반주와 목소리를 함께 들어보세요.'],
 ['저장 및 공개','recording-save','테스트 계정의 게시 설정에 표시된 공개 종류와 초안 저장, 저장 후 게시 버튼',1010,974,
  '싱크 조절과 볼륨 밸런스로 소리를 맞추세요. 나중에 마치려면 초안 저장을 누르고 저장 완료 표시를 확인하세요.',
  '공개하려면 게시 설정에서 공개 종류와 권리 동의를 확인하고 저장 후 게시를 누르세요. 게시한 내 작품은 스튜디오에서 비공개 처리할 수 있어요.']
];
const action=(label,href)=>`<a class="guide-action" href="${href}">${label} ${icon('arrow-right')}</a>`;
const note=(title,body)=>`<aside class="guide-note"><h2>${title}</h2>${body}</aside>`;
const faq=(heading,items)=>`<section class="guide-faq"><h2>${heading}</h2>${items.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`;
function steps(items) {
 return `<ol class="guide-steps" role="list">${items.map(([title,file,alt,w,h,a,b],i)=>{
  const src='/assets/public-guides/'+file+'.webp';
  return `<li class="guide-step"><a class="step-image" data-enlarge href="${src}" aria-label="${alt} 확대 보기"><img src="${src}" alt="${alt}" width="${w}" height="${h}" loading="lazy" decoding="async"><span>${icon('search')} 확대 보기</span></a><div class="step-copy"><span class="step-number">STEP 0${i+1}</span><h2>${title}</h2><p>${a}</p><p>${b}</p></div></li>`;
 }).join('')}</ol><dialog class="guide-dialog" aria-labelledby="image-caption"><div><p id="image-caption"></p><form method="dialog"><button>닫기</button></form></div><img alt=""></dialog>`;
}
const listeningPolicy=note('감상과 보관 이용 조건','<ul><li>비회원은 공개곡을 최대 1분까지 미리듣고, 회원은 로그인 후 전체곡을 무료로 감상할 수 있어요.</li><li>내 플레이리스트에는 제작곡만 추가할 수 있어요. 커버·듀엣·더빙 작품은 담기 대상에서 제외돼요.</li><li>비공개·삭제·운영자 제거 곡은 목록과 재생에서 제외돼요. 원곡의 공개 또는 노래방 제공이 중단되면 연결된 커버도 감상할 수 없어요.</li></ul>');
const recordingSettings=faq('고급 녹음 설정',[
 ['마이크와 이어폰 모니터링은 어떻게 준비하나요?','녹음 전 마이크 연결과 사용 권한을 확인하세요. 내 목소리를 들으며 부를 때는 이어폰 모니터링을 사용하세요. 유선 이어폰을 연결하면 스피커 소리가 다시 녹음되는 울림을 줄일 수 있어요.'],
 ['목소리가 반주보다 늦게 들려요.','블루투스 이어폰은 기기에 따라 소리가 늦게 들릴 수 있어요. 음원 편집의 싱크 조절에서 녹음을 재생하며 목소리 위치를 맞추세요.'],
 ['목소리와 상대 파트의 크기는 어디에서 조절하나요?','볼륨 밸런스에서 내 목소리와 반주를 조절하세요. 분리 음원이 있는 듀엣은 상대 목소리도 따로 맞출 수 있어요. 일부 이전 듀엣은 반주와 상대 목소리가 함께 조절돼요.'],
 ['에코와 공간감을 바꾸려면 어떻게 하나요?','공간 효과에서 원음·노래방·스튜디오·홀을 비교해 보세요. 사용자 설정에서는 에코 효과, 룸 크기, 리버브 강도를 직접 맞출 수 있어요.']
]);
const crewCards=[
 ['아티스트 팔로우','활동명을 눌러 프로필과 공개 작품을 확인하세요. 마음에 드는 아티스트를 팔로우하고 팬페이지에서 음악을 다시 만날 수 있어요.','아티스트 둘러보기','/#artists','headphones'],
 ['크루 찾기','함께하고 싶은 활동과 음악 장르로 크루를 찾아보세요. 크루 소개에서 모집 상태와 가입 방식을 확인할 수 있어요.','크루 찾기','/#community/crews?browse=1','mic-vocal'],
 ['메시지와 소통','다른 회원의 프로필에서 메시지를 눌러 대화를 시작하세요. 크루에 가입하면 크루 채팅에서 음악을 나누고 함께할 활동을 정할 수 있어요.','커뮤니티 둘러보기','/#community','list-music']
];
const crewGuide=()=>`<div class="community-cards">${crewCards.map(([h,p,label,href,symbol])=>`<article><span class="about-icon-tile">${icon(symbol)}</span><h2>${h}</h2><p>${p}</p>${action(label,href)}</article>`).join('')}</div>
 <section class="crew-guide"><h2>나에게 맞는 크루 찾기</h2><dl><div><dt>활동 방향과 장르</dt><dd>활동 방향은 크루에서 함께 하는 일을 뜻해요. ${CREW_ACTIVITIES.slice(0,2).join('·')} 같은 활동이나 ${CREW_GENRES.slice(0,3).join(', ')} 등 좋아하는 장르를 확인하세요.</dd></div>
 <div><dt>가입 방식</dt><dd>${CREW_JOIN_LABELS.open}는 조건을 충족하면 바로 참여할 수 있어요. ${CREW_JOIN_LABELS.approval}은 신청 후 운영진의 승인을 기다리고, ${CREW_JOIN_LABELS.invite_only}은 초대를 받아야 해요. 한 번에 한 크루에 가입할 수 있어요.</dd></div>
 <div><dt>가입 후 활동</dt><dd>내 크루에서 공지와 음악, 멤버를 확인하세요. 오늘과 이번 주의 성장 미션에서 작품 공개나 협업에 참여할 수 있어요. 크루 채팅은 내가 가입한 뒤의 대화부터 볼 수 있어요.</dd></div></dl></section>
 ${faq('안전한 활동과 이용 규칙',[
 ['음원에 문제가 있으면 어떻게 신고하나요?','로그인 후 다른 회원의 공개곡 메뉴에서 음원 문제 신고를 선택하고 잡음이나 끊김 등 상황을 알려주세요. 한 회원의 신고는 곡당 한 번 집계돼요. 서로 다른 회원 3명 이상의 신고 또는 60일간 유효 재생이 없는 곡은 운영자가 검토한 뒤 조치 여부를 결정해요.'],
 ['음악과 이미지를 공유할 때 무엇을 확인해야 하나요?','직접 만들었거나 게시할 권한이 있는 콘텐츠만 공유해 주세요. 저작권 문제는 <a href="/contact">고객센터</a>에서 접수할 수 있어요.'],
 ['다른 회원과 소통할 때 지켜야 할 규칙이 있나요?','다른 사람의 개인정보를 공개하거나 원치 않는 메시지를 보내지 마세요. 자세한 기준은 <a href="/terms">이용약관</a>과 <a href="/privacy">개인정보처리방침</a>에서 확인하세요.']
 ])}`;
export const publicGuides={
 '/guide/listening':{label:'음악 감상',title:'음악 감상, 이렇게 시작해요',summary:'음악을 찾는 순간부터 다시 듣는 방법까지 알아보세요.',body:()=>steps(listening)+listeningPolicy+action('공개 음악 둘러보기','/music')},
 '/guide/recording':{label:'녹음하기',title:'내 목소리로 완성하는 음악',summary:'솔로와 듀엣 녹음을 처음부터 차근차근 알아보세요.',body:()=>steps(recording)+recordingSettings+note('초안은 이 기기에 저장돼요','<p>같은 계정으로 플레이 → 노래 → 내 초안을 열고 이어하기를 누르세요. 앱 삭제나 브라우저 사이트 데이터 초기화로 녹음이 사라질 수 있고, 다른 기기에는 표시되지 않아요.</p>')+action('노래방 시작하기','/#karaoke')},
 '/guide/community':{label:'커뮤니티',title:'음악으로 연결되는 사람들',summary:'좋아하는 음악을 공유하고, 함께 활동할 크루를 만나보세요.',body:crewGuide}
};
