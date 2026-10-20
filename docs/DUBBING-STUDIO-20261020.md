# 운영 최신본 통합 · 배포 준비 (2026-10-20 22:35 KST)

이 절이 아래 기록보다 우선한다. 운영에는 아직 배포하지 않았다.

- Sites 운영 174번 원본 `c705ab169d426021241ce0f4cdadb1841f690e4d`를 공식 소스 도구로 받아 더빙 변경만 3방향 병합했다. GitHub 원본에 없던 토킹룸·실시간 채팅·음악 화면 수정과 자산을 유지했다.
- 운영에 이미 있는 `0051_voice_music_permissions.sql`과 기존 적용 SQL은 변경하지 않았다. 미배포 더빙 SQL만 **0052~0059**로 이동했다. 기존 토킹룸 스키마를 Drizzle 메타데이터에 반영했고 추가 생성 변경 없음, 연결된 스냅샷 체인과 로컬 D1 전체 적용을 확인했다.
- 더빙용 Dockerfile/Compose를 추가했다. 별도 `aifect-dubbing` 프로젝트로 실행하며 기존 음악·가사·결제 컨테이너를 재시작하지 않는다. 실제 서버 접속·기존 서비스 가동과 더빙 파일 미설치를 읽기 전용으로 확인했다.
- 통합 회귀 **176개 통과**. 별도 실제 HTTP→Python/FFmpeg→API 테스트 **1개 통과**로 총 177개 검증했다. 무음 배경 생성, 두 배역의 합성음 WAV 저장, 최종 AAC 합성·업로드·공개 재생까지 확인했다. 사용자 마이크 음성이나 유료 API는 사용하지 않았다.
- 빌드·DB 타입 검사·JS 문법·공백 검사 통과. 1440×900에서 대사 10줄, 390px에서 가로 넘침 없음, 브라우저 오류 없음.
- Ad Manager를 기존 광고 운영 계정으로 재확인했으며 `uncheckedAdsenseAccount`, 승인 이메일 대기 안내가 동일하다. 웹 광고는 계속 비활성으로 유지한다.
- 운영 Secret 목록의 비밀 값은 도구가 숨겨서 null로 반환한다. 기존 Secret이 누락되었다는 의미가 아니다. 더빙용 설정과 OpenAI/Pika 키 항목은 아직 운영 목록에 없다.
- 운영 DB/배포 및 유료 API 활성화는 최초 사용자 요구의 별도 승인 조건을 따른다. 준비된 공개 범위와 실행 순서는 `DUBBING-RELEASE.md`에 기록했다.

---

# 대사 가독성 · 커뮤니티 · 운영 관리 후속 작업 (2026-10-20)

이 절이 아래 과거 단계 기록보다 우선한다. 로컬 구현·검증 결과이며 운영 배포, 운영 DB 적용, 실제 골드 차감, 추가 유료 API 호출은 하지 않았다.

## 이번 사용자 요청

- PC 녹음 화면은 대본을 넓게 배치하고 1440×900에서 대사 10줄을 동시에 표시한다. 녹음 조작은 오른쪽에 둔다.
- 모든 대사는 `배역: 대사` 형식이다. 배역별 6색을 일관되게 사용하며 현재 읽을 대사는 흰색, 다음 내 대사는 별도 표시한다. 대사 선택 시 앞뒤 문맥이 보이도록 자동 스크롤한다.
- 모바일 390px에서는 대본 스크롤과 세로 배치로 가로 넘침을 막는다. 모바일에서도 10줄이 화면 전체에 동시에 보인다고 주장하지 않는다.
- 스크립트 상세 읽기에도 배역 이름·대사 색상을 적용했다.

## 광고 확인 정정

- 실제 AdMob 관리 화면에서 사이그램과 포켓시세의 Android/iOS 광고 송출 실적을 확인했다. 기존 앱 광고 계정의 승인이 막힌 상태가 아니다.
- 앞서 승인 대기로 확인된 것은 별도 **웹 Ad Manager 가입에 연결된 AdSense 검토**다. 음성 광고 승인이 아니다.
- 사이그램 코드는 네이티브 AdMob 보상형 화면 광고다. AIFECT iOS 광고 단위는 확인 당시 전면 광고 1개였으며 보상형 단위는 없었다. 다른 앱의 단위를 복사하지 않았다.
- 이번 더빙 웹 보상은 GPT REWARDED 화면 광고다. 실제 웹 광고 단위 생성·송출은 아직 미완료이며, 광고 완료를 검증했다고 주장하지 않는다.
- 공식 구분: https://developers.google.com/publisher-tag/samples/display-rewarded-ad 및 https://developers.google.com/admob/android/rewarded

## 커뮤니티와 관리자

- 기존 좋아요·댓글·댓글 신고 체계를 더빙 작품에 연결했다. 음악 대상과 더빙 대상을 구분하고 차단·비공개·삭제·재전송을 처리한다.
- 권리 신고는 권리자·연락처·설명·HTTPS 증빙·동의를 받으며 공개 화면에 개인정보를 노출하지 않는다. 관리자 검토 전에는 자동 중단하지 않는다.
- 관리자 공개 중단, 작성자 이의신청, 복원·중단 유지와 감사 기록을 구현했다. 확정된 공개 중단 작품 3개 이상이면 새 더빙 제작·참여가 제한된다. 복원하면 제한 산정에서 빠진다.
- 공개 중단은 작품·음성 접근과 작업 대기열에 적용된다. 진행 중 음향 제작은 1회 환급 규칙을 따른다. 신고자 탈퇴 시 증빙 개인정보는 비우고 기존 검토 결과는 유지한다.
- 관리자에서 제작 Gold 가격 변경, 대본 토큰 사용량, Pika 확정 비용과 미확인 상태, Gold 사용·환급, 실패 작업을 볼 수 있다. 최종 합성만 기존 파일로 재시도하며 유료 공급자 요청은 자동 재전송하지 않는다.
- 가격은 버전 비교와 실제 차감 시 DB 확인을 모두 적용한다. 기존 주문은 결제 당시 가격을 유지한다.
- Pika 비용 원장은 대본·음성·사용자 개인정보 없이 보존된다. 작품 삭제/임대 취소 중 도착한 공급자 응답도 기록하며 취소된 작품을 되살리지 않는다. OpenAI 비용을 Pika 비용에 포함하지 않는다.
- 브라우저에서 지원되지 않는 prompt 대신 관리자 화면 안에 검토·재시도 사유 입력란을 제공한다.

## DB와 검증

