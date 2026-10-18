# iPhone 구현 인수인계 · 스트리밍 중심 UI

2026-10-18 · Android 2.5.51 (64) · 브랜치 `codex/aifect-streaming-first`

이번 문서는 **기존 iOS 앱에 적용할 최신 디자인·동작 기준**이다. Android는 구현했으며, iOS SwiftUI 화면에 이번 디자인을 모두 이식하거나 Xcode 빌드한 상태는 아니다. 이전 인수인계와 충돌하는 화면 배치는 이 문서와 최신 Android 소스를 우선한다. 기존 재생·녹음·결제·세션을 재사용한다.

## 먼저 볼 자료

1. [사용자가 다시 준 승인 보드](../../docs/ui/aifect-20261018/resupplied/approved-streaming-first.png)
2. [구현 범위·동작 기준](../../docs/ui/aifect-20261018/resupplied/IMPLEMENTATION_BRIEF.md)
3. [최신 Android 실행 화면 갤러리](streaming-20261018/index.html) — 홈·커뮤니티·부르기·메시지·마이 및 연결 화면
4. [마이 메뉴 제거·커뮤니티 밀도 변경](../../docs/ui/aifect-20261018/COMPACT_COMMUNITY.md), [메시지·로그인 변경](../../docs/ui/aifect-20261018/SOCIAL_AND_LOGIN.md), [팝업을 페이지로 변경](../../docs/ui/aifect-20261018/PAGE_NAVIGATION.md)

캡처는 실제 Android 앱을 격리된 에뮬레이터 데이터로 실행한 결과다. 사진·곡·회원·수치는 검사용이며 운영 데이터나 iOS에 복사할 샘플이 아니다. 갤러리의 일반 화면은 390dp, 작은 화면은 320dp·글자 130%다. Android 상태바/기기 테두리는 iOS 디자인 요소가 아니다.

## 승인 보드 이후 사용자가 확정한 변경

- 홈의 ‘오늘, 이 노래 어때요?’는 **파란색 필터 없이 원래 앨범 색**으로 표시한다. 글자 가독성을 위한 하단 명암만 유지한다.
- 메뉴·상세·설정·목록·편집은 **앱 안의 독립 페이지**로 이동한다. 뒤로가기와 작성 상태를 유지한다. 최종 삭제/로그아웃 확인, 시스템 공유·사진 선택·인증 화면은 역할에 맞는 시스템 UI를 사용한다.
- **마이 상단의 세 줄 전체메뉴를 제거**하고 설정 버튼만 유지한다. 홈·부르기의 기존 전체메뉴 진입은 남겨 둔다.
- 커뮤니티는 보드의 세로로 큰 이미지를 그대로 쓰지 않고 **한 화면에 카드가 더 보이는 낮은 카드**로 확정했다. 390dp에서 미니플레이어 위로 카드 두 개와 다음 작성자 줄이 보인다. 기본 이미지 비율 2.15:1, 큰 글자에서는 1.9:1. 커버 업로더 사진은 위쪽 정렬, 원곡 커버는 가운데 정렬한다. 장식용 음파 막대는 넣지 않는다.
- 메시지는 작은 원형 프로필과 이름·최근 메시지·시간·읽지 않은 개수를 보여주는 연속 목록이다. 필터는 **전체 / 안 읽음 / 크루 / 알림**. 미지원 ‘공지’ 기능을 만들지 않는다.

## 화면과 실제 동작

