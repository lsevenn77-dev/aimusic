# AIFECT 상품 제작 표준 v2.0.0

선물, 프로필 테두리, 방 테마는 상품 하나당 ZIP 하나로 납품합니다. 이 표준은 매니페스트 v2, 애니메이션 설정 v1, 아래 렌더러 v1을 사용하는 등록 API와 제작 도구에 적용됩니다. 출시 여부와 플랫폼 검수 결과는 상품의 버전 화면에서 확인합니다.

## 제작과 등록

1. 아래 표를 보고 유형과 렌더 방식을 선택합니다. 제작 원본은 `originals/`, 운영 이미지와 효과는 `assets/`에 둡니다. `product.json`에 상품과 파일 역할을 지정합니다.
2. 작업 폴더에서 패키징 도구를 실행합니다. 도구가 이미지의 형식, 가로·세로 크기, 프레임 수, 바이트 수, SHA-256을 읽어 `manifest.json`을 만들고 완성 ZIP을 재검사합니다.
3. 어드민 **상품 관리 → 상품 등록**에서 ZIP을 선택합니다. 매니페스트가 상품 유형·대표·본체·배경·카드·효과·대체 이미지를 연결합니다. 추천 상품명, 설명, 기본 패널은 초안에 입력됩니다. 가격, 통화, 이용 기간과 판매·발송 설정은 어드민에서 결정합니다.
4. ZIP 검사와 대표 이미지를 확인해 초안을 저장합니다. 수정 화면과 상세 보기에서도 같은 ZIP으로 버전을 교체할 수 있습니다. 어드민의 검수 버전에서 이전·신규 버전을 확인하고, 승인된 빌드의 실제 화면과 미리보기를 비교합니다.
5. PC 웹·모바일 웹·Android·iOS의 필수 검수가 모두 통과하면 에셋을 적용합니다. 판매 재개와 관리자 발송 허용은 별도 작업이며 에셋 적용만으로 시작하지 않습니다.

여러 상품은 **ZIP 일괄 등록**에서 최대 10개를 선택합니다. 개별 ZIP을 한 번 더 묶을 경우 바깥 ZIP 루트에는 상품 ZIP만 넣고 전체를 8 MiB 이하로 유지합니다. 기존 상품을 일괄 교체할 ZIP은 정확한 `productId`를 넣습니다. 어드민에서 항목별 기본 정보와 연결 대상을 확인한 뒤 초안 또는 버전으로 저장합니다.

## 실제 지원 렌더러

| 유형 | 방식 | `renderer.id` | 필수 역할 |
|---|---|---|---|
| 선물 | `static` | `gift-standard` | `base`, `thumbnail` |
| 선물 | `layered` | `gift-overlay` | `base`, `thumbnail`, `effect`, `fallback` |
| 선물 | `animated` | `gift-standard` | `base`, `thumbnail`, `fallback` |
| 테두리 | `static` | `frame-static` | `base`, `thumbnail` |
| 테두리 | `layered` | `frame-overlay` | `base`, `thumbnail`, `effect`, `fallback` |
| 테두리 | `animated` | `frame-overlay` | `base`, `thumbnail`, `fallback` |
| 테마 | `static` | `room-background` | `desktop`, `mobile`, `roomCard`, `thumbnail` |
| 테마 | `layered` | `room-overlay` | 정적 테마 역할과 `desktopEffect`, `mobileEffect` |

`renderer.version`은 정수 `1`입니다. 정적 역할은 단일 프레임 WebP입니다. `thumbnail`과 `roomCard`는 정사각형이며, 같은 파일을 여러 역할에 연결할 수 있습니다. 움직이는 선물과 테두리의 분리형은 정적 `base`와 투명 Animated WebP `effect`를 겹칩니다. 분리형의 `fallback`은 `base`와 같은 파일입니다. `animated`의 `base`는 Animated WebP이고 `fallback`은 같은 캔버스의 정적 WebP입니다.

움직이는 상품만 `animation.json`을 추가합니다. 설정은 `schemaVersion: 1`, `playback: "event"`(선물) 또는 `"visible"`(테두리·테마), `layers`(움직이는 역할 이름 배열)로 구성합니다. 재생 타이밍은 승인된 Animated WebP의 프레임 간격에 담습니다. 선물은 반복 횟수 1, 프레임 간격 20 ms 이상, 총 4.5초 이하로 내보냅니다. 화면에 계속 표시되는 테두리와 테마는 프레임 간격 34 ms 이상, 반복 횟수 0으로 인코딩합니다. 효과 위치와 합성 순서는 캔버스에 제작합니다. 외부 URL, 스크립트, 실행형 파일, 임의 파티클 설정은 허용되지 않습니다.

## 캔버스와 구도

