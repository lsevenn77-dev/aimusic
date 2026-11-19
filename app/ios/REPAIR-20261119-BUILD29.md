# iPhone 노래방 통화 중단·팝업 개선 — 1.0.9 (29)

2026-11-19. 기존 심사 제출 1.0.9 (28)은 변경하지 않았다. 이 문서의 빌드 29는 로컬 Release 아카이브까지 완료했으며 App Store Connect 업로드·제출 및 실기기 설치는 하지 않았다.

## 반영 내용

- 노래방·파티방의 CallKit 통화 상태를 WebKit에 boolean으로 전달한다. 전화번호와 통화 식별자는 전달하지 않는다.
- 통화 시작 시 본인 마이크와 모니터링·반주를 중단하고, 본인의 현재 노래 순서만 기존 `abandon` 명령으로 종료한다. 청취자에게 전화가 와도 다른 사람의 노래는 종료하지 않는다. 재시도는 같은 invitation/request ID를 사용하고 방 이탈·세대 변경·차례 변경 시 중단한다.
- 통화가 끝나도 이전 노래와 마이크를 자동으로 다시 켜지 않는다. 네트워크 장애로 순서 종료가 실패하면 로컬 오디오는 중단한 채 연결 복귀 시 종료를 재시도한다.
- 최신 방의 메시지 버튼은 웹 안의 팝업을 사용한다. 구형 메시지·알림 링크의 네이티브 화면도 절반 높이로 열며, 아래 노래방 화면과 입력 내용을 유지한다.
- 메시지·공유·선물 팝업에 일관된 닫기 버튼과 터치 영역을 적용하고, 선물 받는 사람·가격·하단 버튼을 읽기 쉽게 조정했다.
- 이모티콘 선택창은 입력창 위에 뜨며 무대를 축소하지 않는다. 모바일에서 적용되던 이모티콘 1.5배 확대를 제거했다.
- 소리 재개 안내 버튼을 예약바 아래 대신 무대 안에 배치했다.
- 실제 마이크가 살아 있는데 서버 publication 상태만 갱신될 때 로컬 모니터링 연결을 끊고 다시 만드는 조건을 제거했다. 실제 음소거·마이크 중단 시에는 연결을 끊는다.

## 검증

- 웹 전체 테스트: 2,225개 중 **2,223 통과, 2 건너뜀, 0 실패**. `release:prepare`, `release:check` 통과.
- 통화 중 본인 순서 종료, 청취자 보호, 실패 재시도, 방 이탈 취소, 모니터링 연결 유지, 이모티콘 위치를 로컬 fixture로 검사했다.
- 모바일 웹 320/390px, 태블릿 768px, 데스크톱 1440px에서 팝업 크기와 가로 넘침을 확인했다.
- iPhone 12 시뮬레이터에서 인라인 메시지 창 및 네이티브 절반 높이 팝업을 직접 확인했다. 팝업을 닫은 뒤 기존 방과 입력 내용이 유지됐다. 수정한 XCTest UI 테스트 자체는 이번 작업에서 실행하지 않았다.
- Debug 시뮬레이터 빌드와 Release 아카이브 성공. `codesign --verify --deep --strict` 통과.
- 아카이브: `/Users/user/Library/Developer/Xcode/Archives/2026-11-19/AIFECT-1.0.9-29.xcarchive`.
- 연결된 iPhone 두 대 모두 unavailable 상태여서 **실제 전화 수신, 이어폰 모니터링 청음, 실기기 설치는 미검증**이다. 모니터링 끊김의 모든 원인이 해결됐다고 판단하지 않는다.

## 운영 웹 반영

- 기존 Sites 프로젝트: `appgprj_6aa56aec3434819186f9a42d9a557520`, 공개 범위·DB/R2 바인딩 유지, 신규 migration 없음.
- 소스 기준: `70af74bed779f0c4b1a650de4e9b83da65ec987b` → `351244f5e190a1462d05e4f8810b93cfb5df1d71`.
- Sites **844**: `appgprj_6aa56aec3434819186f9a42d9a557520~appgver_8118578dafc08191b96abada591b14ea`.
- 성공 deployment: `appgdep_6afed6e4849c81918d82249c3f4b3684`.
- 운영 URL: https://aifect.co.kr — Sites URL: https://wavv-music-design-lseve.sassy-auk-0975.chatgpt.site .
- 최초 아카이브는 소스와 생성 파일이 중복 포장되어 256 MiB 제한으로 저장이 거절됐다. 동일 검증 산출물의 `dist/client`, `dist/server`, 메타데이터와 migration만 별도 디렉터리에 복사한 후 공식 `package-site.mjs`로 재포장했다. 원본 검증 소스와 산출물은 수정하지 않았다.
- 저장한 런타임 아카이브 SHA-256: `6d0223d98b132c284b82d0b0d65ab7f9d3d30605c56063a257ca118751ca17a1`.
- Cafe24 렌더러도 준비된 revision `616ae53475ccbdffa31ff7056a33cbff7da131e2f4a3c286fc55874889e2d4c2`에 맞춰 새 release 디렉터리로 설치했다. 이전 release는 보존했고 `aifect-public-origin`만 재시작했다. 인증된 로컬 렌더 검사 통과.
- `release:verify` 통과: 실제 도메인·Cafe24 revision·클라이언트 번들·공개 곡/미리듣기 HEAD·ads.txt·익명 MCP 차단. 인증된 관리자 읽기 조회도 성공했다. 운영 사용자/선물/결제 데이터를 테스트로 변경하지 않았다.
- 웹 변경 보관본: `deploy/cafe24-public/rolling/ios-room-20261119.patch`. 이 패치는 위 Sites 기준 커밋용이며 GitHub의 오래된 웹 사본에 바로 적용하지 않는다.

공식 API 참고: https://developer.apple.com/documentation/callkit/cxcallobserver
