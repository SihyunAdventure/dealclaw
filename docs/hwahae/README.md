# 화해(Hwahae) 크롤 — 문서 인덱스

hotinbeauty 서비스의 화해 랭킹·어워드 수집 파이프라인 관련 문서.

## 문서 구성

| 파일 | 내용 | 읽어야 할 시점 |
|---|---|---|
| [phase0/final-report.md](./phase0/final-report.md) | Phase 0 탐색 결과 — 필드 인벤토리, 카테고리 트리, 어워드 | 스키마·파서 설계 시 |
| [gateway-api.md](./gateway-api.md) | gateway.hwahae.co.kr API 사양 (최종 엔드포인트) | 파서·크롤러 구현 시 |
| [ROADMAP.md](./ROADMAP.md) | Phase 2~5 작업 로드맵, 의존성 그래프, 확정 사실 | 전체 진행 상황 확인 시 |
| [NEXT-SESSION.md](./NEXT-SESSION.md) | 다음 세션 재개용 프롬프트 | 세션 시작 시 |

## 빠른 참조

- **엔드포인트**: `GET gateway.hwahae.co.kr/v14/rankings/{themeId}/details?page_size=100`
- **배포 타겟**: 맥북 서버 + launchd
- **크롤 주기**: 매일 06:00 KST (화해 갱신 05:00 KST + 1시간 버퍼)
- **현재 Phase**: 1 (스키마) 완료, 2 (파서) 진행 예정

## 진행 이력

| 이슈 | PR | 결과물 |
|---|---|---|
| SIH-566 Phase 0 탐색 | #17 | `docs/hwahae/phase0/`, `src/scripts/spikes/spike-hwahae-phase0*.ts` |
| SIH-567 Phase 1 스키마 | Draft | `lib/db/schema/hwahae.ts`, `src/crawl/hwahae-types.ts`, `src/scripts/test-hwahae-schema-fixtures.ts` + `src/scripts/spikes/spike-hwahae-{coverage,pagination,exists,ec2-fetch}.ts` |
