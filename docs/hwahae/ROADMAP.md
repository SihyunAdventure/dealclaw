# 화해 크롤 구현 로드맵

SIH-566 (Phase 0 탐색) 완료, SIH-567 (Phase 1 스키마) 완료 시점 기준 남은 작업.

## 완료

| Phase | 이슈 | 산출물 | 상태 |
|---|---|---|---|
| 0. 탐색 | SIH-566 | `docs/hwahae/phase0/final-report.md`, spikes | ✅ PR #17 |
| 1. 스키마 | SIH-567 | `lib/db/schema/hwahae.ts` 9테이블, `src/crawl/hwahae-types.ts`, smoke test | ✅ Draft PR |

## 진행 예정

| Phase | 이슈 | 작업 | 예상 |
|---|---|---|---|
| 2. 파서 | **SIH-568** | `src/crawl/hwahae-parser.ts` — gateway API 응답 → `HwahaeRankedProduct` 매핑. 카테고리 트리 추출기 (`SSR __NEXT_DATA__` → `HwahaeRankingCategoryNode[]`) | 2h |
| 3. 크롤러 | **SIH-569** | `src/crawl/hwahae-ranking.ts` — 트리 수집 + 리프 순회 + 병렬도 15 + exponential backoff retry + 에러 로깅 | 3h |
| 4. 스토리지 | **SIH-570** | `src/crawl/hwahae-storage.ts` — `upsertHwahaeProducts`, `insertRankingSnapshots`, `upsertBrands`, `insertProductTopics`, `recordCrawlRun`. `src/scripts/run-hwahae-crawl.ts` 엔트리 | 1h |
| 5. 배포 | **SIH-571** | 맥북 launchd plist + 환경변수 + 로그 로테이션 | 1h |
| 연결 | **SIH-572** | 올영 분리 PR(#16) 머지 후 `lib/db/schema.ts` re-export + `drizzle.config.ts` schema glob 확장 + `npm run db:push` | 30m |

## 의존성 그래프

```
SIH-566 (PR #17) ──┐
                    ├─→ SIH-567 (PR #Draft) ──→ SIH-568 ──→ SIH-569 ──→ SIH-570 ──→ SIH-571
                    │                                             └──→ SIH-572 (+올영 #16)
SIH-557 (PR #16) ──┘
```

- SIH-567 파일 3개 (스키마·타입·smoke)만으로 SIH-568/569/570 구현 가능 (DB push 없이도)
- SIH-572 는 올영 PR #16 머지 후 수행 — db:push 까지만
- SIH-571 (배포) 은 SIH-568~570 완료 후

## 확정 사실 (구현 시 전제)

### 엔드포인트 (Phase 2/3)
```
GET https://gateway.hwahae.co.kr/v14/rankings/{themeId}/details?page=1&page_size=100
```
- Playwright 불필요. Node `fetch()` + `User-Agent` 만 있으면 됨
- 상세 사양: `docs/hwahae/gateway-api.md`

### 카테고리 트리 (Phase 3 초기화)
- `https://www.hwahae.co.kr/rankings?english_name=category&theme_id=2` SSR HTML 에서 `__NEXT_DATA__.props.pageProps.rankingsCategories` 추출
- `children[]` / `categories[]` recursive walk → flat `HwahaeRankingCategoryNode[]`
- 리프 선정 기준: `max_rank >= 20` (depth=2 집합 노드는 제외)

### 병렬·재시도 (Phase 3)
- 동시 15 이하 (30일 때 500 4건 관찰됨)
- 3회 재시도 with 지수 백오프 (500ms → 2s → 5s)

### 스토리지 정책 (Phase 4)
- `hwahae_products` upsert: 최신값 미러링 + `first_seen_at` 유지
- `hwahae_ranking_snapshots` append-only: `(product_id, theme, theme_id, crawled_at)` 복합
- `hwahae_product_topics` append-only: 매 크롤마다 3건/상품
- `hwahae_brand_ranking_snapshots`: brand 테마 10개 브랜드마다
- 가격 3종 nullable: `is_commerce=false` 상품 수용

### 배포 (Phase 5)
- 맥북 서버 launchd `0 6 * * *` (KST 06:00)
- 올영(헤드풀 Chrome)과 시간대 분리 — 화해는 fetch only 경량
- 로그: `~/Library/Logs/hotinbeauty/hwahae.log`
- Secrets: `.env` (로컬 머신) 또는 macOS Keychain

## 미해결 질문

- [ ] `gateway.hwahae.co.kr` robots.txt 정책 확인 (현재 `www.hwahae.co.kr/robots.txt`만 확인)
- [ ] 맥북 서버 IP 고정 vs 동적 — 동적이면 차단 위험도 체크 필요
- [ ] 어워드 수집(`dehydratedState.queries`) — Phase 2에서 파서 구현 시 병행