| 화면 | 현재 Android 기준 | iPhone에서 유지할 동작 |
|---|---|---|
| 홈 | `BrowseScreens.kt`, `StreamingComponents.kt`, `ChartScreen.kt` | 추천·차트·최신곡·발견 4탭 고정. 실제 추천/기간별 차트/최신/장르 데이터. 내 음악 목록·좋아요·최근 감상·플레이리스트 바로가기 |
| 공통 플레이어 | `NativeScreens.kt`, `MusicModel.kt`, `LyricsDisplay.kt` | 하단 5탭 바로 위 작은 플레이어, 앨범/곡/아티스트/좋아요/재생·일시정지/다음 곡, 현재 가사 한 줄. 상세 플레이어에서 큐·셔플·반복. 화면 이동 중 재생 유지 |
| 커뮤니티 | `MusicCommunityScreens.kt`, `CommunityFeedCard.kt`, `BrandComponents.kt` | 추천·팔로잉·크루와 실제 음악 필터. 작성자 프로필·팔로우·좋아요·댓글·공유·재생·부르기. 더보기에서 담기·선물·원곡/다른 목소리. 듀엣 참여는 기존 초대/파트 ID 유지 |
| 부르기 | `BrowseScreens.kt`, `MainActivity.kt` | 곡 검색·솔로/듀엣 페이지·초안 이어 하기. 선택한 듀엣 ID와 원곡/키/파트를 기존 녹음기로 전달. 스트리밍과 녹음 반주 중복 방지 |
| 메시지 | `MessageInbox.kt`, `SocialScreens.kt`, `NativeChatCache.kt` | 검색·새 대화·필터·읽음/배지·크루 고정 진입. 프로필 사진은 프로필, 행은 대화. 뒤로가기 시 필터/검색 보존. 대화 중 미니플레이어 UI 숨김과 음악 유지 |
| 마이 | `MusicCommunityScreens.kt`, `NativeScreens.kt` | 내 음악/내 활동 분리. 홈과 같은 보관함·좋아요·플레이리스트·최근 감상. 프로필/레벨은 실제 값. 초안·스튜디오·지갑·정산·도구함 접근 유지. 전체메뉴 없음 |
| 페이지 이동 | `AppPages.kt`, `NavigationScreens.kt`, `MusicModel.kt` | 모달을 쌓지 않고 페이지로 이동. 원래 탭/검색/목록 상태 복귀, 미니플레이어와 안전 영역 유지 |

Android 파일은 [`../android/app/src/main/java/kr/co/aifect/app/`](../android/app/src/main/java/kr/co/aifect/app/) 아래에 있다. 녹음 엔진은 별도 `karaoke/`에 있으며 이번 UI 때문에 재작성하지 않았다.

### 시각 토큰

현재 구현값이며 사용자가 개별 HEX를 승인한 명세라는 의미는 아니다. Android `NativeScreens.kt`와 `StreamingComponents.kt`를 기준으로 SwiftUI 토큰을 맞춘다.

| 용도 | 색 |
|---|---|
| 배경 / 기본 패널 | `#0C121B` / `#131B26` |
| 스트리밍 패널 / 테두리 | `#111D30` / `#354568` |
| 보라 / 핑크 / 시안 / 블루 | `#B49AFF` / `#F397DC` / `#79E5F2` / `#78ADFF` |
| 공통 라벤더 / 민트 | `#D6BAFF` / `#AEEBDF` |
| 보조 글자 | `#A9B0C1` |

SF Symbols로 의미가 같은 선 아이콘을 사용한다. iPhone safe area와 Dynamic Type을 따르며 최소 44pt 터치 영역을 확보한다. 카드가 많아 보이게 하려고 본문/버튼을 과도하게 축소하지 않는다. 홈 커버 색과 프로필 원형을 보존한다.

## 기존 기능·정책 보존

- 새 데모 앱이나 WebView로 갈아타지 않는다. 기존 SwiftUI 프로젝트는 [`../ios/`](../ios/README.md). `MusicPlayer.swift`, `RecordingStudio.swift`, `StorePayments.swift`, 세션/네트워크 구현을 재사용한다.
- 홈과 마이는 같은 좋아요·플레이리스트·최근 감상 상태를 사용한다. 원곡/커버 ID를 바꾸지 않는다. 서버 응답 실패를 가짜 0이나 예시 음악으로 덮지 않는다.
- 미지원 다운로드/오프라인, 허위 실시간 차트·AI 개인화, 예시 금액/숫자/회원은 구현하지 않는다.
- 실버(S)·골드(G), 정산·가입·액자·레벨 정책, 서버 업로드 한도는 현행 유지. 커버는 업로더 프사, 원곡은 등록된 앨범 이미지.
- 최근 녹음기 수정(가사 역할/수동 파트, 키 조절, 모니터링, 음색, 일시정지, 초안/저장)을 보존한다. 음정보정 제거와 솔로 현재 줄 흰색·나머지 회색 기준을 유지한다.
- Android `.test` 패키지만 Google 브라우저 로그인으로 우선 진입한다. **iOS 앱 ID/OAuth 설정을 이 테스트 패키지에 맞추지 않는다.** iOS 기존 Google/Apple/Kakao 시스템 인증 및 키체인·앱 복귀를 유지하고 확인한다.

