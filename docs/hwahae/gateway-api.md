# 화해 gateway API 사양

화해 랭킹 데이터 수집의 최종 진입점. Phase 0 후속 스파이크(SIH-567 범위)에서 확정.

## 엔드포인트

```
GET https://gateway.hwahae.co.kr/v14/rankings/{themeId}/details?page={N}&page_size={1..100}
```

- `{themeId}`: 리프 노드 id (category/skin/age 서브 id 또는 trending 5102, brand 2058)
- `page`: 1-indexed
- `page_size`: 최대 **100**. `page_size=100`이면 top 100을 한 요청으로 수령

## 인증·제약

| 항목 | 결과 |
|---|---|
| Auth 토큰 | 불필요 |
| referer 헤더 | 불필요 (없어도 200) |
| 쿠키 | 불필요 |
| CORS 제약 | 서버 측 fetch에 무관 |
| Rate limit | 병렬 30 동시 요청 시 4/30 = 13% 500 관찰 → **병렬도 15 + 재시도 권장** |

## 응답 구조 (실측)

```jsonc
{
  "meta": {
    "code": 1000,
    "message": "성공",
    "pagination": { "total_count": 100, "count": 20, "page": 1, "page_size": 20 }
  },
  "data": {
    "details": [
      {
        "brand":   { "id": 3264, "name": "토리든" },
        "goods":   {                          // null 가능 (is_commerce=false 상품)
          "id": 54413, "product_id": 1984011,
          "name": "...", "capacity": "...",
          "price": 28000, "discount_rate": 36,
          "discount_price": null, "image_url": "..."
        },
        "product": {
          "id": 1984011, "uid": "uuid", "name": "...",
          "image_url": "...", "package_info": "...",
          "price": 22000,                     // 정가(goods 없어도 항상 존재)
          "review_count": 79992, "review_rating": 4.6,
          "is_commerce": true,
          "product_topics": [                 // 최대 3개
            { "review_topic": { "id": 16, "name": "유분없는", "sentence": "유분이 없어요" },
              "is_positive": true, "score": 168.361, "review_count": 2961 }
          ]
        },
        "is_rank_new": false,
        "rank_delta": 2
        // rank 필드는 없고 배열 순서 = (page-1) × page_size + i + 1
      }
    ]
  }
}
```

## 성능 실측

| 시나리오 | elapsed |
|---|---|
| 단일 요청 page_size=20 (cache miss) | 862 ms |
| 단일 요청 page_size=100 (cache hit) | 124 ms |
| 30 병렬 (카테고리 순회) | 1.6 s, 26/30 성공 + 4 500 에러 |

## 크롤 전략

1. **초기 1회**: `www.hwahae.co.kr/rankings?english_name=category&theme_id=2` HTML 로 `__NEXT_DATA__`에서 전체 카테고리 트리 수집 (`rankingsCategories.children[]`). 이는 gateway API 가 아닌 SSR 경로.
2. **매 run**: 리프 노드 each × `page_size=100` 1회 요청 = 상품 100개 수령
3. **병렬도**: 동시 15 이하, 지수 백오프 재시도 3회
4. **업데이트 주기**: 화해 측 일 1회 05:00 KST → 06:00 KST 크롤 권장

## 크롤 대상 노드 선정

SSR 트리에서 총 2,992개 노드 중 실제 랭킹이 있는 리프는 depth=3 이상 + `max_rank ≥ 20` 기준. 대략 ~557개 추정(Phase 1 coverage spike). 실제 구현 시 SSR 트리에서 max_rank 기반 동적 필터.

## 대안·리스크

| 항목 | 상태 |
|---|---|
| URL `&page=N` 파라미터(SSR/`/_next/data/...`) | **무시됨** — gateway API 로만 페이지네이션 가능 |
| robots.txt | `/rankings` Allow. gateway 서브도메인은 robots.txt 별도 — 확인 필요 |
| API 버전 | `v14` — 상위 버전 등장 시 마이그레이션 |
| Sentry/Akamai | 관찰되지 않음 (CloudFront 경유) |

## 참고 스파이크

- `src/scripts/spikes/spike-hwahae-exists.ts` — Playwright 스크롤로 XHR 캡처 → gateway URL 발견
- `src/scripts/spikes/spike-hwahae-pagination.ts` — Next.js data route 페이지네이션 미지원 확정
- `src/scripts/spikes/spike-hwahae-coverage.ts` — 카테고리 트리 2,992 노드 수집
- `src/scripts/spikes/spike-hwahae-ec2-fetch.ts` — bare fetch로 SSR 접근 가능성 검증
