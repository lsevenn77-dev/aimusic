# AIFECT 전체 리스트 최종 적용 감사 · 2026-10-28

## 상태와 기준

- 최종 기준 공식 Sites 버전 254, 소스 `9057b50458c07857a661efa24fb1d223b48e4e35`. 작업 브랜치 `codex/unified-list-final`.
- 이전 로컬 변경은 c157a6d 기준의 미배포 작업이었다. 새 공식 소스의 voice-rooms 변경 2개 파일을 보존한 상태에서 이전 패치를 합쳤다. 시작 시 새 체크아웃은 깨끗했다. 작업 중 갱신된 v253/v254의 공개 ID·보관 선물·프로필 응원 랭킹 관련 7개 파일/테스트를 최종 통합했다. profile-management.js는 행 속성과 최신 API 필드를 모두 보존하도록 자동 병합됐고 충돌은 없었다.
- AGENTS.md, AIFECT_DESIGN_SYSTEM.md, AIFECT_PAGE_LOCKS.md, VERIFIED_SITE_TOKENS.md 및 사용자가 첨부한 최종 지시서 전체를 확인했다. 최종 지시서는 같은 docs/ui 디렉터리에 등록했다.
- **웹 소스 수정 및 로컬 검증 대상과 Android 실제 검증을 구분한다. Android 기기/현행 소스가 연결되지 않아 통합 작업의 전체 완료로 판정하지 않는다. 운영 배포/운영 DB 변경은 하지 않는다.**

## 확인된 원인

1. 운영 모바일 실제 CSS: 재생 SVG 36×36px, 참여 SVG 32×32px(content-box + 5px padding), 메뉴 20×20px. 행 좌우 padding 0px, 제작자 열 display:none. 참여 수는 span뿐이며 펼침 이벤트가 없다. 운영 CSS 자산은 `aifect-app-f118369bfd598d19.css`였다.
2. PLAY API는 듀엣의 original_id를 기준으로 원곡의 모든 커버 참여자를 집계했다. 같은 원곡의 다른 반곡·솔로를 특정 반곡의 참여작 수와 혼동할 수 있었다.
3. `uiux-space.css`는 참여 SVG에 content-box와 별도 원을 추가하고 모바일 제작자 열을 숨겼다. 홈에는 기존 3열 모바일 grid가 남아 새 flex 액션 그룹을 암묵 열로 밀어냈다. 메시지 목록에는 `padding:12px 4px !important`가 있었다.
4. 이전에 고친 일부 경로 외에 컬렉션 목록 variant, 플레이리스트 편집/선택 모달, 실제 크루 작품 및 여러 보조 목록의 공통 클래스/행 패딩 적용이 부족했다.
5. 이전 변경은 배포되지 않았고 공식 v252에도 리스트 개선 파일이 없었다. 운영 미반영을 캐시만의 문제로 단정하지 않는다. 현재 빌드의 콘텐츠 해시 자산은 변경 시 자동으로 새 이름을 사용한다.
6. 제공되지 않은 현재 Android APK/소스는 비교할 수 없다. 발견한 10월 19일의 이전 Android 사본 MainActivity는 Compose 기반이며, 현행 앱/WebView와 동일하다고 판단하지 않았다. 연결된 Android 기기, adb, emulator도 확인되지 않았다.

## 공통 계약

- `[data-list-row]` 또는 명시적인 `.layout-list .cover-collection-item`만 행 스타일을 적용한다.
- 좌우 inset: PC 12px / 모바일 10px. 실제 썸네일이 있는 경우만 48px / 44px 정사각형을 사용하며 원본 이미지·프로필 사진을 유지한다. 썸네일 없는 순서 편집/랭킹 행에 가짜 썸네일 열을 만들지 않는다.
- 썸네일과 텍스트의 간격: PC 12px / 모바일 10px. 제목/제작자 min-width:0 및 말줄임.
- `.list-actions`는 오른쪽 flex 클러스터이며 gap PC 8px / 모바일 6px, shrink 금지. 좁은 화면은 필요한 조작부를 제거하지 않고 두 번째 줄로 보낸다.
- `.list-action`: 44×44px 이상의 hit/focus 영역. 시각 원형 외곽 PC 28px / 모바일 24px, 원 테두리 2px, 내부 SVG 영역 16px, 선 굵기 1.8px. 기존 아이콘 집합의 play/plus/menu 등을 재사용한다. 목록의 재생도 동일한 선형 삼각형을 사용해 +와 같은 원/명도/중앙점을 갖는다.
- 큰 플레이어·카드 그리드·녹음기·모달 주요 CTA·사이드바/탑바/하단 탭은 이 크기를 강제하지 않는다. 카드/큰 플레이어의 원래 재생 자산도 유지한다.
- 녹음/참여 → 재생 → 메뉴 순서, 메뉴 최우측. 기존 보조 행동과 반응형 배치를 유지한다. 숫자 펼침은 원형 +와 다른 버튼이다.
- 포커스/disabled/aria 상태 유지. 셔플·반복·좋아요는 기존 상태 및 핸들러를 보존한다.