- **선물**은 512×512 투명 원본을 권장합니다. 본체·효과는 같은 정사각형 캔버스에서 내보내고, 대표 이미지는 256×256을 권장합니다. 연출의 여백은 방의 실제 선물 표시 영역을 기준으로 확인합니다.
- **테두리**는 512×512 투명 원본을 권장합니다. 중앙의 너비와 높이 각각 33–67% 구간에서 알파 값이 12/255를 초과하면 재검사가 필요합니다. 공통 아바타 캔버스의 피벗은 정중앙이고 적용 배율은 1.5입니다. 중앙 사진과 마이크·음소거·방장 표시는 템플릿으로 확인합니다.
- **테마**는 가로형 2560×1440, 세로형 1080×2400, 정사각형 대표·방 카드 원본 1200×1200을 권장합니다. 각 방향으로 별도 구도를 제작하고 UI를 합성하지 않습니다. 정사각형 카드와 대표를 같은 파일로 연결할 수 있습니다.
- 선택 역할 `app`은 좁은 앱 화면에서 별도 구도가 필요할 때만 추가합니다. `desktopLow`, `mobileLow`, `appLow`는 각 기본 배경보다 작은 동일 비율 변형입니다. 선택적 `appEffect`, `desktopEffectLow`, `mobileEffectLow`, `appEffectLow`는 대응 배경과 가로·세로 픽셀이 같아야 합니다. 앱 구도에 효과를 만들지 않은 경우 앱은 정적 배경을 표시할 수 있습니다.
- 테마의 `layout` 항목은 `desktop`, `mobile`, `app`별로 `fit`(`cover` 또는 `contain`), `focus`([x, y]), `safe`([왼쪽, 위, 오른쪽, 아래])를 지정합니다. 좌표는 원본 캔버스 기준 0~1입니다. 예를 들어 `{"fit":"cover","focus":[0.55,0.5],"safe":[0.35,0.31,0.77,0.67]}`은 달과 중요한 주변 피사체를 자르지 않게 보호합니다. 입력이 없으면 중앙 정렬과 전체 이미지 보호를 적용합니다. 배경과 효과는 같은 크롭 변환을 사용합니다.
- 실제 방 콘텐츠 너비가 600 CSS px 또는 dp 이상이고 가로세로비가 1.1 이상이면 가로 구도를 먼저 검사합니다. 그 외에는 세로 구도, 또는 앱 전용 구도가 있으면 세로 앱 구도를 먼저 확인합니다. 보호 영역을 자르는 경우 대체 구도나 `contain`을 적용합니다. DPR·저데이터·저전력·동작 감소 조건에 따라 경량 파일이나 정적 표시를 선택할 수 있습니다. 밝기는 앱이나 패널에 맞춰 원본 전체를 재보정하지 않습니다.
- [제작용 레이아웃 템플릿](layouts/README.md)에서는 제작 이미지와 UI 가이드를 서로 다른 레이어에 배치해 구도를 확인합니다.

## 파일 형식과 검사 제한

| 항목 | v2 등록 한도 |
|---|---|
| ZIP | 8 MiB, 해제 합계 24 MiB, 파일·디렉터리 항목 48개, 이미지 선언 42개 |
| 이미지 | 파일당 5 MiB, 한 변 4096px, 120프레임 이하, 전체 디코딩 16,000,000px 이하 |
| JSON | `manifest.json` 16 KiB, `animation.json` 2 KiB |
| 파일 경로 | 루트의 JSON 두 종, 이미지 폴더 `assets/` 또는 `originals/`, 하위 `effects/`만 지원 |
| 이미지 확장자 | 운영 WebP, 제작 원본 PNG·WebP·JPG·JPEG·GIF. 소문자 확장자 사용 |
| 원본 | `author` ZIP은 실제 원본을 포함하거나 `sourceException`에 미보유 사유를 기입 |

압축 형식은 저장형 ZIP과 Deflate ZIP입니다. 암호화, 다중 볼륨, 중복·대소문자 충돌, 상대 경로 탈출, 링크, 미선언 파일, 임의 중첩 압축은 검사를 통과하지 못합니다. 파일별 압축 해제 크기는 압축 바이트의 300배 또는 64 KiB 중 큰 값을 넘길 수 없습니다. 운영 자료와 원본은 서로 다른 경로에서 선언합니다. 미리보기 이미지나 확대 보간본을 제작 원본으로 표시하지 않습니다.

