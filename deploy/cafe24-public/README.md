# AIFECT 카페24 공개 웹 서버

Sites 407번을 기준으로 한 운영 변경입니다. 홈페이지와 공개 곡 목록·상세, 안내 페이지는 기존 도메인을 유지하면서 카페24에서 렌더링합니다. 응답 지연·버전 불일치 시 Sites로 복귀합니다. 로그인, 결제, 관리자, D1, R2는 기존 Sites에 있습니다. 비공개 회원 자료나 운영 비밀값은 이 디렉터리에 없습니다.

- `overlay/` 안은 새 서버·테스트·서비스 설정의 실제 파일입니다.
- `sites-origin.patch`는 기존의 네 파일에 대한 Git 변경입니다. GitHub의 이전 웹 사본에 억지로 적용하지 마세요.
- 공식 Sites 저장소의 기준 커밋은 `sites-base-commit.txt`, 결과 커밋은 `sites-result-commit.txt`입니다.
- 기준 커밋의 깨끗한 작업 디렉터리에서 `git apply --check <sites-origin.patch 경로>`, `git apply <같은 경로>`를 차례로 실행한 뒤 overlay의 내용을 저장소 루트에 복사합니다. 적용한 Git 트리가 실제 배포 소스와 동일한지 검증했습니다.
- 빌드·검증은 `npm run release:prepare`, `npm run release:check`. 설치와 복구 방법은 [운영 설명서](overlay/ops/cafe24/README.md)를 참고하세요.

웹의 일반 이미지 업로드는 브라우저에서 WebP를 시도합니다. 앨범 수정의 PNG·JPEG 호환 경로와 서버에 직접 올리는 일반 앨범·프로필 이미지는 카페24에서 검증·변환을 거친 후 저장합니다. 과거 파일은 이 배포로 다시 쓰지 않습니다.
