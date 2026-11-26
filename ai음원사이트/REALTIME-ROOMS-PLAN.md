# AIFECT 실시간 음성방 — 구현 계획 (2026-10-19)

## 확인한 기반
- 운영 Sites v167 소스 `f3c28ff1f4dbe1e88d112b847240289ed8d38436`에서 별도 `codex/aifect-realtime-rooms` 브랜치를 시작했다.
- 프론트: `dist/app.js` 해시 라우터와 일반 JavaScript, 기존 디자인 시스템. `scripts/build.mjs`가 정적 파일과 Worker를 빌드한다.
- 백엔드: `server/index.js` Cloudflare Worker. `server/auth.js`가 HttpOnly 세션 쿠키를 D1 세션/사용자와 대조한다. API 변경 요청은 동일 출처 검사와 요청 크기 제한을 거친다.
- D1: 회원·크루·DM·골드 원장. R2 `BUCKET`: 기존 음원·사진 등 미디어. 음성방 오디오를 R2에 저장하거나 자동 녹음하지 않는다.
- DM: `server/social.js`, `chat-features.js`, `chat-stream.js`. 기존 저장·차단·전송 요청 ID·알림 경로를 재사용한다.
- 선물: `server/gifts.js`가 서버 가격, 수량, 잔액, FIFO 결제 로트, 정산, 요청 ID 중복 검증을 담당한다. 새 지갑이나 별도 결제 계산을 만들지 않는다.
- 기존 녹음/듀엣은 `karaoke.js`, `covers.js`, `duets.js`와 클라이언트 녹음 모듈에 있다. 이를 교체하지 않는다. 기존 실시간 WebRTC 음성방 구현은 발견되지 않았다.

## 배포 구조
Sites의 공개 hosting manifest 계약에는 D1/R2만 있고 Durable Objects 선언이 없다. 따라서 기존 사이트를 이전하지 않고 별도 **Cloudflare Worker + Durable Object + 전용 D1**을 연결한다. 이는 방 상태/시그널링 서버이며 미디어 SFU를 직접 구축하는 것이 아니다.

브라우저 → 기존 AIFECT `/api/voice/*`(세션/출처/크루 확인) → 서명된 서버 요청 → 음성방 Worker → 방별 Durable Object → Cloudflare Realtime SFU.

브라우저의 음성은 SFU와 WebRTC로 송수신한다. 비밀키와 SFU 세션 소유권은 서버에만 둔다. WebSocket도 기존 인증 API를 통과시킨다. 로그인과 크루 가입 상태는 HTTP heartbeat에서 재검사하며 만료된 멤버는 서버에서 정리한다.

## 구현 순서와 범위
1. 방 상태: 공개/비공개/크루 전용, 생성/종료, 최대 30명, 8석, 방장/관리자, 신청/승인/반납, 음소거, 강퇴/차단, 제한된 채팅 기록, 초대.
2. 미디어: 송출/수신 별도 PeerConnection, 마이크 오디오만 송출, 서버가 허용한 발화자만 구독, 직렬 SDP 교환, 강제 퇴장 시 서버 트랙 종료, 재접속 세대 교체와 만료 정리.
3. 사이트 연결: 커뮤니티 음성방 페이지, 좌석과 청취자, 프로필, 장치 선택, DM 초대, 기존 골드 선물 영수증에 기반한 중복 없는 애니메이션.
4. 자동 검사: 인증/서명/재전송, 30명/8석 경합, 권한 위조, 세션 소유권, private/crew 접근, 퇴장/재접속, SFU 실패, 선물 중복; 기존 전체 회귀 테스트와 빌드.
5. 실기기: PC/Android/iOS 중 2대 이상 실제 송수신, 마이크 거절/재허용, Bluetooth, 백그라운드 복귀, 연결 끊김과 재접속. 결과를 별도로 기록한다.

앞서 요청한 실시간 듀엣(가창자 2명, A→B 단방향 구독, R2 반주 타임라인 보정, 3대 검증)은 음성방과 구분된 후속 모드다. 일반 8석 방을 합창 기능으로 만들지 않는다. 이 문서는 듀엣 타이밍 검증을 완료했다고 의미하지 않는다.

## 운영 활성화 전 조건
- 사용자 Cloudflare 계정에 SFU App, Worker/DO, D1 및 서버 비밀키 설정 필요. 기존 Sites에 SFU 관련 설정은 없다.
- 현재 ADB에는 가상기기만 보인다. 모의 API 테스트나 브라우저 두 탭을 실제 2대 음성 검증으로 세지 않는다.
- 실제 음성 송수신과 회귀 검사 완료 전 운영 배포하지 않는다. 미설정 환경은 기능 준비 중으로 표시하고 기존 기능은 계속 동작한다.

## 공식 참고 자료
- https://github.com/cloudflare/realtime-examples/tree/main/video-room
- https://github.com/cloudflare/realtime-examples/tree/main/echo
- https://developers.cloudflare.com/realtime/sfu/api/
- https://developers.cloudflare.com/realtime/sfu/concepts/negotiation/

예제의 자격 증명 격리, 서버 권한 검사, 송수신 세션 분리, 협상 직렬화, 재접속 세대/정리 원칙을 참고한다.
