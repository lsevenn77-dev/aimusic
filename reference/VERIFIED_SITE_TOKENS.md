# AIFECT 실제 홈 디자인 토큰

기준: https://aifect.co.kr/#home. 측정일 2026-10-23 (Asia/Seoul).

운영 공개 홈의 실제 DOM computed style을 Codex 브라우저 도구로 읽었습니다. 원본 JSON/화면 캡처는 reference/audit/에 있습니다. 패키지 Playwright 스크립트는 문법만 검증했고 실행하지 않았습니다. 같은 목적의 읽기 전용 DOM 측정을 수행했습니다.

로컬: codex/community-v3, HEAD 01d8bdbde728119d636c85994ef5daf03f4d2fd7 + 기존 커뮤니티 미커밋 변경. Sites 조회 latest_version_number=191, 공개 도메인 정상. 이 번호가 배포 커밋과 동일하다고 단정하지 않습니다. 운영 번들: /aifect-app-a94cbb2771c8d188.css. 로컬은 v189 기반이므로 최신 원격 소스와 완전히 동일하지 않습니다. 이번 문서 등록을 위해 런타임 변경을 덮어쓰거나 병합하지 않았습니다.

## 우선 재사용할 실제 토큰

| CSS 변수 | 운영 계산값 | 근거 |
|---|---|---|
| --ds-bg | `#0c121b` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-panel | `#131b26` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-text | `#f5f5fc` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-muted | `#a9b0c1` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-ink | `#171b2b` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-lilac | `#d6baff` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-lavender | `#b7b6ff` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-mint | `#aeebdf` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --pink | `#d6baff` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --page-pink | `#ed91bc` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-gradient | `linear-gradient(105deg,#d6baff,#b7b6ff 48%,#aeebdf)` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-line | `rgba(183,182,255,.16)` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-radius-sm | `8px` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-radius-input | `12px` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-radius-card | `16px` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --ds-radius-feature | `20px` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |
| --sidebar | `228px` | live-pc.json :root / dist/design-system.css:2-19 (page-pink 제외) |

## 실제 컴포넌트 표본

수치는 CSS px. 카드/버튼마다 적용 범위가 다르므로 일괄 치환하지 않습니다. visible=false는 닫힌/숨겨진 DOM의 CSS 값이며 열린 UI 검증이 아닙니다. body 폰트는 선언된 계산값이고 실제 글리프별 폰트 파일 사용까지 검증한 것은 아닙니다.

