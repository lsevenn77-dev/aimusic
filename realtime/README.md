# AIFECT 음성방 운영 연결 안내

현재 상태: 로컬 개발·검증 후 사용자 요청으로 웹 테스트 배포 준비 중이다. 실제 SFU 음성 송수신 검증 전이다.

2026-10-19 사용자 소유 Cloudflare 계정에 `aifect-voice-rooms` Worker와 전용 D1/DO를 배포했다. 서비스 주소는 `https://aifect-voice-rooms.aifect.workers.dev`이며 기존 Site에 서명 키와 주소를 등록했다. Realtime 가입 약관·과금 동의 및 SFU 앱 설정 완료 여부는 배포 기록을 확인한다. 마이크 테스트가 끝난 것으로 간주하지 않는다.

## 구성과 소유권

- 기존 AIFECT Site Worker: 로그인 세션/출처/회원 차단/크루 확인, 기존 DM·골드 선물 원장 재사용.
- 별도 사용자 소유 Cloudflare Worker: `worker.js`, 방별 SQLite Durable Object: `room.js`, 방 설정·관리 이력 전용 D1: `ROOM_DB`.
- 관리형 Cloudflare Realtime SFU: 브라우저 마이크 오디오만 전달. 자체 미디어 서버 없음.
- 기존 R2 음원/이미지와 녹음 API는 그대로 사용. 음성방은 통화를 녹음하거나 R2에 저장하지 않는다.
- 일반 음성방 30명/마이크 8석. 실시간 듀엣 반주 동기화 모드는 이 구현과 별도다.

## 필요한 서버 설정

| 위치 | 설정 | 내용 |
|---|---|---|
| 음성방 Worker secret | `REALTIME_SFU_APP_ID` | 사용자 Cloudflare 계정의 SFU App ID |
| 음성방 Worker secret | `REALTIME_SFU_APP_SECRET` | 같은 SFU 앱의 비밀키 |
| 두 Worker secret | `VOICE_BRIDGE_SECRET` | 같은 임의의 32자 이상 서명 키 |
| 기존 Site Worker | `VOICE_SERVICE_URL` | 음성방 Worker의 HTTPS 주소 |
| 음성방 Wrangler | `ROOM_DB.database_id` | 사용자 계정에서 생성한 전용 D1 ID |

`wrangler.jsonc`에는 사용자 계정의 전용 D1 ID가 설정되어 있다. 비밀키는 클라이언트, 저장소, 채팅에 넣지 않는다. Sites hosting manifest에 임의의 DO 필드를 추가하지 않는다.

## 로컬 재현

저장소 루트에서 의존성을 설치하고 `node scripts/build.mjs`를 실행한다. 기존 로컬 D1에는 `drizzle/`, 음성방 로컬 D1에는 `realtime/migrations/`를 적용한다.

```powershell
npx wrangler d1 migrations apply aifect-local --local
npx wrangler d1 migrations apply aifect-voice-rooms --local --config realtime/wrangler.jsonc
npx wrangler dev --config realtime/wrangler.jsonc --port 4206
# 별도 터미널
npx wrangler dev --port 4205
```

루트 `.dev.vars`에는 `AUTH_PEPPER`, `VOICE_SERVICE_URL=http://127.0.0.1:4206`, `VOICE_BRIDGE_SECRET`를 둔다. `realtime/.dev.vars`에는 같은 bridge secret을 둔다. 모두 Git 제외 파일이다. SFU 앱 설정이 없으면 방/채팅 검증은 가능하지만 실제 음성 연결은 준비 중 오류로 종료된다.

```powershell
node --test tests/voice-rooms.test.mjs
node scripts/voice-local-smoke.mjs
npx wrangler deploy --dry-run --config realtime/wrangler.jsonc
```

로컬 smoke 스크립트는 고정된 loopback 주소에서만 동작하며 로컬 테스트 회원·프로필·방·DM을 생성한다. 자격 증명은 `.sites-runtime/voice-local-accounts.json`에만 보관한다. 실제 회원이나 운영 지갑을 사용하지 않는다. 이 스크립트가 성공해도 음성 송수신 검증을 의미하지 않는다.

## 설정 및 검증 순서

1. 사용자 Cloudflare 계정에서 SFU 앱과 전용 D1을 생성하고 Wrangler 로그인 계정을 확인한다.
2. 전용 D1 ID를 설정하고 새 `voice_rooms`, `voice_room_events` 마이그레이션을 적용한다.
3. Worker secret으로 SFU App ID/Secret 및 bridge secret을 등록한다.
4. 격리된 테스트 환경에 음성방 Worker를 배포하고, 기존 Site의 테스트 버전에서 HTTPS service URL과 동일한 bridge secret을 연결한다.
5. 2대 이상의 실제 기기에서 아래 검증을 마친다. 기존 기능 회귀 실패도 검토·해결한 후 운영 배포를 판단한다.

## 연결과 장애 처리

