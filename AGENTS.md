# AIFECT 작업 지침

## 운영 Sites와 Cafe24 동시 배포

- AIFECT 운영 Sites를 게시하는 작업은 [Sites·Cafe24 배포 절차](deploy/cafe24-public/README.md#운영-sites와-cafe24-동시-배포)를 따른다. 어느 PC에서 작업하든 이 저장소의 `main`에서 배포 도구를 읽고 공식 Sites 체크아웃에서 운영 산출물을 만든다.
- 같은 빌드에서 만든 Sites 아카이브와 Cafe24 렌더러를 짝지어 배포한다. Sites 게시 전에 Cafe24의 별도 릴리스에 설치하고, 공식 게시 성공 및 소스 커밋 확인 후 렌더러를 전환한다.
- 이전 Cafe24 릴리스는 롤백용으로 보존한다. `npm run release:verify` 통과 후 공용 도구의 `confirm`으로 현재 공식 Sites 게시본, Cafe24 실행 프로세스, GitHub 배포 ref를 대조한다. 홈과 `/music`이 준비 리비전으로 응답하고 `confirmed` JSON 기록이 생성된 뒤 완료를 보고한다.
- 배포의 범위와 운영 DB 변경 승인은 사용자 요청 및 공식 Sites 체크아웃의 절차를 따른다. 이 저장소에 지침이나 스크립트를 반영하는 작업은 GitHub에서 검증한다.

## 배포 소스의 GitHub 동기화

- 웹, Android, iOS의 실제 배포에는 `deploy/push-release.mjs`를 사용해 `lsevenn77-dev/aimusic`의 원격 커밋을 확인한다. 웹은 공식 Sites 도구의 전체 `commit_sha`, Cafe24는 설치 산출물을 만든 전체 소스 SHA를 사용한다. 앱은 제출할 빌드를 만든 전체 SHA를 사용한다.
- 같은 배포 소스의 Git 체크아웃에서 도구를 실행하고 출력된 원격 브랜치와 커밋을 결과에 기록한다. 웹 배포 흐름은 위 Sites·Cafe24 배포 절차를, 앱 배포는 해당 플랫폼 절차를 따른다.
