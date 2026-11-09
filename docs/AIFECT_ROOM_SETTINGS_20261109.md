# AIFECT 방 유형·팝업·참여자 목록 수정 검증

검증일: 2026-11-09. 요청 범위는 기존 노래방·토킹룸 화면이다.

## 적용 구조

- 기존 `VoiceRoomClient`와 `live-karaoke.js`의 노래방 확장, 공유 방 템플릿, 디자인 토큰을 사용한다.
- 설정의 첫 항목은 가로로 배치한 `노래방 / 토킹룸` 라디오 버튼이다. 현재 방 유형을 선택하고 열며, 저장 전에는 편집 중인 값만 바뀐다.
- 설정을 열 때 표시 값을 기준으로 draft를 만들고, 실제로 변경한 필드만 기존 `settings` 명령으로 보낸다. 유형만 변경하면 클라이언트는 `mode/revision`만 전송하고, 제목·공개 범위·크루·테마·정원 등 수정하지 않은 값을 함께 전송하지 않는다. 서버의 기존 테마 유효성·만료 정책은 유지하므로 만료된 테마는 기존 정책대로 기본 테마로 전환될 수 있다.
- 기존 서버의 방장 권한, settings revision, 서명된 실시간 브리지, 방 coordinator를 사용한다. 새 방을 생성하거나 다른 방으로 재입장시키지 않는다.
- 서버의 기존 유형 전환 정책은 진행 중인 가창·노래 예약·공동 음악·자리 요청/초대를 정리하고 기존 오디오 게시/구독 세션을 종료한다. 방 ID, 참여자 membership, 채팅, 제목 및 공통 설정은 유지한다. 토킹룸 좌석은 기존 정책대로 재설정된다.
- 서버 coordinator 자체에는 변경이 필요하지 않았다. 실제 서버 라우터와 운영 coordinator 코드를 사용하는 통합 테스트를 보강했다.
- 클라이언트는 전환 시 음량/공유 타이머, 공유 요청, worklet 메시지 포트와 종료된 트랙 이벤트를 정리한다. 기존 socket·generation·방 세션을 유지하고 해당 유형 화면을 다시 그린다.
- 팝업 전환 직후 늦게 오는 이전 `close` 이벤트가 새 팝업의 draft나 포커스를 제거하지 않도록 정리를 동기적으로 수행한다.

## 화면 변경

### PC 팝업

모든 방 내부 일반 팝업은 실제 `.voice-chat-panel`의 상단과 너비를 기준으로 배치한다. 최대 높이는 `min(500px, 채팅 영역과 viewport의 가용 높이)`다. 팝업을 문서 흐름 밖에 두어 방·채팅 높이가 늘어나지 않는다.

참여자 팝업은 인원이 적어도 해당 가용 최대 높이를 유지하고 목록 내부에서 스크롤한다. 방 설정은 본문과 취소·저장 footer를 분리했다. 프로필·공유 등 짧은 팝업은 필요한 만큼만 높이를 사용한다. X 버튼, dim, blur 또는 검정 backdrop은 사용하지 않는다.

### 모바일

기존 채팅·입력창 배치와 팝업 하단 기준을 유지한다. 새 PC 참여자 행 크기를 모바일에 적용하지 않는다. 320×700처럼 높이가 낮은 화면에서 설정 팝업이 상단 메뉴를 가리던 기존 동작은 가용 높이 계산에 방 헤더 하단을 포함해 보완했다. 일반적인 390×844 설정 팝업의 높이 560px와 하단 좌표 782px는 유지한다.

### 참여자와 상단 버튼

- 집계 헤더, 카드 배경·외곽 테두리를 제거하고 사진·닉네임·마이크 상태를 얇은 구분선으로 정렬했다.
- 좌석·가창자·예약자·참여자 목록의 방장 왕관은 닉네임 바로 왼쪽에 표시한다.
- 음소거 사진만 opacity 0.42로 표시하며, 음소거 아이콘과 닉네임은 opacity 1을 유지한다.
- 항상 보이던 별도 마이크·헤드폰 조작 버튼을 두지 않는다. 기존 팔로우 관계 기능은 유지한다.
- 방장은 다른 참여자 우측 더보기에서 마이크 회수/허용·강퇴 등 기존 관리 기능을 사용한다. 본인·방장은 관리 대상에서 제외한다.
- 상단 순서는 `참여자 → 소리 설정 → 공유 → 방 설정 → 나가기`다. 기존 메시지 기능은 채팅 입력창 왼쪽으로 옮기고 unread badge와 팝업 상태를 연결했다.