- 처음에는 청취자로 입장. 승인된 좌석에서 직접 마이크를 켜야 권한을 요청한다.
- 송출/수신 PeerConnection 분리. 서버가 구독 대상 트랙을 선택하고 수신 SDP는 `recvonly`/`inactive`만 허용한다.
- 발행 트랙은 클라이언트 연결 확인 후 다른 참여자에게 공개한다. 입력한 임의 SFU 세션 ID는 사용하지 않는다.
- 방 요청은 DO에서 직렬 처리. 연결 세대가 다르면 이전 요청을 거절한다. 같은 계정의 다른 연결과 재접속이 서로 마이크를 계속 빼앗지 않도록 이전 화면은 재입장을 요구한다.
- heartbeat 20초, 서버 임대 75초, 재연결 지수 backoff 최대 30초. 백그라운드 지속 통화를 보장하지 않는다.
- 강퇴/차단/음소거 시 트랙 종료를 서버에서 요청한다. 외부 SFU 장애로 종료가 불명확하면 정리 작업을 저장하고 재시도한다. 외부 장애 중 즉시 강제 종료를 보장할 수는 없다.
- 응답을 잃은 할당은 빈 session 조회만으로 정리 완료 처리하지 않는다. 예상 트랙이 확인되어 종료되거나 SFU가 410 `session_error`를 반환할 때까지 유지한다. 해당 사용자 재발행은 정리 중 제한한다.
- 기존 골드 선물 요청 ID와 서버 원장이 차감·정산을 결정한다. 애니메이션 전달 실패를 결제 실패로 처리하지 않는다. 실패한 애니메이션은 자동 재전송하지 않으며 영수증은 유지된다.
- 채팅 최근 100개와 애니메이션 영수증 최근 500개를 DO에 보관한다. 관리자 이벤트는 D1에 기록한다. 장기 보관/내보내기 UI는 없다.

## 실기기 검증 대기 목록

- PC + Android, PC + iOS에서 실제 양방향 음성 및 개별 볼륨.
- 서로 다른 네트워크와 여러 동시 마이크, 패킷 손실/네트워크 전환/재접속.
- 마이크 거절→재허용, 유선/블루투스 장치 변경, 로컬 모니터링 지연과 피드백.
- 모바일 백그라운드→복귀, 화면 잠금, 페이지 종료 시 마이크 해제.
- 방장 강퇴/차단/음소거 후 기존 수신자의 오디오 종료.
- 최대 30명·8석 실부하. 현재 정원 검증은 자동 상태 테스트다.
- 현재 ICE에는 Cloudflare STUN만 설정되어 있다. UDP 제한 네트워크에서 TURN 자격 증명 발급·연결을 추가 검증해야 한다.
- 기존 음악 재생, 녹음/초안, 듀엣 녹음, 로그인, DM, 지갑/정산 회귀.

네이티브 Android/iOS 전용 화면·오디오 세션 통합이나 APK/AAB 빌드는 이번 웹 음성방 작업에 포함하지 않았다.

## 공식 근거

- [Cloudflare 공식 video-room 예제](https://github.com/cloudflare/realtime-examples/tree/main/video-room)
- [SFU API](https://developers.cloudflare.com/realtime/sfu/api/)
- [협상·재접속·정리](https://developers.cloudflare.com/realtime/sfu/concepts/negotiation/)
- [오류와 종료 응답 해석](https://developers.cloudflare.com/realtime/sfu/observability/error-codes/)

## 2026-10-20 개발 변경 (운영 반영 전)

- SFU 협상·정리 네트워크 호출은 방 전체 직렬 잠금 밖에서 실행한다. 상태 예약과 결과 반영만 직렬 처리하며, 세대/예약 객체가 바뀐 응답은 폐기한다. 정리 실패는 저장 후 재시도한다.
- 수신 연결 정리는 새 송출을 막지 않는다. 이전 송출의 불확실한 정리는 안전하게 완료될 때까지 재발행을 제한한다.
- WebSocket도 입장 generation을 검증하여 오래된 브라우저가 새 세션을 교체하지 못하게 한다.
- 마이크 DSP는 dist/voice-audio.js에 분리했다. 기본 라디오 클린, 원음, 스튜디오. 지원되지 않거나 AudioContext가 시작되지 않으면 원음으로 우회한다. 실행 중 오디오 컨텍스트가 중단되면 송출 트랙을 원음으로 전환한다.
- 공동 음악은 DO의 서버 시각·revision·request_id로 제어하고 사이트 R2 스트리밍으로 각자 수신한다. 음성 트랙과 혼합해 송출하거나 일반 listens 원장을 생성하지 않는다.
- 새 사이트 D1 마이그레이션: drizzle/0051_voice_music_permissions.sql. 기존 곡을 일괄 허용하지 않는다. 방장 자신이 올린 공개 원곡은 음악 검색에서 명시적 권리 동의 후 추가할 수 있다. 커버곡은 이번 허용 대상에서 제외한다.
- 음악·참가자·소리·방 설정·초대·선물은 페이지 안의 dialog를 사용한다. 모바일은 고정 뷰포트와 채팅 내부 스크롤, 키보드 visualViewport 높이를 사용한다.
- 관련 자동 테스트 38개 및 Site 빌드, 음성 Worker dry-run 통과. 실제 SFU 양방향 음성, 두 기기의 동시 음악·음성, PC/Android/iOS UI·음질·네트워크 전환·30명 실부하는 미검증이다.
- 이 PC의 Wrangler는 로그아웃 상태였다. 별도 음성 Worker를 배포하거나 운영 로그를 읽지 않았다. Site만 먼저 배포하지 않는다. 두 Worker의 호환 버전과 새 D1 마이그레이션을 함께 준비한 뒤 실제 기기로 검증한다.

최종 v2 MD 문서를 전체 대조했다. 신청 취소/거절, 프로필에서 좌석 반납, 음악 종료/탐색/진행시간, 잡음 감소/리버브 조절, 빈 음악 바 접기와 호스트 퇴장 일시정지를 보완했다. 재생 속도 보정은 제거하고 1배속을 유지한다. 일반음악 개인 게인은 방 음량 × 개인 음량이다. 실제 다중 기기 검증은 여전히 미완료다.
