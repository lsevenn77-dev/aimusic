# AIFECT Android 시안 대조 수정본

2026-10-18 · 작업 브랜치 `codex/aifect-streaming-first`

사용자가 다시 제공한 `IMPLEMENTATION_BRIEF.md`와 `AIFECT 음악 앱 UX 전략 보드.png`를 모두 확인하고 기존 1차 구현을 수정했다. 재제공 원본은 `resupplied/`에 보관했다. 이미지 SHA-256은 `1A40F741999F7BB4D79198BB244481BB934A9D24AEF2245DB3887AFD77B15792`이며, 앞서 받은 승인 이미지와 동일하다.

## 달라진 화면

| 화면 | 이번 수정 |
|---|---|
| 홈 | 사진 위 제목·재생 버튼을 배치한 배너와 페이지 점, 서로 다른 색의 보관함 바로가기 4개, 작은 최근 감상 앨범, 짧은 추천곡·인기차트 행으로 정리했다. 추천·차트·최신곡·발견과 기존 API 연결을 유지했다. |
| 부르기 | 상단 검색, 보라색 마이크 배너, 솔로·듀엣 카드 두 개, 최근 녹음 초안, 장르별 추천곡과 부르기 버튼으로 구성했다. 최신 초안을 누르면 기존 녹음 편집 화면을 직접 연다. |
| 마이 | 프로필·팔로워/팔로잉/공개곡, 실제 레벨/XP, 내 음악·내 활동 탭, 2열 음악 보관함·작업 바로가기, 작은 플레이리스트 행으로 정리했다. 플레이리스트의 재생 버튼은 해당 목록의 실제 곡을 재생한다. |
| 공통 | 다크 네이비, 보라·핑크·시안 강조색, 얇은 테두리, 작은 아이콘을 적용했다. 하단 5개 메뉴와 한 줄 가사를 포함한 미니플레이어를 유지했다. 음질 표시는 확장 플레이어에서 확인한다. |
| 작은 화면·큰 글자 | 320dp 폭/글자 130%에서 바로가기를 2열로 바꾸고 아이콘·글자를 세로로 배치한다. 프로필 버튼을 이름 아래로 옮기며, 부르기 배너 장식을 줄여 글자가 단어 중간에서 갈라지는 문제를 완화했다. |

시안의 예시 회원 수·곡 수·날짜를 제품 화면에 넣지 않았다. 다운로드/오프라인 기능도 추가하지 않았다. 예시의 다운로드 자리는 기존 녹음 초안으로 연결했다. 운영 앨범·프로필과 기기 비율에 따라 시안과 이미지·노출 개수는 달라지며, 아래 콘텐츠는 스크롤로 이어진다.

## 변경 파일

`app/android/app/src/main/java/kr/co/aifect/app/` 기준:

- `StreamingComponents.kt`: 바로가기·음악 행·플레이리스트 행·아이콘 스타일과 큰 글자 배치.
- `BrowseScreens.kt`: 홈 배너/목록, 부르기 검색·배너·초안·추천곡.
- `NativeScreens.kt`: 헤더, 하단 5개 메뉴, 미니플레이어와 기존 녹음 연결.
- `MusicCommunityScreens.kt`: 마이 프로필·보관함·작업·플레이리스트 배치.
- `PlayerProgress.kt`: 실제 서버 값으로 표시하는 작은 레벨/XP 영역.
- `RecordingDraftsScreen.kt`: 계정·서비스별 기존 초안 저장소에서 최근 초안 미리보기.
- `MusicModel.kt`: 플레이리스트 바로 재생. 늦게 도착한 목록 응답이 이후 선택한 다른 곡을 덮지 않도록 취소 처리.
- `ChartScreen.kt`: 차트 제목·목록 간격 조정, 실제 순위·기간·동작 유지.

추가 자산: `app/android/app/src/main/res/drawable-nodpi/streaming_microphone.webp`. 저장소의 기존 마이크 이미지를 재사용했다.

테스트 변경: `app/android/app/src/androidTest/java/kr/co/aifect/app/DesignCaptureTest.kt`, `NativeAppTest.kt`.

`KaraokeActivity`, 녹음 엔진, 오디오 효과, 저장/게시 로직, 서버·정산 정책은 이번 수정에 포함되지 않는다. 최근 웹 전용 녹음 수정을 모두 native에 이식한 결과는 아니다.

