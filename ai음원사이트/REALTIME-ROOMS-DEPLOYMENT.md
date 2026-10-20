# 음성방 웹 테스트 배포 기록

2026-10-19 KST 사용자 요청으로 기존 AIFECT 웹에 배포했다. 이 문서는 버전 168의 배포 결과를 기록한다.

- 기존 Site: `appgprj_6aa56aec3434819186f9a42d9a557520`, 공개 범위 유지.
- 웹 버전: **168**, 커밋 `64109d836bb50751e7b529ba5bf8991a465fb93b`.
- 배포 ID: `appgdep_6ad605e08a088191a265d5dc30a3a7e4`, 상태 `succeeded`, 환경변수 revision 23.
- 테스트 주소: https://aifect.co.kr/#voice
- 배포 도구 반환 주소: https://wavv-music-design-lseve.sassy-auk-0975.chatgpt.site
- 별도 음성방 Worker: https://aifect-voice-rooms.aifect.workers.dev
- Worker/DO/D1/SFU는 사용자 `lsevenn77@gmail.com` Cloudflare 계정 소유다. 기존 Site의 음악/회원 D1·R2를 이전한 작업은 아니다.
- 전용 D1 `aifect-voice-rooms`: `253c19af-35de-4863-a4aa-c54bbc5e76fe`, 마이그레이션 적용 완료.
- SFU 앱 `AIFECT Voice Rooms`: `24ad3ceb2a1164f58dcc9ff7dfc5092e`.
- 사용자가 Cloudflare Realtime 자동 갱신 및 월 1,000GB 무료, 초과 GB당 $0.05(+세금) 조건에 명시적으로 동의했다.
- SFU App Secret과 bridge secret은 서버 런타임 secret에만 등록했다. SFU 등록용 임시 파일은 제거했다.

## 배포 후 확인

- `/api/voice/status`: HTTP 200, enabled=true, 정원 30명, 좌석 8개.
- 새 JS/CSS: HTTP 200.
- 사용자 로그인 상태에서 임시 비공개방 생성 → 청취 입장 → 텍스트 채팅 표시 → 방 종료를 확인했다. 다른 회원 초대/선물 결제는 실행하지 않았다.
- 해당 브라우저에서 신규 console error/warn 없음.
- SFU 서버 인증과 빈 세션 생성/정리 확인. 음성 트랙을 송출한 시험은 아니다.
- 빌드 및 음성방 자동 검사 13/13 통과. 전체 검사 19개 기존 실패는 로컬 검증 보고서에 기록되어 있다.

## 미검증

사용자가 직접 테스트할 실제 마이크 송수신, 2대 이상 기기, 지연·음질, 모바일 백그라운드·Bluetooth, 제한 네트워크 TURN, 정원 부하 및 실제 선물/DM 전달은 아직 검증하지 않았다. Android/iOS 앱 빌드는 이번 웹 배포에 포함되지 않는다. 실시간 듀엣 반주 동기화는 별도 구현 대상이다.

![배포된 임시 음성방 확인](outputs/voice-rooms/web-deployed-room.png)
