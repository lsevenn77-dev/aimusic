# AIFECT 앱 (Android · 이후 iOS)

음악 탐색·계정·보관함은 Capacitor 8에서 https://aifect.co.kr 을 사용하고, **노래방 화면·녹음·실시간 청음·효과·믹싱은 Android Java 네이티브**로 실행한다. 사이트 변경과 APK 업데이트는 별도 배포다.

- 패키지: `kr.co.aifect.app` · 앱 이름 AIFECT · 버전 1.1.0 (2) · targetSdk 36
- 백그라운드 재생 · 잠금화면 조작: `@capgo/capacitor-media-session` (사이트의 `dist/media-session.js` 가 앱 안에서 이 플러그인을 부른다). Android 14 이상에서 필요한 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 권한은 `AndroidManifest.xml` 에 직접 넣었다(플러그인이 빠뜨림).
- 앱 안에서는 Google 로그인을 숨긴다. Google 은 앱 속 웹뷰 로그인을 막기 때문에, 네이티브 Google 로그인을 붙이기 전까지 이메일 · 카카오 · Apple 로 로그인한다. 사이트는 `window.Capacitor.isNativePlatform()` 으로 앱인지 안다(`inApp`).
- 인터넷이 없으면 `www/offline.html` 을 보여준다.
- 아이콘 · 스플래시 원본은 `assets/` (로고의 「ai + 음표」를 잘라 만듦). 바꾸면 `npm run assets`.

## 빌드

Java 21 이 필요하다(이 PC 기본 JAVA_HOME 은 17 이라 빌드할 때 21 로 지정).

```sh
npm ci
npx cap sync android
cd android
JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot" ./gradlew.bat assembleDebug
```

디버그 APK: `android/app/build/outputs/apk/debug/app-debug.apk`

로컬 개발 서버로 앱을 시험하려면 `AIFECT_APP_URL=http://localhost:4174 npx cap sync android` 로 빌드하고 `adb reverse tcp:4174 tcp:4174` 로 포트를 넘긴다. 다시 `npx cap sync android` 하면 운영 사이트로 돌아간다. 시험용은 `gradlew assembleDebug -PaifectTest` 로 빌드하면 패키지 `kr.co.aifect.app.test` · 이름 「AIFECT 테스트」가 되어 운영용 앱과 함께 설치된다.

## 노래 부르기

사이트의 `dist/karaoke.js` 가 앱 안에서만 켜진다(`inApp`). 메뉴에 「노래방」이 생기고, MR과 단어별 싱크가 준비된 곡에서 「노래방 열기」를 누르면 `AifectKaraoke` 플러그인이 `KaraokeActivity`를 연다. 이전 APK는 기존 Web Audio 녹음 경로를 유지한다.

- **에코**: 235ms 딜레이와 감쇠 반복, 0~65%. **룸 리버브**: 4개 comb + 2개 all-pass 잔향, 양 0~65%와 룸 크기 조절. 별도로 목소리·반주·청음 음량을 바꾼다. 설정 변화에는 짧은 램프, 출력에는 피크 제한을 적용한다.
- **실시간 청음**: `AudioRecord` → `VocalEffects` → `AudioTrack` 경로다. 오디오 콜백마다 JS를 호출하지 않는다. 기본은 꺼짐이며 유선·USB 이어폰을 권장한다. 블루투스는 지연 안내에 동의해야 켜진다. 출력 경로를 확인해 스피커로는 마이크를 보내지 않고, 이어폰 분리·통화 등 오디오 포커스 상실 시 중단한다. 기기별 실제 왕복 지연은 아직 측정하지 않았고 지연 없는 청음을 보장하지 않는다.
- **반주와 녹음**: 네이티브 오디오 스레드의 48kHz 프레임 타임라인에 맞춘다. MediaCodec으로 MR을 디코딩하고 스트리밍 변환한다. 파일 단위로 읽고 써서 10분짜리 전체곡을 메모리에 올리지 않는다. 음성 통화용 에코 제거·잡음 제거·자동 음량은 끈다.
- **다시 듣기**: 목소리 원본을 유지한 채 에코·룸·목소리·반주 음량을 다시 조절한다. 싱크는 -300~800ms(기본 80ms), 재생을 멈춘 상태에서 조절한다. 양수는 늦게 녹음된 목소리를 앞으로 이동한다. 녹음 후 바꾼 최종 효과가 업로드에 적용된다.
- **커버 업로드**: 같은 DSP로 믹싱한 32kHz 16비트 스테레오 WAV를 기존 `/api/covers` → `/api/uploads/:id/audio` → `/complete`에 전송한다. 최대 10분, 80MB 미만. 실패 후 재시도는 받은 업로드 ID를 재사용한다. 사용자가 직접 부른 음성과 공개 권리를 확인해야 올릴 수 있다.
- **권한·수명**: 녹음 버튼을 눌렀을 때만 마이크 권한을 요청한다. 앱이 뒤로 가면 마이크와 청음은 정지하며 자동 재개하지 않는다. 기기의 임시 녹음은 화면을 닫으면 삭제한다. 권한 없는 외부 페이지에서 네이티브 플러그인을 열 수 없고 세션 쿠키는 AIFECT 원본 주소에만 전송한다. HTTP localhost는 디버그 빌드에서만 허용한다.

## 검증

```sh
cd android
./gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug -PaifectTest
# 대상 에뮬레이터만 지정: 실제 마이크를 요청하지 않는 무음 fixture 테스트
ANDROID_SERIAL=emulator-5580 ./gradlew.bat :app:connectedDebugAndroidTest -PaifectTest
```

- JVM: 에코 반복·감쇠, 룸 잔향, 바이패스, 피크 제한, 싱크 이동, 원본 보존, WAV 형식, 허용 원본 제한.
- Android: 합성 무음 MR 다운로드·MediaCodec 디코딩·화면, 재생 중단·재시작, 마이크 권한 거부, 스피커 청음 차단. 실제 이용자 계정이나 마이크를 쓰지 않는다.
- 웹: `ai음원사이트/tests/karaoke-native.test.mjs`에서 중복 열기, 실패 후 재시도, 다른 화면으로 이동한 후의 응답 처리를 확인한다.
- 출시 전 기기 검증: 유선·USB·블루투스 각각의 왕복 지연과 잡음/끊김, 이어폰 분리, 통화 진입, 10분 녹음, 실제 AAC MR, 녹음 업로드 후 청음을 확인해야 한다. 에뮬레이터 테스트는 음질 검증을 대신하지 않는다.

## 남은 것

- 출시용 서명 키(업로드 키) 만들기와 백업 — 키는 git 에 넣지 않는다(`keystore/`, `keystore.properties` 는 .gitignore)
- 골드 인앱결제, 네이티브 Google 로그인
