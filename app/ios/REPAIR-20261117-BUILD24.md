# 최초 실행 온보딩 · 1.0.7(24)

## 구현

- 사용자 제공 2026-11-17 22:24 시안에 맞춘 네이티브 5장 안내: AI 음악 스트리밍 → 곡 업로드·수익 → AI 곡 부르기 → 더빙 → 함께 즐기기.
- 원본 시안은 번들 이미지로 보관하고 각 사진 영역만 화면에서 표시한다. 텍스트·로고·버튼·페이지 표시는 실제 SwiftUI이므로 터치와 접근성 읽기를 지원한다. 네트워크 이미지 로딩이 필요 없다.
- 좌우 스와이프·다음·페이지 표시·건너뛰기, 마지막 `아이팩트 시작하기`로 홈에 진입한다.
- 완료 또는 건너뛰기를 설치별 UserDefaults에 저장한다. 재실행·로그아웃·앱 업데이트 시 안내를 다시 표시하지 않는다. 계정이나 삭제 후에도 남는 Keychain에 완료 여부를 저장하지 않는다. 이 기능이 없던 설치에는 완료 기록이 없으므로 도입 후 한 번 표시된다.
- 온보딩이 열려 있을 때 홈 화면을 마운트하지 않아 홈의 로딩·동의 화면이 겹치지 않는다. 기존 로그인 URL 처리를 보존한다.
- 큰 글씨는 설명 영역을 세로로 스크롤할 수 있고 건너뛰기·시작 버튼은 화면에 유지한다. 동작 줄이기를 존중한다.

## 검증

- iPhone 12 / iOS 26.2: 5장 렌더, 다음·시작, 완료 후 재실행, 좌우 스와이프, 건너뛰기 후 재실행, 접근성 큰 글씨 UI 테스트 2개 통과. 결과: `../work/ios-onboarding24.xcresult`.
- iPhone SE 3 / iOS 26.2 (375×667): 동일 UI 테스트 2개 통과(0 실패). 결과: `../work/ios-onboarding24-se-ready.xcresult`. 최초 시도는 시뮬레이터 서비스 연결 지연으로 중단했으며 재부팅 후 정상 실행됐다. [작은 화면 첫 장](parity/onboarding24/onboarding-se-first.png), [마지막 장](parity/onboarding24/onboarding-se-last.png), [큰 글씨](parity/onboarding24/onboarding-se-large-text.png)를 확인했다.
- 5장과 큰 글씨의 실제 스크린샷을 확인했다: [1](parity/onboarding24/onboarding-page-1.png), [2](parity/onboarding24/onboarding-page-2.png), [3](parity/onboarding24/onboarding-page-3.png), [4](parity/onboarding24/onboarding-page-4.png), [5](parity/onboarding24/onboarding-page-5.png), [큰 글씨](parity/onboarding24/onboarding-large-text.png).
- 테스트 상태는 DEBUG 전용 별도 UserDefaults suite와 로컬 API fixture를 사용한다. Release에는 테스트 진입·초기화 경로가 포함되지 않는다.

## 빌드·설치

- Release 아카이브 성공: `/Users/user/Library/Developer/Xcode/Archives/2026-11-17/AIFECT-1.0.7-24.xcarchive`. 버전 `1.0.7(24)`, 번들 `kr.co.aifect.app`.
- `codesign --verify --deep --strict` 통과, `Assets.car`에 OnboardingStoryboard 포함 확인, Release 바이너리에 DEBUG 온보딩 테스트 인수·초기화 suite 미포함 확인.
- 연결된 iPhone 12에 2026-11-17 22:49 설치 성공. 기기의 설치 목록에서 `1.0.7 / 24` 확인. 기존 앱 데이터는 유지했다. 22:49:17 `devicectl device process launch`도 성공했다. 실제 기기 화면의 시각 비교는 수행하지 않았으며 UI 검증은 위 두 시뮬레이터에서 완료했다.
- App Store Connect 업로드나 기존 심사 빌드 변경은 이번 온보딩 작업에서 수행하지 않았다.

점프러쉬의 별도 웹 수정은 [조사·게시 기록](REPAIR-20261117-JUMP-ENTRY.md)을 따른다. 온보딩 추가가 해당 웹 배포 실패를 해결하지는 않는다.
