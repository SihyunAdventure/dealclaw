# Hwahae UI Phase 6 (SIH-573) — 종합 설계안

화해 크롤러(SIH-566~SIH-571) 로 수집될 **121k 상품 · 2524 카테고리 노드 · 토픽 · 어워드** 를 `hotinbeauty` 사이트에 시각화하는 Phase 6.

## 배경

- Phase 0~5 완료 후: gateway + SSR 크롤러 → Neon Postgres 9 테이블 → 맥북 06:00 KST launchd 스케줄
- **UI 는 아직 없음** — `app/` 에 `hwahae` 참조 0개. 현재 `page.tsx` 는 쿠팡 collections(가성비/기획전/등) 만 렌더
- 올영 크롤(SIH-557) 은 병행 진행 중(PR #16). 스키마는 아직 별도 배럴.

## 전제(Premises)

1. **사용자는 랭킹을 탐색하고 싶다** — 화해는 "리뷰 기반 신뢰도" 브랜드. 121k 상품을 검색보다 랭킹으로 소비
2. **hotinbeauty 는 통합 뷰티 포털로 진화** — 쿠팡(최저가 사냥) + 화해(리뷰/랭킹) + 올영(상품 메타) 공존
3. **모바일 우선** — 화해·올영 실사용자 80%+ 모바일. 데스크탑은 보조
4. **프론트엔드 성능 > 기능 완성도** — 121k 상품 전부 SSR 은 불가. 페이지네이션 + 캐시 불가피
5. **기존 디자인 시스템 재사용** — shadcn + tailwind v4 + font-heading(serif), coupang UI 의 카드/탭/그리드 컴포넌트 그대로 extend

## 목표

| # | 목표 | Acceptance |
|---|---|---|
| 1 | 5 테마별 랭킹 페이지 | `/rankings?theme=category&id=2` 가 TOP 100 렌더 |
| 2 | 카테고리 트리 탐색 | 좌측 sidebar 에 `rankingsCategories` 트리 + 선택 시 URL 갱신 |
| 3 | 상품 카드에 화해 메타 | rank, rank_delta, is_rank_new, 리뷰 토픽 3개 |
| 4 | 어워드 뱃지 | 2023/2024/2025 수상작에 뱃지 + 호버 시 이력 |
| 5 | 랭킹 시계열 차트 | 상세 페이지: 30일 rank 변화 + 가격 변화 |
| 6 | 쿠팡과 통합 | 홈 `/` 에서 두 소스가 자연스럽게 섞임 |

**Not in scope (후속 이슈)**:
- 검색 바 (full-text search)
- 개인화 추천
- 가격 알림 UI (구독은 백엔드로 이미 있음)
- 리뷰 본문 수집 (크롤러에서 토픽만 수집)
- 올영 데이터 UI (올영 PR 머지 후 별도 Phase)

## 디자인 대안 분석

### Option A: 통합 피드 (Unified Feed)

- 홈 `/` 에 쿠팡 + 화해를 단일 타임라인으로 — 카테고리별로 "화해 TOP 5 + 쿠팡 최저가 3" 혼합
- **장점**: 단일 경험, 탐색 마찰 없음
- **단점**: 두 데이터의 "순서/의미" 가 달라 UX 혼란. 화해 rank 1 ≠ 쿠팡 최저가 1
- **구현 복잡도**: 중 (merge 로직 + 출처 뱃지)

### Option B: 분리 섹션 (Separate Sections) — 추천

- `/` 유지(쿠팡 hot deals), `/rankings` 신설(화해 랭킹), 각자 최적화
- 상단 글로벌 탭: `홈 / 랭킹 / 어워드`
- **장점**: 각 데이터 고유 UX 유지. 구현 단순. A/B 테스트 가능
- **단점**: 사용자가 두 체계 학습 필요. 홈에서 랭킹 노출 안 되면 발견 저조
- **보완**: `/` 홈 상단에 "오늘 랭킹 급상승 TOP 5" 섹션 삽입 — 발견 경로 확보

### Option C: 화해 우선 리브랜딩

- 쿠팡 홈을 `/deals` 로 이동, `/` 를 화해 랭킹으로 교체
- **장점**: 화해 리뷰 기반 신뢰도가 MSG (부족한 쿠팡 대비 강점)
- **단점**: 기존 구독자 이탈 리스크. 쿠팡 수수료 수익 감소
- **구현**: 대공사 — 이번 Phase 범위 초과

**결정**: **Option B (+ 홈 랭킹 섹션)** — 점진적 도입, 기존 수익 방어, 신규 경험 실험. Option C 는 Phase 7+ 전략 이슈로 분리.

## 라우트 구조

```
/                             기존 쿠팡 홈 + [신규] 상단 "급상승 TOP 5" 섹션
/rankings                     화해 테마 선택 허브 (5 테마 카드 + 최근 업데이트)
/rankings/[theme]             theme 랭킹 TOP 100 (trending/category/skin/age/brand)
/rankings/[theme]/[themeId]   서브 카테고리 랭킹 (예: /rankings/category/2 = "스킨케어")
/rankings/product/[id]        상품 상세 (랭킹 시계열 + 리뷰 토픽 + 어워드 이력 + 가격)
/awards                       연도별 어워드 허브 (2023/2024/2025)
/awards/[year]                연도별 수상작 리스트

기존:
/                홈
/privacy, /terms, /unsubscribe, /verify
```

**내비**: 상단 `홈 / 랭킹 / 어워드` + 기존 collection tabs 은 `/` 내부에만.

## 데이터 접근 패턴

| 화면 | 쿼리 | 캐시 |
|---|---|---|
| 홈 상단 급상승 | `SELECT ... FROM hwahae_products WHERE current_is_rank_new=true OR current_rank_delta <= -5 ORDER BY current_rank_delta LIMIT 5` | ISR 5분 |
| `/rankings/[theme]` | `hwahae_products WHERE current_rank_theme=? ORDER BY current_rank LIMIT 100` | ISR 1시간 |
| `/rankings/[theme]/[themeId]` | `hwahae_ranking_snapshots latest + hwahae_products JOIN` | ISR 30분 |
| 상품 상세 | 3개 쿼리: 상품 + snapshots(30일) + topics + awards | ISR 1시간 |
| 카테고리 트리 | `hwahae_ranking_categories WHERE theme_english_name=? ORDER BY depth, id` | ISR 24시간 |

**121k 상품 전부 SSR 불가능** → 필요한 100건만 쿼리. 크롤 run 1회당 write-heavy, 읽기는 light.

## API 라우트

```
GET /api/hwahae/rankings/[theme]?themeId=N&page=N    # 100개씩, 페이지네이션
GET /api/hwahae/categories/[theme]                   # 카테고리 트리 (캐시 강)
GET /api/hwahae/products/[id]                        # 상품 상세 + 시계열
GET /api/hwahae/trending                             # 홈 상단용 TOP 5
GET /api/hwahae/awards/[year]                        # 어워드 목록
```

Next 15+ Route Handlers. 모든 GET 은 cache tags 로 `revalidateTag('hwahae')` 크롤 완료 후 재검증 가능.

## 컴포넌트 설계

### 기존 재사용
- `<ProductCard>`: 화해 props 확장 (rank, rankDelta, isRankNew, topics, awardBadge)
- `<CollectionTabs>`: 구조 재사용, 라벨만 다름 → `<ThemeTabs>`
- `<PriceDisplay>`: 그대로

### 신규 컴포넌트
1. `<HwahaeProductCard>` (확장) — rank 뱃지, delta 화살표, 토픽 뱃지 3개, award 뱃지
2. `<CategoryTreeSidebar>` — 트리 네비게이션 (데스크탑) / `<CategoryDrawer>` (모바일)
3. `<RankDeltaBadge>` — `+2` / `-5` / `NEW` 시각화
4. `<TopicBadges>` — "유분없는 · 보습 · 진정" 세 개 뱃지, 긍/부 색상
5. `<AwardRibbon>` — 수상작 리본 (hall of fame 구분)
6. `<RankingTrendChart>` — 상세 페이지 30일 시계열 (recharts or Chart.js)
7. `<TrendingStrip>` — 홈 상단 가로 스크롤 "급상승 TOP 5"
8. `<ThemeHubCard>` — `/rankings` 허브의 5 테마 엔트리 카드 (아이콘 + 마지막 업데이트)

## 디자인 토큰 (추가)

- `--hwahae-rank-up`: `oklch(…green)` (rank 올라감 = 긍정)
- `--hwahae-rank-down`: `oklch(…red)`
- `--hwahae-rank-new`: `oklch(…amber)`
- `--hwahae-award-gold`: `oklch(…gold)` (hall of fame)
- `--hwahae-award-silver`: `oklch(…silver)` (일반 수상)
- topic 뱃지 긍정: `--hwahae-topic-positive`, 부정: `--hwahae-topic-negative`

## 성능 예산

- LCP < 2.5s (모바일 4G)
- 페이지당 DB query ≤ 5개
- TOP 100 rendering: 100 카드 × ~6 뱃지 = ~600 DOM → virtualize 불필요 (1 스크린당 10 카드만 보임)
- 카테고리 트리: 2524 노드 → **전체 렌더 금지**. lazy expand 필수
- ISR revalidation: 크롤 완료 시 `revalidateTag('hwahae')` 로 일괄

## 접근성

- 탭/드로어 키보드 내비게이션 (Tab, Esc)
- rank 뱃지에 `aria-label="순위 3위, 2계단 상승"`
- 토픽 뱃지에 `title` + `aria-label`
- 색상 차이만으로 rank up/down 전달 금지 → 화살표 아이콘 병기
- 차트에 table fallback

## 마이그레이션/롤아웃

1. **Phase 6.0** — API 라우트 + 카테고리 트리 쿼리만 (UI 없이 `/api/hwahae/*` 테스트)
2. **Phase 6.1** — `/rankings` + `/rankings/[theme]` (카드 + 탭 + 트리)
3. **Phase 6.2** — 상품 상세 `/rankings/product/[id]` + 시계열 차트
4. **Phase 6.3** — `/awards` 라우트
5. **Phase 6.4** — `/` 홈 상단 `<TrendingStrip>` 삽입
6. **Phase 6.5** — 글로벌 내비 + 푸터 업데이트

각 하위 Phase 는 별도 PR. 전부 stacked on SIH-572 (연결 완료) 머지.

## 테스트 전략

- 단위: `<RankDeltaBadge>` / `<TopicBadges>` props 렌더 (Vitest)
- 통합: `/rankings/[theme]` SSR 응답 (Next test harness + fixture DB)
- E2E: 카테고리 트리 클릭 → URL 갱신 → 상품 갱신 (Playwright)
- 시각: 스크린샷 회귀 (Phase 6.x 머지 후 별도 이슈 — `visual-verdict` 스킬 활용 고려)
- 실 데이터: SIH-572 머지 + 첫 크롤 완료 후 staging 환경에서 수동 QA

## 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| 121k 상품 데이터로 Neon 비용 급증 | 중 | current_* 미러링 + 필요한 field 만 select |
| 카테고리 트리 2524 노드 → 초기 로드 무거움 | 높음 | lazy expand + ISR 24h + 트리 압축(불필요 aggregate 제거) |
| 화해 API TOS — 크롤 데이터 공개 노출 | 높음 | robots.txt 재확인 필요 · 출처 표기 의무 확인 · 파트너 링크 정책 |
| 쿠팡 파트너스 수익 희석 | 중 | 홈 `/` 기존 우선도 유지 + `/rankings` 는 정보 중심(파트너 링크 0) |
| 모바일 카테고리 드로어 UX 난이도 | 중 | 첫 버전은 상단 가로 스크롤 "테마 선택" + 바텀시트 |
| 이미지 CDN 부하 (img.hwahae.co.kr 참조) | 낮 | `<Image>` unoptimized={true} + next/image 로 resize 파라미터 전달 |

## 미해결 질문

- [ ] `img.hwahae.co.kr` 직접 참조 가능한지 (hotlink 정책) — `next.config.mjs remotePatterns` 등록 필요
- [ ] 화해 출처 표기 필수 여부 (법무 검토)
- [ ] SEO: `/rankings` 개별 페이지를 검색 엔진에 인덱싱할지 (소스 TOS 이슈)
- [ ] 올영 데이터와 통합 시점 (Phase 6 이후 별도 Phase 7)

## 예상 구현 비용 (CC 기준)

| Phase | 작업 | 예상 |
|---|---|---|
| 6.0 API | 5개 route handler + 쿼리 | 1h |
| 6.1 랭킹 목록 | 라우트 + 컴포넌트 4개 + 트리 sidebar | 3h |
| 6.2 상품 상세 | 시계열 차트 + 토픽/어워드 섹션 | 2h |
| 6.3 어워드 | 라우트 + 컴포넌트 2개 | 1h |
| 6.4 홈 통합 | `<TrendingStrip>` + 홈 수정 | 1h |
| 6.5 글로벌 내비 | 헤더 · 푸터 · 접근성 | 1h |
| 디자인 QA | `design-review` 스킬 + 수정 | 2h |
| **합계** | | **~11h CC (≈ 1 인력일 + 리뷰)** |

## 완료 기준

- [ ] 6 하위 Phase 전부 머지
- [ ] Lighthouse 모바일 Performance ≥ 85
- [ ] 접근성 자동 검사 (axe) 에러 0
- [ ] 실 데이터 1회 크롤 후 모든 페이지 정상 렌더
- [ ] 사용자 QA: 카테고리 트리 탐색 3 스텝 이내 원하는 랭킹 도달
