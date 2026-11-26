# 공지 채팅 운영과 연동

공지 한 건의 원본은 `welcome_campaigns`에 저장합니다. `welcome_receipts`의 회원별 레코드가 수신 권한과 읽음, 개별 철회를 결정합니다. 신규 공지, 기존 환영 안내, 프리미엄 이벤트 공지와 운영자 대화는 같은 공식 채널에서 시간순으로 표시합니다. 기존 운영자 DM은 기존 DM의 권한과 저장 정책을 따릅니다.

## API와 권한

| 기능 | 경로 |
| --- | --- |
| 회원 타임라인과 읽음 | `GET/PATCH /api/notices/official` |
| 회원 이미지 | `GET/HEAD /api/notices/official/{campaignId}/images/{assetId}` |
| 발송 이력과 확정 발송 | `GET/POST /api/admin/notices` |
| 대상 사전 확인과 페이지 조회 | `POST /api/admin/notices/targets`, `GET /api/admin/notices/targets/{checkId}` |
| 운영자 본인 테스트 | `POST /api/admin/notices/test` |
| 편집과 철회 | `PATCH /api/admin/notices/history/{campaignId}`, `POST /api/admin/notices/history/{campaignId}/withdraw` |
| 명단, 초안, 설정 | `/api/admin/notices/rosters`, `/api/admin/notices/drafts`, `/api/admin/notices/welcome` |

기존 콘솔 세션과 관리자 권한으로 조회할 수 있습니다. 변경은 기존 콘솔 세션 또는 `ADMIN_USER_IDS`와 `AIFECT_NOTICE_OPERATOR_IDS`에 모두 포함된 회원 계정에 허용합니다. 테스트 발송은 `AIFECT_NOTICE_TEST_ACCOUNTS`의 운영자 ID와 검증된 테스트 회원 ID 연결이 필요합니다. 예를 들어 `admin-console`은 기존 단일 콘솔의 서버 인증 식별자입니다. 공지 전용 앱 푸시는 연결 준비 상태로 표시합니다.

## 발송과 명단 재사용

`server/notice-audience.js`가 대상 조건과 저장 명단을 제공합니다. 프리미엄 혜택의 유효기간은 기존 회원 판정식을 사용합니다. 실제 유료 구독은 웹의 유효한 실결제 기간, App Store의 유효한 Production 구매, Google Play의 유효한 비테스트 구독으로 판정합니다. 대상 확인 기록은 운영자별 15분간 유효합니다. 서버가 변경된 ID와 인원수를 제시하면 다시 확인합니다.

`server/notice-campaigns.js`의 `publishOfficialNotice`는 동일한 요청 UUID로 원본, 수신 권한, 감사 기록을 한 번에 기록합니다. D1 배치가 실패하면 배치 전체를 재시도할 수 있습니다. 발송 당시 확정된 수신 권한을 이후 가입이나 구독 갱신으로 다시 계산하지 않습니다. 기존 계정 삭제 정책에 따라 삭제된 회원의 개인 수신 기록은 제거되며, 신규 캠페인의 최초 인원은 발송 감사 기록으로 조회합니다.

선물 발송 기능은 실제 성공한 지급 건의 회원 ID를 공유 명단 모듈로 전달할 수 있습니다. 지급 작업별 알림은 안정적인 요청 UUID와 지급 기록 참조를 사용해야 합니다. 지급, 회수와 공지 편집은 별도 작업으로 유지하며 공지 본문에는 실제 지급 상태를 변경하는 필드를 넣지 않습니다.

## 배포와 복구

1. 승인 후 기존 Sites 프로젝트의 운영 D1 백업 또는 복구 시점을 확보합니다. 후보 버전의 소스와 마이그레이션을 확인한 후 기존 Sites 절차를 따릅니다. 샘플 회원을 이용한 발송 검증은 격리 환경에서 실행합니다.
2. 사용 중 문제가 발생하면 `AIFECT_NOTICE_READ_ONLY=true`로 어드민 변경과 발송을 잠급니다. 이 상태에서 이미 전달된 공지의 회원 조회, 권한 검증과 읽음 처리는 계속 작동합니다.
3. 새 공지를 발송하기 전이라면 기존 버전으로 코드를 되돌려도 추가된 컬럼의 기본값으로 기존 쓰기가 동작합니다. 새 공지가 전달된 후에는 공식 타임라인과 수신 상태 처리가 포함된 수정 빌드로 복구합니다. 이전 코드에는 신규 공지를 읽고 배지를 계산할 경로가 빠져 있기 때문입니다.
4. 추가 테이블과 컬럼을 운영 복구 중 삭제하지 않습니다. 실제 데이터 복원은 백업을 격리 환경에 먼저 복원하고 복구 시점 이후 발생한 다른 업무의 쓰기를 확인한 뒤 승인된 절차로 진행합니다.

기존 앱에는 제목과 평문을 반환하는 호환 경로가 있습니다. 새 서식, 여러 이미지, 수신 중 수정·철회의 네이티브 반영은 앱 업데이트에서 제공됩니다.
