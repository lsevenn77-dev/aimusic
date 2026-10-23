# 공식 AI 응원 시스템

## 구현 계획 및 경계

기준 소스는 운영 205번(dc5545d), 작업 브랜치는 codex/ai-support-bots다. 일반 회원 데이터, 골드/실버 지갑, 유료 선물·정산 원장은 유지한다.

1. users.account_type=ai_bot 서비스 계정과 별도 관리 메타데이터를 추가한다. 비밀번호·인증 subject·세션을 발급하지 않는다. 기존 producers/댓글 UI를 재사용한다.
2. 공식 응원별은 실버가 랭킹에 반영되는 기존 free_gifts에 넣지 않고 ai_support_gifts에 저장한다. 현금가치 0이며 지갑·매출·정산·팬 순위와 분리한다.
3. 공개 전환 DB 트리거가 중앙 작업 큐에 기록한다. 최초 기본값 OFF, 과거 작품 일괄 소급 없음. 기존 Worker scheduled 핸들러 및 인증된 관리자 처리 버튼으로 같은 엔진을 실행한다. D1 원자 배치, 전역 lease, job 고유키, 일일 한도, 재시도, 감사 로그를 사용한다.
4. 기존 관리자 내부에 계정/템플릿/설정/활동/가져오기 화면을 추가한다. 일반 회원 네비게이션은 변경하지 않는다.
5. 가져오기는 이미지/CSV 검토 후 선택 실행한다. 권한을 확인할 수 없는 원격 이미지 URL은 서버에서 가져오지 않는다. WebP 파일을 AIFECT R2에 별도 저장하며 원본은 보존한다.
6. fixture 테스트에서 500개 계정, 중복/동시 처리, 권한, 한도, 정산과 랭킹 불변을 확인한다. 운영 DB 적용·배포·실제 이용자 자동 활동은 이번 단계에 포함하지 않는다.

## 운영 준비

Sites 관리형 스케줄의 실제 호출 주기는 별도 배포 승인 이후 확인해야 한다. scheduled 핸들러가 있다고 플랫폼 스케줄이 자동 등록되는 것은 아니다. 관리자 화면에서 명시적으로 처리할 수도 있으며, 비밀키 없는 공개 실행 엔드포인트는 제공하지 않는다.

기본 한도는 작품당 댓글 1개(0~2), 공식 응원별 1~2개, 댓글 5~15분/선물 10~30분이다. 설정 OFF는 대기 작업을 보존하고 실행만 중지한다. 긴급 중지는 설정 revision을 바꾸며 진행 중 배치도 실제 쓰기 직전에 확인한다.

## 사이그램 가져오기 결과 (2026-10-24)

- 사용자가 지정한 ChatGPT 계정과 브라우저 계정이 같은 것을 확인했다. 현재 Sites 커넥터의 목록에는 AIFECT만 존재했다. 사이그램 서비스는 별도 서버 `api.dasi-on.co.kr`를 사용한다. AIFECT 프로젝트 연결은 변경하지 않았다.
- 로컬 `Downloads/saigram-ios/saigram.bundle`에서 소스를 읽었다. 기준 커밋은 `657f4ef572524497119000c62066c04cb8784eb9`이다. 운영 서버의 최신 DB 전체를 덤프한 것은 아니다.
- `api/character_master_v3.json`의 공식 캐릭터 42명과 `web/lib/bots.generated.ts`의 bot_accounts 스냅샷 293개를 대조했다. 일반 사용자 테이블이나 사용자 사진 목록은 가져오지 않았다.
- 공식 캐릭터는 로컬 원본/변환 manifest, 봇은 소스에 명시된 `https://img.dasi-on.co.kr/assets/bot-profiles/bot_*.webp`에서 취득했다. 임의 경로 탐색·무단 크롤링·로그인 세션 복사는 하지 않았다.
- 후보는 **335개**, 중복 SHA-256 **0개**, 실패 **0개**다. 모두 512×512 WebP로 별도 최적화했다. 합계 **11,980,700 bytes(약 12 MB)**. 원본을 수정하지 않았다.
- 관리자가 보는 목록: `dist/assets/ai-bot-import/catalog.json`. `source_key`와 SHA-256이 각각 고유하며 이미 등록된 계정은 제외한다. 이미지 일괄 업로드와 CSV 매핑도 지원한다.
- 실제 관리자 화면에서 미리보기 → 별도 등록 버튼을 사용해 로컬 SQLite/메모리 R2에 **335개만** 등록했다. 활성 계정 0개, 자동 활동 OFF를 확인했다. 이후 별도 폐기형 fixture에서 댓글 1개와 응원별 1~2개를 실행하고 다시 OFF로 돌려 일반 작품 화면까지 확인했다.
- **운영 DB 등록 0개, 운영 R2 쓰기 0회, 운영 배포 없음**. 500개는 별도 성능 테스트에서만 생성한 합성 fixture이고 실제 가져오기 목록에는 없다. 사용자 지시에 따라 실제 등록 후보는 335개로 고정한다.