## 실제 브라우저 검증

실제 앱 클라이언트, Site 라우터, SQLite fixture, 운영 coordinator 코드 및 WebSocket을 사용하는 격리된 로컬 환경에서 검증했다. 방장 탭과 일반 참여자 탭의 신원을 분리해 같은 방을 동시에 열었다. 운영 사용자나 운영 채팅을 변경하지 않았다.

| 검증 | 결과 |
| --- | --- |
| PC 토킹룸 → 노래방 → 토킹룸 저장 | 두 탭이 동일한 유형 화면으로 자동 전환 |
| 모바일 토킹룸 → 노래방 → 토킹룸 저장 | 두 방향 저장 후 동일한 방 ID 유지 |
| 유형 전환의 공통 정보 유지 | 방 ID `a5357a04-cb50-4ef4-a2c4-79abbca7ff21`, 제목 `함께 이야기하는 밤`, 8명 membership, 검증 채팅 유지 |
| PC·모바일 취소 후 재열기 | 기존 `talk` 선택 유지 |
| 같은 버튼·다른 버튼·바깥 클릭 | 닫기/팝업 전환, 미저장 draft 폐기 |
| 설정 본문 스크롤 | 본문 scrollTop 303에서도 footer 위치 유지, 취소·저장 사용 가능 |
| PC 1440×900 토킹룸 | 팝업 x 998.016, y 198.75, 너비 364.203, 가용 높이 약 470.297px로 채팅 영역과 일치 |
| PC 노래방 | 참여자 팝업 높이 500px, 내부 목록 스크롤 |
| 2명 참여자 | 토킹룸 참여자 팝업의 약 470.297px 높이 유지 |
| 낮은 PC 1280×600 | 팝업 y 198.75, 너비 320, 높이 401.25px로 viewport 안에 제한 |
| 공유·소리·프로필·강퇴 확인 팝업 | 같은 채팅 상단/너비 사용, 짧은 내용은 축소 |
| 390×844 모바일 | 채팅 x 10, y 479.938, 너비 370, 하단 836 및 팝업 하단 782 유지 |
| 320px·768px 폭 | 가로 넘침 없음, 상단 5개 버튼은 44px 크기 유지 |
| 낮은 모바일 320×700 | 헤더 하단 129.75px, 팝업 상단 137.75px·높이 500.25px·하단 638px. 상단 버튼 재클릭 닫기 통과 |
| 방장 마이크 회수/허용 | 실제 명령 반영 후 반대 동작 메뉴로 변경, 상대 채팅에 상태 동기화 |
| 방장 강퇴 | 확인 팝업에서 실행 후 대상 제거, 방장과 다른 참여자 유지 |
| 일반 참여자 | 관리 버튼 0개, 방 유형·설정 및 저장 비활성화 |
| 음소거 표현 | 사진 opacity 0.42, 닉네임·아이콘 opacity 1, 행 배경 투명·하단 1px 구분선 |

기하 측정은 팝업의 진입 애니메이션 중 opacity가 일시적으로 0.6으로 보일 수 있다. 이는 배경 overlay가 아니며 최종 팝업 표면은 기존 네이비 패널이다. 상세 좌표와 반복 검증 값은 `room-settings-qa-20261109/browser-evidence.json`에 기록한다.

### 화면 증거

- [PC 수정 전](room-settings-qa-20261109/before-pc-members.jpg)
- [PC 참여자 수정 후](room-settings-qa-20261109/after-pc-members.jpg)
- [PC 설정 수정 후](room-settings-qa-20261109/after-pc-settings.jpg)
- [모바일 수정 전](room-settings-qa-20261109/before-mobile-members.jpg)
- [모바일 참여자 수정 후](room-settings-qa-20261109/after-mobile-members.jpg)
- [모바일 설정 수정 후](room-settings-qa-20261109/after-mobile-settings.jpg)
- [320px 낮은 모바일 설정](room-settings-qa-20261109/after-mobile-320-settings.jpg)

