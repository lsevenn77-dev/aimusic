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

## 최종 소스 및 운영 게시 결과

- 웹 커밋: `ed03119936b3b3f908843320ef607badac106658`. 원격 최신 변경을 병합하여 공식 소스 helper로 푸시했다.
- 병합 후 전체 테스트 **2,162개 통과**, 빌드·로컬 공개 API smoke·`release:check` 통과. 새 migration 없음.
- 병합 후 같은 네이티브 UI 검사도 통과(31.240초). 결과: `../work/ios-jump-entry-merged.xcresult`.
- 원본 패키지는 소스 `dist`와 생성 `dist/client`가 중복되어 256 MiB 업로드 제한을 초과했다. 공식 `package-site.mjs`에 실제 빌드의 client·server·hosting·migration만 보존한 별도 staging을 전달했다. 최종 1,638개 파일 / 181.13 MiB이며 배포 파일의 바이트가 테스트한 빌드와 동일함을 비교했다. 원본 소스·빌드·원래 아카이브는 변경하지 않았다.
- 공식 Sites 저장 버전 **822** 생성 성공. 운영 게시 결과는 **실패**: `Failed to publish the built site.`
  - Site: `appgprj_6aa56aec3434819186f9a42d9a557520`
  - Version: `appgprj_6aa56aec3434819186f9a42d9a557520~appgver_fdbdcc0ae5148191a851eb28ca4d6b79`
  - Deployment: `appgdep_6afc555ab0d88191ae0fee49297b40a9`
- 앞선 별도 작업의 버전 818–821도 같은 게시 오류 상태였다. 공식 상태와 Worker 로그에 더 구체적인 게시 실패 원인은 제공되지 않았다. 동일 버전을 무작정 재게시하거나 다른 배포 경로로 우회하지 않았다.
- 2026-11-17 22:25 KST 운영 응답에는 수정 코드가 없었다. 기존 Cafe24 revision `4f91611e907bd9cca10b470eb41784511f312f37224b5ab0f7500fd6d541e1cc`가 유지됐으며 `release:verify`는 수정본 불일치로 실패했다. 관리자 플러그인의 인증된 읽기 조회는 정상이다.
- 따라서 **코드 수정·검증·Git 푸시·버전 저장 완료, 실제 운영 반영은 미완료**다. 다음 단계는 공식 게시 실패 원인/인프라 복구를 확인한 뒤 이 저장 버전의 게시를 재개하고 실제 도메인을 검증하는 것이다.