## 화면·컴포넌트·렌더러·CSS·아이콘 인벤토리

`공통` CSS는 dist/list-actions.css다. 아래 모든 실제 행에 공통 규칙 또는 명시적 목록 variant를 적용했다. 기존 CSS 파일은 충돌의 출처로 남기며 공통 규칙을 목록 범위에서 우선시한다.

| 화면/컴포넌트 | 렌더러 | 기존 CSS + 공통 | 아이콘/동작 | 검증 |
|---|---|---|---|---|
| 홈 추천·인기·부르기 11행 | home.js homeRowHTML/homePlay | home.css, uiux-space.css | 좋아요·댓글·재생·부르기·메뉴 | 지연 로딩까지 실제 스크롤, 7폭 |
| 차트·최신·검색·플레이리스트 곡 표 | app.js songTable/list | browse.css, secondary-pages.css | 좋아요·댓글·재생·제거·메뉴 | 각 실제 경로 7폭 |
| PLAY 추천·최신·듀엣 모집 | play-page.js playSongRows | play-page.css, uiux-space.css | mic / N⌄ / + / play / menu | 7폭 + 실제 펼침/접힘/재생/참여 |
| PLAY 더빙 작품찾기·더빙참여·내 작업 | playProjectRows | play-page.css, uiux-space.css | 상세/배역/이어서 보기, 빈 배역 수 | 각각 7폭 |
| PLAY 둘러보기 솔로·듀엣·더빙 | playMusicCard/playDubbingCard | music-card-controls.css | 기존 카드 재생/상세/메뉴 | 그리드 크기 유지, 간략 메타 제거 |
| 녹음 초안 | playDraftRows | play-page.css | 이어하기·개별/전체 삭제 | 기존 초안 URL/키 자동 테스트, 기능 시간 유지 |
| 곡 이야기 하단 전체·듀엣·최근·하위 참여작 | song-covers.js songCoverRowHTML | song-covers.css | N⌄·좋아요·참여·재생/일시정지·메뉴 | 3탭 7폭, 자식 실제 ID |
| 마이 작품·공개 프로필 작품·하위 참여작 | mypage.js myWorkItemHTML → songCoverRowHTML | mypage.css, song-covers.css | 참여·펼침·완성작 재생·메뉴 | 본인/공개 프로필 7폭 + 기존 정책 테스트 |
| 마이 내 제작곡 관리 목록 | browse.js own-music-row | browse.css | 재생·관리 | 실제 7폭, 그룹 간격 통일 |
| 마이 커버 컬렉션 목록/격자 | music-ui.js coverCollectionItem | music-experience.css | 재생·담기·관리·선택/삭제·반응·참여 | 실제 목록 전환 52행×7폭, 격자 스타일 분리 |
| 내 보관함 좋아요·최근 | music-library.js musicLibraryRows | music-library.css | 좋아요·재생·메뉴 | 각각 7폭 |
| 내/공개 플레이리스트 카드 | explorer.js collectionCard | explorer.css | 저장·고정·열기 | 카드 크기 유지, 총 길이는 간략 카드에서만 제거 |
| 플레이리스트 곡/목록 순서 편집 | actions.js / explorer.js | discovery.css | ↑↓·저장 | 실제 이동 동작, 7폭, 썸네일 없는 행 |
| 플레이리스트 곡 선택·좋아요 담기 | explorer.js trackPicker / library.js | discovery.css | 체크박스·기존 담기 | 실제 7폭, 48/44px 썸네일 및 12/10px 간격 |
| 재생 대기열 | explorer.js queueDialog | player-queue.css | 재생·↑↓·제거·셔플/반복 | 기존 큐/모드 자동 테스트 및 실제 대기열 |
| 크루 작품 | community-v3.js crewV3WorksHTML | community-v3.css | 유형 아이콘·완성작 재생/상세 | 실제 52행×7폭 |
| 크루 음악 표/최근 공개 활동 | social-layouts.js | community-feed.css | songTable 및 작품 링크 | 공통 표 + 활동 행, 공개 날짜 제거 |
| 커뮤니티 랭킹 작품·AI·관계·크루·더빙 | communityRankingV3 | community-v3.css | 기존 작품/인물 링크·통계 | 작품/AI 실제 유효 순위 7폭, 기타 동일 행 템플릿/빈상태 |
| 이전 커버 랭킹 | community.js coverRankTracksHTML | community.css | 썸네일 재생·좋아요·댓글·담기·선물 | 행 마커/아이콘 적용, 현행 랭킹은 V3가 우선 |
| 팔로잉/팔로워 인물 목록 | music-ui.js peopleListHTML | music-experience.css | 프로필 이동 | 실제 팔로잉 7폭 |
| 소속 아티스트/프로필 관리 관계 | profile-collections.js / profile-management.js | mypage.css | 프로필·고정·위로·기존 관리 | 실제 아티스트 관리 7폭, 관계 정책 유지 |
| 알림 활동 목록 | notifications.js activityRowHTML | notifications.css | 열기·읽음 | 실제 7폭, 기능 날짜 보존 |
| 메시지 일반·고정 크루 목록 | social-chat.js / chat-features.js | uiux-space.css, page-redesign.css | 열기·알림 토글 | 두 행 실제 7폭, 날짜 보존, 개별 대화 헤더는 제외 |
| 이전 MR/부를곡·참여자 행 | browse.js karaokeRows/bindBrowse, singing-hub.js singingHubTiles | browse.css, singing-hub.css | 기존 듣기/녹음/업로드/커버 연결 | 명시적 행 규칙 적용, 현행 PLAY 라우터 우선 |
| 이전 간략 듀엣 연결 행 | page-redesign.js sing-duet-row | page-redesign.css | 기존 참여 링크 | 각 실제 행에 패딩/정사각형/아이콘, 현행 PLAY 우선 |