제작 도구는 정적 파생본을 sRGB로 변환하고 EXIF 방향을 적용하며, 비율을 유지하고 확대하지 않습니다. 이미 만든 WebP를 `assets/`에 직접 배치한 경우 원래 바이트를 보존합니다. 서버는 ZIP을 다시 열어 선언한 메타데이터와 실제 이미지 디코딩·해시를 검사합니다. 서비스에서 표시할 때 재인코딩을 수행하지 않습니다. 검사 서비스 오류가 발생하면 ZIP과 활성 버전은 그대로 두고 재시도할 수 있습니다. [Cloudflare Workers 리소스 한도](https://developers.cloudflare.com/workers/platform/limits/) · [R2 Workers 바인딩](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)

## 매니페스트와 제작 도구

제작 키트 루트에서 **Node.js 24**와 npm을 사용합니다. 한 번 설치하면 이후 새 상품 등록에 개발 작업은 필요하지 않습니다.

```powershell
npm --prefix ops/cafe24 ci
node authoring/product-assets.mjs pack ./my-product ./my-product-2.0.0.zip
node authoring/product-assets.mjs verify ./my-product-2.0.0.zip
```

제작 폴더의 `product.json`은 아래와 같이 작성합니다. 같은 작업에서 자동으로 만들 파일에만 `derive`를 추가합니다. `width`·`height`는 최대 파생 크기이고 `quality`는 선택값입니다. 효과·움직이는 본체는 제작 툴에서 투명 Animated WebP로 먼저 내보내고 `assets/effects/` 등에 배치합니다.

```json
{
  "schemaVersion": 2,
  "assetVersion": "2.0.0",
  "productType": "gift",
  "packageKind": "author",
  "renderMode": "static",
  "renderer": { "id": "gift-standard", "version": 1 },
  "metadata": { "name": "유리 리본", "description": "시원한 청록 리본" },
  "assets": { "base": "assets/base.webp", "thumbnail": "assets/thumbnail.webp" },
  "originals": ["originals/base.png"],
  "derive": [
    { "from": "originals/base.png", "to": "assets/base.webp", "width": 384, "height": 384 },
    { "from": "originals/base.png", "to": "assets/thumbnail.webp", "width": 256, "height": 256 }
  ]
}
```

스키마와 레지스트리는 키트의 `shared/product-assets/`에 있습니다. 단일 파일 규칙은 `manifest.schema.json`과 `animation.schema.json`, 렌더러와 역할 간 제약은 `renderer-registry.json` 및 동일하게 사용되는 제작·서버 검증기에서 확인합니다. `productId`는 기존 상품을 교체할 때 해당 ID를 적고 신규 상품에서는 생략합니다. 내부 버전 ID는 등록 서버가 만들며, `assetVersion`은 제작자가 관리합니다. 같은 상품의 같은 ZIP은 기존 버전을 반환하고, 같은 제작 버전에 다른 ZIP을 등록하면 충돌을 알립니다.

## 보존, 다시 등록, 오류 해결

- **원본 ZIP 다운로드**는 처음 업로드한 동일 바이트를 내려받습니다. 서버가 SHA-256을 확인하고 관리자 조회 이력을 남깁니다. 제작 원본 선언이 없는 ZIP은 **업로드 ZIP 보유 · 제작 원본 미보유**로 표시됩니다.
- **운영 ZIP 다운로드**는 해당 버전의 운영 이미지와 설정, 파일 메타데이터로 `packageKind: "operating"` ZIP을 만듭니다. ZIP을 새로운 초안에 등록할 수 있습니다. 같은 상품에 새 버전으로 올릴 경우 제작 버전을 올리고 대상 ID를 지정합니다. 이전 버전의 제작 원본은 그대로 보존됩니다.
- **검토 전용 ZIP**은 `packageKind: "review"`, `reviewOnly: true`, `releaseReady: false` 가운데 하나로 지정합니다. 등록과 확인에 사용할 수 있고 운영 적용은 차단됩니다.
- **새 파생본을 다시 만들 때**는 새 작업 복사본을 사용하거나 기존 파생본을 다른 이름으로 옮깁니다. 제작 도구는 파생본과 완성 ZIP을 실수로 덮어쓰지 않습니다.
- **검사 실패**는 표시된 역할, 실제 이미지 형식, 캔버스 크기와 프레임 수를 확인합니다. 프레임 중앙 투명도가 부족하면 제작 원본에서 중심을 수정합니다. 파일에 직접 손댄 뒤에는 패키징 도구를 다시 실행해 해시를 갱신합니다.
- **버전 복원**은 버전 화면에서 대상 파일의 무결성과 필요한 검수를 확인한 뒤 이전 적용 버전으로 전환합니다. 이미 진행 중인 방에는 적용 당시 선택한 배경·효과 버전이 함께 유지됩니다.

## 등록 검증용 샘플

`authoring/samples/`의 `gift-static.zip`, `gift-layered.zip`, `frame-static.zip`, `frame-layered.zip`, `theme-static.zip`, `theme-layered.zip`에 원본 PNG, 운영 WebP, 실제 해시와 설정이 들어 있습니다. 두 테마 모두 가로·세로·정사각형 카드·대표 역할을 제공하며, 분리형 테마는 각 방향의 효과도 포함합니다. 샘플은 격리된 등록·미리보기 검수에 사용합니다. 매장 판매나 실기기 렌더링 승인은 각 버전의 검수 기록에서 확인합니다.
