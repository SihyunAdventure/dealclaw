# 화해(Hwahae) Phase 0 탐색 — 최종 결과 (SIH-566)

생성: 2026-04-15 / 브랜치: `chore/sih-566-hwahae-phase0`

## 한 줄 요약

화해는 Next.js SSR 앱이고, **모든 랭킹·카테고리·어워드 데이터가 `<script id="__NEXT_DATA__">` JSON에 구조화된 상태로 embed**되어 있다. DOM 파싱·API 리버스엔지니어링 불필요. 페이지 하나 요청해 JSON 파싱하면 끝.

## 수집 엔트리포인트

| theme | URL | SSR JSON path | 한 페이지 | 최대 rank |
|---|---|---|---|---|
| `trending` | `/rankings?english_name=trending&theme_id=5102` | `props.pageProps.rankingProducts.data.details[]` | 20 | **50** |
| `category` | `/rankings?english_name=category&theme_id={sub_id}` | 동일 | 20 | **100** |
| `skin` | `/rankings?english_name=skin&theme_id={sub_id}` | 동일 | 20 | — |
| `age` | `/rankings?english_name=age&theme_id={sub_id}` | 동일 | 20 | — |
| `brand` | `/rankings?english_name=brand&theme_id=2058` | `props.pageProps.brandRankings[]` + `brandProductsLists[0..9][]` | 10 브랜드 × 상품 N | — |
| `awards` | `/awards/home` | `props.pageProps.awardsYears[]` + `dehydratedState.queries[0].state.data` | — | — |

- theme_id 를 빼고 호출하면 **500** (실측)
- `rankings[]` 메타는 어떤 theme 페이지에서도 전부 동일하게 내려옴 → **첫 수집 시 theme 목록 자동 확보**
- `rankingsCategories.children[]` 에 **대분류 16~18개**, 각 자식(depth=3)에 **소분류 11~16개** — 전체 카테고리 트리가 JSON 안에 full tree 로 들어있음
- 업데이트: `rankingsCategories.last_updated_at = "2026-04-15 05:00:00"` → **매일 오전 5시 갱신**

## 페이지네이션

`rankingProducts.meta.pagination`:
```json
{ "total_count": 50, "count": 20, "page": 1, "page_size": 20 }
```
- trending: 총 50 → 3 페이지
- category(서브별): 총 100 → 5 페이지
- 페이지 이동은 URL `&page=N` 추정. Phase 1 구현 시 실측 1회 필요

## 필드 인벤토리 (details 원소, 실측 확정)

```jsonc
{
  "brand":   { "id": 3264, "name": "토리든" },
  "goods":   {                       // 판매 패키지(=현재 노출 중인 기획 상품)
    "id": 54413,                     //   ← 카드 URL /goods/{slug}/{id}
    "product_id": 1984011,           //   ← 아래 product.id 와 동일 (세부 상품 본체)
    "name": "[only화해] 다이브인 저분자 히알루론산 세럼 100ml (+수딩크림 20ml*3)",
    "capacity": "다이브인 저분자 히알루론산 세럼 100ml + 수딩크림 20mlx 3개",
    "price": 28000,                  //   ← goods(판매가)
    "discount_rate": 36,             //   ← %
    "discount_price": null,          //   ← 현재 null 이지만 스키마엔 남김
    "image_url": "…/goods/…png"
  },
  "product": {                       // 리뷰 대상이 되는 원 상품 본체
    "id": 1984011,
    "uid": "b8f2bd31-4208-11ee-b457-0a737d0456c2",  // 글로벌 UUID
    "name": "다이브인 저분자 히알루론산 세럼",
    "image_url": "…/products/…jpg",
    "package_info": "50ml / 1.69 fl. oz.",
    "price": 22000,                  //   ← 원 상품 정가
    "review_count": 79992,
    "review_rating": 4.6,
    "is_commerce": true,
    "product_topics": [              // 리뷰 토픽 랭킹 (최대 3개)
      { "review_topic": { "id": 16, "name": "유분없는", "sentence": "유분이 없어요" },
        "is_positive": true, "score": 168.361, "review_count": 2961 },
      …
    ]
  },
  "is_rank_new": false,              // NEW 진입 여부
  "rank_delta":  2                   // 순위 변동 (+/-)
  // rank 자체는 필드로 없고 **배열 순서가 곧 rank** (page·page_size 와 조합)
}
```

brand 테마 전용:
```jsonc
brandRankings[i] = { brand: {id,name,alias,full_name,image_url}, rank_delta, is_rank_new }
brandProductsLists[i] = { "0": <details-like>, "1": …, "2": … }  // 해당 브랜드 top 3
```

## Phase 1 스키마 재설계 (최초 제안 대비 변경)

