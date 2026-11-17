# 점프러쉬 배너 진입 조사와 회귀 검증

## 원인과 수정

iPhone에서 게임 배너를 눌렀을 때 문서와 게임 데이터를 받아도 웹의 화면 준비 표시가 해제되지 않았다. WKWebView의 navigation delegate는 같은 fragment로 이동하는 `location.replace`를 비동기로 처리한다. 웹 `AifectRender.ready`는 `:target`이 갱신되기 전에 종료하고 다시 확인하지 않아 본문을 숨긴 채 남았다.

공식 웹 소스의 `dist/render-state.js`에서 같은 이동을 반복 요청하지 않고 실제 `:target` 완료를 기다린 뒤 현재 경로만 표시하도록 수정했다. 이전 경로·만료된 렌더·네트워크 실패는 여전히 표시하지 않는다. 새 네이티브 실행 파일이나 버전 변경은 이 수정에 필요하지 않다.

## 검증

- 웹 렌더 준비 상태 회귀 테스트 18개 통과. 비동기 fragment 완료, 중복 이동 방지, 이전 렌더·경로 변경·시간 초과를 포함한다.
- `scripts/jump-site-fixture.mjs`는 실제 빌드한 웹 전체와 Worker를 로컬 SQLite 데이터로 제공한다. 쓰기 요청을 차단하므로 운영 점수·공식 도전 횟수에 영향을 주지 않는다.
- `StreamingUITests.testJumpEntryThroughAuthenticatedSiteShell`: 네이티브 커뮤니티 → 크루 → 게임 배너 → 대기실 표시·버튼 접근 → 연습 실행 → 결과 화면을 확인했다. iPhone 12 / iOS 26.2 시뮬레이터에서 최종 통과(26.258초). 결과 번들: `../work/ios-jump-entry-stable.xcresult`.
- [대기실](parity/jump-entry-20261117/lobby.png), [연습 결과](parity/jump-entry-20261117/practice-result.png).
- 수정 전 같은 전체 웹 진입 검사는 화면 준비 시간 초과로 실패했다. 이전 빌드23 조사에서 DOM 텍스트 존재만 검사한 운영 익명 probe는 본문의 실제 표시를 증명하지 못했다. 이 회귀 검사는 실제 접근성 요소와 터치 가능 여부를 확인한다.
- 사용자가 잠금을 해제한 직후 실기기의 앱 실행은 성공했다. 이후 기기가 자동 잠금되어 실기기 게임 진입 XCTest는 실행되지 못했다. 실기기 게임 동작을 통과했다고 판단하지 않는다.

재현 시 먼저 웹 체크아웃에서 빌드를 완료한 뒤 fixture를 시작한다. UI 테스트 도중 웹 산출물을 다시 빌드하면 서로 다른 파일 버전을 읽으므로 빌드와 UI 테스트를 동시에 실행하지 않는다.
