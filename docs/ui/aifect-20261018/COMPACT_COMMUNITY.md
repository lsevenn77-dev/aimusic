# 마이 메뉴 정리 · 커뮤니티 카드 밀도 개선

2026-10-18 · `codex/aifect-streaming-first` · 기준 `317535b`

마이 상단의 3줄 전체메뉴 버튼을 제거하고 설정 버튼을 유지했다. 홈과 부르기의 기존 전체메뉴 진입은 유지한다.

커뮤니티는 둥근 네이비 카드 안에 작성자·시간·재생수·팔로우·더보기를 모았다. 이미지 비율을 1.42:1에서 2.15:1로 낮추고 제목·소개와 반응 버튼의 중복 여백을 줄였다. 일반 390dp 화면에서는 미니플레이어 위로 카드 두 개와 다음 카드의 작성자 줄까지 보인다. 커버 프로필 사진은 상단을 기준으로 표시해 얼굴 위쪽이 잘리는 현상을 줄였다.

원곡 듣기/다른 목소리는 카드의 더보기 페이지에 배치했다. 좋아요·댓글·공유·부르기·듀엣 참여와 담기·선물 기능은 유지한다. 글자 확대 시 이미지 공간을 조금 늘리고 반응 버튼은 필요하면 줄바꿈한다.

## 변경 파일

- `app/android/app/src/main/java/kr/co/aifect/app/NativeScreens.kt`: 마이 전체메뉴 제거, Artwork의 이미지 정렬 선택 인자 추가(기본값은 기존 가운데 정렬).
- `app/android/app/src/main/java/kr/co/aifect/app/CommunityFeedCard.kt`: 낮은 커버, 카드 배경/테두리, 작성자 줄 정리, 관련 곡 메뉴 이동.
- `app/android/app/src/main/java/kr/co/aifect/app/BrandComponents.kt`: 커뮤니티에서만 원곡/다른 목소리 메뉴를 추가할 수 있는 선택 인자.

## 확인 결과

- 앱·테스트 APK 빌드 성공.
- 기존 기능 검사 3개 통과: 커뮤니티 재생/담기/듀엣 전달, 크루 소개/긴 작성자 이름, 홈·마이 보관함/플레이리스트/스튜디오 연결.
- 최종 이미지 정렬 변경 후 커뮤니티 검사 재실행 1개 통과.
- 320dp·글자 130%에서 커뮤니티 검사 1개 통과. 버튼이 잘리지 않고 줄바꿈되는 것을 캡처로 확인했다.
- 마이 캡처에서 전체메뉴가 없고 설정 버튼이 남아 있는 것을 확인했다.
- `git diff --check` 통과. UI 범위의 수정이라 단위 검사·Lint는 이번에 다시 실행하지 않았으며, 비교 페이지의 해당 집계는 이전 검증 결과다.

실제 앱 캡처는 로컬 데이터로 실행한 에뮬레이터 결과다. 운영 사진·계정이나 실제 마이크 검증은 아니다. 휴대폰 Samsung SM-F761N의 **AIFECT 테스트** (`kr.co.aifect.app.test`, 2.5.50/63)에 2026-10-18 23:00:00 `adb install -r` 성공을 확인했다. 앱 데이터는 삭제하지 않았다.

APK SHA-256: `D0CDD377EF87CF707E5DD682B673924AB1850BB5F275A71BFD1071BA29C345D4`

## 검토 자료

- 비교 페이지: `http://127.0.0.1:4199/revision/`
- 최신 캡처: `screens/06-my-music.png`, `screens/32-community-feed.png`, `screens/33-community-duet.png`, `screens/37-small-community.png`
- 로그: `checks/compact-build-final.txt`, `checks/compact-tests.txt`, `checks/compact-layout-final.txt`, `checks/compact-small-screen.txt`, `checks/compact-install.txt`
- 앞선 로그인/메시지 작업: `SOCIAL_AND_LOGIN.md`

원격 push·운영 병합·배포·스토어 업로드는 하지 않았다.
