# AIFECT ChatGPT 관리 환경

검토 기준: 2026-10-21. 기존 Sites 187번 소스에서 시작했다. 이 문서는 준비된 코드와 운영 활성화를 구분한다.

## 공식 지원 범위

| 업무 | 공식 경로 | 현재 상태 |
| --- | --- | --- |
| 일반 ChatGPT의 이용자·골드·신고 관리 | 설치된 `AIFECT 관리자` MCP | 코드/로컬 테스트 준비. 승인 후 게시·소유자 연결 필요 |
| 버그 이메일 조회 | 공식 Gmail 플러그인 | 현재 연결 계정이 사이트 고객센터 계정과 일치함을 프로필 조회로 확인 |
| 버그 접수 보관·조회 | Gmail에서 선택한 메일 요약을 관리자 MCP로 등록 | 자동 메일 동기화가 아님. 메일 ID 해시로 중복 방지 |
| 소스 수정·테스트·후보 저장·게시 | `@Sites`와 해당 채팅의 개발 실행 환경 | 현재 환경에 공식 소스/저장/배포 도구가 있음. 일반 채팅의 도구 가용성은 플러그인·모드·계정에 따름 |
| 최초 설치/ChatGPT 로그인/연결 동의 | ChatGPT Plugins의 설치 카드 | 사용자가 직접 완료해야 하는 최초 인증 단계 |
| 사이트 목록·기존 버전·설정 점검 | ChatGPT Sites 화면 또는 공식 Sites 도구 | 화면 전용으로 제한된 배포 방식이 아님 |

일반 채팅에서 관리자 MCP만 선택하면 서버의 한정된 운영 도구를 사용한다. 이 MCP는 코드 실행·임의 SQL·파일 업로드·배포·결제 취소 도구를 제공하지 않는다. 소스 수정과 게시에는 `@Sites`를 함께 사용한다. 공식 Sites 도구가 없는 채팅은 Sites/Work 또는 이 프로젝트가 열린 Codex로 이어서 작업한다. 임의 배포 API를 추가하지 않았다.

### 공식 근거

