# AIFECT Android 커뮤니티·메시지 및 로그인 보완

2026-10-18 · `codex/aifect-streaming-first` · 기준 커밋 `814e638`

승인된 5화면 보드와 `resupplied/IMPLEMENTATION_BRIEF.md`를 기준으로, 기존 앱에서 아직 예전 형태로 남아 있던 커뮤니티 피드와 메시지 목록을 수정했다. 홈·부르기·마이·공통 미니플레이어는 앞선 구현을 유지한다. 별도 데모 앱이나 웹 UI 변경이 아니다.

## 화면과 동작

- 커뮤니티: 상단 추천·팔로잉·크루 탭, 작성자 프로필/시간/팔로우, 큰 커버 이미지와 제목·소개, 좋아요·댓글·공유·함께 부르기를 배치했다. 커버 이미지는 업로더 프로필 정책을 유지한다. 전체/커버/듀엣/제작곡 필터는 상단 설정 버튼의 페이지로 이동했다.
- 기존 곡 ID로 재생·담기·선물·댓글을 연결한다. 더보기와 원곡 듣기도 남아 있다. 참여 가능한 듀엣은 원곡 ID와 듀엣 부모 ID를 녹음 화면에 전달한다. 자신의 참여 대기 듀엣에 스스로 참여하는 버튼은 표시하지 않는다.
- 메시지: 원형 프로필, 이름, 최근 대화, 상대 시간, 안 읽은 수를 간결한 목록으로 구성했다. 전체·안 읽음·크루·알림 필터, 현재 대화 검색, 새 대화 페이지를 연결했다.
- 시안의 공지 전용 기능은 현재 지원하지 않아 실제 선물·참여 알림 기록으로 연결하는 ‘알림’을 사용한다. 크루/DM 데이터와 수치는 기존 서버 응답을 사용한다.
- 프로필 사진은 상대 페이지, 대화 행은 DM으로 열린다. 대화·크루 채팅에서 복귀할 때 검색 조건과 필터를 보존한다. 기존 DM 실시간 연결, 읽음 처리, 기기 캐시, 작성 중인 초안, 크루 초대 메시지 동작을 유지한다.
- 메뉴와 새 대화는 앱 내부 페이지로 열린다. 크루 상세·개별 채팅 내부 전체 디자인은 이번에 다시 만들지 않았다.

## Google 로그인

테스트 패키지(`kr.co.aifect.app.test`)의 Google Credential Manager 인증이 실패하는 것을 확인했다. 기존 Firebase 등록 패키지와 테스트 패키지가 달라지는 구성은 확인했지만 Google 콘솔의 전체 OAuth 등록 상태까지 확인한 것은 아니다.

테스트 APK의 Google 버튼은 이미 운영 서버가 제공하는 브라우저 인증과 일회성 ticket/verifier 교환을 사용하도록 연결했다. 운영 패키지의 네이티브 Google 로그인은 유지하며 브라우저 대체 경로를 제공한다. 돌아올 때 인증을 교환하고, 미완료(409) 상태에서는 verifier를 유지한다. 외부 도메인으로의 인증 시작 URL은 거절하며, 취소/만료·실패 안내와 수동 완료 확인 버튼을 제공한다. 서버는 수정하지 않았다.

사용자가 휴대폰에서 Google 인증을 완료하고 **‘로그인됐어’라고 확인했다.** 테스트 fixture의 성공과 실사용자의 인증 성공을 구분해서 기록한다.

## 변경 파일

`app/android/app/src/main/java/kr/co/aifect/app/` 기준:

| 파일 | 변경 내용 |
|---|---|
| `CommunityFeedCard.kt` (신규) | 승인 보드의 큰 이미지 피드 카드, 반응·재생·참여·기존 곡 메뉴, 상대 시간 |
| `MessageInbox.kt` (신규) | 대화 목록·검색·필터·크루 행·새 대화 페이지 |
| `MusicCommunityScreens.kt` | 추천/팔로잉/크루 탭 및 음악 종류 필터 |
| `SocialScreens.kt` | 새 메시지 목록 연결, 대화/크루 복귀 시 목록 상태 유지 |
| `NativeScreens.kt` | 커뮤니티/메시지 중복 상단 제거, 로그인 안내/완료 확인 |
| `MainActivity.kt`, `MusicModel.kt` | 테스트 Google 브라우저 인증, 인증 대기/완료 상태 및 안전한 URL 확인 |