## 관리 경로와 운영 방법

기존 `/admin/dashboard` → **AI 봇 관리**. 운영자 콘솔 세션 또는 기존 서버 운영자 권한을 검증한다. 일반 회원 메뉴에는 관리 도구를 추가하지 않았다.

1. 사이그램 · 일괄 등록에서 후보를 미리보고 선택한다. 원격 주소를 임의로 입력하는 가져오기 API는 없다. CSV 열은 `source_key,name,image`이며 image는 선택한 로컬 파일명이다.
2. 운영자 소유 AI 이미지 확인 후 **선택 항목 서버 미리보기**를 누른다. 이 단계는 R2 임시 이미지 저장과 중복 검사만 수행하고 계정을 생성하지 않는다.
3. 별도 **검토한 계정 등록** 버튼으로 등록한다. 서버는 미리보기와 같은 운영자·정확한 항목 목록을 검증하며, 한 요청에 5개씩 원자적으로 생성한다. 개별 실패는 화면과 감사 기록에 남긴다. R2 복사 실패는 계정을 비활성 상태로 두고 동일 항목 재시도로 복구한다.
4. 계정의 말투·이모지·일일 한도를 검토하고 필요한 계정을 활성화한다. 새 계정은 기본 비활성이다. 일괄 선택/활성화/비활성화, 검색, 페이지 이동, 이미지/이름 수정이 가능하다.
5. 템플릿은 분류 6종 × 20개 = **120개**다. 실제 청취/분석 평가는 포함하지 않는다. 추가·수정·삭제·비활성화할 수 있다.
6. 실제 운영 배포 및 DB 적용은 별도 승인 후 진행한다. 실제 자동 응원 시작도 검증과 운영자 승인 후 전체 ON으로 설정한다. 글로벌 긴급 중지는 대기 작업을 보존하고 쓰기를 중단한다.

## DB 마이그레이션

`drizzle/0071_parched_talos.sql` — 아직 운영에 적용하지 않음.

- 기존 users에 `account_type NOT NULL DEFAULT 'human'` 열 추가. 기존 회원은 모두 human을 유지하며 기존 비밀번호/세션/결제 기록을 변경하지 않는다.
- 새 테이블 8개: `ai_bots`, `ai_bot_settings`, `ai_bot_templates`, `ai_bot_jobs`, `ai_bot_activities`, `ai_support_gifts`, `ai_bot_assets`, `ai_bot_audit`.
- 최초 설정 OFF와 템플릿 120개만 seed한다. **335개 계정을 마이그레이션에서 자동 생성하지 않는다.** 관리자의 미리보기·등록 절차가 필요하다.
- 공개 전환 트리거는 공개 음원/완료 커버·듀엣/완료 공개 더빙만 큐에 넣는다. 최초 공개 시점의 첫 작품 여부도 보존한다. 비공개·미완료 듀엣·삭제·권리 차단 작품은 실행 전에 재검증한다.
- UNIQUE 키로 동일 작품/활동/슬롯, 활동 job, 선물 job, 프로필 원본 키/이미지 중복을 막는다. 서비스 계정 로그인 세션·자동 재생·좋아요·팔로우·유료/실버 지갑·유료 선물·창작/크루/정산 진입을 DB 트리거와 서버에서 제한한다.
- 기존 금전 원장과 free_gifts를 재작성하지 않는다. 공식 응원별은 cash_value=0을 강제하고 유료 선물 수령도 차단한다. AI 댓글은 인간 댓글 수/차트 점수에서 제외한다.

## 자동화·서버 부담