홈의 카드 선반·토킹룸/크루 카드·아티스트/컬렉션 카드 그리드는 그리드이며 행 규격으로 바꾸지 않았다. 녹음/재생/상세/분류 편집/영수증/정산/운영 기록의 기능 정보는 간략 작품 목록으로 취급하지 않는다.

## 듀엣 기능 수정

- server/play.js의 읽기 집계만 수정: exact duet_parent_id, 동일 original_id, 공개 완료 듀엣, 숨김/차단 제외. 서로 다른 부모에 같은 곡명이 있어도 섞지 않는다.
- N은 기존 정책에 맞춰 반곡 제작자를 제외한 고유 참여자 수다. 완성작 수는 별도로 반환하며 tooltip에서 함께 표시한다. 2명이 여러 번 만든 53개 작품이면 2⌄ / 완성작 53개로 구분한다.
- 기존 `/api/tracks/:original/covers?view=children&parent=:half&offset=...`를 재사용한다. 50개 페이지 + 더 보기를 지원하고 원곡 전체 검색/곡명 검색으로 대체하지 않는다.
- parent 바로 뒤의 hidden 컨테이너에 자식을 렌더한다. 숫자/화살표 모두 같은 native button 클릭이다. 최초 로드 뒤 재클릭은 접기/캐시된 펼치기이며 중복 바인딩을 막는다. 오류/페이지 이탈 시 busy 상태를 복구한다.
- 자식은 기존 프로필 이미지/닉네임/제목을 사용하며 data-play는 그 자식 ID다. 자식 메뉴/상세 링크도 그대로 유지한다.
- 실제 부모 t.producer를 곡명 아래에 표시한다. 원곡 아티스트명으로 대체하지 않는다. PC·모바일 모두 긴 텍스트 말줄임을 적용한다.
- +는 기존 참여 가능 모집 행의 녹음 URL을 사용한다. 완성작에는 새 +를 만들지 않는다. 부모 재생과 자식 재생은 분리한다.

## 보존 및 검증 한계

DB/API의 날짜·장르·재생시간 원본 필드를 삭제하지 않았다. 상세의 발매일·제작 정보·장르·길이, 재생/녹음 시계, 초안 저장일/길이, 알림/DM/관리의 날짜는 유지한다. shared 녹음/재생 엔진, karaoke.js, dubbing-recording.js, 권한·녹음·파트·저장/업로드 처리 코드는 변경하지 않았다. 테스트는 격리된 SQLite/R2 fixture만 사용하며 운영 DB를 쓰지 않는다.

PC·모바일 브라우저 검증은 실제 앱 렌더러/서버 API와 로컬 테스트 레코드에서 수행했다. 운영 화면은 변경 전 비교/원인 확인용으로 읽기만 했다. 테스트 레코드가 운영 데이터라고 보고하지 않는다.

Android WebView 실기기/현행 앱은 아직 검증되지 않았다. Android 메뉴 경로 자동 테스트, Chromium 화면 폭 검사를 실제 WebView 검증으로 간주하지 않는다. 실제 기기 또는 에뮬레이터와 현재 앱 소스/디버그 빌드가 있어야 남은 확인을 수행할 수 있다. 운영 배포 없이 로컬 검증 URL을 열 수 있는 환경이 필요하다.

최종 실행 로그·변경 파일·측정 JSON·스크린샷 및 완료/미완료 구분은 outputs/final-20261028의 최종 보고서에 기록한다.