- `0057_stormy_tomas.sql`: 기존 커뮤니티 대상 확장·권리 검토 필드·가격 설정. 외래키 활성화 상태의 트랜잭션으로 기존 음악 댓글·댓글 반응·신고·좋아요 보존을 검증했다. 댓글 재구성 시 종속 행을 백업 후 복원한다.
- `0058_cold_surge.sql`: 익명 공급자 비용 원장과 기존 작업 비용 이관. 0051~0058 스냅샷 연결 확인. 모두 운영 미적용.
- 관련 회귀 테스트 108개 통과. 실제 유료 API를 호출하지 않는 대체 응답으로 접근 제어, 가격 경쟁, 신고/복원, 삭제 중 비용 응답, 결제 환급, 녹음·광고·기존 음악 기능을 검증했다. 전체 저장소 테스트가 모두 통과했다는 의미는 아니다.
- 빌드, DB 스키마 TypeScript, 변경 JS 문법, Git 공백 검사를 통과했다.
- 로컬 UI에서 댓글 등록, 권리 신고 폼, 가격 50→75→50 저장, 신고 공개 중단 저장, 10줄 대사 및 역할 색상을 확인했다. 관리자/녹음 화면은 메모리 DB 샘플이며 실제 사용자 데이터가 아니다.
- 화면 증거: `outputs/dubbing-community/recording-desktop.png`, `recording-mobile.png`, `desktop.png`, `rights-form.png`, `admin.png`, `admin-rights.png`.
- 남은 운영 단계: 실제 마이크·이어폰 청취 검증, 웹 광고 승인/광고 단위 연결과 실제 송출 검증, 별도 승인 후 운영 DB·Worker·합성 서버 배포 및 기능 활성화. iOS 빌드/심사 제출은 이번 웹 변경에 포함되지 않았다.

---

# 웹 보상형 광고 · 배역 녹음 후속 작업 (2026-10-20)

이 절이 아래 과거 단계 기록보다 우선한다. 이번 변경은 로컬 개발이며 운영 배포·DB 적용·실제 골드 차감·추가 유료 API 호출을 하지 않았다.

## 광고 계정 확인 결과

- Git의 `pub-5910265378731607`은 기존 웹 게시자 ID이고, Android/iOS의 `ca-app-pub` 값은 앱 전면 광고 ID다. 웹 GPT 보상형 광고 단위로 재사용하지 않았다.
- 사용자가 확인한 월간 조회수 **0~100만 회**, 웹 게시자, 아시아로 Ad Manager 시작 절차를 진행했다.
- 기존 광고 운영 Google 계정으로 가입 연결을 누르자 Google이 **애드센스 계정 신청서 검토 중**이며 승인 이메일 후 Ad Manager 로그인이 가능하다고 표시했다. 아직 네트워크 코드/웹 보상형 광고 단위가 생성되지 않았다.
- 증거: `outputs/dubbing-rewarded/admanager-pending.png`. 실제 광고를 실행하지 않았으며 수익·광고 시청 성공을 주장하지 않는다.

## 웹 보상 연결 코드