## Mac에서 이어 작업

기존 Mac 체크아웃의 미커밋 작업부터 확인한다. 변경이 있으면 보존/커밋한 뒤 브랜치를 전환하고, 강제 초기화하지 않는다.

```sh
git fetch origin
git switch --track origin/codex/aifect-streaming-first
# 이미 로컬 브랜치가 있다면: git switch codex/aifect-streaming-first
# 그 다음: git pull --ff-only
```

`app/ios`의 기존 Xcode 프로젝트에 네이티브 화면을 반영한다. `project.yml`을 변경할 때만 기존 XcodeGen 절차에 맞춰 재생성한다. `ListenDesign.swift`, `DiscoveryViews.swift`, `SocialViews.swift`, `RedesignComponents.swift`와 실제 루트 탐색 구조를 먼저 읽고 대응한다. Android의 새 파일을 이름만 Swift로 바꾸거나 오디오 엔진까지 덮어쓰지 않는다.

### 완료 확인 항목

- [ ] 홈 4탭에서 실제 음악 탐색·재생, 홈/마이 좋아요·플레이리스트 상태 공유.
- [ ] 연속 재생·다음 곡·큐·셔플·반복·백그라운드/잠금화면 제어와 이동 중 재생 유지.
- [ ] 다섯 메인 화면을 이 갤러리와 대조. 원색 홈 커버, 낮은 커뮤니티 카드, 메시지 목록, 마이 메뉴 제거 확인.
- [ ] 페이지 뒤로가기·긴 곡명·320pt/큰 글자·키보드/하단 안전 영역·빈/오류/로그아웃 상태 확인.
- [ ] 듀엣 참여 ID/파트 보존, 초안 복원, 실제 iPhone 마이크·키 조절·이어폰 모니터링·녹음 저장 확인.
- [ ] Google/Apple/Kakao 로그인 후 앱 복귀·재시작 세션·로그아웃 확인.
- [ ] iPhone 푸시 누락 제보 점검: 권한 요청·APNs/FCM 토큰 등록·알림 클릭 경로·읽음 배지·계정 변경 정리. `PushNotifications.swift`가 존재한다는 것만으로 완료 처리하지 않는다. 실제 전경/배경/종료 상태에서 확인. [이전 푸시 메모](IOS-HANDOFF-20261017.md#iphone-후속-작업-푸시-알림-누락-2026-10-17)
- [ ] 단위/화면 검사, Release archive 및 실제 iPhone 화면 검증 후 TestFlight 여부 결정.

## 검증 범위

Android의 앞선 최신 화면 검사는 홈/보관함/재생/듀엣/메시지/페이지 복귀 등을 포함하며 세부 결과는 위 검토 문서에 있다. 마지막 커뮤니티 변경 후 관련 3개 검사, 최종 이미지 정렬 1개 재검사, 320dp·큰 글자 1개 검사를 통과했다. Google 테스트 앱 로그인은 사용자가 성공을 확인했다. 이번 출시용 빌드 결과는 [Android 출시 기록](ANDROID-RELEASE-20261018.md)에 별도로 기록한다.

실제 음질·마이크·과금·선물·운영 녹음 게시, 모든 하위 화면과 TalkBack, iOS 새 디자인은 검증 완료로 주장하지 않는다. 기존 `webParityGiftQuantityAndActivityHistory`의 알림 목록 fixture 검사 실패도 이번에 해결됐다고 처리하지 않았다.
