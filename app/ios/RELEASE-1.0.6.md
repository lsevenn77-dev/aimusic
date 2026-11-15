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
- Apple 서버가 `You do not have required contracts to perform an operation` 오류로 업로드를 차단했다. 오류 ID: `27941199-6710-4bcb-bb01-71d8ac989385`.
- App Store Connect 웹 세션도 만료되어 로그인과 계정 소유자의 미완료 계약 확인을 요청했다. 업로드, 심사 제출, 자동 출시 설정은 아직 완료하지 못했다.
- GoogleMobileAds/UserMessagingPlatform 배포 SDK의 dSYM 누락 경고도 표시됐다. 업로드를 차단한 오류는 필수 계약 미완료다.

## 검증 범위

- 변경별 단위 검사 82개 및 UI 시나리오 17종의 최종 재검사 통과.
- iPhone 시뮬레이터의 실제 AVAudioRecorder 연속 녹음, 초안 저장·복원, 대본 편집, 주요 화면 전환 검증.
- arm64 Release 빌드 통과. 실물 기기는 사용하지 않았다.
- 실시간 합동 더빙은 이번 범위에서 제외했다.
- 화면별 비교, 실행 결과 및 미검증 범위는 [화면 대조 기록](ANDROID-IOS-SCREEN-AUDIT.md)에 정리했다.
