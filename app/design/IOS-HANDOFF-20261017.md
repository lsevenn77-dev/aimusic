# AIFECT web / Android handoff — 2026-10-17

Android 2.5.47 (versionCode 60) was submitted to the existing Google Play **비공테** closed-testing track. Review is pending; submission does not mean the update is already available to testers. iOS has not been built or submitted from this Windows checkout.

## Android 2.5.50 (63) — 인기 차트

- 5곡 미리보기 패널 대신 모바일 웹과 같은 연속 목록. 기간별 서버 차트와 실제 순위 변동, 좋아요/재생/담기/선물/댓글 제공. 긴 곡명은 줄바꿈하며 잘리지 않는다. `ChartScreen.kt` 참조.
- Galaxy Z Flip6에 2.5.50(63) 데이터 유지 업데이트·정상 실행 확인. Play Console 제출본은 여전히 2.5.47(60).
- Android 차트 관련 기기 시나리오 3개 통과. 웹 CSS 변경 없음. iOS에도 별도 네이티브 반영이 필요하다.

## Android 2.5.49 (62) — 모바일 웹 비교 후 네이티브 수정

- 창작자 스튜디오를 앱 내부 화면으로 구현. 외부 브라우저의 별도 로그인 때문에 막히던 진입 경로를 없앴다. 원곡 업로드·정보/앨범 커버/가사·MR·아티스트 관리와 기존 서버 한도/권한을 연결했다.
- 홈·커뮤니티·선물함·공통 버튼·녹음 컨트롤에 최신 테마와 배치를 반영. 전체 메뉴에서 웹에 있던 아티스트/공개 플레이리스트/보관함/정산 경로도 제공한다.
- Android에 크루 이름 30일 제한과 프로필 초대→DM→크루 보기 구현 완료. 아래의 크루 UI 미완료 메모는 이제 iOS에만 해당한다.
- Galaxy Z Flip6에 데이터 유지 업데이트, 버전과 정상 실행 확인. Play Console 제출본은 여전히 2.5.47(60)이며 2.5.49는 직접 설치본이다.
- release/JVM 61개 검사, 관련 기기 시나리오 9개 최종 통과. 검증 범위와 캡처는 [Android 비교 기록](ANDROID-WEB-PARITY-20261017.md)을 참고. iOS 푸시는 여전히 Mac 작업 대상이다.

## Android 2.5.48 (61) — 직접 연결한 휴대폰 업데이트

- Galaxy Z Flip6의 기존 2.5.46(59)을 데이터 유지 방식으로 2.5.48(61)로 업데이트. 기존 직접 설치본과 같은 인증서로 서명했다. Play Console에는 이번 버전을 제출하지 않았다.
- 직전 2.5.47의 선물 수량/알림/장르 사진/앨범·플레이리스트 사진/재생바/녹음 변경 포함. 여기에 공통 웹 테마 색상, 댓글 작성자 실제 프로필 사진과 답글 표시를 추가했다.
- 앱 재생바를 접어도 현재 가사 한 줄을 유지한다. 등록된 가사 유무와 기존 접근 권한은 유지한다.
- 웹 v153: 모바일 웹 접힌 재생바에서도 가사 1줄 표시, PC 재생바에 리스트 추가·선물하기·댓글 보기 표시. 장르 이미지의 음수 z-index를 제거해 모바일 합성 시 카드 배경 뒤에 가려지는 위험을 줄였다. 조사 중 Chromium에서는 기존 이미지 누락이 재현되지 않았고, 수정 후 모바일 표시를 확인했다.
- release APK 빌드와 JVM 검사 61건 통과. 격리된 에뮬레이터에서 셔플·반복·큐·접기/펼치기·가사 1줄 검사 통과. 웹 기존 검사 13건 통과. APK: `AIFECT-2.5.48-61-phone.apk` (로컬 산출물; Git에 바이너리/키 미포함).
- iOS 네이티브 푸시와 아래 크루 관리 UI 후속 항목은 계속 Mac 작업 대상이다. 웹 미러 업데이트 자체가 네이티브 구현을 대신하지 않는다.

