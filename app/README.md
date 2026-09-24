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

## 남은 것

- 노래 부르기(MR 재생 + 가사 + 녹음 → 커버곡 올리기)
- 출시용 서명 키(업로드 키) 만들기와 백업 — 키는 git 에 넣지 않는다(`keystore/`, `keystore.properties` 는 .gitignore)
- 골드 인앱결제, 네이티브 Google 로그인