## 자동 검증 범위

다음 테스트는 실제 구현 또는 실제 서버 경로를 대상으로 한다.

- `room-settings-draft`: 현재 유형, 취소·재열기, 변경 필드만 전송, host 권한 상실, 늦은 옵션 응답, 중복 저장, 이전 저장 콜백의 추가 닫기가 새 팝업에 적용되지 않음, 오류 재시도. 실제 유형 전환으로 방 화면을 교체할 때는 현재 팝업을 종료한다.
- `room-popup-switch`: 소리 테스트 정리, 설정 draft와 나가기 pending 상태 정리, 이전 close 이벤트와 새 팝업의 분리.
- `room-bubbles`, `room-chat-viewport`: 채팅 영역 기준 위치·폭·500px 제한, 좁고 낮은 viewport, 모바일 헤더 가용 높이, footer 및 스크롤, 입력/keyboard/sticker 연동 유지.
- `room-entry-integration`, `live-karaoke.production`, `live-karaoke-server`: 두 방향 전환과 공통 정보 유지, 일반 참여자 설정 403, stale revision 409, 본인·방장 관리 거절, 다른 참여자 mute/unlock/kick, 늦은 publish/subscribe 완료 409와 SFU 세션 정리, DB 기록 실패 시 기존 유형·가창·대기열 유지.
- `live-karaoke-ui`, `room-audio-session`: 전환 타이머·worklet 포트 정리, 종료된 오디오 트랙 이벤트 해제, 살아 있는 트랙 유지, 닉네임 옆 왕관.
- 기존 message badge와 방 공통 동작 테스트를 함께 수행한다.

최종 전체 테스트·빌드·public smoke 결과와 소스/빌드 해시는 저장소의 공식 `npm run release:prepare`가 생성하는 `work/releases/latest.json`으로 확인한다. 게시 직전에 `npm run release:check`를 다시 수행한다. 이 문서는 브라우저 QA와 변경 범위를 기록하며, 배포 성공을 대신 증명하지 않는다.

## 변경 파일

| 영역 | 파일 |
| --- | --- |
| 설정·참여자·팝업 수명 | `dist/voice-room-controls.js` |
| 공통 템플릿·상단/메시지 버튼 | `dist/voice-room-template.js` |
| 팝업 배치·가용 높이 | `dist/room-layout.js`, `dist/room-bubbles.css` |
| 메시지 badge | `dist/room-release.css`, `dist/chat-features.js` |
| 유형별 오디오 정리·가창자 표시 | `dist/live-karaoke.js`, `dist/room-audio-session.js` |
| 자동 테스트 | `tests/room-settings-draft.test.mjs`, `tests/room-popup-switch.test.mjs`, `tests/room-bubbles.test.mjs`, `tests/room-chat-viewport.test.mjs`, `tests/room-entry-integration.test.mjs`, `tests/live-karaoke-ui.test.mjs`, `tests/room-audio-session.test.mjs` |
| 격리 브라우저 fixture | `tests/preview-room-bubbles.mjs` |

## 검증 한계와 배포 주의

- 클라우드 브라우저의 화면 크기를 지정한 iframe으로 PC·모바일을 검증했다. 실제 iPhone/Android 기기나 물리 마이크·헤드폰의 음질/지연은 측정하지 않았다.
- HTTP 로컬 프리뷰는 secure-context 마이크 API를 제공하지 않는다. 미디어 협상 지연·정리·이벤트 중복 방지는 실제 구현을 실행하는 자동 테스트로 확인했다.
- 별도 음성 Worker의 현재 운영 배포 지문은 확인하지 않았다. 해당 Worker의 소스는 이번 작업에서 변경하지 않았다.
- 새 migration은 없고 DB binding·project ID·공개 audience를 유지한다.
- 작업 중 상점 관련 최신 원격 변경 `cf0581c`, `56f2b13`을 fast-forward로 포함했다. 관계없는 사용자 변경을 덮어쓰지 않았다.