| 화면 | selector | 표시 여부 | 스타일 |
|---|---|---|
| PC 1440×900 | body | 표시 | backgroundColor: rgb(12, 18, 27); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 1425px; height: 5353.11px |
| PC 1440×900 | .sidebar | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(rgb(16, 23, 34), rgb(13, 20, 29)); color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 32px 22px 20px; gap: normal; border: ; borderRadius: 0px; width: 228px; height: 900px |
| PC 1440×900 | .nav-link.active | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(105deg, rgb(214, 186, 255), rgb(183, 182, 255) 48%, rgb(174, 235, 223)); color: rgb(23, 27, 43); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 700; lineHeight: normal; padding: 10px 14px; gap: 14px; border: 0px none rgb(23, 27, 43); borderRadius: 12px; width: 173px; height: 45px |
| PC 1440×900 | .nav-link:not(.active) | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(188, 195, 210); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 600; lineHeight: normal; padding: 10px 14px; gap: 14px; border: 0px none rgb(188, 195, 210); borderRadius: 12px; width: 173px; height: 45px |
| PC 1440×900 | .topbar | 표시 | backgroundColor: rgba(14, 21, 31, 0.96); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px 42px; gap: 18px; border: 0px none rgba(183, 182, 255, 0.16); borderRadius: 0px; width: 1197px; height: 80px |
| PC 1440×900 | #main | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 22px 46px 58px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 1197px; height: 4939.48px |
| PC 1440×900 | h1 | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 31.333px; fontWeight: 700; lineHeight: 37.5996px; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 143.062px; height: 37.5938px |
| PC 1440×900 | .section-heading h2 | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 23.333px; fontWeight: 700; lineHeight: 32.6662px; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 174.562px; height: 32.6562px |
| PC 1440×900 | .primary-button | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(105deg, rgb(214, 186, 255), rgb(183, 182, 255) 48%, rgb(174, 235, 223)); color: rgb(23, 27, 43); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 14px; fontWeight: 700; lineHeight: normal; padding: 10px 12px; gap: 10px; border: 1px solid rgba(214, 186, 255, 0.333); borderRadius: 12px; width: 275.359px; height: 50px |
| PC 1440×900 | .small-button | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(228, 228, 244); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 13.6px; fontWeight: 400; lineHeight: normal; padding: 8px 15px; gap: 8px; border: 1px solid rgb(83, 86, 106); borderRadius: 12px; width: 328.359px; height: 44px |
| PC 1440×900 | .album-card | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 164.156px; height: 261.75px |
| PC 1440×900 | .album-art | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 11px; width: 164.156px; height: 164.156px |
| PC 1440×900 | .album-title | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 650; lineHeight: 26.8661px; padding: 0px; gap: 5px; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 132.156px; height: 26.8438px |
| PC 1440×900 | .home-music-grid | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px; gap: 24px; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 1105px; height: 547.5px |
| PC 1440×900 | #global-search | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(130deg, rgb(28, 37, 51), rgb(27, 32, 44)); color: rgb(169, 176, 193); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 15.333px; fontWeight: 400; lineHeight: normal; padding: 0px 14px; gap: 10px; border: 1px solid rgba(255, 255, 255, 0.1); borderRadius: 12px; width: 432px; height: 42px |
| PC 1440×900 | .tab.active | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(214, 186, 255); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 600; lineHeight: normal; padding: 0px 0px 15px; gap: normal; border: ; borderRadius: 0px; width: 31.2656px; height: 42px |
| PC 1440×900 | .mobile-navigation | 숨김 | backgroundColor: rgba(16, 23, 34, 0.97); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px 8px; gap: normal; border: ; borderRadius: 0px; width: auto; height: auto |
| PC 1440×900 | #dialog | 숨김 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(130deg, rgb(25, 34, 47), rgb(17, 25, 34) 75%); color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 35px; gap: normal; border: 1px solid rgba(183, 182, 255, 0.22); borderRadius: 20px; width: min(520px, 100% - 32px); height: fit-content |
| 모바일 390×844 | body | 표시 | backgroundColor: rgb(12, 18, 27); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 375px; height: 10023.1px |
| 모바일 390×844 | .sidebar | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(rgb(16, 23, 34), rgb(13, 20, 29)); color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 22px 17px 20px; gap: normal; border: ; borderRadius: 0px; width: 232px; height: 778px |
| 모바일 390×844 | .nav-link.active | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(105deg, rgb(214, 186, 255), rgb(183, 182, 255) 48%, rgb(174, 235, 223)); color: rgb(23, 27, 43); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 14px; fontWeight: 700; lineHeight: normal; padding: 12px 10px; gap: 10px; border: 0px none rgb(23, 27, 43); borderRadius: 12px; width: 187px; height: 44px |
| 모바일 390×844 | .nav-link:not(.active) | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(188, 195, 210); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 14px; fontWeight: 600; lineHeight: normal; padding: 12px 10px; gap: 10px; border: 0px none rgb(188, 195, 210); borderRadius: 12px; width: 187px; height: 44px |
| 모바일 390×844 | .topbar | 표시 | backgroundColor: rgba(14, 21, 31, 0.96); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px 20px; gap: 16px; border: ; borderRadius: 0px; width: 375px; height: 78px |
| 모바일 390×844 | #main | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 22px 20px 42px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 375px; height: 9206.39px |
| 모바일 390×844 | h1 | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 27.333px; fontWeight: 700; lineHeight: 32.7996px; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 124.797px; height: 32.7812px |
| 모바일 390×844 | .section-heading h2 | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 22.333px; fontWeight: 700; lineHeight: 31.2662px; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 247px; height: 31.25px |
| 모바일 390×844 | .primary-button | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(105deg, rgb(214, 186, 255), rgb(183, 182, 255) 48%, rgb(174, 235, 223)); color: rgb(23, 27, 43); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 14px; fontWeight: 700; lineHeight: 21px; padding: 10px 12px; gap: 10px; border: 1px solid rgba(214, 186, 255, 0.333); borderRadius: 12px; width: 246px; height: 50px |
| 모바일 390×844 | .small-button | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(130deg, rgba(32, 39, 53, 0.5), rgba(22, 28, 38, 0.5)); color: rgb(228, 228, 244); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 13.6px; fontWeight: 400; lineHeight: 20.4px; padding: 8px 15px; gap: 8px; border: 1px solid rgb(83, 86, 106); borderRadius: 12px; width: 299px; height: 44px |
| 모바일 390×844 | .album-card | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 160.5px; height: 258.078px |
| 모바일 390×844 | .album-art | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px; gap: normal; border: 0px none rgb(245, 245, 252); borderRadius: 11px; width: 160.5px; height: 160.5px |
| 모바일 390×844 | .album-title | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 650; lineHeight: 26.8661px; padding: 0px; gap: 5px; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 128.5px; height: 26.8438px |
| 모바일 390×844 | .home-music-grid | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 0px; gap: 22px 14px; border: 0px none rgb(245, 245, 252); borderRadius: 0px; width: 335px; height: 1658.47px |
| 모바일 390×844 | #global-search | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(130deg, rgb(28, 37, 51), rgb(27, 32, 44)); color: rgb(169, 176, 193); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 14.333px; fontWeight: 400; lineHeight: normal; padding: 8px; gap: 10px; border: 1px solid rgba(255, 255, 255, 0.1); borderRadius: 12px; width: 192px; height: 36px |
| 모바일 390×844 | .tab.active | 표시 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: none; color: rgb(214, 186, 255); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 16.333px; fontWeight: 600; lineHeight: normal; padding: 0px 0px 13px; gap: normal; border: ; borderRadius: 0px; width: 29.4375px; height: 39px |
| 모바일 390×844 | .mobile-navigation | 표시 | backgroundColor: rgba(16, 23, 34, 0.97); backgroundImage: none; color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 5px 8px; gap: normal; border: ; borderRadius: 0px; width: 375px; height: 66px |
| 모바일 390×844 | #dialog | 숨김 | backgroundColor: rgba(0, 0, 0, 0); backgroundImage: linear-gradient(130deg, rgb(25, 34, 47), rgb(17, 25, 34) 75%); color: rgb(245, 245, 252); fontFamily: "DM Sans", "Noto Sans KR", sans-serif; fontSize: 17.333px; fontWeight: 400; lineHeight: normal; padding: 35px; gap: normal; border: 1px solid rgba(183, 182, 255, 0.22); borderRadius: 20px; width: min(520px, 100% - 32px); height: fit-content |

