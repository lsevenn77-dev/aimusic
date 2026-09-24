# AIFECT 앱 (Android · 이후 iOS)

Capacitor 8 로 https://aifect.co.kr 을 그대로 여는 앱이다. 화면과 기능은 사이트가 그대로 쓰이므로 사이트를 배포하면 앱에도 바로 반영된다. 앱에만 필요한 것은 네이티브로 붙인다.

- 패키지: `kr.co.aifect.app` · 앱 이름 AIFECT · targetSdk 36
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

사이트의 `dist/karaoke.js` 가 앱 안에서만 켜진다(`inApp`). 메뉴에 「노래방」이 생기고, MR과 단어별 싱크가 준비된 곡 페이지에 「노래 부르기」 버튼이 뜬다.

- MR 재생과 녹음을 한 AudioContext(32kHz)에서 해서 같은 시계로 맞춘다. 남는 기기 지연(이어폰 · 블루투스)은 싱크 슬라이더로 맞춘다(기본값은 기기 지연 추정 + 40ms).
- 녹음은 AudioWorklet 으로 받는다. 에코 제거 · 잡음 제거 · 자동 음량은 끈다(이어폰 권장).
- 다시 듣기에서 싱크 · 목소리 · MR 크기를 바꾸고, 올릴 때 OfflineAudioContext 로 합쳐 16비트 스테레오 WAV(10분 곡도 80MB 이하)로 기존 커버곡 업로드 경로에 올린다.
- 마이크 권한은 사이트가 요청할 때 Capacitor 가 안드로이드 권한(RECORD_AUDIO · MODIFY_AUDIO_SETTINGS)을 대신 묻는다.

## 남은 것

- 출시용 서명 키(업로드 키) 만들기와 백업 — 키는 git 에 넣지 않는다(`keystore/`, `keystore.properties` 는 .gitignore)
- 골드 인앱결제, 네이티브 Google 로그인
