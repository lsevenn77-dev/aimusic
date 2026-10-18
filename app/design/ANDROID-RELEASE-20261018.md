# Android 2.5.51 (64) · 프로덕션 초안 파일 교체

2026-10-18 · `codex/aifect-streaming-first`

사용자가 현재 UI로 빌드해 Play Console 프로덕션 파일을 교체하고, iPhone에서 같은 디자인을 구현할 수 있도록 Git 업로드를 요청했다. 기존 프로덕션 출시 초안의 **2.5.47 (60)을 2.5.51 (64)로 교체하고 임시보관함 저장 완료**를 확인했다. Console 아티팩트 표에는 64만 있으며 변경사항 저장 완료 안내가 표시되었다. **프로덕션 심사 제출이나 공개 출시를 실행한 상태는 아니다.** 별도 공개 테스트의 기존 검토 중 변경사항도 수정하지 않았다.

## 포함된 변경

현재 UI는 `e68735fae609e6999c2ef7f6dc574ade5eacbdb5`까지의 네이티브 Android 수정과 동일하다. 이번에 버전만 올려 정상 production 패키지로 빌드했다.

- 홈 추천·차트·최신곡·발견 및 홈/마이 공통 보관함 연결.
- 미니플레이어와 앱 내 페이지 이동, 원래 색의 홈 앨범 커버.
- 낮은 커뮤니티 카드, 메시지 검색·필터·대화 목록, 마이 전체메뉴 제거.
- 기존 스트리밍·녹음·듀엣·서버 연결 유지.
- [iPhone 인수인계](IOS-HANDOFF-20261018.md), 승인 보드·구현 기준·[실행 화면 37장](streaming-20261018/index.html).

## 출시 파일 검증

| 항목 | 결과 |
|---|---|
| 패키지 | `kr.co.aifect.app` (테스트 패키지 아님) |
| 버전 | `2.5.51` / `64` |
| 빌드 | `bundleRelease` 성공, `DEBUG=false` |
| 서명 | 기존 AIFECT 업로드 키, `jarsigner -verify`: `jar verified` |
| 파일 | `AIFECT-2.5.51-64-play.aab` |
| 크기 | 24,003,904 bytes |
| SHA-256 | `5FB36F14EB4CA24126586AB89F175CDE1EB2B2A9D5B44B8C784B99511927B303` |
| API / target SDK | 26 이상 / 36 |
| 단위 검사 | release JVM 61개 통과, 실패·오류·건너뜀 0 |
| Lint | release 오류 0, 경고 119 (기존 경고 포함) |
| Console | 업로드·처리 성공, 64(2.5.51) 확인, 기존 60을 초안에서 제외 후 저장 |

빌드 명령 (`app/android`, Android Studio JBR):

```powershell
./gradlew.bat :app:bundleRelease :app:testReleaseUnitTest :app:lintRelease --console=plain
```

`-PaifectTest`는 사용하지 않았다. `app/scripts/sign-play-bundle.ps1`로 Gradle 원본의 사본을 서명했다. 업로드 키/암호/서명 바이너리는 Git에 넣지 않는다. 자체 서명 업로드 인증서의 PKIX·타임스탬프 관련 jarsigner 경고는 출력되었고, 서명 검증 및 Play 업로드는 성공했다.

## 검증 범위와 남은 항목

이번 출시 빌드에서 단위 검사와 Lint를 다시 실행했다. 기능/화면 검사는 직전 동일 UI 소스의 [최종 커뮤니티 검증](../../docs/ui/aifect-20261018/COMPACT_COMMUNITY.md)과 [메시지·로그인 검증](../../docs/ui/aifect-20261018/SOCIAL_AND_LOGIN.md)을 따른다. 전체 instrumentation 전수 검사가 아니며 기존 알림 fixture 실패를 해결했다고 처리하지 않는다.

실제 마이크 음질·이어폰 모니터링·유료 결제·운영 게시·선물 전송과 iOS 신규 디자인 빌드는 미검증이다. 이 출시 파일을 실제 휴대폰에 별도 설치하지 않았으며 사용자 휴대폰의 테스트 앱 데이터도 변경하지 않았다.

로컬 산출물: `C:/Users/lseve/Documents/ChatGPT/aieffect/artifacts/android-release-2.5.51/`의 AAB, `build-validation.log`, `signing.log`, `play-production-draft-saved.png`. Console 스크린샷은 파일 교체 및 저장 상태를 보여주며 공개 출시 증거가 아니다.

소스는 작업 브랜치에서 공유하며 운영 `main` 병합과 웹 운영 배포는 수행하지 않는다. 과거 검토 문서의 ‘원격 업로드하지 않음’은 해당 검토 시점의 기록이며 이번 사용자의 업로드 요청으로 변경되었다.