## Current source

- Branch: `codex/android-native-app`.
- `ai음원사이트/` contains the deployed web application, assets, APIs, schema and migrations through Sites source commit `1d327092e8151d3d36ed334147414efb6a3599e6` (production version 153).
- The mirror preserves its own hosting/Git configuration. Do not overwrite production settings or replay migrations without checking the target environment.
- Production: https://aifect.co.kr

## iPhone implementation reference

- Comment responses now include the author's `profile_id` and `image_version`, including replies. Show the actual profile photo or default silhouette. Web replies include an indented L-shaped connector and a visible 답글 label.

- New crew management: owner name changes have a server-enforced 30-day cooldown. Public person profiles in web now offer **내 크루에 초대**, sending an ordinary DM via `POST /api/dm/:profileId/crew-invite` with `crew_id` and stable `request_id`, then opening the conversation. Native implementation details and validation are in [`CREW-MANAGEMENT-20261017.md`](../../ai음원사이트/docs/CREW-MANAGEMENT-20261017.md). Native app controls for these additions still need implementation/build on the respective platform.
- Desktop web lyric banner spans the full player width with a fixed 55px height (two lines); mobile web remains one line. Its dimensions stay unchanged as the lyric text changes. Google and Naver ownership verification and sitemap registration are complete; preserve both tags in `dist/index.html` (see [`SEARCH-REGISTRATION-20261017.md`](../../ai음원사이트/docs/SEARCH-REGISTRATION-20261017.md)).

- Gift catalog matches the confirmed web design: 9 silver gifts / 10 gold gifts. Display **실버 / 골드**, units **S / G**. Quantity 1–100, total cost, balance confirmation and duplicate-request protection are implemented in Android `GiftSelection.kt`, `GiftScreens.kt` and the web gift APIs.
- Activity notifications show who participated in a cover/duet or sent a gift, with date, quantity and total. The entry is available under Messages, after the pinned crew conversation, plus the profile and header notification badge. See `ActivityScreens.kt` and `/api/notifications` in the mirrored server.
- Cover artwork uses the uploader's profile; originals retain their registered album artwork. Original-song cover tabs are solo, duet and ranking by actual views.
- Owners can change original album artwork and playlist artwork. My page shows silver/gold balances and a creator-studio entry.
- Original-song upload allowance is free **3 per month**, Premium **10 per month**. Existing pricing, diamond settlement and crew/player-frame policies are retained.
- Home, community, genre images and compact song lists follow the updated web design. Community cards do not include decorative waveform bars.
- Android compact player has the current lyric, shuffle, repeat, playback controls, queue and collapse. Detailed gift/save/sing/comment actions stay in the song view.
- **The latest lyric request specifically concerns mobile web:** desktop web defaults to two lyric lines, mobile web to one. The desktop lyric toggle remains available. Screenshots below are from the deployed site, at desktop and 390px mobile viewport sizes.
- Solo recording uses white for the current line and gray for other lines. Duet parts retain three roles/colors and manual line assignment. Pitch correction is removed from the user flow; vocal tone/effect controls remain.
- Android backing-track key changes allow repeated taps without waiting for each intermediate conversion: the most recent selection wins. Key range is -6 to +6 semitones with tempo retained; selection survives activity recreation. Existing duet participation inherits the source key. `karaoke/BackingKey.java` and `KaraokeActivity.java` provide the implementation reference.

## 공통 디자인 후속 작업 (2026-10-17)

사용자가 제공한 디자인 시스템에 맞춰 **웹·모바일 웹**을 라벤더 `#B7B6FF`, 연보라 `#D6BAFF`, 민트 `#AEEBDF`, 어두운 남색 패널과 1.6px 선 아이콘으로 변경했다. 버튼·탭·메뉴의 선택 상태, 입력창, 재생바, 녹음 설정까지 적용했다. 색상/범위/검증 상세는 [`DESIGN-SYSTEM-20261017.md`](../../ai음원사이트/docs/DESIGN-SYSTEM-20261017.md)를 기준으로 한다.

