# AIFECT Android 메뉴 페이지 전환

2026-10-18 · `codex/aifect-streaming-first` · 기준 커밋 `dc1afbf`

사용자가 요청한 메뉴의 팝업 제거와 홈 배너의 블루 필터 제거를 기존 Android 앱에 적용했다. 별도 데모 앱이 아니다.

## 동작 변경

- 계정·설정·알림·선물·정산·도구함·재생목록·곡/프로필 상세 등 하단 시트로 열리던 화면 27곳을 앱 내부 페이지로 전환했다. 곡 더보기·정렬·은행 선택 메뉴도 페이지로 열린다.
- 플레이리스트 편집, 아티스트/장르 선택, 크루 편집·멤버 관리, 댓글 신고, 사진 확대도 페이지로 전환했다.
- 상단 뒤로가기와 Android 뒤로가기로 이전 화면에 복귀한다. 이전 화면의 스크롤과 작성 중인 입력값을 유지하며, 하단 주요 메뉴를 선택하면 열린 페이지를 정리한다.
- 새 페이지를 열어도 재생 세션과 미니플레이어를 유지한다. 확장 플레이어에서는 중복 미니플레이어를 숨기고, 다음 곡의 가사도 계속 갱신한다.
- 홈의 ‘오늘, 이 노래 어때요?’ 배너에서 파랑/보라색 전체 이미지 오버레이를 제거했다. 원본 커버 색상을 표시하고, 글자에만 그림자를 적용했다.
- 삭제·선물 전송·정산·저장하지 않은 변경사항 폐기 등 최종 확인창은 유지했다. Android 파일 선택/권한·Google Play 결제창과 별도 녹음 Activity의 도구 창은 이번 일반 메뉴 전환 범위에 포함하지 않았다.

## 변경 파일

`app/android/app/src/main/java/kr/co/aifect/app/` 기준:

| 파일 | 변경 |
|---|---|
| `AppPages.kt` (신규) | 앱 내부 페이지 스택, 뒤로가기, 메뉴/폼 페이지 공통 구조. 현재 페이지만 배치하고 접근성에 노출한다. |
| `NativeScreens.kt`, `MusicModel.kt`, `NavigationScreens.kt` | 앱 루트/하단 메뉴 연결, 계정 하위 페이지 복귀, 가사 갱신 위치, 주요 상세·설정 페이지. |
| `BrowseScreens.kt`, `BrandComponents.kt` | 원본 커버 색상, 보관함·정렬·곡 메뉴 페이지. |
| `ActivityScreens.kt`, `ChatFeatures.kt`, `SocialScreens.kt` | 알림·활동·채팅 설정·크루 관련 페이지. |
| `CreatorStudioScreen.kt`, `ArtistPhotoGallery.kt`, `CommentReportDialog.kt` | 편집 선택 화면·사진·신고 폼 페이지. |
| `CoverRankingScreens.kt`, `DiamondScreen.kt`, `GiftScreens.kt`, `PlayBillingScreen.kt`, `PlayerProgress.kt`, `PlayerQueueSheet.kt`, `ProfileScreens.kt`, `RecordingDraftsScreen.kt` | 기존 하단 시트를 전체 콘텐츠 페이지로 전환. |

`app/android/app/src/androidTest/java/kr/co/aifect/app/DesignCaptureTest.kt`에 메뉴 복귀/입력 보존/취소 시 미저장/확장 플레이어 가사 갱신 검사 4개를 추가했다. 서버·정산 정책·녹음 엔진은 변경하지 않았다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| Debug 앱·instrumentation APK 빌드 | 성공 |
| JVM 단위 검사 | 61개 통과, 실패·오류·건너뜀 0 |
| Android Lint | 오류 0, 경고 118 |
| 선택 기능 회귀 | 23개 통과 (77.238초) |
| 320dp 폭·글자 130% | 메뉴 복귀·플레이리스트 편집·주요 화면 3개 통과 (14.341초) |
| `git diff --check` | 통과 |

23개는 홈 4개 탭, 홈/마이 보관함 연결, 재생 유지, 플레이리스트 재생/변경/응답 순서, 듀엣·초안 복원, 빈 화면/로그인 필요, 메뉴·스튜디오·차트·곡 목록·크루·음질 표시와 신규 4개 검사를 포함한다. 작은 화면 3개 중 메뉴/편집 2개는 위 검사의 다른 화면 크기 재실행이다. 전체 instrumentation 테스트를 모두 실행한 결과는 아니다.

캡처 30장은 실제 기존 앱을 에뮬레이터에서 실행한 화면이다. 로컬 HTTP 테스트 데이터와 무음 WAV를 사용하므로 운영 회원·실제 소리의 검증은 아니다. 기본 390dp(780×1688px, density 320), 추가 320dp(640×1280px)/글자 130%로 검사했으며 기기 설정을 복원했다.

## 휴대폰 설치

Samsung SM-F761N에 `adb install -r` 결과 `Success`를 확인했다. 설치한 앱은 **AIFECT테스트** (`kr.co.aifect.app.test`), 버전 2.5.50(63), 갱신 시각은 2026-10-18 22:11:21이다. 기존 데이터는 삭제하지 않았고 테스트 fixture나 instrumentation APK는 휴대폰에 설치하지 않았다.

실행 명령을 전달했으나 `KeyguardServiceDelegate showing=true`로 휴대폰이 잠겨 있어 실물 화면은 확인하지 못했다.

## 한계와 후속 범위

- 실제 마이크·음질·키 조절·모니터링, 운영 녹음 저장/게시·결제·정산은 미검증이다.
- 프로세스 강제 종료 후 페이지 복원, TalkBack 전수 검사는 하지 않았다.
- 앞선 `webParityGiftQuantityAndActivityHistory`의 알림 목록 검사 실패는 이번 변경으로 해결됐다고 처리하지 않았다. 운영/기준 커밋에서도 발생하는지는 미확인이다.
- 커뮤니티·메시지 전체 시각 개편은 2차 범위로 남는다. 이번에는 관련 팝업 메뉴의 이동 방식을 변경했다.
- 원격 push·PR·운영 브랜치 병합·배포·스토어 업로드는 하지 않았다.

## 검토 자료

- 비교 페이지: `http://127.0.0.1:4199/revision/`
- 자료 폴더: `C:/Users/lseve/Documents/ChatGPT/aieffect/artifacts/AIFECT-streaming-first-review-20261018/revision/`
- 로그: `checks/page-build-final.txt`, `checks/page-tests.txt`, `checks/page-small-screen.txt`, `checks/page-install.txt`, `checks/summary.json`
- 새 메뉴 캡처: `24-account-page.png` ~ `30-small-playlist-edit-page.png`
- 빌드 명령: `./gradlew.bat -PaifectTest :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lintDebug` (`app/android`, Android Studio JBR/SDK 사용)
