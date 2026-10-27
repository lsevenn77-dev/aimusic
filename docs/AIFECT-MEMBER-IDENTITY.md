# 회원 닉네임·공개 ID 변경 (2026-10-27)

운영 적용 전 검토용 변경이다. 운영 배포와 DB migration은 각각 승인이 필요하다.

## 기존 정책과 영향

- 기존 `server/nicknames.js`: NFKC 정규화, 연속 공백 축약, 1~60자, 제어·서식 문자 제외. 공백·다수 특수문자 허용. 변경 기간 제한 없음.
- 기존 `account_handles.normalized` UNIQUE와 기존 공개 이름 조회로 중복 방지. 기존 회원 이름 전체에 UNIQUE를 강제할 수 없는 구조다.
- 새 정책: 앞뒤 공백 제거, 한글(완성형·자모)/ASCII 영문/숫자/밑줄, 2~12자, 소문자 비교, 사칭·금지어 차단. 전체 폭 영문은 변환하지 않고 거부한다.
- 기본 차단 목록은 `shared/nickname-policy.js`에 명시했다. 임의의 모든 유해 표현을 완벽히 판별한다고 주장하지 않는다. 브라우저 정의가 공통 소스와 같은지 테스트한다.
- 기존 이름을 강제로 변경하거나 UNIQUE 인덱스로 기존 중복을 합치지 않는다. 현재 공개 이름을 그대로 저장하는 요청은 유효성·중복·기간 제한을 건너뛰어 소개·사진 수정을 보존한다. 새 이름을 선택할 때부터 새 정책 적용.
- `nickname_changes`에 실제 변경 시각 저장. 같은 DB batch 안에서 변경 제한 트리거와 이름 예약 UNIQUE를 처리하므로 경쟁 요청도 원자적으로 보호한다. 가입 시 및 아직 공개 닉네임을 정하지 않은 OAuth 최초 설정은 변경 기록에 포함하지 않는다.

## 공개 ID와 호환성

- 기존 내부 `users.id`, 모든 참조 FK, 숫자 `public_member_ids.number`를 유지한다. 기존 숫자 ID는 선물 수신자 검색·관리자 지급 등에 쓰이므로 형식을 바꾸지 않는다.
- `public_profile_ids(user_id PRIMARY KEY, code TEXT NOT NULL)`에 별도 발급한다. code에 UNIQUE 인덱스와 `[A-Z]{3}[0-9]{4}` CHECK를 둔다.
- 서버 DB INSERT 트리거에서 random()/char()/printf('%04d')로 발급. 충돌 시 최대 32번 새 후보를 생성하고 모두 실패하면 가입 transaction을 중단한다. 인증·로그인·세션 토큰으로 쓰지 않는다.
- 기존 회원 backfill도 사용자별 같은 재시도 절차를 거친다. users 행이나 기존 번호를 UPDATE하지 않는다. 이미 있는 정상 code는 유지한다. 재실행 시 미발급 행만 처리한다. 삭제된 계정의 발급 코드도 재사용하지 않는다.
- 응답에 `public_id`를 추가하고 `public_number`의 타입·값은 유지한다. 클라이언트의 ID 변경 입력은 수락하지 않는다.
- `/api/search?q=`에서 공개 닉네임 또는 code로 회원을 찾는다. 작품 없는 회원도 포함하며 비공개 OAuth 이름은 검색하지 않는다. 기존 제작자는 기존 producer 경로로 이동한다. 제작자 프로필 없는 리스너는 `/api/members/:public_id` 및 `#member/:public_id`의 읽기 전용 프로필을 쓴다. 조회만으로 새 제작자 데이터는 만들지 않는다.
- 회원가입용 중복 확인 GET은 익명 사용을 허용하되 호출량을 제한한다. 닉네임 저장은 기존 인증·CSRF 보호를 유지한다.

## 운영 현황 확인 범위

공식 Sites DB overview는 DB의 테이블 목록 중 account_handles 등만 반환했고 users/producers/public_member_ids는 반환하지 않았다. 식별자를 추측해 별도 호출하지 않았다. account_handles 전체 10건은 조회했고 예약 키 중복은 없었다. 4건에 내부 공백이 있으며 신규 규정에서는 허용되지 않는다. 기존 값은 유지한다. 전체 회원의 미예약 이름 중복·전체 기존 ID 현황은 미확인이다.

운영 DB의 전체 감사 결과를 확보하기 전 '중복 없음' 또는 '기존 회원 발급 완료'로 보고하면 안 된다. 로컬 검증은 격리된 SQLite fixture이며 운영 회원 DB를 복제하지 않는다.

## 배포 절차

1. 아래 SELECT를 운영 DB의 승인된 읽기 전용 관리 화면에서 실행하여 누락·중복을 검토한다. 닉네임 중복이 있어도 임의 수정하지 않는다.
2. `npm run release:prepare` 및 `npm run release:check` 성공 후 공식 Sites helper로 소스/빌드를 저장한다.
3. 실제 저장된 버전과 커밋에 대해 운영 배포·DB migration 각각 승인받는다.
4. 공식 Sites 배포가 Worker 게시 전에 migration을 적용한다. 구버전 Worker와 기존 데이터/API도 그대로 동작하는 추가형 스키마다. 스키마를 되돌리며 ID를 삭제하지 않는다.
5. 배포 후 누락 code 0건, 중복 0건, 회원/작품/크루/선물/정산 수·참조 무결성과 실제 Android 연결을 확인한다. 실패 시 기존 Worker 버전 복구를 검토하고 발급된 코드는 보존한다.

## Android

기존 PK, 인증, OAuth/PKCE, 쿠키, 숫자 public_number 계약은 유지한다. Android 네이티브 화면이 기존 숫자 ID를 표시하면 DTO에 optional String public_id를 추가해 표시하고 닉네임 입력/중복 확인/30일 오류를 반영해야 한다. 웹뷰는 새 웹 번들을 사용한다. Android 저장소·APK·실기기 접근은 이번 작업에 없으므로 실제 앱 수정 여부와 unknown-field 파서 동작은 미검증이다.

## 읽기 전용 감사 SQL

OAuth 실명을 포함하지 않는 실제 공개 이름 기준이다.

```sql
WITH identities AS (
 SELECT u.id,
 COALESCE((SELECT CASE WHEN p.nickname_confirmed=1
 OR NOT EXISTS(SELECT 1 FROM users x WHERE x.id=p.user_id AND x.provider!='email' AND x.name=p.name)
 OR EXISTS(SELECT 1 FROM tracks t WHERE t.producer_id=p.id AND t.kind='original')
 THEN p.name ELSE '리스너 '||substr(p.user_id,1,8) END
 FROM producers p WHERE p.user_id=u.id),CASE WHEN u.provider='email' THEN u.name ELSE '리스너 '||substr(u.id,1,8) END) name
 FROM users u WHERE u.provider!='deleted'
)
SELECT lower(trim(name)) nickname_key,count(*) accounts,group_concat(id) user_ids
FROM identities GROUP BY lower(trim(name)) HAVING count(*)>1;

SELECT count(*) users FROM users;
SELECT count(*) tracks FROM tracks;
SELECT count(*) crews FROM crews;
SELECT count(*) gifts FROM gifts;
SELECT count(*) payouts FROM payout_statements;
PRAGMA foreign_key_check;
-- 以下は新 migration 適用後のみ実行。
SELECT count(*) missing_codes FROM users u WHERE NOT EXISTS(SELECT 1 FROM public_profile_ids m WHERE m.user_id=u.id);
SELECT code,count(*) FROM public_profile_ids GROUP BY code HAVING count(*)>1;
```