- [ ] iOS 공통 테마에 위 색상, 그라데이션, 아이콘 선 두께, 흰 슬라이더 핸들을 적용하고 실기기에서 확인.
- Android 2.5.48(61): 공통 라벤더·민트/패널/테두리 색상, 흰 슬라이더 핸들 반영. 기존 선택 아이콘과 듀엣 역할 색상은 유지. 폰 설치본이 업데이트되었으며 Play에 제출된 버전은 아직 2.5.47(60)이다.
- 솔로/듀엣 가사 역할 색, 오류·성공 색, 원형 프로필·액자, 선물 이미지의 의미를 유지한다.
- 웹 실화면: [데스크톱](theme-20261017/web-desktop.png), [모바일 웹](theme-20261017/web-mobile.png).

## iPhone 후속 작업: 푸시 알림 누락 (2026-10-17)

사용자 제보: 현재 아이폰 앱에는 푸시 알림 기능이 보이지 않음. **Mac에서 이어서 구현·확인할 미완료 항목**으로 기록한다. 앱 안의 알림 기록 화면과 별도로, 앱이 백그라운드에 있거나 종료된 상태에서도 알림을 받을 수 있어야 한다. 이 메모를 추가한 시점에는 iOS 구현이나 실기기 검증을 진행하지 않았다.

- [ ] iOS 알림 권한 요청, 기기 토큰 등록·갱신, 서버 푸시 전송 연결을 점검하고 누락된 부분 구현.
- [ ] 개인 DM·크루 채팅, 내 곡의 커버·듀엣 참여, 받은 선물 알림을 연결. 채팅 알림 끄기 설정을 존중.
- [ ] 알림을 누르면 해당 대화·곡·알림 기록으로 이동하고 읽음 상태와 배지를 맞춤.
- [ ] 로그아웃·계정 전환 시 기기 토큰 연결을 정리해 이전 계정의 알림이 오지 않도록 확인.
- [ ] 실제 아이폰에서 포그라운드·백그라운드·종료 상태의 수신과 알림 거절·다시 허용 흐름을 검증한 후 완료 처리.

## Validation and limitations

- Release build and signed AAB verification succeeded.
- 61 release unit tests passed. Device checks cover gift quantity/cost, activity history, images/cover tabs, mini-player/queue, and recording-key behavior. Two failures in the initial device run were fixed and both passed on rerun; the final rapid-key/activity-recreation check also passed.
- Backing-key tests verify expected pitch changes, unchanged duration/source samples and cancellation cleanup. Human vocal quality was not assessed by these automated tests.
- Android release lint: 0 errors, 116 warnings. Existing warnings are not a claim of a warning-free project.
- Web focused tests: 31 passed; final public-catalog artwork correction: 2 passed. The mirrored files are copied from that validated source.
- AdSense rejection reason was **가치가 별로 없는 콘텐츠**. Public music/catalog/detail/about content and navigation were improved, deployed, and resubmitted. Approval remains pending.

## Build artifact

- `AIFECT-2.5.47-60-play.aab`
- SHA-256: `7F1B611EDE368EC41C8EB75D31DF42113DD7CA8E68DC5EDFA31EA9838822B5ED`
- The signed binary and signing credentials are not committed. Google Play has the submitted bundle.

## Screens

Android screenshots below use isolated emulator fixtures, not production users or transactions.

![Silver gift catalog](android-2.5.47/40-silver-gifts.png)
![Gift quantity](android-2.5.47/41-gift-quantity.png)
![Activity notifications](android-2.5.47/42-activity-history.png)
![Mini player](android-2.5.47/45-mini-player.png)
![Queue](android-2.5.47/46-player-queue.png)
![Backing key selection](android-2.5.47/backing-key.png)
![Desktop web lyrics](android-2.5.47/web-desktop-lyrics.png)
![Mobile web lyrics](android-2.5.47/web-mobile-lyrics.png)
