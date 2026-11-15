# AIFECT 1.0.6 (16)

## App Store 업데이트 내용

더빙을 더 편리하게 만들고 주요 화면을 개선했습니다.

- 더빙 제작, 배역 선택, 대본 편집 화면 개선
- 파트별·연속 녹음과 배경 음향·녹음 목소리 볼륨 조절
- 초안 저장과 복원, 녹음 종료 동작 개선
- 홈, 차트, 크루, 메시지, 플레이리스트 화면 개선
- 스티커 입력과 음원·앨범 표지 편집의 안정성 향상

## 배포 기록

- 기능 기준 커밋: `9eb8474` (`ios/from-android-2.5.97`)
- Bundle ID: `kr.co.aifect.app`
- App Store Connect 앱 ID: `6819654764`
- 마케팅 버전 `1.0.6`, 빌드 `16`
- 2026-11-16 배포용 서명 아카이브 생성 성공: `AIFECT-1.0.6-16.xcarchive`.
- 명령줄 export는 `Failed to Use Accounts`로 실패했다. 로그인된 Xcode Organizer에서 App Store Connect 배포를 다시 진행했다.
- 첫 업로드는 Apple의 필수 계약 미완료로 차단됐다. 계정 소유자가 완료했다고 알린 뒤 웹 세션을 갱신하고 재시도했다.
- 2026-11-16 01:44 KST Xcode Organizer에서 `Uploaded to Apple`, 빌드 `16`을 확인했다.
- App Store Connect에 버전 `1.0.6`을 생성하고 한국어 업데이트 내용, 더빙 설명과 심사 안내를 저장했다. 기존 스크린샷 6장, 검색 키워드와 심사 계정을 유지했다.
- Apple 빌드 처리 완료 후 빌드 `16`을 버전 `1.0.6`에 연결했다. 빌드 ID: `71e89e9b-9ecc-4e5d-8e36-6ed7a60ffd22`.
- 2026-11-16 01:47 KST 최종 심사 제출 완료. App Store Connect에서 `심사 대기 중`을 확인했다.
- 제출 ID: `64a735ee-a4f3-44b4-b464-d8c9f5b60d06`.
- [App Store Connect 심사 상태](https://appstoreconnect.apple.com/apps/6819654764/distribution/reviewsubmissions/details/64a735ee-a4f3-44b4-b464-d8c9f5b60d06)
- 승인 후 자동 출시 및 모든 사용자에게 즉시 업데이트 출시 설정을 확인했다. 실제 출시와 심사 승인은 아직 대기 중이다.
- GoogleMobileAds/UserMessagingPlatform 배포 SDK의 dSYM 누락 경고는 남았지만 앱 업로드는 성공했다.

## 검증 범위

- 변경별 단위 검사 82개 및 UI 시나리오 17종의 최종 재검사 통과.
- iPhone 시뮬레이터의 실제 AVAudioRecorder 연속 녹음, 초안 저장·복원, 대본 편집, 주요 화면 전환 검증.
- arm64 Release 빌드 통과. 실물 기기는 사용하지 않았다.
- 실시간 합동 더빙은 이번 범위에서 제외했다.
- 화면별 비교, 실행 결과 및 미검증 범위는 [화면 대조 기록](ANDROID-IOS-SCREEN-AUDIT.md)에 정리했다.
