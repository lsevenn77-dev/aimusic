# AIFECT 아이폰 작업 인계 · Android 2.5.97 (110)

## 기준

| 항목 | 확인값 |
| --- | --- |
| Git 브랜치 | `ios/from-android-2.5.97` |
| Android 기준 커밋 | `e03177c43c1629de75516caff7c95c2845725d2d` |
| 아이폰 프로젝트와 스킴 | `app/ios/AIFECT.xcodeproj` · `AIFECT` |
| 기존 iOS 프로젝트 설정 | 앱 ID `kr.co.aifect.app` · iOS 17.0 이상 · 버전 1.0.5 (14) |
| iOS 구현 | SwiftUI, AVFoundation, StoreKit 2 |
| 제외한 기능 | 실시간 더빙룸. 일반 더빙, 토킹룸, 노래방은 이관 범위에 포함 |

갤럭시에서 확인한 설치본은 2.5.98 (111)이다. 기기 APK와 로컬 서명 APK의 SHA-256이 일치했다. 2.5.97 이후 커밋은 실시간 더빙룸 구현 `7bac809`와 해당 빌드의 버전 변경 `b113e96` 두 개다. 아이폰 작업 브랜치는 그 직전 Android 트리에서 시작한다.

## 이번 Swift 변경

- 프로필 액자는 서버의 `profile_frame_display`에서 오버레이, 효과 이미지, 배율을 읽는다. JSON 객체·문자열과 기존 `profile_frame_artwork` 형식을 지원한다.
- 골드 선물 선택 화면에 카탈로그의 상품 이미지를 표시한다. 이미지가 없거나 내려받지 못하면 기존 선물 아이콘을 표시한다.
- AIFECT 미디어는 기존 인증 경로를 사용한다. 외부 HTTPS 카탈로그 이미지는 쿠키와 자격 증명이 없는 별도 세션에서 가져온다.
- `AIFECTTests/OctoberParityTests.swift`에 카탈로그 URL, 신형·기존 액자 응답의 회귀 검사를 추가했다.

## Mac에서 이어서 실행

기존 Mac의 체크아웃에서 먼저 `git status -sb`와 `git log -1 --oneline`을 확인한다. Mac에 별도 변경이 있으면 아래 새 작업 폴더와 비교해 통합한다. 새 폴더는 다음과 같이 받을 수 있다.

```sh
git clone --branch ios/from-android-2.5.97 https://github.com/lsevenn77-dev/aimusic.git AIFECT-iOS-2.5.97
cd AIFECT-iOS-2.5.97
git rev-parse HEAD
open app/ios/AIFECT.xcodeproj
```

1. Mac에 이미 설치된 AIFECT의 실행 대상과 버전·빌드 번호를 확인한다. Mac의 응용 프로그램, iPhone 시뮬레이터, 물리 iPhone은 각기 별도 설치 대상이다. Mac에 더 최신인 소스나 빌드가 있으면 먼저 해당 변경을 대조한다.
2. Xcode의 `AIFECT` 스킴에서 Swift 패키지를 복원한다. `xcodebuild -project app/ios/AIFECT.xcodeproj -scheme AIFECT -showdestinations`로 사용 가능한 대상을 볼 수 있다.
3. iPhone 시뮬레이터에서 아래 단위 검사를 실행한다. `SIMULATOR_UDID`에는 확인한 시뮬레이터의 실제 ID를 넣는다.

```sh
xcodebuild -project app/ios/AIFECT.xcodeproj -scheme AIFECT -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
  -only-testing:AIFECTTests test
```

4. 기존 개발용 설치 대상이 확인되면 Xcode에서 그 대상을 선택해 Run으로 업데이트한다. 원래 계정과 초안이 남아 있는지 확인한다. Mac App Store로 설치한 사본이면 해당 배포본의 버전과 개발용 실행 대상을 먼저 구분한다.
5. 실행 후 프로필 액자의 중앙 정렬·오버레이·다른 배율, 골드 선물 목록의 새 상품 이미지와 이미지 누락 시 기본 아이콘을 확인한다. 증빙에 Xcode 빌드·검사 결과, 설치 대상, 앱 버전·빌드, 실행 결과를 함께 기록한다.

## iPhone에서 이어서 대조할 기능

아래는 Android 기준 소스와 iOS에서 확인할 동작이다. 이번 Swift 변경으로 진행한 부분은 위에 따로 적었다. Kotlin 경로의 루트는 `app/android/app/src/main/java/kr/co/aifect/app/`이다.

| 기능 | Android 기준 파일 | iPhone 확인 항목 |
| --- | --- | --- |
| 일반 더빙 | `NativeDubbingScreen.kt`, `NativeDubbingAudio.kt` | 내 배역 우선, 대사별 3·2·1 카운트다운 중 효과음 지속, 준비·녹음·저장 |
| 토킹룸·노래방 | `NativeVoiceScreen.kt`, `RoomThemeSync.kt`, `VoiceRoomForm.kt` | 서버 방 테마 반영, 두 방 유형의 배경, 키보드와 채팅 입력창 위치, 오디오 전환 |
| 음악 재생·탭 복귀 | `CurrentExperience.kt`, `CurrentNavigation.kt` | 탭 변경 시 재생 위치와 목록 상태, 대화 재진입 위치 |
| 프로필·상점 | `CatalogAssets.kt`, `PlayerProgress.kt`, `GiftScreens.kt` | 카탈로그 이미지, 선물 목록·잔액, 프로필 액자와 방 배경 |
| 녹음·게시 | `karaoke/KaraokeActivity.java` | 녹음 효과, 재시작, 기존 초안 복원, 편집 후 게시 진입 |

기준 커밋에서 Android Debug 단위 검사 27개 클래스의 112개 테스트가 모두 통과했다(실패·오류·건너뜀 0). iOS 스킴과 패키지 잠금 파일을 읽고, 수정한 Swift 파일 4개가 해당 Xcode 타깃의 소스에 포함된 것을 확인했다. 이후 iPhone 17 Pro 시뮬레이터에 1.0.5 (15)를 설치해 실행했고 단위 검사 64개를 통과했다. 화면별 구현 차이와 캡처는 [화면 대조](ANDROID-IOS-SCREEN-AUDIT.md)에 기록했다. 실물 iPhone 로그인·오디오·구매 검증은 남아 있다.
