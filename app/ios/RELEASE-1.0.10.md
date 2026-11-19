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
- App Store Connect 웹 세션이 만료되어 TestFlight 처리 완료 여부는 아직 확인하지 못했다. 로그인 요청은 전달했다.
- 이번 요청은 업로드이며, 심사 제출·출시 완료를 뜻하지 않는다.

## 새 아카이브 검증

- Release archive 성공: `/Users/user/Library/Developer/Xcode/Archives/2026-11-19/AIFECT-1.0.10-30.xcarchive`.
- `codesign --verify --deep --strict` 통과. 번들 `kr.co.aifect.app`, 버전 `1.0.10`, 빌드 `30` 확인.
- 배포 실행 파일에서 Debug 전용 `fixture-original`, `-workspace-test-url` 미포함 확인.
- 버전 변경 외 앱 코드 변경은 없다. 실기기 통화 수신·모니터링 청음은 여전히 미검증이다.
