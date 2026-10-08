# AIFECT Android 디자인과 iOS 적용 기준

2026-10-07 Android 소스의 실제 화면과 새 A 마크를 iOS에 맞추기 위한 전달 자료다. **먼저 [index.html](index.html)을 브라우저로 열어 화면을 비교한다.** PNG는 기존 제품 화면에 테스트 데이터를 넣어 에뮬레이터에서 촬영한 이미지이며, 가상의 신규 UI 시안이 아니다. 테스트 이름·샘플 수치·가사·단색 이미지·상태 표시줄을 제품 콘텐츠로 복사하지 않는다.

이 저장소에는 Xcode 프로젝트와 실제 iOS 화면 소스가 없다. `ios/`는 가져다 쓸 디자인 기반과 리소스이며, 아이폰 앱에 적용되거나 iOS 빌드가 검증됐다는 의미는 아니다. 최신 Android 구현은 `../android/app/src/main/`에 있다. 이전 README의 버전별 기록이나 오래된 웹 스크린샷보다 이 문서와 현재 소스를 우선한다.

## 자료

| 파일 | 용도 |
| --- | --- |
| [index.html](index.html) | 실제 화면 갤러리, 화면별 설명, iOS 적용 체크리스트 |
| [overview.png](overview.png), [recording-flow.png](recording-flow.png) | 바로 열어 비교하는 메인 화면·녹음 흐름 디자인 보드 |
| [screens/](screens/) | 홈·커뮤니티·부르기·프로필·DM·크루·듀엣 편집·녹음·후처리 PNG |
| [tokens.json](tokens.json) | 색상, 간격, 크기, 화면 구성의 기계 판독 값 |
| [brand/aifect-app-icon-1024.png](brand/aifect-app-icon-1024.png) | 새 A 마크의 1024px 불투명 앱 아이콘 |
| [brand/aifect-app-icon.svg](brand/aifect-app-icon.svg) | 앱 아이콘 벡터 원본 |
| [brand/aifect-wordmark.svg](brand/aifect-wordmark.svg) | 둥근 그라데이션 A와 흰색 IFECT |
| [ios/Assets.xcassets](ios/Assets.xcassets/) | Xcode AppIcon·AifectMark·AifectWordmark 자산 |
| [ios/AifectDesignTokens.swift](ios/AifectDesignTokens.swift) | SwiftUI 색상·치수와 로고 View |
| [capture-manifest.json](capture-manifest.json) | 화면 생성 기준, 파일 해시와 계측 캡처 정보 |

## 제품 구성

AIFECT는 쉽게 스트리밍하면서 커버·듀엣·크루로 참여하는 음악 커뮤니티다. 홈은 음악 감상이 우선이다. 원곡과 커버 모두 재생·플레이리스트 저장·좋아요·댓글·선물·프로필로 이어진다. 커버를 저장할 때 원곡 ID로 바꾸지 않는다.

- 하단: **홈 / 커뮤니티 / 부르기 / 메시지 / 마이**. 검색은 상단 버튼이다.
- 커뮤니티: **추천 / 커버 / 듀엣 / 크루 / 팔로잉**. 추천 안에서도 크루 진입이 보인다.
- 가입한 크루: **대표 이미지와 최근 음악이 첫 화면**이다. 크루 채팅 들어가기는 메시지 안의 크루 채팅으로 연결하고, 메시지 목록 맨 위에 내 크루를 고정한다. 멤버 / 소개와 다른 크루 탐색은 별도 동선이다.
- 보관함: 플레이리스트 / 최근 감상 / 좋아요 / 내 커버곡 / 내 제작곡 / 팔로잉 / 팔로워.
- 마이: 정사각형 프로필 사진, 팔로워·팔로잉, 내 음악, 녹음 초안. 사진을 긴 가로 배너로 늘리지 않는다.
- 미니 플레이어는 하단 탭 바로 위에 둔다. 재생 가사는 한 줄 높이를 유지하고, 녹음 화면은 현재 가사와 다음 가사를 함께 보여준다.

## 색상과 형태

2.5.32 최종 헤더는 로고 **124×30pt**, 상하 여백 **8pt**다. 이전 캡처의 156×38pt 로고보다 약 20% 작다. 갤러리의 화면 구성은 유지하되 iOS에서도 `tokens.json`과 SwiftUI 파일의 최신 크기를 적용한다. 홈 화면 앱 아이콘 크기는 변경하지 않는다.

