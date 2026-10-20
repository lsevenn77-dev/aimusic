# AIFECT 음성방 구현·검증 기록

기록일: 2026-10-19. 작업 위치: `realtime-rooms`. 브랜치: `codex/aifect-realtime-rooms`.
기준: 운영 Sites v167 소스 `f3c28ff1f4dbe1e88d112b847240289ed8d38436`.

## 후속 웹 테스트 배포

2026-10-19 사용자가 웹 배포를 요청했다. 아래 본문은 배포 전 로컬 검증 시점의 기록이다. 후속 작업으로 사용자 소유 Cloudflare 계정에 별도 Worker/DO와 D1을 생성·배포하고 마이그레이션 및 Site bridge 환경변수를 등록했다. 신규 검사 13개와 웹 빌드를 다시 통과했다. Realtime 가입 동의·SFU 설정과 웹 게시 완료 결과는 별도의 배포 기록에 남긴다. 실기기 검증은 계속 보류 상태다.

## 결과와 범위

기존 웹 프로젝트에 `#voice`, `#voice/:roomId` 화면과 `/api/voice/*` API를 추가했다. 별도 데모 앱이 아니다. 기존 하단 메뉴를 유지하며 커뮤니티의 음성방 메뉴로 연결한다. 공개·초대·크루방, 생성/종료, 청취 입장, 30명/8석, 마이크 신청/승인/반납, 방장/관리자, 음소거/강퇴/차단, 채팅, 프로필, 개별 음량, DM 초대, 기존 골드 선물과 애니메이션을 연결했다.

현재 작업 트리에 저장된 개발 결과이며 원격 업로드·운영 병합·배포는 하지 않았다. Cloudflare SFU 앱 설정이 없어 실제 음성 연결은 검증하지 못했다. 2026-10-19 사용자의 ‘우선 개발 진행, 실기기 검증은 나중에’ 지시에 따라 2대 이상의 실제 기기 검증은 보류했다.

실시간 듀엣의 2명 가창자/청취자 선택 구독과 R2 반주 타이밍 보정은 아직 구현하지 않았다. 기존 녹음·녹음 듀엣 코드와 미디어 저장소는 변경하지 않았다. Android/iOS 네이티브 앱 빌드·설치는 이번 결과에 포함되지 않는다.

## 검증 결과

| 검사 | 결과 | 한계 |
|---|---|---|
| 기존 Site 빌드 `node scripts/build.mjs` | 통과 | 운영 배포 아님 |
| 전용 Worker Wrangler dry-run | 통과 | Cloudflare 실리소스/인증 확인 아님 |
| `tests/voice-rooms.test.mjs` | 13개 통과 | SFU API 응답은 모의 응답 |
| 로컬 smoke | 통과 | 서로 다른 실제 기기 또는 음성 테스트 아님 |
| 전체 기존+신규 검사 | 552개 중 533 통과 / 19 실패 | 아래 기존 실패 목록 참조 |
| 변경 전 기준 검사 | 539개 중 519 통과 / 20 실패 | 현재 실패 19개 모두 변경 전에도 실패 |
| 브라우저 로그인→청취 입장→좌석 사용→채팅 | 확인 | 로컬 D1 테스트 계정 |
| 489px / 803px 폭 브라우저 | 가로 넘침 없음 | 실제 Android/iOS 브라우저 미검증 |
| 수정 후 브라우저 오류 | 신규 런타임 오류 관찰 없음 | 최초 초기화 순서 오류 수정 후 확인 |
| `git diff --check` | 통과 | 새 파일은 별도 소스 점검 |

로컬 smoke는 실제 workerd 두 프로세스와 로컬 D1/DO를 사용해 로그인→비공개방 차단→DM 초대→입장→인증 WebSocket 알림→텍스트 채팅→마이크 신청/승인→일반회원 관리권한 거절→관리자 음소거→방 종료를 검사했다. SFU 오디오 전송은 하지 않았다.

