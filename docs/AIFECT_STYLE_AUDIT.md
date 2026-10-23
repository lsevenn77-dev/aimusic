# 실제 AIFECT CSS 자동 실측 방법

이 안내는 **코덱스가 실제 사이트/저장소에 접근하는 개발 PC에서 실행할 절차**다. 작성 환경에서 AIFECT 로그인 화면·계산된 CSS 값을 직접 측정하지 못했으므로 실제 스타일은 **이 결과로 확정해야 한다**.

## A. 코드 우선 확인

1. 홈을 실제 렌더하는 소스 파일을 찾는다. 기존 `.css`, `.scss`, CSS-in-JS, theme, `:root`, `tailwind.config` 등을 탐색한다.
2. 공통 `Button`, `Tabs`, `Card`, `Modal`, `Navbar/Sidebar`, `Player`, `Input`, `Badge` 컴포넌트와 활성/비활성 상태를 확인한다.
3. 각 컴포넌트의 실제 파일과 적용 CSS 라인을 정리한다. 컴포넌트가 없다면 현재 쓰는 CSS 클래스를 재사용한다.

## B. Playwright로 공개 화면 자동 캡처

Node.js와 Playwright가 실제 프로젝트에 이미 있으면 그것을 사용한다. 없다면 새 의존성이 필요한지 먼저 판단하고, **사용자 허락 없이 운영 앱에 불필요한 패키지를 추가하지 말 것**. 별도의 임시 분석 환경에서 실행 가능.

```sh
npm install --no-save playwright
npx playwright install chromium
node scripts/audit-aifect-ui.mjs
```

운영 사이트가 아닌 로컬 개발 서버를 측정하려면:

```sh
AIFECT_AUDIT_URL=http://localhost:4174/#home node scripts/audit-aifect-ui.mjs
```

PowerShell:

```powershell
$env:AIFECT_AUDIT_URL='http://localhost:4174/#home'
node scripts/audit-aifect-ui.mjs
```

기본 결과는 `audit-output/aifect-style-desktop.json`, `audit-output/aifect-style-mobile.json`, `audit-output/home-desktop.png`, `audit-output/home-mobile.png`. 비밀번호·세션/사용자 토큰은 출력하지 않으나 **화면에 개인 정보가 보일 수 있으므로 캡처를 공개 Git에 올리지 말 것**.

## C. 사람이 확인할 필수 항목

- 배경: `body`, `.app-shell`, 헤더, PC 사이드바, 주요 패널, 모바일 하단 내비게이션
- 브랜드: 로고·민트·핑크·선택 상태·CTA 배경(그라데이션 포함)
- 텍스트: fontFamily/size/weight/lineHeight/color
- 컴포넌트: padding/gap/borderRadius/border/shadow/button height/icon 크기
- 반응형: 1440×900 및 390×844. 768px와 320px에서 잘림 여부 추가 점검
- 팝업: 실제 사이트 CTA(그라데이션 포함), 닫기·포커스·스크롤

## D. 측정값을 규정에 반영하는 방식

`reference/VERIFIED_SITE_TOKENS.md`를 만들어 **컴포넌트 / 속성 / 정확한 값 / CSS 출처(파일:라인) 또는 computed CSS 캡처 시각 / 확인 수준 / 예외**를 표로 작성한다.

같은 컴포넌트가 상태별로 다르면 정상/hover/active/disabled를 구분한다. 서버에 운영되는 홈과 로컬 소스 CSS가 다를 경우 차이를 표시하고 임의로 하나를 덮어쓰지 않는다.

### 수용 기준

스타일 가이드를 넣은 뒤에도 기존 홈의 레이아웃·색·폰트는 그대로여야 한다. 신규 페이지는 같은 UI 부품과 CSS 토큰을 사용해야 한다. 최종 사용자 승인 전까지 전역 테마 자동 치환 금지.


## 2026-10-23 프로젝트 등록 및 실측 보충

이 문서의 원문 검증 상태는 패키지 작성 시점의 기록입니다. 최신 실측 결과와 운영/로컬 차이 및 한계는 [VERIFIED_SITE_TOKENS](../reference/VERIFIED_SITE_TOKENS.md)를 먼저 확인하세요. 이번에는 Codex 브라우저의 읽기 전용 computed style 측정을 사용했고, 동봉 Playwright 스크립트는 실행하지 않았습니다. 불필요한 의존성은 추가하지 않았습니다. 폰트/색상 예시와 실제 값이 다른 경우 실제 컴포넌트를 우선 재사용하며 전역 자동 치환하지 않습니다.

## 프로젝트 실제 구현 지도

React 컴포넌트 라이브러리가 아니라 dist/의 HTML + 일반 JavaScript 렌더 함수와 여러 CSS 파일의 cascade로 구성됩니다. 빌드 결과 dist/client는 편집 원본이 아닙니다.

| 영역 | 원본/재사용 지점 | 주의 |
|---|---|---|
| 공통 토큰 | dist/design-system.css:2–19 | 이전 brand-refinement.css 토큰을 후순위에서 덮음 |
| 폰트 로딩/스타일 순서 | dist/index.html:14–49, scripts/client-bundle.mjs | DM Sans/Noto Sans KR, Manrope는 브랜드용. 뒤에 오는 CSS와 specificity 확인 |
| 기본 셸/간격 | dist/style.css:1, dist/brand.css:2, dist/mobile-ux.css | style.css 한 파일만 읽고 실제 값을 단정하지 않음 |
| 버튼 | dist/design-system.css:49–64, .primary-button/.small-button/.icon-button | 국소 화면 selector가 덮는 경우 실제 computed style 우선 |
| 카드 | dist/app.js:67 card(t), cover(t), .album-card/.album-art | 실제 음원 DTO와 기존 data-play를 유지 |
| 팝업 | dist/app.js:128 dialog(html), dist/index.html #dialog, dist/design-system.css:115 | PC 중앙 모달 및 화면별 모바일 sheet 규칙이 공존 |
| 아이콘 | dist/app.js icons()/icon(), 기존 SVG 자산 | 신규 라이브러리/이모지 대체 금지 |
| 사이드바/하단 메뉴 | dist/index.html, dist/design-system.css:30–46 | 기존 순서/크기/선택 표시 보존 |
| 플레이어 | dist/player-shell.css, dist/player-queue.css, dist/player-progress.css | 재생 상태별 UI, 숨김 DOM 값을 실재생 상태로 보고하지 않음 |
| 커뮤니티 국소 스타일 | dist/community-v3.css | 이전 작업의 미커밋 변경. 이 규칙 등록에서 재디자인하지 않음 |

## 향후 작업의 자동 적용 범위

프로젝트 루트 AGENTS.md를 읽는 코딩 에이전트가 UI 수정 전에 필수 문서 2개와 VERIFIED_SITE_TOKENS.md를 확인하도록 등록했습니다. 런타임 CSS 생성/전역 토큰 교체/자동 배포 기능은 추가하지 않습니다. 별도 checkout이나 다른 대화에서 원격 소스를 새로 받는 경우 이 문서 변경을 먼저 반영해야 합니다. 현재 로컬 등록만으로 다른 저장소에 자동 전파되지는 않습니다.
