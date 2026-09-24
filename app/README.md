# AIFECT 네이티브 Android 앱

버전 **2.0.0 (3)** · 패키지 `kr.co.aifect.app` · Android 8.0 이상 · targetSdk 36.

Kotlin / Jetpack Compose 화면과 Media3 플레이어를 사용한다. WebView, Capacitor, 웹 JavaScript 화면은 APK에 포함하지 않는다. 기존 Java 노래방 화면과 오디오 엔진을 직접 실행한다.

## 화면과 연결

- **듣기**: 곡/프로필 검색, 인기·최신·장르·기분별 탐색, 공개 플레이리스트, 음악가 프로필.
- **부르기**: MR·가사 싱크가 준비된 곡, 네이티브 노래방, 에코·룸 리버브·룸 크기·목소리/반주 음량, 이어폰 실시간 청음, 녹음 재청음 및 커버곡 업로드.
- **커뮤니티**: 전체·커버곡·제작곡·팔로잉 피드, 실제 재생/좋아요/댓글 수, 좋아요·댓글·댓글 좋아요, 내 댓글 삭제, 프로필 팔로우. 사람의 프로필 안에서 제작곡과 커버곡을 나눠 보여준다.
- **내 음악**: 좋아요, 내/저장한 플레이리스트, 최근 들은 곡, 팔로잉. 목록 만들기·이름/공개 여부 편집·곡 추가/삭제·순서 변경·목록 삭제. 기존 서버의 Free 2개 / Premium 10개 한도를 그대로 적용한다.
- **플레이어**: 네이티브 MediaSessionService, 백그라운드·잠금화면 제어, 이전/다음·탐색·셔플·반복, 닫을 수 있는 미니 플레이어. 로그아웃 상태에서는 서버의 60초 미리듣기 제한을 따른다. 무료는 현재 가사 한 줄, Premium은 현재 줄과 주변 가사를 표시한다. Premium 만료 시 전체 가사 캐시를 지운다.
- 음원 제작·업로드 및 정산용 웹 스튜디오, 약관·고객센터는 명시적으로 외부 브라우저를 연다. Android 골드 결제와 Play Store 출시는 이 버전에 포함하지 않는다.

## 로그인

이메일 로그인/가입은 네이티브 폼이다. Google·카카오·Apple 인증은 시스템 브라우저에서 기존 제공자 설정으로 진행하고 앱으로 돌아온다. 새 제공자 키나 앱 안의 웹 로그인 창은 필요하지 않다.

앱이 랜덤 verifier를 생성하고 SHA-256 challenge만 서버에 보낸다. 브라우저 인증 성공 후 2분짜리 단회 ticket을 verifier와 교환한다. ticket만 탈취해도 세션을 받을 수 없다. 인증 완료 링크에 세션/키를 넣지 않는다. 브라우저에 기존 로그인 세션이 있으면 어떤 계정으로 계속할지 명시적으로 선택한다.

세션 쿠키와 진행 중인 verifier는 Android Keystore AES-GCM으로 암호화한다. API와 음원 HTTP 클라이언트는 AIFECT 원본에만 쿠키를 보내고 리다이렉트를 따라가지 않는다. 앱 로그아웃은 브라우저 세션에 영향을 주지 않는다. 이전 WebView 세션은 가져오지 않으므로 2.0 업데이트 후 한 번 다시 로그인한다.

백엔드의 `server/mobile-auth.js` 및 `/api/community`와 함께 배포한다. 기존 `oauth_states`를 재사용하므로 새 DB 마이그레이션은 없다.

## 빌드

Java 21, Android SDK 36을 설치한 뒤:

```powershell
$env:JAVA_HOME='C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot'
$env:ANDROID_HOME='C:/Users/lseve/AppData/Local/Android/Sdk'
cd app/android
./gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

`local.properties`에 실제 SDK 경로를 기록한다. 예: `sdk.dir=C\\:/Users/lseve/AppData/Local/Android/Sdk`.
APK는 `app/android/app/build/outputs/apk/debug/app-debug.apk`.
Node 설치나 `cap sync`는 필요하지 않으며 사용하지 않는다.

`-PaifectTest`는 별도 패키지 `kr.co.aifect.app.test`로 빌드한다. 이 패키지의 디버그 빌드만 MainActivity의 `testOrigin` extra로 HTTP localhost 테스트 서버를 지정할 수 있다. 일반 앱과 release에서는 이 옵션을 무시한다.

## 오디오 엔진

- 48kHz AudioRecord/AudioTrack. 마이크는 녹음 버튼을 눌렀을 때만 권한을 요청한다.
- 에코 235ms, 감쇠 반복; 룸은 4 comb + 2 all-pass. 파라미터 램프와 피크 제한, 기기 내 dry PCM 보관.
- 이어폰 청음 기본 OFF. 유선/USB 권장. 블루투스는 지연 안내 후 선택하며 실제 지연은 기기에 따라 다르다.
- 스피커로 마이크를 출력하지 않는다. 이어폰 분리·통화/오디오 포커스 상실·앱 백그라운드에서 녹음/청음을 중단한다.
- 재청음에서 효과/목소리/반주 음량과 -300~800ms 싱크 조절. 최대 10분, 32kHz PCM16 stereo WAV로 업로드.
- 사용자 직접 녹음/공개 권리 확인 후 업로드한다. 서버가 변환·공개한 뒤 커뮤니티의 커버곡으로 나온다. 녹음은 화면을 닫으면 기기에서 삭제한다.

## 검증과 출시 범위

```powershell
$env:ANDROID_SERIAL='emulator-5580'
./gradlew.bat :app:connectedDebugAndroidTest -PaifectTest
```

- JVM 8개: DSP, 피크 제한, 잔향, 원본 보존, 싱크 이동, WAV/리샘플링, 서버 원본 제한.
- Android: 네이티브 화면에 WebView가 없는지 확인, 메뉴 이동, 백그라운드 재생/재생바 닫기, 이메일 로그인/플레이리스트 생성, 세션 암호화, 외부 원본/경로 차단 및 노래방 무음 fixture 테스트.
- 백엔드: 단회 인증·verifier 불일치·재사용 거부·브라우저 세션 분리·커뮤니티 접근 검증과 기존 회귀 테스트.
- Android 테스트는 로컬 합성 데이터와 무음 WAV만 사용한다. 실제 이용자 로그인, 실제 마이크 녹음, 글 게시, 결제는 하지 않는다.
- 별도 실기기 확인 필요: Google/카카오/Apple 각 계정 인증 완료, 이어폰별 실제 왕복 지연/음질, 전화 수신/장시간 녹음, 녹음 업로드 후 청음.
- 디버그 APK는 설치 확인용이다. 스토어 출시는 별도의 릴리스 서명·계정/콘텐츠 심사·결제 정책 작업이 필요하다.