## 불일치와 적용 결정

- 사용자 고정 Accent Mint는 **#8EDDD2**. 현행 --ds-mint/--aqua는 **#AEEBDF**. dist/brand-refinement.css:9의 #8EDDD2가 후순위 dist/design-system.css:3,13에서 덮입니다. 목표 브랜드 민트와 기존 그라데이션 종점을 같은 토큰으로 간주하지 않습니다. 이번에는 CSS를 수정하지 않았습니다.
- 패키지의 100deg #DCC6FF → #BFCBF7 → #B8F1E3는 승인 예시/근사값이고, 실측은 105deg #D6BAFF → #B7B6FF(48%) → #AEEBDF입니다. 현행 .primary-button을 우선 재사용합니다.
- --pink 이름의 실측값은 핑크가 아닌 #D6BAFF입니다. 별도 --page-pink는 #ED91BC. 새 핫핑크를 추정해 넣지 않습니다.
- 홈 album-card는 투명/테두리 없음/모서리 0px이고 썸네일 album-art가 둥근 모서리입니다. --ds-radius-card=16px를 모든 카드 외곽에 강제하지 않습니다.
- 운영 PC 메뉴는 홈, 로컬은 듣기입니다. 새 규칙은 홈을 기준으로 등록하되 기존 작업본의 메뉴를 이번 분석 작업에서 변경하지 않습니다.
- 로컬 홈은 공개 음원이 없는 빈 상태, 운영 홈은 실제 음원 카드입니다. 카드 수/문서 높이/버튼 위치 차이를 디자인 오류로 간주하거나 운영 데이터를 로컬에 복제하지 않았습니다.
- 공개 홈 Veil(Zero) 표기와 보호 문서의 Veil/ZERO 사례는 범위가 다릅니다. 특정 사용자 데이터를 전역 하드코딩하거나 이번에 바꾸지 않습니다.

## 비교 결과

PC/모바일 각각 운영·로컬 실제 캡처를 육안 비교했습니다. 아래 동일 selector의 색·폰트·경계·간격 차이는 표본 간 상태/콘텐츠 차이일 수 있으므로 해당 요소 범위를 먼저 확인합니다.

### PC

공통 셸의 비교 속성(색상/배경/폰트/패딩/모서리/gap)은 일치했습니다.
### 모바일

공통 셸의 비교 속성(색상/배경/폰트/패딩/모서리/gap)은 일치했습니다.

## 검증 한계

- 로그인 후 프로필/선물/결제 팝업의 실제 열린 상태, hover/active/disabled 전체 조합, 재생 중 미니플레이어는 이번에 검증하지 않았습니다. 숨겨진 #dialog 값을 열린 팝업 실측으로 오인하지 않습니다.
- 폰트 패밀리 선언은 확인했지만 개별 글리프에 사용된 실제 폰트 파일은 확인하지 못했습니다.
- 320px 로컬 홈은 viewport=320 / scrollWidth=305로 문서 가로 넘침 없음. 768px는 미검증. 폰/태블릿 실기기 터치·키보드 접근성 전수 검증은 하지 않았습니다.
- 문서만 등록했으므로 화면 차이의 자동 수정은 하지 않습니다. 실측과 다른 가정/예시를 문서에서 바로잡았으며, 실제 화면 변경은 향후 해당 UI 작업에서 이 기준을 따라 수행합니다.