### 변경 내역
1. **가격 3계층 적용 가능해짐** — 이전 보고엔 "화해 랭킹 카드에 가격 없음"이었으나 SSR JSON에는 `goods.price`, `goods.discount_rate`, `product.price` 모두 존재. 올영과 동일한 `current_sale_price/current_original_price/current_discount_rate` 패턴 적용.
2. **`hwahae_product_topics`(스냅샷)** 테이블 신설 — 리뷰 토픽 랭킹이 강력한 차별화 포인트.
3. **`hwahae_brands` + `hwahae_brand_ranking_snapshots`** 신설 — brand 테마 전용 구조 대응.
4. **`hwahae_themes` / `hwahae_ranking_categories`(메타)** 신설 — rankings 메타와 카테고리 트리 캐시. UI 에서 탭·드롭다운 렌더할 때 DB 에서 읽어오는 편이 깔끔.
5. **product_id 정책 확정** — `product.id`(int, 글로벌 상품 본체)를 PK 로, `product.uid`(UUID)는 백업 identifier, `goods.id` 는 판매 패키지 필드로 분리.

### 최종 테이블 목록
| 테이블 | 역할 | 주요 필드 |
|---|---|---|
| `hwahae_themes` | 랭킹 테마 5종 메타 (캐시) | id, english_name, shortcut_name, ranking_type |
| `hwahae_ranking_categories` | 서브 카테고리 트리 (캐시) | id, parent_id, name, depth, theme_english_name, max_rank |
| `hwahae_products` | 상품 마스터 | product_id(PK int), uid, goods_id, brand_id, name, image_url, package_info, capacity, current_sale_price, current_original_price, current_discount_rate, current_rating, current_review_count, current_is_commerce, current_rank_theme, current_rank, first_seen_at, last_crawled_at |
| `hwahae_brands` | 브랜드 마스터 | brand_id(PK), name, alias, full_name, image_url, current_rank, first_seen_at, last_crawled_at |
| `hwahae_ranking_snapshots` | 상품 랭킹 시계열 | id, product_id, theme, theme_id, theme_label, rank, rank_delta, is_rank_new, sale_price, original_price, discount_rate, rating, review_count, crawled_at |
| `hwahae_brand_ranking_snapshots` | 브랜드 랭킹 시계열 | id, brand_id, rank, rank_delta, is_rank_new, crawled_at |
| `hwahae_product_topics` | 리뷰 토픽 스냅샷 | id, product_id, topic_id, topic_name, is_positive, score, review_count, crawled_at |
| `hwahae_awards` | 어워드(시간 불변) | id, product_id, year, award_id, theme, category, rank, is_hall_of_fame |
| `hwahae_crawl_runs` | 실행 메타 | id, theme, theme_id, product_count, new_entry_count, avg_rating, status, error_message, started_at, finished_at |

`current_*` 네이밍 규칙 · 인덱스 `idx_hw_*` prefix · `snake_case` DB · TS 타입 `HwahaeRankedProduct` 등은 올영과 완전 일치.

## 업데이트 주기 · 크롤 설계

- 화해 자체 갱신: 매일 05:00 KST
- 크롤 시각: **06:00 KST 권장** (올영이 오후 돌면 시간대 분리)
- 1회 실행량 추정:
  - trending: 1 × 3 page = 3 req
  - category: ~130 서브카테고리 × 5 page = 650 req
  - skin/age: 서브 id 확인 필요 (Phase 1 초입)
  - brand: 1 req
  - awards: 연간 1회 + 신년 갱신
- **Phase 1 구현에서 category 서브 600+ req 을 단일 실행으로 돌릴지, 분할 스케줄할지 결정** 필요 — 차단 리스크와 실행 시간 트레이드오프

## 리스크 재평가

| 이전 리스크 | 현재 상태 |
|---|---|
| DOM 셀렉터 유지보수 | **사라짐** (SSR JSON 직접 사용) |
| `/goods/*` 봇 차단 | 그대로 유지 — 상세 페이지는 여전히 접근 안 함 (이미 수집 불필요) |
| robots.txt 변경 리스크 | 동일 — `/rankings` Allow 가 깨지면 전면 중단. 상태 모니터 필요 |
| skin/age 500 | **해결** — theme_id 필수 파라미터였음 |
| 과거 어워드 미접근 | **부분 해결** — 2023/2024/2025 는 id 존재, 2015~2022 는 `is_legacy=true` 라 데이터 없음 |

## Phase 1 착수 가능 상태

- 스키마 enum 전부 확정 (theme 5개, ranking_type 5개)
- 필드 nullability 실측 완료
- 페이지네이션 메커니즘 확정
- product/goods/brand id 체계 확정

→ Phase 1 (DB 스키마 + 드리즐 마이그레이션) 이슈 생성 가능.