- `DUBBING_REWARDED_ADS_ENABLED=false`, `DUBBING_REWARDED_AD_UNIT=` 기본값. 실제 Ad Manager `/NETWORK_CODE/AD_UNIT` 입력 및 별도 운영 활성화가 필요하다. AdMob ID, 샘플 광고 경로는 거절한다.
- 기존 웹 광고와 같이 한국 지역만 허용한다. 다른 지역은 CMP 확인 전 비활성이다. AI 대본 기능이 꺼져 있으면 광고도 제공하지 않는다.
- Google Publisher Tag 공식 [보상형 광고 이벤트](https://developers.google.com/publisher-tag/samples/display-rewarded-ad)를 사용한다. 사용자가 보상을 설명한 버튼으로 선택한 뒤 요청하며 `rewardedSlotGranted`에서만 지급 요청한다. 영상 완료, 타이머, 닫기 이벤트 자체는 보상이 아니다.
- 지원하지 않는 브라우저, no-fill, 차단/네트워크 오류, 중도 종료를 처리하고 슬롯·이벤트를 정리한다. 통신 응답 유실 시 같은 보상 요청을 재확인하며 광고를 다시 보도록 요구하지 않는다.
- 서버는 로그인·동일 출처 보호, 사용자에 귀속된 일회성 세션, 15분 만료, KST 날짜, 동시 1개 세션, 일 최대 4회, 요청 중복 방지를 검증한다.
- **신뢰 경계:** 웹 GPT는 브라우저 콜백이며 AdMob의 서명된 SSV가 아니다. 세션·횟수 제한은 재사용/남용을 제한하지만 광고 시청 자체를 서버에서 암호학적으로 증명하지 않는다. DB `source=web_gpt_client`로 구분하고 골드 등 양도 가능한 재화는 지급하지 않는다. `creditVerifiedDubbingAd`는 별도의 실제 공급자 검증용 서버 전용 함수로 유지한다.
- 마이그레이션 `0055_outstanding_spyke.sql`: 광고 세션 테이블 1개와 인덱스만 추가. SQL·스냅샷 체인을 확인했으며 운영 미적용.

## 배역별 녹음과 완성 오디오

- 기존 `recorder-worklet.js`, `placeChunks`, `encodeWav`를 재사용한 독립 더빙 녹음 화면. 기존 노래 녹음 코드는 수정하지 않았다.
- 내 대사 강조, 대사 선택, 준비 시간, 일시정지·이어 녹음, 현재 대사 마치기, 재녹음, 미리 듣기, 대사별 서버 임시 저장, 배역 최종 제출을 구현했다.
- 마이크만 모노 PCM 트랙으로 저장하고 배경음과 앞 참여자의 제출된 목소리는 별도로 재생한다. 이어폰 안내를 제공한다. 제출 전 녹음은 본인만 조회 가능하다.
- 첫 녹음은 완성된 배경 오디오 ID를 확인한 뒤 공통 시간축을 고정한다. 이후 다른 배역 참여는 가능하지만 대본 수정은 불가능하다. 작성자의 비공개 전환은 유지한다.
- 대사 뒤 최대 1초(다음 대사 직전까지) 여유를 제공한다. 서버가 실제 WAV 헤더·48kHz 모노 샘플 수·파일 크기로 구간 초과를 검증한다. 구간 종료 후 녹음 화면에서 듣고 재녹음할 수 있다.
- 수정 버전 비교(CAS), 불변 R2 객체 경로, 업로드 요청 식별자로 동시 저장/재시도 충돌을 처리한다. 제출된 목소리는 고정되며 모든 대사를 저장하고 공동 공개에 동의해야 제출할 수 있다.
- 전체 배역 제출 시 독립 최종 합성 작업을 한 번 예약한다. 배경·목소리는 공통 시각에 배치하고 개별 목소리 음량, 경계 페이드, 피크 제한을 적용한다. FFmpeg 출력은 48kHz stereo AAC이며 길이와 피크를 재검증한다.
- 기존 `transcoder/dubbing.py`가 배경 작업과 최종 합성을 번갈아 처리한다. 임대·재시도·서버 재시작 복구, 제출 후 대기열 생성 응답 유실 복구, 실패 상태를 구현했다. 외부 유료 API를 추가로 호출하지 않는 합성이다.
- 완료하면 작품 화면에서 재생·배역 참여자 표시·링크 공유가 가능하다. 참가자 탈퇴 시 해당 목소리와 완성 파일을 비공개 처리하고 삭제 대기열에 넣는다. 새 참가자가 같은 배역을 제출하면 새 작업 ID로 재합성한다.
- 활성화는 `DUBBING_RECORDING_ENABLED=true`와 저장소/작업 서버 연결이 필요하다. 기본값은 false다.
- `0056_curvy_maximus.sql`: 배역 녹음, 대사별 파일, 최종 합성 작업 테이블. Drizzle 생성 후 SQL과 스냅샷을 확인했고 로컬에서만 적용했다.

## 검증 및 남은 항목

- 관련 Node 테스트 85개 통과: 광고 세션/SDK 이벤트, 녹음 구간·접근 제어·충돌·재시도·탈퇴 후 재합성, 녹음 일시정지/이어 녹음/마이크 해제, 기존 더빙·골드·계정·선물·노래방 회귀.
- 합성 테스트 5개 통과: 합성 신호만 사용했고 실제 사용자 음성/유료 API는 사용하지 않았다. 두 목소리의 시간 배치, 음량 균형, 경계 침범 거절과 출력 피크를 확인했다.
- 프런트/서버 빌드, DB 스키마 TypeScript 검사, 변경 JS 문법, Git 공백 검사를 수행했다. 전체 기존 테스트군 통과를 주장하지 않는다.
- PC 1440px, 모바일 390px의 화면·배경 미리 듣기·배역 화면 왕복·가로 넘침·브라우저 오류를 확인했다. `tests/preview-dubbing.mjs --recording-fixture`는 메모리 DB의 샘플 작품과 합성음만 쓴다.
- 사진: `outputs/dubbing-recording/desktop.png`, `mobile.png`. 오디오 검증: `outputs/dubbing-recording/audio-validation.json`, `synthetic-final-validation.m4a`.
- 실제 브라우저 마이크/헤드폰을 사용한 녹음 청취 검증은 남아 있다. 실제 광고는 Google 승인 후 광고 단위 생성 및 송출 확인이 필요하다.
- 다음 전체 범위: 기존 커뮤니티의 좋아요·댓글과 더빙 연결, 저작권 신고·이의신청, 관리자 가격/사용량/비용/실패 작업 관리. 운영 적용은 별도 승인 대상이다.

---

# 최신 웹 디자인 · 골드 결제 후속 작업 (2026-10-20)

- `git fetch origin` 후 확인: 현재 HEAD `ab8c508`은 `origin/main`, `origin/codex/aifect-streaming-first`, `origin/codex/android-native-app`의 최신 커밋을 포함한다. 추가로 병합할 원격 커밋은 없었다. 더 오래된 main으로 디자인을 되돌리지 않았다.
- 실제 운영 홈 화면을 확인하고 현재 `design-system.css`의 공통 토큰을 더빙에 적용했다. 라벤더·민트 그라데이션, 네이비 카드, 입력창, 둥근 버튼과 탐색 메뉴를 재사용한다. 기존 음악 녹음 화면은 변경하지 않았다.
- 대본 길이 30초~5분(30초 간격), 1~6명, 장르 최대 2개, 세부사항 직접 입력을 유지한다. PC 1440px와 모바일 390px에서 5분·30초 선택 및 6개 배역 편집 화면 진입을 확인했다. 가로 넘침과 브라우저 오류 없음.

## 음향 제작 50G

`DUBBING_GOLD_ENABLED=true`일 때만 실제 지갑 차감 코드가 작동한다. 기본값과 실제 로컬 비공개 설정은 비활성 상태이며, 이번 작업에서는 운영 골드를 사용하지 않았다. 유료 API 승인 게이트는 별개다.

- 확인창에 50G 가격, 이번 실제 차감액, 보유 잔액, 차감 후 잔액을 표시한다. 부족하면 제작을 막고 골드 충전으로 연결한다.
- 클라이언트가 본 `acceptedGold`와 `acceptedChargeGold`를 서버가 다시 확인한다. 0G 안내 이후 설정이 바뀌어도 몰래 50G를 차감하지 않는다.
- 대기열 생성 + 구매분 차감 + 독립된 제작 결제/사용 기록을 하나의 D1 batch로 처리한다. 기존 음악 선물·정산 원장은 건드리지 않는다.
- 같은 대본 요청, 동시 클릭, 응답 유실 후 재시도는 기존 작업을 반환한다. 다른 작품이 같은 요청 ID를 재사용하면 거절한다.
- 기존 지갑과 동일하게 오래된 유효 구매분부터 사용한다. 다른 선물이나 결제 취소와 경쟁해 잔액이 바뀌면 전체 작업을 취소한다.
- 생성 실패, 결과 불명, 합성 실패, 최대 재시도 초과, 제작 도중 대본 교체/삭제 시 구매분별로 1회 환급한다. 공급자 결과가 불명이어도 사용자는 미완성 결과에 골드를 부담하지 않는다. 공급자 요청을 자동 재전송하지 않는다.
- 스토어에서 이미 취소된 구매분은 복원하지 않는다. 복원 가능한 구매분만 환급하고 나머지는 `refund_review`로 남긴다.
- 성공한 오디오는 결제를 `fulfilled`로 확정한다. 이후 작품을 삭제해도 이용 완료한 서비스가 환급되지 않는다.
- 내 더빙에서 최근 50건의 음향 제작 이용·환급 내역을 볼 수 있다. 탈퇴/작품 삭제 뒤에도 기존 금융 원장과 같이 결제 기록은 유지하며 대본 내용은 보존하지 않는다.
- 작업 서버의 claim 루프가 미처리 환급을 재조정한다. 운영 활성화 전 이 독립 작업 서버를 실행해야 한다.

마이그레이션 `0054_spooky_lilith.sql`: `dubbing_gold_orders`, `dubbing_gold_lots`만 추가. Drizzle로 생성한 SQL과 메타데이터를 확인했고 로컬 메모리 DB에 적용했다. 운영에는 미적용.

## 검증과 남은 연결

- 골드 테스트 12개, 기존 더빙/계정/선물/노래방 회귀 포함 총 68개 통과.
- 프런트 빌드, 변경 파일 문법, Git 공백 검사 통과.
- `tests/preview-dubbing.mjs --gold-fixture`는 메모리 DB의 가상 80G만 사용한다. 서버 외부 fetch를 차단하므로 Pika/OpenAI를 호출할 수 없다. UI에서 50G 사전 확인 → 요청 → 30G 잔액 및 이용 내역을 검증했다.
- 사진: `outputs/dubbing-stage3/desktop-hub.png`, `desktop-create.png`, `mobile-create.png`, `gold-confirmation.png`.
- 보상형 광고는 실제 웹 광고 단위가 아직 확인되지 않았다. 현재 버튼은 비활성, 브라우저의 `watched:true` 요청만으로 보상을 지급하는 공개 API는 없다. 제공사 완료 검증 어댑터 연결 및 실제 광고 테스트가 남아 있다.
- 웹 광고는 Google Publisher Tag의 [rewarded ad](https://developers.google.com/publisher-tag/samples/display-rewarded-ad) 전용 슬롯이 필요하다. 기존 AdSense 디스플레이·AdMob 앱 광고 단위를 그대로 쓰지 않는다. 브라우저 보상 이벤트와 서버 서명 검증은 구분한다.
- 이번에는 실제 유료 API 추가 실행, 운영 배포·DB 변경, 실제 골드 차감, iOS 빌드/제출을 하지 않았다. 다인 녹음·최종 믹싱/게시, 관리자 가격 변경·신고/통계는 후속 단계다.

아래 내용은 앞선 단계의 기록이며 위 후속 작업 내용이 우선한다.

---

# AIFECT 더빙 스튜디오 — 현재 구현 상태

갱신: 2026-10-20 · 브랜치 `codex/dubbing-studio-stage1`.

## 현재 범위

1차 대본·작품·배역 예약과 2차 Pika 생성·배경 오디오 합성을 로컬 구현했다. 운영 DB 마이그레이션과 서비스 배포는 하지 않았다. 3차 다인 녹음·완성작, 4차 실제 Gold 결제·환급·관리자·신고 기능은 아직 남아 있다. 아래 1차 기록은 당시 상태와 설계 이력이며, 현재 상태는 이 절을 우선한다.

사용자 추가 요청을 반영한 작성 화면:

- 장르 최대 2개 → 인원 1~6명 → 대본 시간 → 세부사항 직접 입력 → `대본 작성하기`.
- 시간은 30초부터 5분까지 30초 단위 10개 선택지. AI 요청에도 선택 시간을 전달하고 과도하게 짧거나 긴 결과를 거절한다. 발화 추정이므로 최종 재생 길이가 정확히 선택 초와 같다는 보장은 하지 않는다.
- 분위기·결말의 필수 드롭다운을 없애고 세부사항에 자유롭게 입력한다. 기존 API 저장 형식의 `mood`/`ending`은 `랜덤`으로 유지해 저장 대본과 호환한다.
- AI 대본 하루 무료 1회. 광고 완료 보상은 하루 최대 4회로 총 5회. 한국 시간 자정 초기화, 동시 요청도 원자적 예약으로 제한한다. 직접 대사를 쓰는 편집은 이 AI 횟수를 쓰지 않는다.
- 확정 실패는 횟수를 반환하고, 결과가 불명확한 요청은 중복 유료 호출을 막기 위해 예약을 유지한다. 같은 요청 ID 조회·재전송은 횟수를 추가 소비하지 않는다.
- 광고 보상 저장·중복 방지 함수는 서버에만 있다. 웹 보상형 광고 단위와 제공사 완료 검증 연결은 미완료이므로 광고 버튼은 연결 대기로 비활성화했다. 브라우저에서 `watched=true`로 횟수를 얻는 API는 만들지 않았다.
- 음향 제작은 작품당 **50G** 가격 안내와 생성 전 확인 화면을 추가했다. 50G에는 효과음·BGM·자동 믹싱이 포함된다. 현재 실제 차감은 **0G**이며, 실제 Gold 주문·실패 환급 처리를 완료했다고 표시하지 않는다.

## 2차 구현

- `server/dubbing-pika.js`: 공식 SFX/Music API 제출·조회, 서버 키, 고정 API 호스트, 요청별 Idempotency-Key, 사용량과 실제 마이크로달러 청구액 수집.
- `server/dubbing-sound.js`: 대본 버전별 단일 작업, DB 작업 임대, 진행 상태, 저장된 provider ID로 조회 복구, 제한된 조회 재시도, 불명확한 제출 자동 재생성 금지.
- 직접 쓴 대본에 음향 계획이 없으면 기존 GPT-6 Luna로 soundCues만 분석한다. 기존 대사·장면·타임라인 길이를 바꾸지 않는다. OpenAI API 유료 실행은 별도 활성화가 필요하며 이번 실제 테스트에서는 호출하지 않았다.
- `transcoder/dubbing.py`: 기존 FFmpeg 처리기 인증을 쓰는 독립 프로세스. 음악 작업 대기열은 수정하지 않는다. CDN 호스트·MIME·파일 크기·디코딩·길이 검증 후 합성한다.
- 48kHz 스테레오 AAC, 페이드, 음량 정규화, 대사 구간 BGM/환경음 0.3배 ducking(120ms 진입·300ms 복원), 피크 제한, 최종 길이 검증. 최대 120개 대사에서도 FFmpeg 표현식 깊이 한도를 넘지 않도록 균형 트리로 계산한다.
- 개별 생성 파일은 처리기의 임시 폴더에서 사용하고 정리한다. 완성 배경은 R2 비공개 작품 경로에 유지한다. 무료 기본 배경은 동일 시간축의 무음 트랙이다.
- 웹 화면에 단계별 진행률·완성 배경 재생을 제공한다. 퍼센트는 실제 남은 시간 예측이 아닌 제작 단계 기준임을 표시한다.

### 마이그레이션

스키마 원본을 수정하고 `npm run db:generate`로 SQL·메타데이터를 생성했다. 새 테이블·인덱스만 만들며 운영에는 적용하지 않았다.

- `0051_silky_puff_adder`: 작품, 배역 예약, AI 생성 기록.
- `0052_woozy_bill_hollister`: `dubbing_sound_jobs`, `dubbing_sound_assets`.
- `0053_unknown_war_machine`: `dubbing_script_rewards`.

작업은 공개/배역 예약 변경에도 증가하는 `revision` 대신 불변 대본 파일 식별자 `script_key`에 묶는다. `(project_id, script_key)`가 고유하다. 별도 timeline/render 테이블 없이 현재 음향 작업 행의 `timeline_json`, `output_key`, `output_meta`에 저장한다. 첫 녹음 이후 작업·대본 변경을 차단한다. 후속 녹음 단계에서 녹음 세션과 공통 시간축 고정 계약을 연결해야 한다.

```text
POST /api/dubbing/projects/:id/sound
  {requestId, revision, mode: basic|ai, acceptedGold: 50 (AI 모드)}
GET /api/dubbing/projects/:id/sound
GET|HEAD /api/dubbing/projects/:id/background
POST /internal/dubbing/claim
POST /internal/dubbing/:job/step|heartbeat|finish|fail
PUT  /internal/dubbing/:job/output
```

외부 공개 쓰기는 기존 세션·동일 출처 검사와 작품 소유권을 사용한다. 내부 API는 기존 TRANSCODER_TOKEN + 작업 임대 토큰으로 보호한다. 오디오 조회도 작품 권한을 검사하고 `private, no-store`로 응답한다. 사용자 탈퇴 시 광고 보상도 제거하며 작품 삭제는 음향 작업에 cascade된다.

## Pika 실제 연결·승인 테스트

사용자가 Pika 구독·결제 설정을 완료하고, `AIFECT Dubbing Studio` 키 생성과 합계 $0.10 이내의 SFX 3초 1건 + BGM 10초 1건 테스트를 명시적으로 승인했다.

- API 키 생성 및 Git 제외 `.dev.vars` 저장 완료. 파일 모드 0600. 키는 브라우저 번들·로그·문서에 넣지 않는다.
- SFX 생성 완료: `output_seconds=3`, `billing.state=settled`, `charge_micro_usd=600`.
- BGM 생성 완료: `output_seconds=10`, `billing.state=settled`, `charge_micro_usd=2500`.
- 실제 합계 **$0.0031**, 승인 상한 $0.10 이내. 멤버십 비용과 구분한 이번 API 호출 청구액이다.
- 실제 결과 파일을 합성한 18초 배경: 48,000Hz, 스테레오, 최종 sample peak 약 **-12.94dBFS**, 길이 검증 통과. 6~11초 대사 예정 구간은 배경 음량 감소.
- 이번 테스트는 OpenAI 호출·Gold 차감·운영 DB/R2 변경 없이 실행했다.
- 실제 샘플: `outputs/dubbing-stage2/pika-live-background.m4a`.
- 검증 요약: `outputs/dubbing-stage2/pika-live-verification.json`. 개인 작업 receipt는 Git 제외 `work/`에 저장하며 같은 실행을 다시 시작해도 생성 POST를 반복하지 않는다.

공식 문서: [SFX](https://dev.pika.art/models/pika/pika-audio/pika-sfx), [Music](https://dev.pika.art/models/pika/pika-audio/pika-music), [SFX 요금](https://dev.pika.art/models/pika/pika-audio/pika-sfx/pricing), [Music 요금](https://dev.pika.art/models/pika/pika-audio/pika-music/pricing).

## 검증과 실행

- 관련 Node 테스트 56개 통과: 더빙 27개 + 기존 계정·본문 제한·MR·부르기·듀엣·선물 회귀.
- 실제 FFmpeg 합성 테스트 4개 통과: 전체 시간축, 페이드/ducking/음량 복원, 호스트·시간 범위 검증, 최대 120대사.
- `npm run build` 및 새 공용 계약·AI/Pika 어댑터의 `checkJs` 통과.
- 전체 기존 테스트 16개 실패는 1차에서 수정 전 HEAD에도 재현했으며 아래 기록에 남겼다. 전체 프로젝트 테스트가 모두 통과했다는 의미가 아니다.
- PC 1440px와 모바일 390px에서 작성 화면 확인. 모바일 가로 넘침 없음, 브라우저 오류 없음. 화면 증빙은 `outputs/dubbing-stage2/desktop-create-options.png`, `mobile-create-options.png`.
- UI·보상 규칙 테스트에는 실제 광고·유료 API를 사용하지 않는다. 보상 제공사 연결 전 실제 광고 지급은 완료로 보고하지 않는다.

```sh
npm run build
node --test tests/dubbing.test.mjs tests/dubbing-sound.test.mjs tests/dubbing-quota.test.mjs
python3 tests/dubbing-audio-test.py  # FFmpeg 필요, FFMPEG_BIN 지정 가능
node tests/preview-dubbing.mjs
# 별도 터미널, 로컬 미리보기 전용 인증:
AIFECT_ORIGIN=http://127.0.0.1:4182 TRANSCODER_TOKEN=local-preview-only python3 transcoder/dubbing.py
```

로컬 QA에 쓴 FFmpeg는 Git 제외 `work/dubbing-tools`의 imageio-ffmpeg 0.6.0 번들이다. 운영 의존성을 추가하지 않았다. 현재 `.dev.vars`의 실제 API 실행 게이트는 비활성 상태로 유지한다. 실서비스 적용은 별도 승인과 작업 서버·DB·Secret 준비 후 진행한다.

---

# 1차 개발 당시 기록과 후속 설계

작성일: 2026-10-20. 작업 브랜치: `codex/dubbing-studio-stage1`.

운영 배포·운영 DB 변경·실제 유료 API 호출은 하지 않았다. 기존 iOS 심사 제출과 별개인 웹 기능이다.

## 기존 코드 조사와 재사용

| 기존 구성 | 재사용 방법 | 이번 변경의 영향 |
|---|---|---|
| `dist/`의 기존 HTML/CSS/일반 JavaScript, 해시 라우터 | `#dubbing` 페이지, 기존 사이드바·검색·부르기 메뉴 | 부르기 목록에 `[노래] [더빙]` 선택만 추가. 음악 녹음 화면·엔진은 수정하지 않음 |
| `server/index.js`의 Cloudflare Worker | 동일 출처 검사, 제한된 요청 본문, 세션, 사용자 차단 | `/api/dubbing/`만 별도 핸들러. 대본 저장 요청은 128 KiB 제한 |
| `server/auth.js`, `identity.js`, `account-safety.js` | 기존 로그인·공개 닉네임·차단·탈퇴 처리 | OAuth 실명/이메일을 작품 공개 정보에 노출하지 않음. 탈퇴 시 더빙 자료도 정리 |
| D1 + Drizzle | 별도 더빙 테이블 3개, 마이그레이션 생성 | 음악·가사·채팅 테이블의 기존 구조는 변경하지 않음 |
| `BUCKET` R2 바인딩 | 비공개 대본·연출안·타임라인 JSON | 공개 버킷 URL을 만들지 않고 권한을 검사한 API로만 대본 열람 |
| 기존 `transcoder/`, `alignment/`의 외부 처리기·작업 임대 패턴 | 2·3차에서 FFmpeg와 대기열 구조 재사용 | 1차에는 오디오 작업·새 서버·새 라이브러리를 추가하지 않음 |
| Gold 구매분, 잔액·동시 차감 처리 | 4차에서 중립적인 Gold 차감/환급 처리 추출 | 기존 선물/음악 정산 원장에 더빙을 끼워 넣지 않음 |
| 기존 신고·관리자 인증·감사 기록 | 4차에서 신고 대상 유형과 상세 증빙 확장 | 1차의 권리 확인은 작품 모집 공개 시 저장. 신고·관리자 기능은 아직 미구현 |

AIFECT 체크아웃에는 기존 OpenAI 호출이 없고 음악 분류용 Gemini만 있었다. 사용자가 지정한 Saigram의 실제 API 컨테이너는 `LLM_API_KEY`로 OpenAI를 사용하고 있었다. 해당 키를 AIFECT의 Git 제외 `.dev.vars`에 `OPENAI_API_KEY`로 복사했다. 파일 모드는 `0600`, `DUBBING_AI_ENABLED=false`이다. 서버 비밀번호와 키 값은 코드·문서·빌드 결과에 넣지 않았다.

OpenAI 프로젝트의 과금과 한도는 Saigram과 공유된다. 실제 사용 권한·잔액·모델 호출 성공은 유료 호출 승인을 받은 뒤 검증해야 한다. 키 복사만으로 라이브 AI 검증이 끝났다고 간주하지 않는다.

## 구현된 1차 기능

- 더빙 메인: 인기(실제 예약 인원순), 최신, 참여 가능, 완성작, 내 더빙. 완성작 탭은 아직 빈 상태를 정확하게 안내한다.
- PC/모바일 반응형 디자인. 기존 네이비 배경, 핑크, 민트 `#8EDDD2` 사용.
- 직접 작성: 1~6명, 장르 1~2개, 목표 1~5분, 분위기·결말·추가 설정.
- 편집: 제목, 배역 이름·성격, 장면, 개별 대사, 감정·연기 지시, 발화 시간·여유. 대사 추가·삭제·장면 내 이동.
- 비공개 저장, 재열기, 수정, 저작권·이용권 확인 후 배역 모집 공개, 모집 중지.
- 배역 선택·예약 취소. 작품당 사용자 1배역, 배역당 사용자 1명. DB 트랜잭션과 고유 제약으로 충돌 방지.
- 모집을 중지해도 이미 예약한 참여자는 자신의 예약을 취소할 수 있다. 다른 이용자는 비공개 대본을 볼 수 없다.
- 저장 중 이동 방지, 미저장 편집 이동 확인, 저장 실패 시 입력 내용 유지.
- 첫 녹음 이후의 타임라인 고정 가드. 현재 단계에서는 녹음 API가 없어 실제 녹음은 시작되지 않는다.
- GPT-6 Luna Responses API 어댑터, 구조화된 대본·음향 연출 JSON, 전체 재생성, 서버 검증, 요청 재사용, 생성 상태 조회.
- 실제 키가 없거나 AI 활성화 승인이 없으면 “연동 대기”. AI 생성 버튼 비활성화. 성공을 흉내 내는 운영용 대본 생성 폴백은 없다.
- 같은 생성 요청의 중복 실행 방지. 네트워크 결과 불명 시 자동 유료 재시도 금지. 결과 확인은 조회만 수행.
- 모델 응답의 토큰 사용량 저장. 검증 실패·불완전 응답도 확인된 사용량을 남긴다. 실제 청구액은 알 수 없으면 `null`.

아직 음향 생성·녹음·완성작 재생·Gold 결제·좋아요·댓글·신고 관리가 구현된 것으로 표시하지 않는다.

OpenAI 연동 형식은 [GPT-6 Luna 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-luna)와 [Structured Outputs 문서](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)를 확인했다.

## 현재 데이터 모델

마이그레이션: `drizzle/0051_silky_puff_adder.sql` 및 대응 스냅샷·저널. 새 테이블과 인덱스만 생성한다. 운영에 적용하지 않았다.

### `dubbing_projects`

`id`(클라이언트 생성 UUID), `owner_id`, `title`, `options_json`, `script_json`, `script_key`, `creation_hash`, `source`(manual/ai), `generation_id`, `state`, `visibility`, `role_count`, `duration`, `revision`, `write_token`, `rights_at`, `first_recorded_at`, `created`, `updated`.

- 현재 상태: `script_ready`(비공개), `recruiting`(모집 공개).
- `script_json`이 현재 편집본의 기준이며 R2에 동일 대본·음향 연출안·계산된 타임라인을 저장한다.
- 생성 UUID와 내용 해시로 최초 저장 재전송을 구분한다.
- 수정은 `revision` 비교 후 원자적 갱신. 공개 중이거나 예약자가 있거나 첫 녹음을 한 경우 수정 불가.
- R2는 쓰기마다 고유 키를 사용한다. DB 응답이 유실되었을 때 참조 중인 R2 객체를 삭제하지 않는다.
- 사용하지 않은 실패 객체는 즉시 정리하되 DB 결과가 불명확하면 비공개로 남겨 재조정한다.

### `dubbing_role_claims`

`project_id`, `role_id`, `user_id`, `created`.

PK `(project_id, role_id)`, UNIQUE `(project_id, user_id)`. 배역 ID는 서버가 현재 대본에서 검증한다. 예약과 프로젝트 버전 갱신은 하나의 D1 batch 트랜잭션이다.

### `dubbing_generations`

`id`(요청 UUID), `user_id`, `input_hash`, `state`, `result_json`, `usage_json`, `provider_id`, `error`, `created`, `updated`.

- `running → ready / failed / unknown`.
- 같은 요청 ID + 같은 입력은 결과를 재사용한다. 다른 입력으로 같은 ID를 사용하면 409.
- 요청 전 예약 행 생성. 실행 중 재요청은 202. 180초 이상 결과가 없는 요청은 `unknown`으로 전환해 자동 호출을 차단한다.
- 사용자당 하루 5회, 전체 하루 100회로 초기 상한 설정. 활성화 전 운영 정책에 맞게 검토한다.
- 사용량: `inputTokens`, `outputTokens`, `totalTokens`, `billedUsd:null`. 추정치를 확정 요금으로 표시하지 않는다.

### 대본 JSON v1

```text
version, title, genres
roles[]: id, name, personality
scenes[]: id, title, description
lines[]: id, order, sceneId, roleId, text, emotion, direction,
         durationSeconds, gapSeconds
soundCues[]: id, kind(sfx/bgm/ambient), prompt, sceneId, lineId,
             anchor(before/after), offsetSeconds, generationSeconds,
             durationSeconds, volume, fadeInSeconds, fadeOutSeconds
```

ID는 편집 시 유지한다. 장면·배역·대사의 참조, 고유성, 배역 수, 장면 순서, 모든 배역의 대사 존재를 검증한다. 최대 12장면·120대사·24음향, BGM 최대 3개. SFX 최대 5초, 음향 볼륨 최대 0.5. BGM 생성 길이 최소 10초는 요청된 제품 규칙이며 실제 Pika 연동 시 공식 제약과 재확인한다.

공통 시간축은 시작 2초 → 각 대사의 발화 슬롯 + 여유 → 끝 2초로 계산하며, 음향의 끝 위치까지 포함해 300초를 초과하면 저장하지 않는다. 음향 시작은 대사 전후 기준으로 매번 계산한다. 이 계산은 배치 계획이며 실제 합성·재생 엔진은 2차 범위다.

### 저장소와 삭제

```text
dubbing/{ownerId}/{projectId}/scripts/{revision}-{writeUUID}.json
```

후속 오디오 경로는 같은 작품 접두사 아래 `background/{timelineVersion}.m4a`, `takes/{roleId}/{lineId}/{revision}.wav`, `final/{renderRevision}.m4a`, `temporary/{jobId}/{cueId}`로 분리한다. 임시 파일 정리에서 배경·보컬·완성본을 삭제하지 않도록 종류별 보존 정책을 둔다.

탈퇴 처리에서 위 사용자 단위 접두사를 기존 `account_file_deletions` 대기열에 넣는다. 더빙 기능을 비활성화해도 테이블이 존재하면 대본·예약·생성 결과를 삭제한다. 기존 2회 R2 정리로 삭제 직전 진행 중이던 업로드도 정리한다.

운영 출시 전 현재 `script_key`와 참조되지 않은 예전 JSON을 비교하는 보존 기간·정리 작업을 확정해야 한다. 음향 임시 파일 정리와는 다른 목적이며 영구 효과음 라이브러리를 만들지 않는다.

## 현재 API

모든 쓰기 요청은 기존 세션과 동일 출처 검사를 사용한다. 본문은 JSON. 기능 기본값은 비활성화.

| 메서드·경로 | 권한·동작 |
|---|---|
| `GET /api/dubbing/config` | 기능·AI 사용 가능 여부만 반환. 키·서버 환경값 비공개 |
| `GET /api/dubbing/projects?tab=popular\|latest\|open\|complete\|mine&offset=0` | 공개 목록 25개씩. mine은 로그인 필요. 차단·탈퇴 계정 제외 |
| `POST /api/dubbing/projects` | 로그인. `{id,options,script,generationId?}`. 비공개 저장 |
| `GET /api/dubbing/projects/:id` | 공개 또는 작성자/기존 배역 참여자. 대본과 배역 상태 |
| `PUT /api/dubbing/projects/:id` | 작성자. `{revision,options,script,generationId?}`. 비공개·예약 없음·녹음 전 조건 |
| `POST /api/dubbing/projects/:id/publish` | 작성자. `{revision,rightsAccepted:true}` |
| `POST /api/dubbing/projects/:id/unpublish` | 작성자. `{revision}`. 기존 예약자의 접근·취소 유지 |
| `POST /api/dubbing/projects/:id/claims/:roleId` | 로그인. `{revision}`. 공개 모집 중 배역 예약 |
| `DELETE /api/dubbing/projects/:id/claims/:roleId` | 해당 예약자. `{revision}`. 녹음 시작 전 취소 |
| `POST /api/dubbing/generations` | 로그인 + 별도 AI 활성화. `{requestId,options}` |
| `GET /api/dubbing/generations/:requestId` | 요청자만 상태·결과 확인. 유료 재호출 없음 |

AI 대본 생성은 이용자에게 무료이며 Gold 원장을 전혀 호출하지 않는다. 운영자의 OpenAI API 비용은 별도다.

## 2~4차 데이터 설계 — 아직 마이그레이션·구현하지 않음

다음 테이블은 후속 단계에서 승인된 마이그레이션으로 추가한다. 현재 1차 DB에 미리 빈 운영 구조를 배포하지 않는다.

| 데이터 | 주요 필드·제약 |
|---|---|
| `dubbing_timelines` | project_id, version, script_revision, plan_key, duration_ms, sample_rate, hash, frozen_at. UNIQUE(project_id,version). 첫 제출 전 공통 배경·슬롯 고정 |
| `dubbing_sound_jobs` | id, project_id, script_revision, request_id, state, attempts, lease_token, lease_until, next_poll_at, error, created, updated. UNIQUE(project_id,script_revision,request_id) |
| `dubbing_sound_assets` | job_id, cue_id, kind, model, prompt_hash, provider_job_id, provider_state, generation_seconds, temp_key, validated_at, usage_json, actual_usd(nullable), estimate_usd, fx_rate, fx_at. UNIQUE(job_id,cue_id), provider_job_id 고유 |
| `dubbing_audio_renders` | project_id, timeline_version, kind(background/final), state, object_key, checksum, duration_ms, integrated_lufs, peak_db, render_revision. 결과 교체는 검증 성공 후 원자적으로 |
| `dubbing_recording_slots` | project_id, role_id, user_id, timeline_version, state(reserved/recording/submitted), lease_token, lease_until, revision. 역할 중복·재제출 CAS |
| `dubbing_takes` | id, project_id, role_id, line_id, user_id, timeline_version, vocal_key, start_ms, duration_ms, latency_ms, trim_ms, revision, accepted_at. UNIQUE(role,line,revision), 보컬만 저장 |
| `dubbing_orders` | id, user_id, project_id, request_id, price_version, quoted_gold, confirmed_at, state(reserved/settled/refunded), job_id, debit_ref, refund_ref. UNIQUE(user_id,request_id), 같은 작업 중복 차감 금지 |
| `dubbing_gold_lots` | order_id, purchase_lot_id, amount, refunded. 기존 Gold 구매분 사용량과 원자적으로 반영, 환급은 사용한 원래 구매분에 정확히 복구 |
| `dubbing_settings` | key, value, version, changed_by, changed_at. 시작 검토가 50G, 1G=10원, 관리자 변경 가능. 가격 버전 확인 후 결제 |
| 기존 신고 테이블 확장 | track_id nullable + dubbing_project_id nullable, 두 대상 중 정확히 하나. 권리자 정보·사유·증빙 키·처리/이의신청 상태 추가. 기존 관리자 인증·감사 로그 사용 |
| 작품 관계 확장 | source_project_id, script_author_credit, participant_credits, moderation_state. 파생 참여작·완성작 게시중단 추적 |
| 커뮤니티 대상 확장 | 대상 kind/id로 좋아요·댓글·공유의 기존 동작 재사용. 더빙을 음악 tracks 행으로 위장하지 않음 |

## 후속 API와 작업 흐름

### 2차: 음향감독·배경 오디오

- `POST /projects/:id/sound-plan`: 직접 작성 대본에도 Luna 음향 분석 제공. 대본 버전과 연출안 결합.
- `POST /projects/:id/sound-jobs`: 승인된 가격·요청 ID 확인 후 대기열 등록. 개발에서는 결제 없이 명시된 테스트 모드만 사용.
- `GET /sound-jobs/:id`: 상태·완료 개수·실패 원인. 브라우저에 Pika 키나 서명 없는 내부 파일 주소를 주지 않는다.
- `/internal/dubbing/jobs/claim|heartbeat|assets/:cue/complete|finish|fail`: 기존 외부 처리기의 인증·임대 토큰 패턴으로 처리.

Pika 연동 예정 모델은 `pika/pika-audio/pika-sfx`, `pika/pika-audio/pika-music`. 실제 제출/조회/파일 수신 형식은 2차 시작 시 [공식 API 문서](https://dev.pika.art/)를 확인한 후 구현한다. 월 $10은 사용자 제안 요금제이며 가입·가격·실제 청구 검증은 하지 않았다.

메인 Worker는 작업을 등록하고 상태만 반환한다. 외부 처리기가 cue별 제출 ID를 먼저 영속화하고 상태 조회를 계속한다. POST의 결과가 불명확하면 새 유료 작업을 자동 생성하지 않는다. 이미 확인된 작업 ID의 조회/다운로드만 제한 재시도한다. 인증 오류는 즉시 중단, 429/일시 오류는 next_poll_at과 상한 적용. 서버 재시작 시 DB 임대 만료와 저장된 provider_job_id로 이어간다.

생성 파일은 허용 호스트·크기·콘텐츠 형식·디코딩·길이·샘플레이트 검증 후 R2 임시 영역에 저장한다. 외부 URL을 무제한 프록시하지 않는다. FFmpeg에서 피크 제한, 페이드, 대사 구간 ducking, 겹침 검증 후 배경을 만든다. 전체 구간에 BGM을 자동으로 깔지 않는다. 같은 작품 안에서만 cue를 재사용하고 임시 파일은 성공 후 정리 정책에 따라 제거한다.

무료 기본 더빙은 동일 타임라인의 무음 배경을 준비하여 `record_ready` 조건을 만족시킨다. 유료 음향 없이도 기본 녹음을 막지 않는다.

### 3차: 녹음·합성

- `POST /projects/:id/roles/:role/recording-session`: 준비된 background + timeline version을 확인하고 세션 임대.
- `PUT /recordings/:session/lines/:line`: 보컬 파일 업로드. 본인·배역·대사·타임라인·길이·중복 요청 검증.
- `POST /recordings/:session/submit`: 원본 보컬 검증 후 제출. 늦은 재전송과 동시 제출 방지.
- `GET /projects/:id/preview`: 권한 있는 배경·기존 참여 보컬을 공통 시간축으로 제공.
- `POST /projects/:id/finalize`, `GET /projects/:id/playback`: 모든 배역 제출 → 최종 합성 대기열 → 검증된 파일 공개.

브라우저 녹음의 장치 선택·모니터링·오디오 처리 코드를 분리 가능한 부분만 재사용한다. 기존 음악 녹음 전역 상태를 더빙 페이지에서 덮어쓰지 않는다. 헤드폰 안내, 건조 보컬 별도 캡처, 지연 보정, 대사별 여유 구간, 초과 녹음 검증, 재녹음·재개·미리듣기를 구현한다. 첫 녹음 후 대본을 바꾸려면 새 버전의 별도 작품으로 분기하고 기존 참여자를 조용히 다른 시간축으로 옮기지 않는다.

### 4차: 결제·신고·관리자

- `POST /projects/:id/sound-quote`: 현재 가격·유효기간·가격 버전 반환.
- `POST /projects/:id/sound-orders`: 이용자 최종 확인 + idempotency ID. 가격 변동 시 재확인.
- `GET /orders/:id`: Gold 사용 내역·진행·환급 확인. 실패 시 기존 구매분에 한 번만 환급.
- 기존 신고 API에 더빙 대상·권리자 정보·증빙 업로드 추가, `POST /reports/:id/appeal`.
- 기존 `/api/admin/` 인증 아래 더빙 현황·작업 재조정·게시중단·가격 설정·사용량 집계.

Gold 차감과 주문 예약을 단일 원자적 쓰기로 묶는다. 외부 API 성공과 DB 결과 불일치를 재조정할 수 있게 작업 ID·주문 ID를 연결한다. 관리자에게 확정 청구 USD, 추정 USD, 환율·시각, 추정 KRW를 분리 표시한다. 실패/불명 작업에 무조건 “재생성” 버튼을 제공하지 않는다. 음악 선물·정산 배분은 더빙에 적용하지 않으며 별도 정책 확정이 필요하다.

전체 상태 흐름:

```text
script_ready
  → sound_queued → sound_generating → sound_mixing → record_ready
  → recruiting → in_progress → complete
음향 실패 → failed (결제 작업이면 멱등 환급)
무료 기본 → 무음 배경 준비 → record_ready
```

1차에서는 배역 “예약”을 미리 할 수 있다. 실제 녹음 진입은 배경 완성과 timeline 고정 전에는 허용하지 않는다.

## 검증과 제한

- `npm run build`: 통과. 기존 lockfile에 있던 `@soundtouchjs/core`가 로컬 설치에서 빠져 있어 `npm ci --ignore-scripts`로 복구했다. 의존성 추가·버전 변경은 없다.
- TypeScript `--allowJs --checkJs --noEmit`: 새 공용 대본 계약과 OpenAI 어댑터 통과. 기존 전체 JS 프로젝트를 새로 타입화한 것은 아니다.
- 신규 서버·클라이언트 JavaScript 문법 검사 통과.
- 더빙 통합 테스트 14개 통과: 저장, R2 실패·DB 응답 유실, 권한, 역할 충돌, CAS, 차단, 탈퇴 정리, AI 게이트, 모의 응답·중복 방지·실패 사용량, 비공개 전환 후 예약 취소.
- 최종 관련 테스트 43개 통과: 더빙 14개와 기존 계정 삭제·본문 제한·MR 생성·부르기 목록·듀엣 이동·선물 처리.
- 브라우저 실동작: 직접 작성 → 저장 → 모집 공개 → 배역 예약. 아이폰 너비 390px에서 가로 넘침 없음.
- 전체 메모리 기반 회귀 테스트 최초 비교: 528개 중 512개 통과, 16개 실패. 수정 전 HEAD를 별도 폴더에 추출하여 같은 실패 16개를 재현했고 새 실패는 없었다. 기존 실패는 커뮤니티/프로필 VM 보조 함수 누락, 듀엣·모바일 인증·캐시/광고 기대값 불일치 등을 포함한다. 따라서 “전체 테스트 통과”로 보고하지 않는다.
- `tests/api.test.mjs`는 전용 로컬 HTTP 서버를 요구하므로 위 전체 실행에서 제외했다. 신규 더빙 API는 실제 Worker 핸들러와 전체 마이그레이션을 적용한 메모리 DB로 검증했다.
- 라이브 OpenAI·Pika, 실제 오디오·녹음·Gold·운영 D1/R2는 검증하지 않았다.

로컬 재현:

```sh
npm run build
node --test tests/dubbing.test.mjs
node tests/preview-dubbing.mjs
# http://127.0.0.1:4182/#dubbing
```

미리보기는 메모리 DB와 로컬 R2 대역만 사용하며 테스트 표시를 고정으로 보여준다. 프로세스를 종료하면 샘플 작품도 사라진다. `.dev.vars`의 실제 API 키를 읽지 않는다.

검증 화면: `outputs/dubbing-stage1/desktop-hub.png`, `outputs/dubbing-stage1/mobile-editor.png`. 비교 결과: `outputs/dubbing-stage1/regression-baseline-comparison.json`. 이 출력물은 Git 제외 경로에 있으며 현재 Mac에 보관한다.

운영 적용 전에는 별도 승인, 기존 회귀 실패의 출시 영향 판단, 신규 DB 마이그레이션 검토·백업, 운영 Secret 등록, 제한된 라이브 AI 검증이 필요하다. 먼저 1차 화면·동작을 검토한 뒤 2차 작업으로 넘어간다.
