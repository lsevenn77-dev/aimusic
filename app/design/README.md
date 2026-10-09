# AIFECT Android 디자인과 iOS 적용 기준

**2026-10-09, Android 2.5.35(48), 소스 `6c2c209` 기준의 실제 화면 36장**이다. **먼저 [index.html](index.html)을 브라우저로 열어 화면을 비교한다.** 최신 원본은 [screens/2.5.35/](screens/2.5.35/)에 있다. Android 15 가상기기(390×844dp, PNG 780×1688)에서 실제 제품 UI에 로컬 샘플 데이터를 넣어 촬영했다. 신규 UI 시안이나 웹 화면 캡처가 아니다.

샘플 이름·프로필 사진·가사·가격·잔액·랭킹 수치를 제품 데이터로 복사하지 않는다. Android 상태 표시줄·키보드·상단 흰색 창 핸들도 iOS UI 구성요소가 아니다. 녹음 화면은 실제 마이크 대신 UI 상태와 합성 오디오로 재현했으며, 메시지 전송·구매·게시를 운영 서버에 수행하지 않았다.

Xcode 프로젝트와 iOS 화면 소스는 [`../ios`](../ios/README.md)에 있다. 이 폴더의 `ios/`는 공용 디자인 토큰과 리소스 원본이며, 적용·검증 상태는 실제 iOS 프로젝트의 README를 따른다. 최신 Android 구현은 `../android/app/src/main/`에 있다. 이전 README의 버전별 기록이나 오래된 웹 스크린샷보다 이 문서와 현재 소스를 우선한다.

## 최신 화면을 확인하는 순서

1. [메인 6화면](overview.png): 홈·커뮤니티·부르기·메시지·마이·플레이어.
2. [DM·크루·키보드](social-flow.png): 크루 채팅 상단 고정, 크루 홈, 대화와 키보드.
3. [프로필·갤러리·선물](profile-flow.png): 사진 비율, 개인 선물, AI 가수 갤러리.
4. [녹음·듀엣·후처리](recording-flow.png): 파트 지정, 다음 가사, 소리·리버브, 싱크와 저장.
5. [전체 36장 갤러리](index.html): 이미지를 누르면 원본 크기로 열린다. [화면 목록](screen-catalog.json)에 설명과 Android 구현 파일이 함께 있다.

`screens/` 바로 아래의 PNG는 10월 7일 기록이다. 최신 구현 기준으로 사용하지 않는다. 당시 메타데이터는 [capture-manifest-20261007.json](capture-manifest-20261007.json)에 보관했다.

## 2026-10-09 AI 가수 갤러리 · 로그아웃

- AI 가수 상세는 **음악 / 갤러리** 탭으로 구분한다. 갤러리는 음악 커버 목록과 별도이며, 모바일 2열 정사각형 사진을 탭하면 원본 비율로 확대한다.
- 제작자만 사진 추가·삭제 가능. 최대 30장, 장당 5MB. 클라이언트에서 긴 변 1600px 이하 WebP로 변환한다. 웹은 여러 장 선택, Android는 한 장씩 추가한다.
- `GET /api/artists/:id`에 `gallery: [{id,image_version,created,url}], can_manage, gallery_limit`이 추가됐다. 단독 갤러리 조회는 `GET /api/artists/:id/gallery` (`photos, can_manage, limit`).
- 업로드 `PUT /api/artists/:id/gallery`에 이미지 바이너리, 삭제 `DELETE /api/artists/:id/gallery/:photoId`. 응답의 `url`을 사용하고 버전 쿼리를 유지해 이미지 캐시를 재사용한다. 쓰기 후 가수 프로필 캐시를 무효화한다.
- **마이 제목 오른쪽에 ‘로그아웃’ 텍스트 버튼**을 바로 노출한다. 확인 후 기존 로그아웃 절차(세션·재생·계정별 상태 정리)를 실행한다. 계정 설정 안의 기존 로그아웃도 유지한다.
- 참고 구현: `ArtistPhotoGallery.kt`, `NativeScreens.kt / ProfileSheet`, `MusicCommunityScreens.kt / MyMusicScreen`, 웹 `dist/artist-gallery.js`.
- 웹 갤러리 업로드·확대·로그아웃을 모바일 폭에서 확인했고 Android Kotlin 컴파일을 통과했다. 네이티브 iOS 적용·검증 결과는 [`../ios/README.md`](../ios/README.md)를 따른다.

