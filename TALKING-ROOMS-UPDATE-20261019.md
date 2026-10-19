# 토킹룸 및 골드 선물 수정 — 2026-10-19

## 변경 내용

- 방 카드 또는 초대 링크를 누르면 해당 방에 청취자로 자동 입장한다. 마이크 권한은 마이크를 직접 켤 때만 요청한다. 연결 실패 시에만 다시 연결 버튼을 제공한다.
- 마지막 회원의 정상 퇴장 시 방을 종료하고 목록에서 제거한다. 갑작스러운 연결 단절은 기존 75초 접속 유효기간과 15초 정리 주기에 따라 종료한다. 빈 기존 방은 목록 조회 때도 정리한다. D1 기록 갱신 실패는 재시도한다.
- 회원별 입장 시점의 메시지 순번을 저장하고 서버 응답을 필터링한다. 재접속은 기존 입장 범위를 유지하며, 퇴장 후 재입장은 새 범위를 적용한다. 방 종료 시 임시 대화 내용을 비운다.
- 기능 이름을 토킹룸으로 통일했다. DM 초대 버튼은 문구 아래에 10px 간격으로 배치한다. 기존 초대 메시지의 링크에도 적용한다.
- 장미 200G를 현재 판매 목록에서 제외하고 막대사탕 1G를 추가했다. 실버 선물과 응원별 100G는 유지한다. 기존 장미 영수증의 이름과 금액은 변경하지 않는다.
- 선물함, 곡/프로필 선물 및 토킹룸은 공통 카탈로그와 서버 가격 검증을 사용한다.

## 검증

- 빌드: `node scripts/build.mjs` 통과.
- `node --test tests/gifts.test.mjs tests/gift-quantities.test.mjs tests/voice-rooms.test.mjs`: **33/33 통과**.
- 1G 및 3개 수량 차감, 개인/커버/토킹룸 선물, 중복 전송 방지, 정산 합계 보존, 조작 가격과 퇴출된 상품 차단, 이전 영수증 유지 검증.
- 로컬 D1 + Durable Object + 인증 WebSocket 통합 검사 통과: 비공개 초대, 입장 전 대화 비노출, 마이크 좌석/관리 권한, 방 종료, 마지막 퇴장 시 목록 제거.
- 실제 브라우저에서 생성 후 자동 입장, 마이크 꺼짐, 마지막 퇴장 후 빈 목록 확인. 기존/신규 DM 초대 링크 모두 별도 줄과 10px 간격 확인.
- 관련 소셜/인증/카탈로그 회귀 검사: 63개 중 60개 통과, 기존 기준선과 동일한 3개 실패(선택 DM의 즉시 목록 조회 기대값, 차단 목록의 지연 조회 기대값, 커뮤니티 테스트의 `empty is not defined`). 이 작업과 관련된 새 실패는 없음.
- 별도 Worker 배포 완료: `e8bebbdc-dda8-469b-a111-d97803a22a96`.
- 웹 버전/배포 ID는 같은 폴더의 outputs/voice-rooms 배포 결과 JSON을 확인한다.

## 미검증

실기기 2대 이상 음성 송수신과 Bluetooth/모바일 백그라운드는 사용자 요청에 따라 후속 검증 대상이다. 실제 운영 골드 지출 및 타인에게 DM 발송은 테스트하지 않았다. 이번 작업에는 Android/iOS 앱 재빌드가 포함되지 않는다.

## 이미지 제작

- 방식: 내장 image_gen 도구, 새 이미지 생성, 투명 배경.
- 최종 자산: `dist/assets/gifts/lollipop.png`.
- 원본 생성물은 보존하고 프로젝트로 복사했다.
- 최종 프롬프트:

> Use case: stylized-concept. Asset type: a single premium virtual gift icon for the AIFECT music app. Create one beautiful 3D lollipop: a round glossy spiral candy with soft pastel pink, lavender, pearl white and subtle mint iridescent swirls, on a slim ivory stick. Pearlescent enamel / glassy candy material, smooth rounded edges, polished soft studio highlights. Cute and refined, same aesthetic as glossy pastel virtual gift balloons, hearts and crowns. Isolated cutout on a genuinely transparent background. Square composition, centered complete object, the candy at upper center and stick angled gently toward lower left, generous clean margins on all sides, strong silhouette recognizable at 80 pixels. Candy and stick only, no extra props, no text, no letters, no prices, no badge, no border, no floor, no cast shadow or background.

