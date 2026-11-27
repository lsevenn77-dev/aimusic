# AIFECT 카페24 공개 웹 서버

## 운영 Sites와 Cafe24 동시 배포

메인 PC에서도 `main`을 받은 이 저장소를 Codex 작업 루트로 엽니다. 여기서 배포 도구 경로를 확보하고, 공식 Sites 소스 도구로 연 별도 체크아웃에서 빌드와 배포 명령을 실행합니다. 현재 게시 버전과 소스 커밋을 먼저 확인합니다.

작업 PC에는 Node.js, Git, `tar`, OpenSSH 클라이언트가 필요합니다. `cafe24` 별칭에는 그 PC의 접근 권한과 검증된 서버 호스트 키를 설정합니다. 개인키는 각 PC에서 보관합니다. 배포 전 기존 연결을 아래 명령으로 확인할 수 있습니다.

```powershell
$workflowRoot = (git rev-parse --show-toplevel).Trim()
$cafe24Deploy = Join-Path $workflowRoot 'deploy/cafe24-public/deploy-cafe24.mjs'
$pushRelease = Join-Path $workflowRoot 'deploy/push-release.mjs'
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes cafe24 true
```

1. 공식 Sites 체크아웃에서 `npm run release:prepare`를 실행합니다. 검증한 산출물로 공식 Sites 도구가 반환한 전체 `commit_sha`와 게시 아카이브의 로컬 경로를 확보합니다. 검증과 패키징 사이에 빌드 산출물을 바꾸면 다시 검증합니다. 이 체크아웃에서 `npm run release:check`가 통과해야 합니다.
2. `$commitSha`에 공식 도구의 전체 SHA를, `$sitesArchive`에 같은 빌드의 게시 아카이브 경로를 넣고 아래 순서로 실행합니다. `stage`는 아카이브의 Worker 리비전과 HTML을 대조한 뒤 Cafe24의 별도 릴리스에 설치해 격리 렌더링을 검사합니다. 출력의 `previousRelease`와 `revision`을 저장하고 GitHub 동기화 출력의 브랜치와 커밋을 기록합니다.

   ```powershell
   node $cafe24Deploy stage $commitSha $sitesArchive
   node $pushRelease web $commitSha
   ```

3. 준비와 GitHub 확인을 마치면 공식 Sites 절차로 같은 버전을 저장하고 게시합니다. 배포 성공과 실제 운영 게시본의 소스 커밋이 `$commitSha`와 일치하는지 확인합니다. 다른 버전이 동시에 게시되면 운영 버전과 산출물을 다시 대조합니다.
4. `$previousRelease`에는 `stage`가 출력한 경로를 넣고 전환합니다. 도구는 이전 릴리스 디렉터리를 보존하고 `aifect-public-origin.service`만 재시작합니다. 전환 이후 검증에 실패하면 이전 Cafe24 릴리스로 복구를 시도하고 결과를 출력합니다.

   ```powershell
   node $cafe24Deploy activate $commitSha $sitesArchive $previousRelease
   ```

5. 운영 홈 `/`과 `/music` 모두 HTTP 200, `x-aifect-web-origin: cafe24`, 준비한 리비전과 같은 `x-aifect-origin-revision`을 반환해야 완료로 기록합니다. 공식 Sites 체크아웃의 `npm run release:verify`로 기존 검증도 수행합니다. 기록한 리비전의 헤더를 읽기 전용으로 재확인할 때는 `node $cafe24Deploy verify $revision`을 실행합니다.

## Sites 407번 기준 자료

Sites 407번을 기준으로 한 운영 변경입니다. 홈페이지와 공개 곡 목록·상세, 안내 페이지는 기존 도메인을 유지하면서 카페24에서 렌더링합니다. 응답 지연·버전 불일치 시 Sites로 복귀합니다. 로그인, 결제, 관리자, D1, R2는 기존 Sites에 있습니다. 비공개 회원 자료나 운영 비밀값은 이 디렉터리에 없습니다.

- `overlay/` 안은 새 서버·테스트·서비스 설정의 실제 파일입니다.
- `sites-origin.patch`는 기존의 네 파일에 대한 Git 변경입니다. GitHub의 이전 웹 사본에 억지로 적용하지 마세요.
- 공식 Sites 저장소의 기준 커밋은 `sites-base-commit.txt`, 결과 커밋은 `sites-result-commit.txt`입니다.
- 기준 커밋의 깨끗한 작업 디렉터리에서 `git apply --check <sites-origin.patch 경로>`, `git apply <같은 경로>`를 차례로 실행한 뒤 overlay의 내용을 저장소 루트에 복사합니다. 적용한 Git 트리가 실제 배포 소스와 동일한지 검증했습니다.
- 빌드·검증은 `npm run release:prepare`, `npm run release:check`. 설치와 복구 방법은 [운영 설명서](overlay/ops/cafe24/README.md)를 참고하세요.

웹의 일반 이미지 업로드는 브라우저에서 WebP를 시도합니다. 앨범 수정의 PNG·JPEG 호환 경로와 서버에 직접 올리는 일반 앨범·프로필 이미지는 카페24에서 검증·변환을 거친 후 저장합니다. 과거 파일은 이 배포로 다시 쓰지 않습니다.
