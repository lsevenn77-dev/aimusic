# 선물 발송 관리

운영 관리의 상품 지급 탭에서 대상과 실제 상품 옵션을 선택합니다. 대상 및 지급 확인에서 확정 회원 ID, 제외 사유, 상품별 수량과 기한을 확인합니다. 상품 관리의 지급하기와 회원 목록의 선물 발송으로 이동은 지급 화면에 선택한 값만 전달합니다.

지급 확인이 끝나면 서버가 대상과 상품 조건을 다시 검사하고 지급 작업을 고정합니다. 지급과 안내를 나누어 처리합니다. 화면을 닫았거나 통신이 끊긴 뒤에는 발송 상세에서 진행 중인 지급을 이어갈 수 있습니다. 유효하지 않은 상품·보유 상태는 실패 사유에 표시됩니다. 같은 작업을 이어서 처리해도 이미 기록된 보유권은 다시 발급되지 않습니다.

## 권한

- 관리자 세션과 계정 권한은 기존 어드민에서 판정합니다. 회원 계정으로 지급하려면 `ADMIN_USER_IDS`와 `AIFECT_GIFT_DISPATCH_OPERATOR_IDS`에, 회수·연장하려면 `ADMIN_USER_IDS`와 `AIFECT_GIFT_DISPATCH_ADJUSTER_IDS`에 포함되어야 합니다. 기존 콘솔 계정의 작업은 서버가 콘솔 식별자로 기록합니다.
- 공지의 회원 검색·CSV·저장 명단 API와 권한을 그대로 사용합니다. 테스트 지급은 격리 서버에서만 `AIFECT_GIFT_DISPATCH_TEST_MODE`를 활성화하고 기존 `AIFECT_NOTICE_TEST_ACCOUNTS`에 검증된 계정을 연결합니다. 기본 발송 내역의 집계는 검증용 작업을 제외합니다.
- 선물 도착 안내는 공지 채팅의 기존 발신자와 회원별 수신 권한을 사용합니다. 앱 푸시는 별도 연결 준비가 필요합니다.

## API

| 기능 | 경로 |
|---|---|
| 권한과 상품 조회 | `GET /api/admin/gift-dispatch/settings`, `GET /api/admin/gift-dispatch/catalog` |
| 대상·상품 사전 확인 | `POST /api/admin/gift-dispatch/preview`, `GET /api/admin/gift-dispatch/{id}/preview-members` |
| 최종 확인과 지급 계속 | `POST /api/admin/gift-dispatch/{id}/confirm`, `POST /api/admin/gift-dispatch/{id}/process` |
| 실패 지급과 안내 재처리 | `POST /api/admin/gift-dispatch/{id}/retry`, `POST /api/admin/gift-dispatch/{id}/notify` |
| 내역과 대상 조회·CSV | `GET /api/admin/gift-dispatch`, `GET /api/admin/gift-dispatch/{id}`, `GET /api/admin/gift-dispatch/{id}/members`, `GET /api/admin/gift-dispatch/{id}/csv` |
| 연장·회수의 사전 확인과 실행 | `POST /api/admin/gift-dispatch/{id}/adjustments`, `POST /api/admin/gift-dispatch/{id}/adjustments/{operation}` |
| 수신자 안내와 인벤토리 | 기존 `/api/notices/official`, `/api/notices/welcome`, `/api/me/gift-inventory`, `/api/me/player`, `/api/decorations` |

## 장부와 사용 기한

0112는 공지 채팅, 0113은 상품 관리, 0114는 선물 발송의 마이그레이션입니다. 지급 작업과 대상은 `gift_dispatches`와 `gift_dispatch_items`에 저장합니다. 회수·연장 사유와 영향받은 보유권의 이전 기한은 `gift_dispatch_adjustments`와 `gift_dispatch_effects`에 남습니다.

발급 단위는 기존 `gift_inventory`와 `player_inventory`에 저장합니다. 무료 지급은 인벤토리에 결제 가치 0으로 기록합니다. 운영 지급으로 받은 소비형 선물을 기존 선물 보내기에서 사용하면 같은 상품의 사용 가능한 무상 지급분에서 기한이 빠른 단위를 먼저 소비합니다. 유료 구매분은 요청에 선택된 단위와 결제 영수증을 유지합니다.

미사용 테두리·테마의 사용 시작 기한과 활성화된 사용권의 종료 시각을 따로 관리합니다. 지급형 사용권을 활성화하면 독립적으로 이용 기간이 시작됩니다. 시즌 종료일을 지정한 상품은 해당 KST 일자의 다음 날 00시부터 만료입니다. 회수·연장은 확인 시점과 실행 시점의 유효 단위와 기한이 일치하는 경우에 적용합니다.

## 운영 반영과 복구

1. 운영 반영 승인 후 현재 Sites 배포 버전과 공식 소스 SHA, D1 복구 지점 또는 백업을 확보합니다. 기존 상점·운영 지급·공지 데이터와 앱 호환성을 대조합니다.
2. 적용될 0112~0114와 공지·상품 관리 의존 커밋을 검토한 뒤 공식 Sites 배포 절차를 따릅니다. Cafe24가 사용하는 웹 소스와 Android·iOS의 후속 빌드가 같은 계약을 사용해야 합니다.
3. 문제가 발생하면 `AIFECT_GIFT_DISPATCH_READ_ONLY=true`로 새 지급, 재시도와 회수·연장을 잠급니다. 이미 발급된 이용권의 조회와 사용 검증은 신기능을 포함한 빌드에서 계속 수행합니다.
4. 신규 지급을 실행하기 전에는 직전 운영 웹 버전으로 되돌릴 수 있습니다. 발급 이후에는 기한과 회수를 인식하는 수정 빌드로 복구합니다. 운영 DB 복원이 필요하면 백업을 격리 환경에 먼저 복원하고 복구 지점 이후의 결제·선물·보유권을 대조합니다.
