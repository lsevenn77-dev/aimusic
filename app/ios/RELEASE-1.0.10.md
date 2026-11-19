# iOS 1.0.10 (30)

2026-11-19. 사용자의 App Store Connect 업로드 요청에 따른 새 버전이다.

## 변경 내용

- `3ac4cc5`의 노래방 통화 중단, 차례 종료, 작은 메시지 팝업 개선을 그대로 포함한다.
- 기능 변경·검증 범위와 실기기 미검증 항목은 [빌드 29 작업 기록](REPAIR-20261119-BUILD29.md)에 기록되어 있다. 새 버전에서는 버전 번호만 변경했다.
- 관련 웹 수정은 Sites 844 및 일치하는 Cafe24 렌더러로 배포·검증했다.

## 버전 변경 이유

- Xcode로 1.0.9(29)를 업로드했으나 Apple이 오류 90186(1.0.9 train closed) 및 90062(이미 승인된 1.0.9보다 높은 버전 필요)를 반환했다.
- 따라서 marketing version을 1.0.10, build number를 30으로 올려 다시 아카이브했다. 승인된 기존 1.0.9는 취소하거나 내리지 않았다.

## 업로드 완료

- 2026-11-19, Xcode Organizer에서 **1.0.10 (30) · Uploaded with warnings** 및 업로드 완료 화면을 확인했다.
- 경고 3건: 2027년 4월부터 적용될 iOS 27 SDK 요구 사전 안내, GoogleMobileAds/UMP 공급업체 dSYM 누락. 이번 전송은 성공했다.
- 증빙: `/Users/user/Documents/Codex/2026-09-24/new-chat/work/ios-1.0.10-30-uploaded.png`.
- 최초 업로드 시점에는 App Store Connect 웹 세션이 만료되어 TestFlight 처리 완료 확인과 심사 제출을 보류했다. 이후 사용자의 로그인 및 제출 요청에 따라 아래 절차를 완료했다.

## 심사 제출 완료

- 2026-11-19 오후 8:25 (KST), App Store Connect에서 **1.0.10 (30) · 심사 대기 중**을 확인했다.
- TestFlight 처리 완료(`제출 준비 완료`) 확인 후 새 App Store 버전 1.0.10을 생성하고 빌드 30을 연결했다.
- 빌드 ID: `ea8843d4-484b-4587-96f2-74917f83160b`.
- 제출 ID: `e66995ee-205f-4432-ba2e-959dba803c17`.
- 심사 내역: https://appstoreconnect.apple.com/apps/6819654764/distribution/reviewsubmissions/details/e66995ee-205f-4432-ba2e-959dba803c17
- 한국어 업데이트 설명에 통화 수신 시 곡 중단·다음 차례 처리, 방 안 메시지·공유·선물 팝업, 이모티콘 위치·크기, 모니터링 연결과 예약 영역 개선을 기록했다.
- 심사 메모에 통화 중 마이크/재생 중단, 본인 차례만 종료, 통화 후 자동 재시작 방지, 방 위 팝업 확인 경로를 안내했다. 기존 심사 계정과 앱 설명·키워드는 유지했다.
- **승인 후 자동 출시**, **모든 사용자에게 즉시 업데이트 출시**, **기존 평가 유지** 설정을 유지했다. 현재 상태는 심사 대기이며 승인·출시 완료는 아니다.
- 증빙: `/Users/user/Documents/Codex/2026-09-24/new-chat/work/ios-1.0.10-30-submitted.png`.

## 새 아카이브 검증

- Release archive 성공: `/Users/user/Library/Developer/Xcode/Archives/2026-11-19/AIFECT-1.0.10-30.xcarchive`.
- `codesign --verify --deep --strict` 통과. 번들 `kr.co.aifect.app`, 버전 `1.0.10`, 빌드 `30` 확인.
- 배포 실행 파일에서 Debug 전용 `fixture-original`, `-workspace-test-url` 미포함 확인.
- 버전 변경 외 앱 코드 변경은 없다. 실기기 통화 수신·모니터링 청음은 여전히 미검증이다.