`DesignCaptureTest.kt`에 로그인 2개·커뮤니티 1개·메시지 1개 검사를 추가했다. `NativeAppTest.kt`의 기존 팔로워/DM 검사 2개는 앞선 마이·홈 디자인 변경으로 사라진 문구를 찾고 있어서 현재 화면 선택자로 갱신했다. 뒤로가기, 지연 응답, 프로필 복귀의 핵심 검증은 유지했다.

## 검증

| 검사 | 결과 |
|---|---|
| Debug 앱·instrumentation APK 빌드 | 성공 |
| JVM 단위 검사 | 61개 통과, 실패·오류·건너뜀 0 |
| Android Lint | 오류 0, 경고 119 |
| 선택 기능 검사 | 최종 14개 통과: 첫 실행 12/14, 예전 화면 문구를 찾던 2개 선택자 수정 후 2/2 통과 |
| 320dp 폭·글자 130% | 새 커뮤니티·메시지 검사 2개 통과 (16.157초) |
| 휴대폰 업데이트 설치 | `adb install -r`: Success |

14개는 신규 인증·피드·대화 검사 4개, 기존 크루 채팅/초대/긴 제목, 홈 4탭, 미니플레이어, 페이지 복귀, DM 프로필/지연 응답/반복 복귀, Google nonce 쿠키 검사를 포함한다. 전체 instrumentation 전수 검사는 아니다. 초기 실패 로그와 재실행 로그를 모두 보관했다.

실행 캡처 31~38은 에뮬레이터에서 기존 앱을 실행한 결과다. 31~36은 390dp(780×1688px), 37~38은 320dp(640×1280px)/글자 130%이며 검사 후 기기 설정을 복원했다. 캡처의 사진·곡·회원·수치는 로컬 테스트 데이터다. 운영 데이터나 시안의 가짜 수치를 앱에 넣은 것이 아니다. 녹음 테스트는 진입 대상 ID를 확인하며 실제 마이크를 녹음하지 않는다.

## 설치 결과

Samsung SM-F761N의 **AIFECT 테스트** (`kr.co.aifect.app.test`), 버전 2.5.50(63)에 2026-10-18 22:48:36 업데이트 설치했다. 사용자 앱 데이터는 지우지 않았으며 테스트 fixture나 instrumentation APK를 실제 휴대폰에 설치하지 않았다. 실행 명령도 전달했다. 휴대폰 잠금 상태 때문에 최신 두 화면의 실물 캡처는 확인하지 못했으며 제공 캡처는 에뮬레이터 결과다.

APK SHA-256: `DC4AF5F9691DF6874BF16DF001DE90573663D207F91A4FFC95F09EA9D2659D00`

## 미검증·남은 범위

- 실제 Google 로그인은 사용자 성공 확인이 있으나 카카오·Apple 로그인과 운영 패키지 OAuth 설정 전수 검사는 하지 않았다.
- 실제 마이크/키 조절/모니터링/음질, 운영 녹음 게시·선물 전송·결제·정산은 이번 검증 범위가 아니다. 녹음 엔진과 정책은 변경하지 않았다.
- 크루 상세, 개별 대화 내부, 스튜디오 등 모든 하위 화면이 승인 보드와 같은 시각 디자인으로 완성됐다는 의미는 아니다.
- 프로세스 강제 종료 후 페이지 복원과 TalkBack 전수 검사는 하지 않았다.
- 앞선 `webParityGiftQuantityAndActivityHistory`의 알림 목록 검사 실패는 이번에 해결됐다고 처리하지 않았다.
- 원격 push·PR·운영 브랜치 병합·배포·스토어 업로드는 하지 않았다.

## 검토 자료

- 시안 대조: `http://127.0.0.1:4199/revision/` — 홈/커뮤니티/부르기/메시지/마이 탭
- 자료: `C:/Users/lseve/Documents/ChatGPT/aieffect/artifacts/AIFECT-streaming-first-review-20261018/revision/`
- 새 캡처: `screens/31-browser-login.png` ~ `screens/38-small-messages.png`
- 로그: `checks/social-build-final.txt`, `checks/social-tests-initial.txt`, `checks/social-followers-tests.txt`, `checks/social-tests-final.txt`, `checks/social-small-screen.txt`, `checks/social-install.txt`
- 빌드: `./gradlew.bat -PaifectTest :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lintDebug` (`app/android`, Android Studio JBR/SDK)