## 빌드·검증

| 검사 | 결과 |
|---|---|
| Debug APK / instrumentation APK | 성공 |
| JVM 단위 검사 | 61개 통과, 실패·오류·건너뜀 0 |
| Android Lint | 오류 0, 경고 118. 이 중 2개는 큰 글자 배치의 화면 폭 조회 방식에 대한 권고다. |
| 선택 기능 회귀 | 16개 통과 |
| 마지막 큰 글자 배치 수정 후 홈·마이·부르기 재검증 | 3개 통과 |
| 320dp / 글자 130% | 1개 통과, 최종 화면 직접 확인 |
| `git diff --check` | 통과 |

16개 회귀는 홈 네 탭, 보관함 공유/복귀, 재생 세션 유지, 전체 플레이어/큐, 플레이리스트 즉시 재생과 늦은 응답 취소, 솔로/듀엣 연결, 초안 복원, 빈 상태/로그인 필요, 전체 메뉴·스튜디오·차트·음질 표시를 포함한다. 전체 저장소의 모든 instrumentation 테스트를 실행한 것은 아니다. 마지막 3개는 위 항목의 재실행이다.

실행 환경은 Android 에뮬레이터 390dp(780×1688px, density 320), 추가 검사는 320dp(640×1280px)/글자 130%다. 검사 후 크기·글자 설정을 복구했다. 23장의 실행 화면은 기존 앱을 실행해 캡처한 것이며 **로컬 HTTP 테스트 데이터**를 사용한다. 운영 회원·음원 데이터가 아니다. 테스트 음원은 무음 WAV이므로 실제 소리·음질을 검증했다고 볼 수 없다.

## 휴대폰 설치

연결된 Samsung SM-F761N에 `adb install -r`로 **AIFECT테스트**를 업데이트했고 `Success`를 확인했다. 패키지는 `kr.co.aifect.app.test`, 버전은 2.5.50(63), 설치 갱신 시각은 2026-10-18 21:46:45다. 일반 실행 시 기존 실제 서비스 연결 경로를 사용한다. 운영 앱과 별도 패키지이며 같은 앱 소스에서 빌드했다.

설치 후 실행 명령은 전달했으나 휴대폰이 잠겨 있어 실제 화면을 확인하지 못했다. 휴대폰의 앱 데이터 삭제나 테스트 fixture 주입은 하지 않았다. 테스트 실행용 APK는 에뮬레이터에만 설치했다.

## 남은 범위와 한계

- 커뮤니티·메시지 등 나머지 화면의 본격 시각 개편은 2차 범위다.
- 실물 휴대폰·태블릿의 마이크/모니터링/키 조절/음질·Bluetooth·잠금화면 조작은 미검증이다. 기존 PCM 초안 복원과 파일 보존은 검사했다.
- 운영 계정의 실제 녹음 저장/게시·결제·정산, 프로세스 강제 종료 후 복원, TalkBack 전수 검사는 하지 않았다.
- 앞선 1차 검사에서 `webParityGiftQuantityAndActivityHistory`의 알림 목록 표시 실패가 있었다. 운영에서도 발생하는지와 시작 커밋부터의 문제인지는 미확인이다. 이번 화면 수정으로 해결됐다고 처리하지 않았다. 상세는 기존 `REVIEW.md`에 남아 있다.
- 원격 push·PR·운영 브랜치 병합·배포·스토어 업로드는 하지 않았다.

## 로컬 검토 자료

- 비교 페이지: `http://127.0.0.1:4199/revision/` — 승인 시안/실제 홈·부르기·마이, 23장 캡처, APK, 로그.
- 폴더: `C:/Users/lseve/Documents/ChatGPT/aieffect/artifacts/AIFECT-streaming-first-review-20261018/revision/`
- 검사 로그: `checks/visual-tests-final.txt`, `checks/visual-final-layout.txt`, `checks/visual-small-screen.txt`, `checks/visual-build-final.txt`, `checks/visual-install.txt`.

재현 빌드(`app/android`, Android Studio JBR/SDK 사용):

```powershell
./gradlew.bat -PaifectTest :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lintDebug
```
