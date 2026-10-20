# 더빙 스튜디오 운영 적용안

2026-10-20 KST. 사용자가 운영 배포·독립 합성 서버·AI/Pika와 50G 활성화를 승인했다. 175번 웹/DB 배포는 성공했고 독립 합성 서버가 실행 중이다. 장르 탐색 추가분과 환경 변수 revision 24를 적용하는 최종 배포를 준비했다. 최종 배포 영수증은 `work/release-176.json`에 별도로 기록한다.

## 반영할 기능

- 장르·인원·30초~5분·세부사항 입력으로 AI 대본 생성. 하루 무료 1회.
- `배역: 대사`, 배역별 색상과 현재 대사 흰색, PC 대사 10줄.
- 음향 제작 기본 50 Gold, 사전 금액 확인, 실패 시 구매분별 1회 환급.
- 배역 예약·대사별 녹음/재녹음·임시 저장·최종 합성·공동 공개.
- 좋아요·댓글·권리 신고/이의신청, 관리자 가격·비용·실패 작업 관리.
- 광고 추가 4회는 Google 승인 및 실제 광고 단위 검증 전까지 비활성.
- SF·이세계물·판타지·사극·로맨스·액션 등 13개 장르 탐색. 같은 장르에서 참여 가능한 극본/완성된 더빙 전환, 새로 시작할 때 장르 자동 선택.

## 승인 대상과 실행 순서

최초 요구사항의 별도 승인 조건은 사용자의 “응 그렇게해”로 충족됐다. 아래 실행 순서와 승인 범위를 기록한다.

1. 기존 공개 Sites 프로젝트 `appgprj_6aa56aec3434819186f9a42d9a557520`에 저장한 준비 버전을 배포한다. 기존 공개 접근과 aifect.co.kr 도메인은 유지한다. 배포에 포함된 더빙 DB 변경은 **0052~0059**이며 기존 0051 토킹룸 권한 테이블은 그대로 둔다.
2. 기존 서버에 독립 `aifect-dubbing` Compose 프로젝트를 추가한다. 기존 음악·가사·결제 서비스는 건드리지 않는다. 이 단계까지 더빙 활성화 값은 꺼 둔다.
3. 승인받아 확보한 OpenAI/Pika 키를 Sites의 서버 Secret으로만 연결한다. 기존 환경 변수를 삭제하거나 다른 서비스 키로 덮어쓰지 않는다. 합성 서버에는 기존 AIFECT_ORIGIN/TRANSCODER_TOKEN만 필요하다.
4. 합성 서버와 저장소 연결 확인 후 `DUBBING_ENABLED`, `DUBBING_SOUND_ENABLED`, `DUBBING_RECORDING_ENABLED`, `DUBBING_AI_ENABLED`, `DUBBING_PAID_API_ENABLED`, `DUBBING_GOLD_ENABLED`를 활성화한다. 이때부터 이용자의 AI 요청은 실제 API 비용을 발생시키며 음향 제작 확인 시 기본 50G가 차감된다.
5. `DUBBING_REWARDED_ADS_ENABLED=false`는 유지한다. 웹 광고 승인과 실제 `/NETWORK_CODE/AD_UNIT` 확보 후 별도로 검증한다. 기존 앱 AdMob ID는 사용하지 않는다.

## 서버 구성

`transcoder/`의 다음 파일만 독립 `/root/aifect-dubbing`에 배치한다:

`worker.py`, `archive.py`, `premium.py`, `dubbing.py`, `Dockerfile.dubbing`, `compose.dubbing.yml`.

기존 서버의 `/root/aifect/.env`에서 **AIFECT_ORIGIN와 TRANSCODER_TOKEN 두 항목만** 서버 안에서 전달한다. 값은 출력·Git 저장하지 않고 새 `.env` 권한은 0600으로 유지한다.

```sh
cd /root/aifect-dubbing
docker compose -p aifect-dubbing -f compose.dubbing.yml config --quiet
docker compose -p aifect-dubbing -f compose.dubbing.yml up -d --build dubbing
docker compose -p aifect-dubbing -f compose.dubbing.yml ps
```

Python 3.12/FFmpeg, 비루트·읽기 전용 파일시스템, CPU/메모리/PID 제한, 외부 공개 포트 없음. HTTP 요청/파일 저장은 작업 임대 토큰으로 제한한다.

## 검증 결과와 한계

- 더빙·토킹룸·채팅·댓글·신고·관리자·기존 결제 회귀 176개 통과.
- 별도 HTTP/FFmpeg 전체 처리 1개 통과: 배경 생성→2개 배역 WAV 저장→최종 AAC 업로드→공개 재생. 실제 음성·API 결제 없음.
- 로컬 D1 마이그레이션 전체 적용, 스키마 추가 생성 없음, 기존 SQL 보존 확인.
- 실제 사용자의 마이크·이어폰 청취와 실광고 보상 확인은 미검증.
- 로컬 Mac에 Docker 실행 환경이 없어 컨테이너 이미지 빌드는 운영 적용 단계에서 검증한다. Python/FFmpeg 실제 처리 자체는 로컬 통과했다.
- 운영 서버에서 Docker 이미지 빌드·기동 확인. UID 10001, 재시작 0회, 기존 음악·가사·결제 서비스 유지.
- 운영 컨테이너 안에서 합성 신호만 사용한 FFmpeg 테스트 5개 통과: 공유 시계 배치·무음·페이드/덕킹·출력 피크·최대 대사 수. 운영 DB나 유료 생성은 사용하지 않았다.
- 추가 장르 필터·상태 분리·비공개/차단 보호·페이지 나누기 테스트 포함 관련 32개 통과. PC와 390px 모바일에서 필터 전환 및 선택 장르 이어가기 확인.
- 장르 선택 버튼/폼과 패널 여백을 축소했다. 모바일 390px에서 14개 선택지(전체 포함)가 3줄로 표시된다.
- OpenAI 모델 조회 HTTP 200. 이번 배포 확인에서는 추가 유료 생성과 실제 이용자 Gold 차감을 실행하지 않았다.

## 중단·복구

문제가 발생하면 새 요청을 막도록 더빙 활성화 값을 끄고 독립 더빙 서비스만 정지한다. 원본 음성·대본·결제 원장은 삭제하지 않는다. 확정된 차감은 기존 실패 환급/관리자 조회로 추적한다. 유료 API 결과 불명 작업을 자동 재전송하지 않는다.

이전 웹 버전은 174번, 원본 커밋은 `c705ab169d426021241ce0f4cdadb1841f690e4d`이다. 웹 버전 복귀와 DB 복원은 서로 다르다. 새 더빙 데이터가 있는 DB에 역방향 DROP SQL을 실행하지 않는다.