`NativeScreens.kt`의 네이티브 값을 기준으로 한다. 네이비 배경 `#10131B`, 카드 `#191E29`, 떠 있는 표면 `#242C38`. 기본 글자 `#F3F6F8`, 설명 `#A6ADBA`. 핑크 `#EF86B6`, 민트 `#8EDDD2`는 수량을 반반 배분하지 않는다. 재생·탐색·선택은 민트, 녹음·참여·좋아요는 핑크를 활용하며 보조 버튼은 중립색으로 둔다. 전체 카드에 흰 외곽선이나 진한 그라데이션을 반복하지 않는다.

좌우 여백 20~22pt, 카드 22pt·앨범 이미지 16pt 모서리. 글꼴은 iOS 시스템 글꼴과 Dynamic Type을 사용한다. 화면 제목 31, 섹션 21, 곡 제목 15, 설명 13~14pt가 Android 기준이다. 글씨가 커지면 제목·설명은 필요한 만큼 줄바꿈하고, 버튼/키보드가 가사를 덮지 않도록 한다. 최소 터치 영역 44pt, 일반 조작은 48pt 이상이다.

## 화면과 코드 대응

아래 파일은 `../android/app/src/main/java/kr/co/aifect/app/` 기준이다.

| 화면 | 구현 기준 | 반드시 유지할 동작 |
| --- | --- | --- |
| 공통·플레이어 | `NativeScreens.kt`, `LyricsDisplay.kt` | 5개 하단 탭, 미니 플레이어, 한 줄 재생 가사, 원본 비율 로고 |
| 홈·검색·부르기 | `BrowseScreens.kt` | 음악 먼저 노출, 직접 재생·담기·부르기, 검색 분리 |
| 커뮤니티·마이 | `MusicCommunityScreens.kt` | 커버 자체 저장, 크루 노출, 정사각형 프로필 사진, 목록/그리드 |
| 프로필·팔로워 | `ProfileScreens.kt`, `MusicModel.kt` | 사진/이름→프로필, 팔로워→프로필→메시지→이전 상태 복귀 |
| DM·크루 | `SocialScreens.kt`, `NativeChatCache.kt` | 채팅 껍데기 즉시 표시, 계정별 로컬 캐시, 이전 페이지 보존, 가입 시점 이후 메시지만 |
| 녹음 | `karaoke/KaraokeActivity.java`, `karaoke/LyricsTimelineView.java` | 현재·다음 가사, 모니터링, 솔로·듀엣, 안전한 일시정지와 초안 |
| 듀엣 편집 | `karaoke/DuetPartEditor.java`, `karaoke/DuetGuide.java` | 한 창에서 연속 지정, 내 파트/파트너/함께, 선택 해제, 남은 줄 지정 |
| 녹음 후 | `karaoke/KaraokeActivity.java`, `karaoke/VocalEffects.java` | 파형, 싱크, 목소리·반주, 리버브, 다시 부르기/임시 저장/저장 후 게시 |

듀엣은 성별로 나누지 않는다. 내 파트 핑크, 파트너 민트에 텍스트·아이콘을 함께 둔다. 참여자는 기존 안내를 읽기만 하고 먼저 녹음한 안내를 덮어쓰지 않는다. 자유 구간은 추정치이며 직접 보정할 수 있다. 수동 모드에서는 지정되지 않은 가사와 양쪽 파트 누락을 확인한다.

청음은 기본 100%, 조절 범위 0~100%다. iOS는 AVAudioEngine 등 플랫폼 오디오 구현이 필요하다. 디자인만 맞추면서 재생·녹음·싱크·오디오 권한을 바꾸지 않는다. 모든 기기의 물리적 0ms 지연을 보장하지 않는다.

## iOS 적용 순서

1. 실제 Xcode 프로젝트에서 기존 AppIcon 세트를 새 `ios/Assets.xcassets/AppIcon.appiconset`으로 교체한다. 동일 이름의 세트를 중복 추가하지 않는다. Target의 App Icons Source가 `AppIcon`인지 확인한다.
2. `AifectMark.imageset`, `AifectWordmark.imageset`과 Swift 파일을 앱 Target에 추가한다. 홈 화면 아이콘은 **A 마크만**, 앱 내부 헤더는 **AIFECT 전체 로고**다. 아이콘 배경은 불투명 `#0F1117`이며 둥근 모서리는 OS가 적용한다. 시작 화면도 같은 A 마크와 배경을 쓴다.
3. 기존 iOS 화면에서 토큰과 5개 탭 구조를 반영한다. SF Symbols는 headphones / person.2 / mic / bubble.left.and.bubble.right / person.crop.circle처럼 의미를 맞춘다. 로고는 template tint를 적용하지 않는다.
4. iOS의 TabView·safeAreaInset·sheet·NavigationStack에 맞추되, DM 시트를 닫으면 아래 프로필과 스크롤 위치가 그대로 남도록 한다. 뒤로가기·프로필 재선택이 반복되어도 중복 창이나 멈춤이 없어야 한다.
5. 가입한 크루는 채팅부터 연다. 로컬 캐시는 계정·대화방 단위로 분리하며 서버의 권한과 가입 시점을 확인한다. 이전 대화를 가져오지 않는 정책 때문에 채팅 화면 자체를 숨기지 않는다.
6. 320/390/430pt, 큰 글씨, 키보드 표시, 노치와 홈 인디케이터에서 확인한다. 녹음 현재 가사 아래 다음 두 줄과 다음 내 차례가 보이는지 확인한다. 재생 가사 한 줄 규칙을 녹음에 적용하지 않는다.