- 기존 Worker `scheduled` 핸들러에 엔진을 연결했다. 관리자 처리 버튼도 동일 엔진을 호출한다. 공개 실행 엔드포인트나 봇별 프로세스는 없다.
- 전역 lease 1개(120초), 기본 1회 **3개 작업**을 처리한다. 환경 변수 `AI_BOTS_BATCH_SIZE`로 최대 15개까지 조정할 수 있다. 실패는 지수 지연 후 최대 5회, 최종 실패는 관리자 재시도 예약으로 복구한다. 설정 revision/lease/계정 활성/일일 한도/대상 공개 상태를 실제 쓰기에서도 확인한다.
- 기본 하루 댓글 100개/응원별 200개, 창작자당 하루 2개 작품, 봇당 하루 10개 활동. 실제 회원의 댓글·좋아요 반응이 충분하면 생략한다. 자동 응원이 실제 팬 관계나 유료 인기에 기여하지 않는다.
- 추가 음원 분석/GPT 호출 **0회**. 새 작품마다 댓글 1개 설정에서 작업 2개(댓글·별)가 생성된다. 작업/일일/계정/대상 조회에는 인덱스를 사용한다.
- 500개의 **합성 fixture** 계정에서 계정 등록은 약 0.24초, 두 작업 엔진 실행은 **SQL 23개·로컬 약 1ms**였다. 이는 네트워크가 없는 로컬 SQLite 결과로, 운영 D1 지연·CPU 비용·실제 rows_read 비용 측정이 아니다.
- 335개 R2 등록 시 이미지 본문 약 12 MB, 임시 사본까지 보존하면 약 24 MB다. 후보 자산도 앱 정적 자산으로 약 12 MB가 추가된다. 원본은 별도 보존된다.
- 바인딩 수와 요청 크기를 제한했다. 플랫폼 한도 참고: [Cloudflare D1 공식 제한](https://developers.cloudflare.com/d1/platform/limits/). 운영 요금제·다른 scheduled 작업과 합산한 실제 여유는 배포 후 확인해야 한다.

## 검증 결과와 한계

- 통합 테스트: 계정 권한/자격 증명 금지/중복 가져오기/335개 실제 후보 등록/500개 합성 규모/중복·동시 작업/지연 시간/ON·OFF·긴급 중지/재시도·롤백/일일 제한/첫 작품/완료 듀엣·더빙/실제 반응 생략/정산 차단/회원·창작자 수 및 차트 점수 불변.
- 기존 전체 회귀 테스트와 빌드는 `work/releases/latest.json` 및 해당 테스트 로그에 최종 결과를 기록한다. 기존 play lint/typecheck도 실행한다. 기존 더빙 전역의 누락된 타입 선언을 실제 shared 모듈 타입으로 보완했다.
- PC 1440×900, 모바일 390×844, 320/768px에서 관리자 페이지를 확인했다. 가로 넘침 없음, 새 버튼 최소 높이 44px. 댓글 AI 배지·공식 선물·프로필 표시는 실제 로컬 앱에서 확인한다. 캡처는 `outputs/ai-bots-*.jpg`에 있다.
- **미검증**: 운영 D1/R2 마이그레이션 및 적용, 운영 스케줄 호출 주기, 실제 이용자 대상 활동, 클라우드 지연·부하, Android/iOS 네이티브 래퍼. PC/모바일 웹을 검증한 것이며 네이티브 앱을 빌드한 것은 아니다.
- 사이그램의 현재 운영 DB와 스냅샷의 차이는 확인하지 않았다. 최신 계정이 추가됐다면 소스 export를 갱신한 뒤 같은 검토/중복 방지 절차로 가져와야 한다.

## 주요 변경 파일

- 서버: `server/ai-bots.js`, `server/index.js`, `server/auth.js`, `server/catalog.js`, `server/profiles.js`, `server/gifts.js`, `server/dubbing-community.js`, `server/admin-dashboard.js`, `server/admin-mcp-operations.js`, `server/popular-chart.js`, `server/payouts.js`.
- UI: `dist/admin-ai-bots.js`, `dist/admin.html`, `dist/admin.js`, `dist/admin.css`, `dist/views.js`, `dist/mypage.js`, `dist/profile-preview.js`, `dist/dubbing-community.js`, `dist/gifts.js`, `dist/integrated.css`.
- 스키마·자산·빌드: `db/ai-bots.ts`, `db/schema.ts`, 새 migration/snapshot/journal, `shared/ai-bots.js`, `dist/assets/ai-bot-import/`(335 WebP + 목록), `scripts/build.mjs`, `scripts/prepare-saigram-bots.py`, `scripts/ai-bot-migration-seed.mjs`.
- 검증: `tests/ai-bots.test.mjs`, `tests/preview-ai-bots.mjs`, `tests/song-sidebar.test.mjs`, `tests/player-progress.test.mjs`, `tests/play-globals.d.ts`.

다음 별도 작업인 커버 WAV 저장 용량 축소는 `docs/NEXT-COVER-AUDIO.md`에 기록했다. 이번 변경에는 녹음 코덱 변경이 없다.
