# AIFECT 2.5.58 — 연결된 추천 목록도 두 줄로 통일

홈의 추천 음악 → 모두 보기 페이지가 기존 세 줄 SongRow를 쓰던 부분을 수정했다. 홈과 목록이 TwoLineSongRow를 공유하며, 첫 줄은 곡명·조작 버튼, 둘째 줄은 가수·재생·좋아요·댓글 수다. 표지 높이는 실제 글꼴 높이에 맞춘다.

추천 목록에만 명시적으로 두 줄 표시를 지정했다. 재생 목록과 기존 부르기·더보기 기능을 유지하며 다른 컬렉션의 표시 방식은 변경하지 않았다.

- 검증: assembleDebug, assembleDebugAndroidTest, testDebugUnitTest, lintDebug 통과. 단위 검사 69개 성공. Lint 오류 0, 경고 123.
- 기존 홈 UI 검사에 추천 목록 진입·두 줄 정보 표시·부르기 버튼 표시·곡 재생·홈 복귀를 포함했다. 390dp/글자 배율 1.0과 320dp/1.3에서 각각 통과했다. 테스트는 격리된 앱과 로컬 데이터로 실행했다.
- [일반 화면](home-258/recommended-list.png), [작은 화면·큰 글씨](home-258/recommended-list-narrow.png)의 실제 캡처를 확인했다.
- 휴대폰 업데이트: adb install -r Success. kr.co.aifect.app, 2.5.58 (71), 기기 설치 시각 2026-10-25 19:36:38. MainActivity Status: ok, 프로세스 실행 및 해당 프로세스의 crash 로그가 비어 있음을 확인했다.
- 설치 파일: C:\Users\lseve\Desktop\AIFECT-2.5.58.apk.
- SHA-256: 60FD8267091F82965630CAD03335655587435A1948047252549BD4387B2B3675.