- [Sites](https://learn.chatgpt.com/docs/sites): 기존 프로젝트 연결과 버전 저장·게시의 구분, 웹/데스크톱 관리.
- [게시와 공유](https://learn.chatgpt.com/docs/sites/publishing-and-sharing): 변경 검토 후 저장·게시.
- [플러그인 사용](https://learn.chatgpt.com/docs/plugins): Chat/Work에서 설치된 플러그인 사용, 계정별 권한.
- [Sites 기반 MCP](https://learn.chatgpt.com/docs/extend/mcp): Sites의 인증, 소유자 게시 후 플러그인 생성·설치. Sites 플러그인은 별도 skill/reference 편집을 지원하지 않으므로 이 운영 지침은 저장소에 둔다.
- [MCP 연결과 테스트](https://developers.openai.com/plugins/deploy/connect-chatgpt): 인증·스키마·도구 평가와 설치 후 확인.
- 설치된 공식 Sites 스킬 `references/site-mcp-server.md`: `capabilities:["mcp"]`, `/mcp`, Sites 사용자 헤더, `get_site`와 `suggest_plugins` 설치 카드 절차.

## 관리자 도구 9개

`aifect_search_users`, `aifect_gold_balance`, `aifect_grant_test_gold`, `aifect_gold_history`, `aifect_admin_stats`, `aifect_list_reports`, `aifect_moderate_report`, `aifect_audit_history`, `aifect_register_email_bug`.

- 닉네임 검색 결과의 user_id로 대상을 확인한다. 실명/이메일 검색은 노출하지 않는다.
- 테스트 지급은 1~10,000G, 한국 시간 하루 총 50,000G 이내. `request_id`를 한 지급에 한 번 정하고 네트워크 재시도에도 유지한다. 다른 대상·수량·사유로 같은 ID를 재사용하면 거절한다.
- 기존 지갑에 `channel=admin_test`, `price_krw=fee_krw=tax_krw=0`으로 저장한다. 선물에 사용해도 정산/다이아 수익이 발생하지 않는다. 지급 원장과 감사 기록은 동일 D1 batch로 저장한다.
- 내역은 기존 구매 lot, 선물, 더빙 제작 차감/환급을 읽는다. 옛 취소 시각처럼 기존 장부에 없는 정보는 만들어내지 않는다.
- 신고 처리에는 조회한 상태·버전과 사유가 필요하다. 음원·더빙은 숨김/복원, 댓글은 기각/본문 삭제다. 댓글 삭제는 되돌릴 수 없다. R2 음원이나 결제 장부는 삭제하지 않는다.
- 버그 메일은 고객센터 계정의 실제 message_id와 수신 시각, 제목, 최소 요약만 등록한다. 메일 ID는 해시로 저장하고 원문/첨부/접속 토큰은 보관하지 않는다. 아직 등록하지 않은 메일을 `접수 없음`으로 단정하지 않는다.

## 최초 승인·활성화

1. 테스트·빌드 완료 후보의 변경을 검토하고 **운영 배포**와 **DB 변경**을 각각 승인한다. 0062는 새 `admin_email_bugs`, `admin_test_gold_grants` 및 인덱스를 만든다. 0063은 0058의 댓글 테이블 재생성 과정에서 사라진 기존 댓글 알림·경험치 트리거 2개를 복원한다. 기존 행 변경이나 과거 경험치 소급 지급, seed, R2 변경은 없다.
2. 공식 Sites 도구로 후보를 게시한다. 처음에는 `AIFECT_MCP_ENABLED=false` 또는 미설정이므로 아무에게도 관리자 도구가 열리지 않는다. 초기에 discovery가 거절되면 소유자 연결 후 다시 갱신한다.
3. 같은 사이트 도메인에서 `/signin-with-chatgpt`로 운영자 ChatGPT 계정을 인증하고 기존 관리자 콘솔에도 로그인한다. `GET /api/admin/mcp/identity`는 기존 콘솔 세션이 있는 운영자에게만 Sites의 site-scoped ID를 반환한다. 이 엔드포인트의 실제 custom-domain 로그인 동작은 승인 후 검증 대상이다.
4. 확인된 ID를 공식 Sites 환경 설정의 **secret** `AIFECT_MCP_OWNER_ID`에 저장한다. AIFECT 회원 UUID, Gmail ID 또는 이메일 주소로 대체하지 않는다. `AIFECT_MCP_ENABLED=true`로 설정한다. 다른 운영자를 자동 등록하지 않는다.
5. 익명/임의 사용자 ID/기존 회원 쿠키만으로 `/mcp` 접근이 차단되는지 **실제 Sites ingress**에서 검사한다. 플랫폼 헤더가 외부 요청으로 위조될 수 있으면 즉시 비활성화하고 공개하지 않는다. 직접 Worker origin에는 이 코드를 노출하지 않는다.
6. 인증된 운영자의 discover/list 및 읽기 도구를 검증한다. 필요 시 같은 검증된 후보를 공식 Sites로 재게시해 도구 목록을 갱신한다. 사이트 소유자 게시로 생성된 plugin ID를 `get_site(include_mcp_connection:true)`에서 받고 `suggest_plugins`로 설치 카드를 제공한다. 별도 app ID나 추정 설치 링크를 만들지 않는다.
7. MCP의 서버 표시명은 **AIFECT 관리자**다. 자동 생성된 개인 플러그인 카드 명칭도 확인한다. 플랫폼이 사이트 제목을 그대로 쓰면 공식 플러그인 편집 화면의 지원 여부를 확인하고, 웹사이트 제목을 무단 변경하지 않는다.
8. 설치·연결 후 새 일반 채팅에서 `@AIFECT 관리자`를 선택하고 읽기부터 확인한다. Gmail은 같은 채팅에서 별도로 선택할 수 있다.

설치 카드는 Sites 게시로 실제 plugin ID가 생성된 뒤 제공된다. 배포 승인 전에는 운영 연결/설치가 완료됐다고 표시하지 않는다.

## 이후 작업 예시

- “@AIFECT 관리자 코코 닉네임의 이용자를 검색하고 골드 잔액을 보여줘.”
- “확인한 user_id에 녹음 테스트용 100G를 지급하고 감사 기록을 보여줘.”
- “@Gmail 고객센터에 온 AIFECT 버그 메일을 찾아 요약해줘. @AIFECT 관리자 해당 접수를 중복 없이 등록해줘.”
- “@Sites 기존 aifect.co.kr 프로젝트를 수정하고 전체 테스트·빌드 후 후보 버전만 저장해줘. 게시와 DB 변경은 승인받아.”

소스 수정 시 `npm run release:prepare` 한 번으로 테스트와 빌드를 실행한다. `npm run release:check`는 검증 뒤 파일 변경 여부를 검사한다. 공식 source helper에 이 검사 명령과 검증된 archive 경로를 전달한 뒤 `save_site_version`으로 후보를 저장한다. 실제 version 번호와 commit SHA는 도구 응답으로 기록하며 추측하지 않는다. 검사 스크립트에는 게시 API·credential·우회 승인 옵션이 없다.

HTTP 회귀 테스트는 자체 loopback 서버와 메모리 SQLite/R2 어댑터를 실행한다. 실행 중인 개발 서버나 운영 URL을 사용하지 않는다. 이 테스트는 실제 Cloudflare D1/R2 및 Sites 인증 프록시 검증을 대신하지 않는다. 기존 UI 테스트의 DOM 모의 객체·프로필 기본 이미지·비동기 DM 목록·노래 카드 선택자를 현재 구현에 맞췄으며 사이트 화면 코드는 수정하지 않았다.

## 장애·복구

- 테스트/빌드 실패: 저장·게시하지 않고 로그를 확인한다. `work/releases/latest.json`은 실패한 실행에서 삭제되어 이전 통과 결과를 재사용하지 못한다.
- 소스 동시 변경: 최신 Sites 소스와 합친 뒤 재검증한다. 강제 푸시로 덮어쓰지 않는다.
- 게시 실패: 공식 deployment ID로 상태와 로그를 확인한다. Sites는 Worker 업로드 전 DB migration을 적용할 수 있으므로 실패했다고 미적용으로 간주하지 않는다.
- MCP 오류/권한 문제: `AIFECT_MCP_ENABLED=false`로 차단한다. env 변경도 운영 변경이므로 사용자의 명시적 운영 요청 범위에서만 수행한다.
- 코드 복구: 사용자가 승인한 이전 archive-backed Sites 버전을 공식 배포 도구로 재게시한다. 게시 ID와 실제 URL을 검증한다. 현재 운영 버전이 이후 변경되었을 수 있으므로 무조건 187로 되돌리지 않는다.
- DB 복구: 이 추가 migration의 테이블은 이전 코드에서 무시할 수 있다. rollback 목적으로 테이블/감사/지급 행을 삭제하지 않는다. 데이터 변경이 필요하면 영향과 복구안을 별도로 승인받는다.
- 최초 승인 후 `npm run release:verify`와 인증된 관리자 읽기 도구로 확인한다. 클라이언트 번들 검사는 서버 버전 검증을 대체하지 않는다. 서버는 공식 배포 결과와 MCP `serverInfo.version`도 함께 확인한다.
