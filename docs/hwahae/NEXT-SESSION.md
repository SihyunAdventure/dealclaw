# 다음 세션 시작 프롬프트

다음 Claude Code 세션 시작 시 아래 내용을 그대로 복사해서 입력하세요.

---

## 복사용 프롬프트

```
hotinbeauty 화해 크롤러 작업을 이어서 진행한다.

## 현재 상태
- Phase 0 탐색: SIH-566 / PR #17 (chore/sih-566-hwahae-phase0) — 머지 대기 or 머지됨
- Phase 1 스키마: SIH-567 / Draft PR (feat/sih-567-hwahae-schema) — 머지 대기
- 올영 EC2 PR: SIH-557 / PR #16 (feat/SIH-557-oliveyoung-db-ec2) — 병렬 진행 중, 머지 대기

## 확정된 핵심 사실
- 크롤 엔드포인트: GET https://gateway.hwahae.co.kr/v14/rankings/{themeId}/details?page=1&page_size=100
- Playwright 불필요 — bare Node fetch 로 충분
- 카테고리 트리는 SSR `/rankings?english_name=category&theme_id=2` 의 `__NEXT_DATA__.props.pageProps.rankingsCategories` 에서 수집
- 리프 노드 ~557개 × 1 req = 월 85MB, 실행 ~40초 (병렬도 15 안전)
- 스키마 9테이블 + 타입 확정 (`lib/db/schema/hwahae.ts`, `src/crawl/hwahae-types.ts`)
- 가격 3종 nullable 확정 (is_commerce=false 상품 수용)
- 배포 타겟: 맥북 서버 + launchd (AWS EC2/Fargate 아님)

## 참고 문서 (읽고 시작)
- docs/hwahae/phase0/final-report.md — Phase 0 종합
- docs/hwahae/gateway-api.md — 엔드포인트 사양
- docs/hwahae/ROADMAP.md — 남은 Phase 2~5 플랜
- lib/db/schema/hwahae.ts — 확정 스키마
- src/crawl/hwahae-types.ts — 확정 타입

## 다음 작업 (우선순위 순)
1. SIH-568 Phase 2 파서 — src/crawl/hwahae-parser.ts
   - parseRankingDetails(json) → HwahaeRankedProduct[]
   - parseCategoryTree(nextDataHtml) → HwahaeRankingCategoryNode[]
2. SIH-569 Phase 3 크롤러 — src/crawl/hwahae-ranking.ts
3. SIH-570 Phase 4 스토리지 — src/crawl/hwahae-storage.ts + run-hwahae-crawl.ts
4. SIH-571 Phase 5 맥북 launchd 배포
5. SIH-572 연결 (올영 #16 머지 후) — schema.ts re-export + drizzle.config glob + db:push

## 시작 명령
1. gh issue view SIH-568
2. dw-task-start SIH-568 feat hwahae-parser
3. 그 worktree의 docs/hwahae/gateway-api.md 읽고 parser 구현 시작

## 참고
- 지난 세션에서 디스크 공간 99% 상태였음 (4.5Gi only). 새 worktree node_modules 는 symlink 전략 권장
- Phase 0/Phase 1 worktree (sih-566-, sih-567-) 가 아직 로컬에 남아있음 — PR 머지되면 cleanup 가능
```

---

## 세션 시작 시 Claude 가 자동으로 할 일

위 프롬프트를 받으면 Claude 는 다음 순서로 작업:
1. `gh pr list --state open` 으로 현재 PR 상태 확인 (Phase 0/1 머지 여부)
2. `gh issue view SIH-568` 로 다음 작업 스펙 확인
3. `docs/hwahae/gateway-api.md`, `docs/hwahae/ROADMAP.md` 읽기
4. `lib/db/schema/hwahae.ts`, `src/crawl/hwahae-types.ts` 읽기
5. `dw-task-start SIH-568 feat hwahae-parser` 로 worktree 생성 후 구현 시작

## 세션 중단 전 체크 (매 세션 종료 시)

- [ ] 진행 중 작업 브랜치에 uncommitted 변경 없음
- [ ] PR 머지됐으면 로컬 worktree cleanup (`dw-task-end` 또는 수동)
- [ ] Linear 이슈 상태 업데이트 (In Progress → In Review 등)
- [ ] 필요 시 이 문서 업데이트 (새 결정·미해결 질문)