13개 자동 검사는 서명 위조/만료/재전송, 동일 출처 및 WebSocket 출처, 정원/좌석 경합, 역할 권한, private/crew 접근, 회원 차단, 재접속 세대, 임대 만료, 서버 트랙 선택, 부분 실패·불확실한 SFU 응답 정리, 수신 연결의 송출 차단, 늦게 도착한 마이크 권한과 이전 응답 무시, 실버 오차감 방지, 기존 골드 원장의 동일 요청 중복 차감 방지, DM 재전송 중복을 다룬다.

기존 회귀 실패를 음성방 기능으로 고쳤다고 처리하지 않았다. 전체 검사 통과 상태가 아니므로 운영 배포 승인을 의미하지 않는다. 변경 전의 추가 1개 실패는 이번 실행에서 재현되지 않았으며 개선 성과로 계산하지 않는다. 의존성 설치에서 기존 9개 보안 감사 경고도 남아 있다.

## 주요 변경 파일

- `dist/voice-rooms.js`, `dist/voice-rooms.css`: 화면, WebRTC 송수신, 개인 음량/장치, 로컬 모니터링, 재접속, 채팅·선물·초대.
- `dist/index.html`, `dist/views.js`, `dist/browse.js`, `dist/community.js`: 번들 초기화·라우터·메뉴 연결.
- `dist/social-chat.js`: 검증된 AIFECT 음성방 링크를 DM 입장 버튼으로 표시.
- `server/voice-rooms.js`, `server/index.js`: 기존 로그인·DM·선물 서버와 서명된 room Worker 연결.
- `realtime/worker.js`, `room.js`, `sfu.js`, `protocol.js`: DO 상태/권한과 SFU API·정리 큐.
- `realtime/migrations/0001_rooms.sql`, `wrangler.jsonc`: 별도 방 D1/DO 구성. 기존 D1 마이그레이션 없음.
- `scripts/build.mjs`, `scripts/voice-local-smoke.mjs`: 빌드·실제 로컬 서버 검사.
- `tests/voice-rooms.test.mjs`: 자동 검사.
- `package.json`, `package-lock.json`: 로컬 WebSocket 검사에 필요한 기존 설치 버전의 `ws`를 명시적 개발 의존성으로 지정.

## 실제 실행 캡처

캡처는 운영 회원·가상 인기 수치를 사용하지 않고 로컬 개발 계정 1명으로 입장한 실제 화면이다. 마이크 좌석을 배정받았지만 마이크는 켜지 않았다.

![로컬 음성방](outputs/voice-rooms/room-desktop.png)

## 남은 검증과 활성화

[운영 연결 및 기기 테스트 안내](realtime/README.md)를 따른다. SFU App ID/Secret, 사용자 Cloudflare 계정의 Worker/DO/D1, 테스트 사이트의 bridge 설정이 필요하다. 이를 설정한 후 실제 PC/Android/iOS 2대 이상, Bluetooth, 배경 복귀, 네트워크 전환, 30명·8석 부하, SFU 장애 중 강퇴/정리, 제한 네트워크 TURN 연결을 검증해야 한다. 기존 Sites 경유의 운영 환경 WebSocket 전달도 테스트 배포에서 확인해야 한다.

## 변경 전부터 재현되는 전체 검사 실패

- MR cards retain the six actual song IDs, cover counts and co-located play/sing actions
- a read finishing after mutation cannot restore an invalidated cached response
- a selected DM keeps the inbox and puts only one composer in the right pane
- blocked users can be unblocked without loading their prohibited history
- browser duet export plays one backing for its entire duration and only the new vocal interval
- community content is escaped and covers link back to their original song
- community filters covers and originals through the public API
- community landing is public and keeps crews visible without being a crew-only landing
- community side cards use actual data, not mockup popularity counts
- duet discovery and invitation listing use their existing separate API paths
- like feedback is immediate, duplicate clicks are ignored and failure rolls it back without fetching the library
- manual song selection records the old listen before checking the ad boundary
- mobile login: browser consent, verifier binding, single-use exchange and cookie isolation
- navigation reads are deduplicated and account scoped; writes invalidate pending and completed cache entries
- own profile exposes private library shortcuts and no self-follow button
- private library and following routes require login before fetching personal data
- profile photo reuses the single photo safely and needs no separate banner
- real API: sessions, ownership, R2, preview, likes, comments, follows, playlists
- visitor profile hides private library and does not link to the visitor own followers