## 자료

| 파일 | 용도 |
| --- | --- |
| [index.html](index.html) | 실제 화면 갤러리, 화면별 설명, iOS 적용 체크리스트 |
| [overview.png](overview.png), [social-flow.png](social-flow.png), [profile-flow.png](profile-flow.png), [recording-flow.png](recording-flow.png) | 최신 캡처로 만든 비교 보드 4장 |
| [screens/2.5.35/](screens/2.5.35/) | 최신 Android 화면 36장, 원본 PNG |
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

현재 공통 헤더는 로고 **124×30pt**, 상하 여백 **8pt**다. 최신 갤러리에도 이 크기가 반영되어 있다. iOS에서는 `tokens.json`과 SwiftUI 파일의 치수를 적용한다. 녹음은 별도 화면 구조이므로 녹음 캡처도 함께 확인한다. 홈 화면 앱 아이콘 크기는 변경하지 않는다.

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
5. 크루 홈은 대표 이미지와 최신 음악을 먼저 보여주고, 채팅 진입 링크를 둔다. 메시지 목록에서는 내 크루 채팅을 최상단에 고정한다. 로컬 캐시는 계정·대화방 단위로 분리하며 서버의 권한과 가입 시점을 확인한다. 이전 대화를 가져오지 않는 정책 때문에 채팅 화면 자체를 숨기지 않는다.
6. 320/390/430pt, 큰 글씨, 키보드 표시, 노치와 홈 인디케이터에서 확인한다. 녹음 현재 가사 아래 다음 두 줄과 다음 내 차례가 보이는지 확인한다. 재생 가사 한 줄 규칙을 녹음에 적용하지 않는다.

## 자산 재생성

이 폴더에서 `npm install` 후 `npm run brand`. `sharp`로 저장소의 SVG를 래스터화하므로 스크린샷, 외부 폰트, 개인 계정이 필요 없다. Android의 현재 adaptive/monochrome 벡터와 PNG fallback, 공통 assets, iOS 모든 아이콘 크기를 같은 A 마크로 유지한다.

검증: Android 일반 debug 리소스 빌드 및 lint, iOS 아이콘 크기/불투명 여부, 모든 갤러리 파일 연결을 확인한다. macOS/Xcode 빌드와 실제 iPhone 설치는 iOS 프로젝트에서 별도로 수행한다.


## 2026-10-08 · 2.5.33 변경 계약

다음 변경은 최신 Android 소스 및 웹 버전 94를 기준으로 iOS에도 적용한다. 10월 9일에 갱신한 `screens/2.5.35/`에서도 관련 화면을 확인할 수 있다.

- 메시지 목록은 내 크루 고정 카드 → 개인 대화 순서다. `GET /api/dm/summary`의 `unread`, `crew`를 사용하며, 하단 메시지 아이콘에 읽지 않은 개수를 표시한다. 크루 홈의 채팅 링크도 동일한 대화로 이동한다.
- 개인 대화마다 알림 켜기/끄기, 사진, 선물을 제공한다. 기기의 사진을 WebP로 변환한 뒤 `PUT /api/dm/:peerProfileId/images`, 반환된 ID를 `POST /api/dm/:peerProfileId`의 `image_id`로 보낸다. 5MB 제한. 로그인한 발신자·수신자만 사진을 열 수 있고 차단 관계에는 노출하지 않는다.
- 사진은 업로드 14일 후 접근이 만료된다. 서버 파일 정리는 API/내부 작업 요청 시 최대 5분 간격으로 예약되고, 실패한 삭제는 재시도한다. Worker `scheduled` 진입점도 제공하지만 이번 배포에 별도 cron은 설정하지 않았다. 따라서 트래픽이 없으면 물리 삭제는 다음 정리 실행까지 늦어질 수 있다.
- `DELETE /api/dm` 및 `DELETE /api/dm/:peerProfileId`는 **내 기록만** 삭제한다. 상대방의 기록은 유지한다. 서버의 `cleared_sequence` 이전 캐시도 제거해야 재접속 시 되살아나지 않는다.
- `POST /api/crews/:id/read`는 읽은 sequence만 갱신한다. 새 가입자는 가입 시점 이전 내용을 가져오지 않는다. 연결됨 같은 정상 연결 문구를 반복 표시하지 않는다.
- 새 부르기는 항상 처음부터 시작한다. 초안 목록에서 선택한 경우만 `resumeDraft=true`, `draftFolder`로 이어서 녹음한다. 새 녹음은 별도 take 폴더를 사용해 기존 초안을 덮어쓰지 않는다.
- 한글 입력은 조합 중인 텍스트를 자르거나 새 문자열로 교체하지 않는다. Android는 TextFieldValue의 composition을 유지하고 IME 완료 시점 이후에만 전송한다.
- 부르기 곡 행을 줄이고 커버 랭킹 진입을 추가했다. 하단 라벨 기준선과 프로필 수치를 맞추고 화살표·셔플을 단순한 벡터로 통일했다. 선물 아이콘은 투명 배경, 보상은 별도 민트 배너, 골드 충전은 전체 너비 버튼을 쓴다.

