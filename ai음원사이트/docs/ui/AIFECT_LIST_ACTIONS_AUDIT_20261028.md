> 이전 미배포 작업의 기록입니다. 최신 기준/적용/한계는 AIFECT_LIST_ACTIONS_FINAL_AUDIT_20261028.md를 참조하세요.

# 전체 음악 목록 조사 및 표시 범위 · 2026-10-28

기준: 공식 Sites 버전 251, c157a6d0841d74e1237c5f75924aa52fbc64aed7. 시작 시 작업 트리 깨끗함. AGENTS.md, 디자인 시스템, 페이지 잠금, 실측 토큰 및 Desktop 첨부 지시서를 확인했다. 새 지시서는 docs/ui/AIFECT_UNIFIED_LIST_ACTIONS_20261027.md로 등록했다.

| 화면/목록 | 실제 렌더러 | 기존 조작 및 처리 |
|---|---|---|
| 홈 추천·차트·최근·부르기 행 | home.js homeRowHTML/homePlay | 좋아요·댓글·재생·더보기/부르기. 행만 크기 통일, 히어로/그리드 유지 |
| 차트·검색·발견·아티스트·플레이리스트·최근감상 | app.js songTable/list, browse.js, explorer.js | 좋아요·댓글·재생·더보기·목록 제거. 길이 열 제거, 원본 순위/통계 유지 |
| PLAY 추천·최신·듀엣 | play-page.js playSongRows | MR에는 기존 마이크·메뉴만. 듀엣은 참여 + → 반곡 재생 → 메뉴. 원래 href/data 핸들러 보존 |
| PLAY 더빙 작품찾기/참여/내 작업 | play-page.js playProjectRows | 작품/배역/이어서 보기 링크. 참여 탭은 기존 배역 보기 링크에 + 아이콘, 목적지는 기존 상세 화면. 새 오디오/녹음 동작 없음 |
| PLAY 둘러보기 | playMusicCard/playDubbingCard → card | 완성 솔로·듀엣·더빙 카드의 재생/상세·기존 메뉴 유지. 장르/시간 텍스트 제거, 그리드 버튼 크기 유지 |
| PLAY 녹음 초안 | playDraftRows | 이어하기·개별/전체 삭제. 기기 초안을 구분하는 저장일/길이는 기능적 관리 정보로 유지 |
| 곡 이야기 하단 전체/최근/듀엣/참여작 | song-covers.js songCoverRowHTML | 참여 숫자 펼침·좋아요·재생/일시정지·참여 +·메뉴. 0명 비활성 의미 유지 |
| 마이 커버·듀엣·더빙 및 참여작 | mypage.js myWorkItemHTML → songCoverRowHTML | 숫자 펼침·참여·재생·메뉴. 더빙 재생 data-mp-dubbing-play, 별도 메뉴 및 하위 작품 로더 유지 |
| 마이 내 보관함 좋아요/최근 | music-library.js musicLibraryRows | 재생·좋아요·더보기, 기간/정렬/페이지네이션 유지. 시간 텍스트 제거 |
| 프로필 커버 컬렉션 | music-ui.js coverCollectionItem | 격자/목록 전환, 재생·담기·관리·선택/삭제·좋아요·댓글·선물·참여. 목록 variant만 공통 크기 |
| 커뮤니티 음악 피드 | musicTrackCard/communityConceptCard | 재생·좋아요·댓글·선물·저장·듀엣 참여·메뉴. 게시 날짜/장르 태그 제거, 실제 재생 진행 시간 보존. 큰 카드 조작부 크기 유지 |
| 크루 작품/활동 | social-layouts.js crewMusicRows, community-v3.js crewWorksV3 | 공통 songTable 또는 기존 재생/작품 링크. 간략 공개일 제거, 운영 기록 날짜 유지 |
| 커버 랭킹 | community.js coverRankTracksHTML | 썸네일 재생·좋아요·댓글·담기·선물. 장르 제거, 원곡 링크/랭킹 좋아요 유지. 기존 버튼 수 유지 |
| 기존 노래 컬렉션·부를곡 카드 | singing-hub.js/browse.js | 듣기·부르기·참여·파일 업로드·커버 랭킹. 카드 장르/길이 제거. 기존 라우팅 유지 |
| 공개 플레이리스트 카드 | explorer.js collectionCard | 저장·고정·열기. 총 길이 제거. 개별 플레이리스트 상세의 총 길이 유지 |
| 재생 대기열 | explorer.js queueDialog, player-queue.css | 곡 재생·위/아래 이동·대기 제거, 셔플/반복/전체 비우기. 행 도구 44px 터치 영역; 대형 플레이어/툴바의 기능 및 위치 보존 |

## 공통 표시 계약

- `.list-action`, `.list-actions`: 기존 동작 속성에 더하는 표시 클래스. 아이콘 외곽 PC 28px / 모바일 24px, 내부 16px 수준, stroke 1.8px. 기존 재생 자산의 원형 테두리는 중복하지 않는다.
- `--list-action-hit:44px`, `--list-icon-size`, `--list-icon-padding`, `--list-action-gap`: 목록 내부 토큰. 간격 PC 8px / 모바일 6px.
- 메뉴는 우측 끝, 재생은 그 왼쪽, 참여/녹음은 재생 왼쪽. DOM 순서와 키보드 순서도 일치시킨다.
- 작은 화면은 독립적인 우측 정렬 조작 행으로 감싼다. 숫자+화살표 펼침은 원형 +와 다른 클릭 대상이다.
- 긴 제목 스트레스 검사에서 grid 자식의 자동 최소 폭이 버튼을 밀어내는 현상을 발견해 PLAY 행에 min-width:0과 width:100%를 적용했다.
- 공통 CSS는 명시적 목록 클래스/variant만 대상으로 하며 body/button/svg 전역, 사이드바·상단바·하단 내비게이션·대형 플레이어·녹음기는 변경하지 않는다.

## 보존 범위

song-detail.js, 상세 헤더/크레딧/발매일, 더빙 상세/편집/녹음 함수, actions.js, karaoke.js, dubbing-recording.js, shared 재생/녹음 엔진, server/API, DB 및 migrations의 커밋 내용은 수정하지 않는다. 장르 필터와 날짜 기준 정렬도 유지한다. 알림·메시지·영수증·정산·운영 타임라인은 대상 밖이다.

Desktop 첨부는 화면별 기능 요구도 포함하지만 이번 요청은 기존 로직 보존을 명시한다. 기존 권한/노출 정책과 녹음 흐름을 다시 설계하지 않고, 현재 기능의 링크·핸들러·상태를 유지한다. 독립 replay 버튼은 조사한 음악 행에 없으며, 녹음기의 다시 시작/파트너 듣기 및 플레이어 반복/셔플을 제거하거나 모든 행에 새로 만들지 않았다.

## 검증 범위

실제 앱 렌더러와 격리된 SQLite/R2 fixture로 1440/1024/768/430/390/360/320px를 검사한다. LIST_ACTIONS_QA=1은 미리보기 DB에만 긴 제목·닉네임을 만든다. PC/모바일 크기·겹침·메뉴 위치·넘침, 0/여러 명 참여, 활성/비활성 및 상세 정보 보존을 확인한다. Android 라우트 테스트는 실행하되 Android WebView 실기기·마이크 실녹음은 별도 미검증으로 보고한다. 운영 배포·운영 DB 쓰기는 하지 않는다.
