# 노래방 · 녹음 설정 · 크루 · 알림 수정 · 1.0.7(20)

## iOS 변경

- 크루의 채팅 바로가기를 제거하고 작품·멤버·소개 / 공지·크루 관리·크루 찾기를 3열 두 줄로 배치했다. 각 버튼이 서로 다른 기능으로 연결되며 메시지 탭의 크루 대화는 유지한다.
- 댓글·답글·좋아요·커버·듀엣·선물 알림을 구분한다. 알 수 없는 알림을 커버 공개로 추측하지 않는다. 제목 없는 댓글의 보조 문구와 원곡 연결도 바로잡았다.
- 노래방과 토킹룸의 알림/메시지 링크를 네이티브 시트로 연다. 기존 WKWebView와 방 상태를 유지하며 나가기 확인창을 통과하지 않는다. 같은 출처의 메인 프레임과 허용된 알림/메시지 경로만 수신한다.
- 녹음 화면 상단의 별도 에코·잡음 설정 버튼을 제거하고 가사 아래에 마이크·볼륨·모니터링과 목소리 효과를 접고 펼칠 수 있게 배치했다. 듀엣/싱크/후보정 볼륨/게시 설정도 접을 수 있다.
- 원음·노래방·스튜디오 / 홀·랩·사용자 설정은 3열 두 줄이다. 사용자 설정을 누르면 잡음 4단계, 에코 0.1 단위, 음색·리버브·룸 크기가 바로 열린다. 버튼 전체 영역이 터치되도록 했다.
- 녹음 시작/재시작은 설정을 접고 가사로 스크롤한다. 키보드 닫기 제스처가 하위 버튼 조작을 가로채지 않도록 수정했다.
- 버전 1.0.7, 기기 확인용 빌드 20. 심사 대기 중인 1.0.7(17)은 이 작업으로 교체하지 않는다.

## 시뮬레이터 검증

- iPhone 12 / iOS 26.2, 390×844, 외부 쓰기를 차단한 fixture.
- 알림 종류 단위 검사와 댓글 → 원곡 화면 UI 검사 통과.
- 크루 6개 메뉴 배치·이동 검사 통과: `ios-build20-studio-crew.xcresult`.
- 미니플레이어가 있는 홈에서 하단 탭 9회 직접 터치 검사 통과: `ios-build20-touch.xcresult`.
- 알림/메시지/방 내부 받은 메시지를 열고 닫는 동안 웹의 입력 상태 유지, 나가기 안내 미발생 검사 통과: `ios-build20-studio-overlay-v2.xcresult`.
- 3열 효과 선택, 사용자 설정 자동 펼침, 에코 조절, 잡음 4단계, 녹음 시작 시 가사 복귀, 가사 이동, 중지 후 재시작·편집 검사 통과: `ios-build20-studio-v3.xcresult`.
- 중간 실패는 메뉴 자동 터치와 보이지 않는 버튼 좌표를 진단하고 수정 후 재검사했다. 실패한 실행은 통과로 계산하지 않았다.
- 운영 APNs 발송, 실사용 마이크/이어폰의 음질, 운영 SFU 연속 송출을 검증한 것은 아니다.

캡처: [효과 3열](parity/build20-effects-grid.png), [사용자 설정](parity/build20-custom-expanded.png), [가사 복귀](parity/build20-return-to-lyrics.png), [방 위 알림](parity/build20-room-notifications.png), [크루 메뉴](parity/build20-crew-six-menus.png).

## 공용 웹과 음성 서버

실제 앱에서 여는 `https://aifect.co.kr`의 Sites 원본을 수정했다. 이 Git 체크아웃의 오래된 `ai음원사이트`를 배포하지 않는다. 작업 중 추가된 웹 소스를 `3938afbd9918966b3febaf8aa0d3f05795eccbc9`까지 합쳤다.

- 예약 왼쪽 배치, 원키 선택창 제거.
- 접을 수 있는 음량/목소리 효과/모니터링/입력 장치 설정, 6개 프리셋과 실시간 처리 그래프 연결.
- 이전 송출 정리 중인 명시적 409에 한해 제한된 자동 재시도. 음소거·퇴장·세대 변경 시 취소하고 송출 가드는 유지한다.
- 별도 realtime Worker는 채팅·하트비트 저장이 cleanup alarm을 계속 미루던 문제를 고쳤다. 실패한 SFU 정리를 재시도할 시간을 유지한다.
- 해당 회귀 검사 65개 통과. UI는 320/390/768/1440 픽셀에서 확인했다. 웹 전체 릴리스 검사·게시와 별도 Worker 배포 결과는 아래에 기록한다.

## 최종 반영 상태

- `AIFECT-1.0.7-20.xcarchive` Release 빌드 성공. 서명 검증, 연결 기기 provisioning 포함, 버전 1.0.7(20), Release fixture 미포함 확인.
- 연결된 iPhone 12에 업데이트 설치 성공. `devicectl device info apps`가 1.0.7 / 20을 반환했다. 기존 앱 데이터는 유지한다.
- 처음 실행 명령은 `Locked` 오류를 반환했다. 사용자 잠금 해제 후 `devicectl` 실행 성공(PID 1259)을 확인했다. 실기기 음질/연속 송출 검증은 별도로 남아 있다.
- 웹 v801(`b815006d8d8961cd3bc452d4b42fa5d0314cc67b`)의 추가 변경을 충돌 없이 합친 후 전체 2,148개 검사 중 2,146개 통과 / 2개 기존 skip / 실패 0. 빌드와 격리된 공개 경로 검사, `release:check` 통과.
- 별도 Cloudflare Worker는 Wrangler 인증이 없어 배포 대기 중이다. 전체 재송출 수정이 운영에서 검증됐다고 간주하지 않는다.

### 공용 웹 게시 완료

- 소스: `8497d9bbfc224f6e9bc68e0c6619ae902da0a1a5` (기존 Sites 저장소에 push).
- 버전: v802, `appgprj_6aa56aec3434819186f9a42d9a557520~appgver_22b075d42c9c8191b299c84cd5d0b0d9`.
- 배포: `appgdep_6afbe565fee88191b14aa68064c41e22`, `succeeded`.
- 실제 도메인: https://aifect.co.kr . Sites URL: https://wavv-music-design-lseve.sassy-auk-0975.chatgpt.site . 기존 공개 범위 유지, DB migration 없음.
- 최초 아카이브는 원본 dist와 dist/client 자산이 중복되어 expanded 256 MiB 제한으로 거절됐다. 검증한 dist/client·dist/server·dist/.openai만 별도 staging에 그대로 복사한 후 공식 package-site 도구로 172.4 MiB 실행 산출물을 포장했다. 검증한 소스/빌드의 fingerprint는 변하지 않았다.
- `release:verify`는 최초 전파 중 origin revision 불일치 후, Cafe24 shell 동기화가 완료된 상태에서 재검사 통과. 정확한 renderer revision·client bundle·공개 곡·익명 음원 HEAD·ads.txt·익명 MCP 거부를 확인했다. 설치된 AIFECT 관리자 플러그인의 인증된 읽기 조회도 성공했다.
- 별도 `aifect-voice-rooms` Worker 수정은 위 웹 게시에 포함되어 배포되지 않는다. 원본에는 저장됐지만 Cloudflare 인증 승인 후 별도 배포가 필요하다.