관련 구현: `ChatFeatures.kt`, `MusicIcons.kt`, `SocialScreens.kt`, `NativeChatCache.kt`, `MusicModel.kt`, `NativeApi.kt`; 웹 `server/chat-features.js`, `dist/chat-features.js`, `dist/october-polish.css`. 데이터 변경은 `0034_chat_images_and_inbox.sql`이다.


## 2026-10-08 · 2.5.34 변경 계약

이 항목은 iOS 구현용 **소스 전달**이다. 웹·서버 구현은 저장소 루트의 `ai음원사이트/`, Android 구현은 `app/android/`에 함께 들어 있다. Git 전달 자체는 운영 서버 배포, iOS 빌드 또는 iPhone 설치를 수행하지 않는다. 새 API를 운영 앱에서 사용하기 전에 `0035_personal_gifts_and_crew_mute.sql`, `0036_gift_tax_reserve.sql`과 서버 코드를 함께 배포해야 한다. 아래는 2.5.34부터 적용한 계약이며 최신 캡처는 `screens/2.5.35/`를 사용한다.

골드 충전 시에는 약속한 골드 수량을 그대로 지급한다. 세금·수수료는 서버가 현금 정산액을 계산할 때 한 번만 반영한다. iOS는 서버의 정산액에서 세금·수수료를 다시 빼거나 골드 수량을 현금 지급액으로 표시하지 않는다. 웹 5% 추가 골드는 확정하여 반영했다. 앱·웹 공통 고정 정산 단가로 바꾸지는 않으며, 서버가 기록한 충전 건별 정산 기준을 사용한다.