## 자산 재생성

이 폴더에서 `npm install` 후 `npm run brand`. `sharp`로 저장소의 SVG를 래스터화하므로 스크린샷, 외부 폰트, 개인 계정이 필요 없다. Android의 현재 adaptive/monochrome 벡터와 PNG fallback, 공통 assets, iOS 모든 아이콘 크기를 같은 A 마크로 유지한다.

검증: Android 일반 debug 리소스 빌드 및 lint, iOS 아이콘 크기/불투명 여부, 모든 갤러리 파일 연결을 확인한다. macOS/Xcode 빌드와 실제 iPhone 설치는 iOS 프로젝트에서 별도로 수행한다.


## 2026-10-08 · 2.5.33 변경 계약

기존 갤러리 PNG는 10월 7일 캡처다. 다음 변경은 최신 Android 소스 및 웹 버전 94를 기준으로 iOS에도 적용한다.

- 메시지 목록은 내 크루 고정 카드 → 개인 대화 순서다. `GET /api/dm/summary`의 `unread`, `crew`를 사용하며, 하단 메시지 아이콘에 읽지 않은 개수를 표시한다. 크루 홈의 채팅 링크도 동일한 대화로 이동한다.
- 개인 대화마다 알림 켜기/끄기, 사진, 선물을 제공한다. 기기의 사진을 WebP로 변환한 뒤 `PUT /api/dm/:peerProfileId/images`, 반환된 ID를 `POST /api/dm/:peerProfileId`의 `image_id`로 보낸다. 5MB 제한. 로그인한 발신자·수신자만 사진을 열 수 있고 차단 관계에는 노출하지 않는다.
- 사진은 업로드 14일 후 접근이 만료된다. 서버 파일 정리는 API/내부 작업 요청 시 최대 5분 간격으로 예약되고, 실패한 삭제는 재시도한다. Worker `scheduled` 진입점도 제공하지만 이번 배포에 별도 cron은 설정하지 않았다. 따라서 트래픽이 없으면 물리 삭제는 다음 정리 실행까지 늦어질 수 있다.
- `DELETE /api/dm` 및 `DELETE /api/dm/:peerProfileId`는 **내 기록만** 삭제한다. 상대방의 기록은 유지한다. 서버의 `cleared_sequence` 이전 캐시도 제거해야 재접속 시 되살아나지 않는다.
- `POST /api/crews/:id/read`는 읽은 sequence만 갱신한다. 새 가입자는 가입 시점 이전 내용을 가져오지 않는다. 연결됨 같은 정상 연결 문구를 반복 표시하지 않는다.
- 새 부르기는 항상 처음부터 시작한다. 초안 목록에서 선택한 경우만 `resumeDraft=true`, `draftFolder`로 이어서 녹음한다. 새 녹음은 별도 take 폴더를 사용해 기존 초안을 덮어쓰지 않는다.
- 한글 입력은 조합 중인 텍스트를 자르거나 새 문자열로 교체하지 않는다. Android는 TextFieldValue의 composition을 유지하고 IME 완료 시점 이후에만 전송한다.
- 부르기 곡 행을 줄이고 커버 랭킹 진입을 추가했다. 하단 라벨 기준선과 프로필 수치를 맞추고 화살표·셔플을 단순한 벡터로 통일했다. 선물 아이콘은 투명 배경, 보상은 별도 민트 배너, 골드 충전은 전체 너비 버튼을 쓴다.

관련 구현: `ChatFeatures.kt`, `MusicIcons.kt`, `SocialScreens.kt`, `NativeChatCache.kt`, `MusicModel.kt`, `NativeApi.kt`; 웹 `server/chat-features.js`, `dist/chat-features.js`, `dist/october-polish.css`. 데이터 변경은 `0034_chat_images_and_inbox.sql`이다.