- 표시 이름에 가입한 크루명을 붙인다: `코코(양꼬치)`. 계정/프로필 편집용 `name`은 원래 아이디이며 `display_name`은 화면 표시용이다. 크루명은 저장된 닉네임을 덮어쓰지 않는다.
- 개인 선물: `GET/POST /api/producers/:profileId/gifts`. 음원이 없는 사람에게도 직접 보낼 수 있다. POST는 기존과 같은 `gift_type`, UUID `request_id`를 사용한다. 중복 요청은 추가 차감하지 않으며 다른 수령자로 재사용할 수 없다.
- 프로필 사진 아래 `선물 랭킹 TOP 50`을 둔다. 위 GET 응답의 `ranking`은 누적 점수순 최대 50명이며, 1G·무료 응원별 1개 각각 1점이다. `profile_id`, `image_version`으로 사진·프로필 링크를 연결하고 무료 별과 골드를 구분해 표시한다.
- 크루 채팅의 종 모양 버튼: `GET/PUT /api/crews/:id/settings`, PUT `{muted:true/false}`. 서버가 개인별 설정을 보관한다. 알림만 끄며 메시지/읽지 않은 개수는 유지한다. `/api/dm/summary`의 `crew.muted`, 크루 상세의 `membership.muted`로 초기화한다.
- 신규 푸시 종류: `crew`는 target 크루 ID의 채팅을, `person_gift`는 target 프로필 ID를 연다. 각각 기존 dm/gift 전체 알림 설정을 따른다.
- 웹 충전은 기본 수량의 **5% 추가 증정**이다. 5,000원 → 525G, 10,000원 → 1,050G, 50,000원 → 5,250G, 100,000원 → 10,500G. `GET /api/gold`의 기존 `packs`는 인앱 기본 수량이고 `web_packs`에 `{gold, bonus_gold, total_gold, price}`가 추가됐다. 웹 주문 요청의 `gold`는 기본 상품 ID(예: 1000)이며 서버가 실제 지급량(1050)을 결정한다. 기본·추가 골드를 합쳐 한 구매 건으로 저장하고, 중복 콜백은 재지급하지 않는다. 기존 주문 재시도는 그 주문의 수량을 유지한다. 전액 환불 시 추가 골드도 회수한다. 이미 사용된 구매 건의 환불은 정산 검토 대상으로 묶는다.
- iOS StoreKit 및 Android Play Billing 상품 ID·가격·지급량은 그대로다. 웹 보너스를 인앱 구매에 다시 적용하거나, 앱 화면의 구매 상품을 `web_packs`로 대체하지 않는다.
- 신규 충전분의 선물 정산은 세금·결제 수수료 차감 후 개인/원곡 70:30, 커버 40:30:30이다. 기존 충전 건 및 선물 배분액은 유지한다. 한국 부가세를 충전 건의 `tax_krw`에 별도 적립하고 구매 건별 FIFO로 사용한다. Apple 수수료는 세금 제외 금액에 적용한다. 스토어 수수료 추정치는 실제 정산 명세서와 대조해야 한다. 웹 추가 골드를 포함한 총 지급량에 실제 결제금액의 정산 기준액을 나눠 사용하며, 보너스를 별도 현금 매출로 더하지 않는다.

구현: `ChatFeatures.kt`, `GiftScreens.kt`, `MusicCommunityScreens.kt`, `SocialScreens.kt`, `MusicModel.kt`; 웹 마이그레이션 `0035`, `0036`. 최신 구성은 이 문서와 `screens/2.5.35/`, 해당 소스를 기준으로 한다.

검증 기록: 관련 서버 테스트 64개, 결제 화면·정책 테스트 2개 통과. Android release APK/AAB 빌드와 단위 테스트 54개 통과. 웹 5% 추가 수량을 로컬 충전 화면에서 확인했다. 웹 결제의 운영 활성화 여부는 기존 계약/서버 설정을 그대로 따르며, 이번 Git push가 결제 승인 또는 운영 배포를 뜻하지 않는다.

## 캡처 재현과 검증 범위 · 2026-10-09

JDK 21과 Android SDK를 준비하고, 전용 Android 15 AVD를 `-no-audio`로 실행한다. 일반 휴대폰이나 운영 패키지에는 설치하지 않는다.

```powershell
./app/design/capture-android.ps1 -Serial emulator-5580 -JavaHome 'C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot'
cd app/design
npm install
npm run boards
npm run catalog
```

스크립트는 `-PaifectTest`로 격리 패키지 `kr.co.aifect.app.test`를 빌드하고 로컬 HTTP fixture만 사용한다. 선택된 `DesignCaptureTest` 3개와 `KaraokeDeviceTest.captureCurrentDesignWithoutMicrophone` 1개가 성공해야 이미지를 가져온다. 버전이 바뀌면 스크립트·카탈로그·manifest 기준 정보를 함께 수정한다.

이번 캡처용 4개 시나리오는 통과했고 원본 36장의 크기·해시, 갤러리 파일 연결과 비교 보드를 확인했다. 전체 회귀 테스트나 실제 녹음 품질 검증을 뜻하지 않는다. 재사용을 시도한 기존 `duetGuideEditsPersistWithoutMicrophone`, `studioSettingsCancelApplyAndAgainPreserveTake`는 Activity 재생성 뒤 상태 복원 검증에서 실패했다. 이 두 테스트/제품 복원 동작은 이번 디자인 자료 작업에서 수정하지 않았으며, iOS도 회전·앱 재진입·명시적인 초안 복원을 각각 확인해야 한다.
