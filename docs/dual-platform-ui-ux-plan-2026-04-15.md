<!-- /autoplan restore point: /Users/sihyunkim/.gstack/projects/hotinbeauty/feat-SIH-577-price-change-feed-autoplan-restore-20260416-000405.md -->
# hotinbeauty 듀얼 플랫폼 UI/UX 재구성 플랜

**작성일**: 2026-04-15  
**브랜치**: feat/SIH-577-price-change-feed  
**베이스 브랜치**: main  
**상태**: DRAFT — /autoplan review 대상  
**Supersedes**: `docs/strategy-reframe-2026-04-15.md`의 UI 실행안, `docs/data-exposure-policy.md`

---

## 0. 한 줄 요약

`hotinbeauty`를 **buy-now decision engine** 성격의 뷰티 가격 변화 서비스로 재구성한다. 홈의 주 구조는 **쿠팡 / 올리브영 2개 섹션**을 유지하되, 상단에서는 "지금 볼 이유"를 먼저 보여준다.  
공개 UI는 **A등급(우리 계산 신호)** 중심으로 만들고, **화해 정보는 상품 상세 하단의 단건 참고 정보(B등급)** 로만 제한한다.

---

## 1. 문제 정의

현재 홈은 `카테고리별 최저가`와 `오늘의 가격 변동`이 함께 있지만, 제품 판단의 핵심 축이 섞여 있다.

1. **플랫폼 맥락이 약함** — 사용자는 “쿠팡에서 싸진 것”과 “올영에서 지금 주목할 것”을 다르게 해석한다.
2. **A/B 등급 경계가 UI에 드러나지 않음** — 현재/향후 확장에서 외부 원본 정보가 홈에 스며들 위험이 있다.
3. **구매 이유가 분산됨** — 최저가, 랭킹, 최근 변동, 외부 평판이 서로 다른 화면에 흩어질 수 있다.
4. **화해 데이터의 역할이 불명확함** — 내부 분석과 공개 참고 정보의 경계가 문서에는 있으나 실제 UI 구조로 고정되지 않았다.

우리가 풀어야 하는 문제는 “통합 뷰티 포털”이 아니라:

> **각 플랫폼에서 지금 살 이유가 생긴 제품만 빠르게 걸러주고, 상세에서만 안전하게 추가 참고 정보를 붙이는 것**.

---

## 2. 사용자 확인 전제 (Premises)

아래 전제는 2026-04-15 사용자 지시로 확인된 것으로 간주한다.

1. **홈은 쿠팡 / 올리브영 두 섹션으로 분리한다.**
2. **공개 UI의 주연은 우리 데이터다.** (가격 변동률, 최저가 경신, 랭킹 급상승, 시계열)
3. **화해 정보는 참고만 한다.**
4. **화해 / 글로우픽류 원본 랭킹을 섹션으로 재구성하지 않는다.**
5. **상품 상세만 외부 단건 인용(B등급)을 허용한다.**

### 2.1 아직 검증되지 않은 가설

| 가설 | 현재 상태 | 검증 방식 |
|---|---|---|
| 홈을 플랫폼 2섹션으로 나누면 CTR이 오른다 | 가설 | 2섹션 홈 vs strongest-opportunity hero strip 비교 |
| 차트가 있으면 상세 신뢰도가 오른다 | 가설 | 차트 노출 vs 이유 bullet 중심 상세 비교 |
| 화해 참고 1줄이 구매 판단에 도움을 준다 | 가설 | reference row on/off CTR 비교 |
| 사용자는 "리테일러"보다 "지금 살 이유"에 더 반응한다 | 가설 | 상단 strongest-opportunity strip 클릭률 측정 |

---

## 3. 성공 기준

### 사용자 관점
- 홈에 들어오면 5초 안에 “쿠팡에서 싸진 것”과 “올영에서 움직인 것”을 구분해 볼 수 있다.
- 상품 상세에 들어가면 “왜 지금 봐야 하는지”가 가격 시계열과 신호 뱃지로 즉시 이해된다.
- 외부 참고 정보는 보조적이며, 원본 플랫폼/출처 링크가 명확하다.

### 제품 관점
- 홈/리스트 계열은 **A등급 데이터만** 렌더링한다.
- 상세에서만 **B등급 1~2줄** 참고 정보가 노출된다.
- 현재 DB/컴포넌트를 최대한 재사용하고, v2 canonical matching 없이도 실행 가능하다.

### 측정 지표
- 홈 → 상세 CTR: 플랫폼 섹션별 추적
- 상세 → affiliate click CTR: 플랫폼별 추적
- 상세 체류 시간: 가격 차트 가독성 지표
- 구독 CTA 전환율: 상품 상세/알림 entry 기준 추적
- **7일 내 재방문율**: browsing UI가 아니라 습관 제품이 되는지 확인
- **알림 opt-in → click 전환율**: repeat-use 가치 측정
- **detail 100뷰당 affiliate revenue**: 소스별 monetization quality 확인

### 3.1 대안 비교 (CEO review 반영)

| 대안 | 장점 | 버린 이유 / 남겨둔 이유 |
|---|---|---|
| Olive Young-first 단일 소스 | 커미션 높음, 카테고리 적합성 높음 | **보류** — learning speed는 빠르지만 쿠팡 비교/저가 포지션 약화 |
| Alert-first 제품 | repeat-use 학습이 빠름 | **부분 채택** — Slice 0에 알림/구독 proof loop 추가 |
| Unified best-opportunities feed | strongest signal을 전면에 세움 | **부분 채택** — 상단 hero strip으로 흡수, 메인 본문은 2섹션 유지 |
| SEO landing pages 우선 | acquisition 명확 | **후속 병행 과제** — UI reframe과 별도 issue로 분리 |

---

## 4. 법적/제품 제약

### 4.1 공개 등급 규칙
- **A 등급**: 우리 계산 결과 — 홈/리스트/상세 전부 허용
- **B 등급**: 단일 소스 사실 인용 — 상세만 허용
- **C/D 등급**: 외부 원본 리스트/이미지/리뷰 본문 — 공개 UI 금지

### 4.2 화해 노출 규칙
- 홈 / 피드 / 컬렉션 / 섹션 카드: **화해 텍스트 자체 미노출**
- 상품 상세: 아래 3개 중 최대 1~2개만 허용
  - `화해 평점 4.5 · 리뷰 567개`
  - `화해 스킨케어 카테고리 상위권` 같은 **모호 표현 금지**
  - `화해 어워드 수상`처럼 원본 리스트 재현으로 보일 수 있는 표현은 **불리언 배지 1개 이하**
- 모든 B등급은 원문 링크와 함께, `참고 정보` 영역에서만 노출

### 4.3 소스별 공개 정책
| 소스 | 홈 섹션 | 상세 참고 정보 | CTA |
|---|---|---|---|
| 쿠팡 | A만 | 선택 | 파트너스 링크 |
| 올리브영 | A만 | 선택 | 큐레이터 링크 |
| 화해 | 금지 | B만 | 원문 링크만 |

---

## 5. 현재 코드/자산 레버리지 맵

| 서브문제 | 이미 있는 것 | 활용 방식 |
|---|---|---|
| 홈 가격 변동 리스트 | `app/page.tsx`, `PriceChangeCard`, `getPriceChangeSignals()` | 소스별 필터링으로 2섹션 분리 |
| 상세 시계열 차트 | `PriceChart`, `/p/cp/[coupangId]`, `/p/oy/[productId]` | 공통 상세 패턴으로 유지 |
| 쿠팡 데이터 | `products`, `coupang_price_snapshots` | 가격 하락 / 최저가 신호 |
| 올영 데이터 | `oliveyoung_products`, `oliveyoung_ranking_snapshots` | 가격 + 랭킹 복합 신호 |
| 법적 기준 문서 | `docs/data-exposure-policy.md` | UI 필드 allowlist 기준 |
| 전략 문서 | `docs/strategy-reframe-2026-04-15.md` | 제품 포지션 / wedge 정의 |

### 재사용 기준
- 새 시스템보다 **기존 feed/detail 구조 재배치**를 우선
- 새 추상화보다 **소스별 selector/helper 추가**를 우선
- 상세 페이지는 소스별 route를 유지하고, 공통 reference row만 추가

---

## 6. 정보 구조 (Information Architecture)

### 6.1 홈 구조

```text
HOME
├─ Header
│  ├─ 브랜드
│  └─ "우리가 계산한 가격 변화 신호" 한 줄 설명
├─ Decision Strip
│  ├─ 지금 가장 강한 신호 1~2개
│  ├─ 오늘 감지된 쿠팡/올영 신호 수
│  └─ 마지막 수집 시각
├─ Section A. 쿠팡에서 지금 싸진 것
│  ├─ 섹션 설명
│  ├─ Top signals list (A only)
│  └─ "쿠팡 상품 더 보기"
├─ Section B. 올리브영에서 지금 변한 것
│  ├─ 섹션 설명
│  ├─ Top signals list (A only)
│  └─ "올영 상품 더 보기"
└─ Footer
```

### 6.2 상세 구조

```text
PRODUCT DETAIL
├─ Sticky header (플랫폼 / 뒤로가기)
├─ Hero card
│  ├─ 상품명 / 브랜드 / 현재가
│  ├─ 핵심 배지 (최저가 / 랭킹 상승)
│  └─ primary CTA + secondary CTA
├─ Price intelligence block
│  ├─ 가격 시계열
│  ├─ 최근 7일 최저/최고
│  └─ "지금 봐야 하는 이유" bullet 2~3개
├─ 참고 정보 (optional, 상세만)
│  ├─ 화해 평점/리뷰수 1줄
│  └─ 출처 링크
└─ 알림 CTA
```

---

## 7. 화면별 설계

## 7.1 Home — 듀얼 섹션 레이아웃

### 목표
한 화면에서 “지금 쿠팡을 볼 이유”와 “지금 올영을 볼 이유”를 분리한다.

### 레이아웃 원칙
- **카드 그리드 금지** — 모바일 기준 list row 중심
- **두 섹션은 동일 패턴**이되, 라벨/설명/신호 해석이 다름
- **첫 화면에서 브랜드보다 효용이 먼저 보이되**, 섹션 이름만으로 플랫폼이 분명해야 함
- **기존 카테고리별 최저가 컬렉션은 홈 core에서 제거**하고, 유지 시 별도 route/secondary area로 분리한다

### Section A — 쿠팡에서 지금 싸진 것
- 정렬 기준: `score = dropRate`
- tie-breaker 1: `updatedAt DESC`
- tie-breaker 2: `currentPrice ASC`
- 노출 필드: 상품명, 현재가, 7일 최저가 여부, 하락률, 컬렉션
- 금지 필드: 외부 리뷰/평점, 랭킹 원문, 화해/글로우픽 문구
- CTA: 상세 진입 → 쿠팡 파트너스 링크

### Section B — 올리브영에서 지금 변한 것
- 정렬 기준: `score = (rankDelta * 2) + dropRate`
- tie-breaker 1: `updatedAt DESC`
- tie-breaker 2: `currentRank ASC`
- 노출 필드: 상품명, 현재가, 현재 랭킹, 랭킹 상승 폭, 카테고리
- 금지 필드: 올영 원본 베스트 리스트 재현 문구
- CTA: 상세 진입 → 올영 큐레이터 링크

### 상단 Decision Strip
- strongest opportunity headline 1개
- strongest opportunity row 최대 1개 또는 signal chip 2개
- `쿠팡 감지 n건`
- `올영 감지 n건`
- `마지막 업데이트 HH:MM`

**계약**:
- 최대 1 headline
- 최대 2 supporting metrics
- timestamp 1개
- 본문 섹션 header보다 시각적으로 더 크되, 상품 리스트 자체를 대체하지는 않는다
- signal이 0개면 strongest opportunity row 없이 counts + timestamp만 남긴다

**strongest opportunity object**:
- `globalScore = sourceScore + freshnessBonus`
- `freshnessBonus = 2` if updated within 6h, else `0`
- `sourceScore`는 쿠팡/올영 각각의 section score 재사용
- 같은 상품이 strip와 section에 동시에 나올 수 있다 (v1에서는 dedupe 안 함)

이 스트립의 목적은 **플랫폼 구분 전에 "지금 봐야 할 이유"를 먼저 보여주는 것**이다.
단, 본문 구조는 사용자 지시대로 **쿠팡 / 올영 2섹션**을 유지한다.

### 반응형 규칙
- **mobile (<768px)**: decision strip → 쿠팡 섹션 → 올영 섹션 순의 단일 컬럼
- **tablet (768~1023px)**: 섹션은 단일 컬럼 유지, 행 밀도만 완화
- **desktop (>=1024px)**: decision strip은 full-width, 그 아래 쿠팡/올영 섹션을 2-column으로 배치 가능
- 어떤 viewport에서도 "가장 강한 신호 → 플랫폼 섹션 → 상세" 흐름은 유지한다

### 행(row) 컴포넌트 명세
- 썸네일 72~80px
- 1차 정보: 제품명 / 현재가
- 2차 정보: 하락률 또는 랭킹 상승
- 3차 정보: 컬렉션/카테고리 + 업데이트 시각
- 장식용 아이콘/원형 badge/background blob 금지

## 7.2 Product Detail — 판단 엔진 화면

### Hero 영역
- 상품명 / 브랜드 / 플랫폼 라벨
- 가격 / 할인율 / 랭킹 배지(올영만) / 최저가 뱃지
- CTA 우선순위:
  - **primary:** 현재 플랫폼 구매
  - **secondary:** `이 가격 추적하기` alert CTA
  - **tertiary:** 다른 플랫폼 비교 CTA (명시적 매칭 있을 때만)

### Price Intelligence 영역
- `PriceChart`
- 보조 지표 카드 2개
  - 최근 7일 최저가
  - 최근 7일 최대 하락폭 또는 현재 랭킹
- confidence beat 1개
  - 예: `이번 주 strongest signal`
  - 예: `랭킹 상승 + 가격 하락이 동시에 확인됐어요`
- “지금 봐야 하는 이유” 텍스트 2~3줄
  - 예: `7일 내 최저가를 갱신했어요`
  - 예: `올영 랭킹이 8계단 상승했어요`

### 참고 정보 영역 (Hwahae-safe)
- 제목: `참고 정보`
- 텍스트 예시:
  - `화해 평점 4.5 · 리뷰 567개`
  - `출처: 화해에서 보기 ↗`
- 제한:
  - 소스당 1줄
  - 전체 2줄 이하
  - 상세 하단에만 위치
  - 접혀 있어도 됨 (`accordion` 또는 `secondary block`)

### 화해 reference 매칭 전제
- **v1 기본값**: 자동 숫자 매칭 없이 `reference slot`만 설계한다.
- 화해 수치(B등급)는 **명시적 매칭이 있는 상품에만** 노출한다.
- 명시적 매칭이 없으면 블록 자체를 숨기거나 `화해에서 유사 상품 보기 ↗` 링크만 노출한다.
- 초기에는 새 infra보다 `manual/curated mapping`(소수 pilot 상품) 우선. canonical matching은 out of scope 유지.
- reference block은 **default collapsed** 또는 하단 배치로 두어 A등급 판단 UI보다 앞에 오지 않게 한다.

### alert entry model
- 위치: 차트/이유 bullet 아래의 inline CTA block
- 기본 상태: `이 가격 추적하기`
- subscribed 상태: `이미 추적 중`
- verification sent 상태: `이메일 확인 후 알림이 시작돼요`
- unavailable 상태: `현재 이 상품은 알림 등록이 일시 중단됐어요`
- modal/interstitial보다 **inline block 우선**
- **전제:** 이 CTA는 collection 구독을 재라벨링하지 않는다. 실제 product-watch backend가 없으면 detail CTA를 열지 않는다

---

## 8. 상호작용 상태 설계

| Surface | Loading | Empty | Error | Partial | Success |
|---|---|---|---|---|---|
| Home decision strip | skeleton 3칸 | `오늘 신규 신호 없음` | strip 숨김 + 섹션 유지 | counts만 노출 | strongest signal + counts + timestamp |
| 쿠팡 섹션 | list skeleton 3행 | `지금은 눈에 띄는 인하가 없어요` | 섹션 단위 에러 카드 | 다른 섹션은 정상 노출 | 신호 리스트 |
| 올영 섹션 | list skeleton 3행 | `지금은 순위 변동이 크지 않아요` | 섹션 단위 에러 카드 | 다른 섹션은 정상 노출 | 신호 리스트 |
| Home 전체 | - | `오늘은 새로운 buy-now 신호가 없어요` | 상단 global fallback copy | 한 플랫폼 stale / 다른 플랫폼 fresh 배지 | 두 섹션 정상 |
| 상품 상세 차트 | 차트 skeleton | `아직 시계열이 쌓이지 않았어요` | 상세 조회 실패 / 404 | 차트는 있고 참고 정보 없음 | 차트 + 요약 |
| 참고 정보 블록 | 숨김 처리 | 블록 자체 미표시 | feature flag off 시 미표시 | 다른 참고 소스만 표시 | 출처 링크 포함 한 줄 |
| Alert CTA | inline skeleton 없음 | CTA 노출 | rate limit / unavailable copy | verification sent / already subscribed | opt-in 완료 |
| 비교 CTA | skeleton 없음 | CTA 자체 미표시 | 미표시 | 한 플랫폼만 남김 | primary+secondary 동시 노출 |

### 상세 data tier
- **full**: chart + badges + confidence beat + reference block
- **partial**: chart + badges, reference 생략
- **no-history**: hero + 단일 포인트 안내 + CTA
- **no-match**: reference block 미노출 또는 link-only fallback

### 원칙
- 한 플랫폼 섹션이 비거나 실패해도 **다른 플랫폼 섹션은 계속 살아 있어야 한다**.
- `stale`는 `error`와 다르게 취급한다: 마지막 업데이트가 24h를 넘으면 stale badge + 설명문구를 노출한다.
- 참고 정보는 실패해도 **주요 구매 판단 UI에 영향 주지 않는다**.

---

## 9. 사용자 여정 & 감정 곡선

| 단계 | 사용자가 하는 일 | 기대 감정 | 화면이 해야 할 일 |
|---|---|---|---|
| 1 | 홈 진입 | 빨리 훑고 싶음 | 플랫폼별로 정보 분리해 혼란 줄이기 |
| 2 | 쿠팡/올영 섹션 스캔 | "지금 볼 가치 있는 것만 보고 싶다" | A등급 신호만 간결하게 표시 |
| 3 | 상품 상세 진입 | 이게 진짜 살 타이밍인지 확인하고 싶음 | 차트 + 핵심 이유 2~3개 먼저 보여주기 |
| 4 | 참고 정보 확인 | 외부 평판도 슬쩍 확인하고 싶음 | 화해 정보는 보조적·안전하게만 제시 |
| 5 | 외부 링크 클릭 | 망설임 없이 구매/확인 이동 | 출처가 분명한 CTA 제공 |

---

## 10. 디자인 원칙

### 분류
이 플랜은 **APP UI**로 본다. 마케팅 랜딩이 아니라 빠른 판단과 비교가 목적이다.

### 시각 원칙
- **차분한 앱 표면** + 강한 타이포그래피
- 플랫폼은 색으로 구분하되, **전체 UI는 1개 accent 중심**으로 유지
- 카드보다 **row / section / divider** 중심
- 장식성 gradient, blob, 3-column feature grid 금지
- 모바일에서 first viewport는 "오늘 봐야 할 것"이 보이도록 구성
- 구현은 기존 theme token(`bg-background`, `bg-muted`, `border-border`, `text-foreground`, `font-heading`) 재사용이 기본

### Visual spec (구현 고정값)
- 폰트: **heading = Cormorant Garamond / body = Noto Sans KR 유지**
- shell: 모바일 기준 `max-w-[480px]` 유지, desktop은 `max-w-[960px]`까지 확장 가능
- spacing rhythm: section 상단 24px, row gap 12px, badge gap 6px
- badge vocabulary: strongest signal / rank jump / 7일 최저가 / 참고 정보 4종만 사용
- row hierarchy: 제목 > 가격 > 신호 > 메타 순서 고정
- shadow는 최소, divider와 surface contrast로 구획

### 톤
- 헤드라인: 설명보다 판단
  - 좋은 예: `쿠팡에서 지금 싸진 것`
  - 나쁜 예: `오늘의 스마트 쇼핑 인사이트`
- body copy: 짧고 사실 중심
- 브랜드 문구는 효용을 방해하지 않는 수준만

### 접근성
- 터치 타깃 44px 이상
- 섹션 제목과 카드 행의 keyboard focus 보장
- 차트는 텍스트 요약 동반
- 컬러만으로 상태 구분 금지 (텍스트 뱃지 병행)

---

## 11. 데이터 표시 allowlist

### 홈/리스트 허용 필드 (A만)
- `name`
- `currentPrice`
- `minPrice7d`
- `dropRate`
- `rankDelta`
- `currentRank`
- `updatedAt`
- `collection/categoryPath`
- `source`

### 상세 허용 필드
#### A
- 홈/리스트 허용 필드 전체
- 시계열 배열
- 요약 판단 문구

#### B
- `sourceName`
- `rating`
- `reviewCount`
- `awardBadgeBoolean`
- `sourceUrl`

### 금지 필드
- 외부 랭킹 리스트 원문
- 외부 상세 설명 본문
- 외부 리뷰 원문
- 외부 이미지 hotlink

### UI boundary rule
- home/list/detail는 raw DB row를 직접 렌더하지 않는다
- 홈은 `HomeSignalViewModel(A only)`만 사용한다
- 상세는 `DetailViewModel(A)` + `ReferenceViewModel(B, verified only)` 조합만 사용한다
- allowlist adapter 바깥에서 외부 소스 필드를 JSX에 직접 전달하지 않는다

---

## 12. 아키텍처

### 12.1 홈 데이터 흐름

```text
DB snapshots
  ├─ coupang_price_snapshots
  └─ oliveyoung_ranking_snapshots
        ↓
lib/signals/*
  ├─ getCoupangSignals(limit)
  ├─ getOliveYoungSignals(limit)
  └─ getHomeSummary()
        ↓
app/page.tsx
  ├─ DecisionStrip
  ├─ PlatformSignalSection(source="coupang")
  └─ PlatformSignalSection(source="oliveyoung")
```

### 12.1-bis 의존성 ASCII 다이어그램

```text
app/page.tsx
├─ Promise.allSettled([summary, coupang, oliveyoung])
├─ getHomeSummary()
├─ getCoupangSignals()
│  └─ HomeSignalViewModel adapter
├─ getOliveYoungSignals()
│  └─ HomeSignalViewModel adapter
├─ DecisionStrip
└─ PlatformSignalSection
   └─ PriceChangeCard (A only)

app/p/*/page.tsx
├─ fetch product + snapshots
├─ buildReasonBullets()
├─ buildReferenceViewModel()  # verified only
├─ PriceChart
└─ AlertCTA / buy CTA / optional compare CTA

app/api/product-watch/*
├─ create watch
├─ verify watch
└─ unsubscribe watch
```

### 12.2 상세 데이터 흐름

```text
Source detail route
  ├─ /p/cp/[coupangId]
  └─ /p/oy/[productId]
        ↓
product + snapshots query
        ↓
reason builder (A)
        ↓
optional reference adapter (B, verified only)
        ↓
normalize to detail view model
        ↓
render
  ├─ hero
  ├─ price chart
  ├─ reason bullets
  └─ optional external reference rows (B only)
```

### 12.3 최소 변경 원칙
- `getPriceChangeSignals()`는 유지하되, source-filtered helper를 추가하는 방향 우선
- 홈은 기존 `PriceChangeCard`를 재사용하거나 small variant만 추가
- 상세는 현재 2개 route를 유지, 공통 `ReferenceRow` 추가 정도로 끝낸다
- `CollectionTabs` / `CollectionSection`은 홈 core에서 제거하고, 유지 시 별도 browse route 또는 secondary surface로 이동한다
- v1에서는 cross-source same-SKU dedupe를 하지 않는다. 동일 상품 continuity는 explicit curated match가 있을 때만 tertiary compare CTA로 노출한다

### 12.4 backend 전제
- 현재 `subscriptions`는 **collection 기반**이므로 detail alert CTA와 직접 호환되지 않는다
- detail alert CTA를 살리려면 `product_watch_subscriptions`(또는 동등 모델) 추가가 필요하다
- 최소 필드: email, source, sourceProductId, verifyToken, status, lastNotifiedAt, createdAt
- product watch가 준비되지 않으면 detail secondary CTA copy는 `이 가격 추적하기`가 아니라 `이 카테고리 알림 받기`로 낮춘다
- 외부 reference는 env/flag로 즉시 off 할 수 있어야 한다

---

## 13. 실패 모드 / Error & Rescue Registry

| 문제 | 사용자 영향 | 탐지 | 복구 |
|---|---|---|---|
| 쿠팡 섹션 데이터 없음 | 한쪽 섹션 비어 보임 | section result 0 | empty state 문구 노출, 올영 섹션 유지 |
| 올영 랭킹 신호 계산 오류 | 랭킹 배지 왜곡 | helper 로그 / zero result spike | rankDelta 없는 price-only fallback |
| 화해 참고 정보 파서 실패 | 참고 정보 누락 | 상세 reference fetch miss | 블록 미표시 (주 UI 유지) |
| 소스별 이미지 차단 | 썸네일 누락 | image load fail | fallback placeholder |
| 상세 시계열 1포인트만 존재 | 차트 가치 약함 | data length | 단일 포인트 안내 문구 |
| 외부 소스 cease-and-desist | 법적 리스크 | 운영 감지 | 해당 소스 reference feature flag off |

---

## 14. NOT in scope

- canonical product matching / cross-platform 동일 상품 통합 상세
- 화해/글로우픽 랭킹 섹션 생성
- 외부 리뷰 본문 요약/번역
- 올영 어워즈 전체 리스트 페이지
- 관리자 대시보드 정교화
- 새 디자인 시스템 도입

---

## 15. Linear 이슈 맵 (초안)

### 유지
- **SIH-557**: 이미 머지된 기반 자산 (올영 DB + 상세 UI + 시계열)
- **SIH-575**: 운영 개선 후속 — 현재 UI 재구성과 직접 결합하지 않음
- **SIH-576**: 이미 다른 배포 이슈로 사용 중 (`Vercel 배포 실패`) — 재사용 금지

### 재정의/후속 필요
- **SIH-573**: 기존 제목/설명은 쿠팡 Akamai 차단 대응 중심. 현 UI reframe blocker 역할과 어긋남 → 별도 코멘트로 전략 전환 링크 필요

### 신규로 분리할 작업
- 현재 확인 기준 **SIH-577~581, SIH-582는 비어 있음**
1. `Proof loop — strongest-opportunity strip + detail CTR gate`
2. `Home UI reframe — 쿠팡/올영 2섹션 구조`
3. `Signal helpers split — coupang / oliveyoung source-specific selectors`
4. `Product detail intelligence polish — reason bullets + reference row`
5. `Product watch subscriptions — detail alert CTA backend`
6. `Hwahae-safe reference adapter — B등급 only view model + curated mapping policy`
7. `Exposure allowlist enforcement — home/detail field guards`
8. `Analytics — section CTR / detail CTR / affiliate click events + revisit metrics`
9. `Distribution follow-up — SEO landing / alert acquisition plan`
10. `ROADMAP + strategy docs sync`

---

## 16. 구현 순서

### Slice 0 — proof loop
- 상단 strongest-opportunity strip 추가
- 단일 상세에서 reason bullets + CTA + opt-in 측정
- analytics event (`home_strip_click`, `section_click`, `detail_view`, `affiliate_click`, `alert_opt_in`) 먼저 심기
- 2섹션 구조가 아니라도 살아남는 핵심 value("지금 살 이유")를 먼저 검증

### Slice 0.5 — alert/backend 정렬
- detail alert CTA를 살릴 수 있는 product-watch 모델 추가 또는 CTA copy 축소 결정
- verify / unsubscribe 흐름까지 같이 설계

### Slice 1 — 홈 구조 재배치
- 홈 decision strip 추가
- 홈을 쿠팡/올영 2섹션으로 분리
- 섹션별 empty/error copy 확정

### Slice 2 — helper 분리
- 쿠팡 / 올영 signal selector 분리
- 섹션별 정렬 규칙 고정

### Slice 3 — 상세 판단력 강화
- reason bullets 추가
- 참고 정보 block 추가 (B only, verified only)

### Slice 4 — instrumentation
- home section view
- detail click / affiliate click
- empty state exposure 측정
- revisit / alert opt-in / revenue-per-100-detail-views 계측

---

## 17. 테스트 계획 초안

### 테스트 프레임워크 결정
- **unit/integration:** Node built-in `node:test` + existing `tsx` 활용 (새 의존성 없이)
- **E2E/smoke:** 이미 설치된 `playwright` 활용
- **원칙:** 새 test dependency 추가보다 현재 runtime + 설치된 package를 먼저 활용
- `package.json`에는 최소 `test`, `test:unit`, `test:e2e` script를 추가한다

### 코드패스 테스트 다이어그램

```text
app/page.tsx
├─ getHomeSummary()
│  ├─ both sources present
│  ├─ one source stale
│  └─ zero signals
├─ getCoupangSignals()
│  ├─ score sort
│  └─ empty fallback
├─ getOliveYoungSignals()
│  ├─ rank+drop sort
│  └─ rank-missing fallback
└─ render
   ├─ DecisionStrip visible
   ├─ DecisionStrip hidden
   └─ partial home state

Detail route
├─ buildReasonBullets()
│  ├─ price-only
│  ├─ rank+price
│  └─ weak-signal fallback
├─ buildReferenceViewModel()
│  ├─ verified match
│  ├─ no match
│  └─ link-only fallback
├─ Alert CTA
│  ├─ idle
│  ├─ subscribed
│  └─ unavailable
└─ Compare CTA
   ├─ explicit curated match
   └─ absent
```

### 단위 테스트
- `lib/signals/price-changes.test.ts`: 쿠팡 drop-only / 올영 rank+drop 조합 / freshness bonus
- `lib/references/hwahae-reference.test.ts`: verified match / no match / link-only fallback
- `lib/view-models/home-signal.test.ts`: 홈에서 B/C/D 필드 제거 확인
- `lib/detail/reasons.test.ts`: weak-signal fallback / confidence beat 문구 규칙

### 통합 테스트
- `app/page` 렌더: 쿠팡/올영 섹션 분리 + decision strip 계약
- 한쪽 섹션 empty, 한쪽 정상일 때 partial state 확인
- 상세에서 chart + alert CTA + reference block tier 확인

### E2E / smoke
- 홈 → detail → primary CTA 클릭
- detail에서 alert CTA 상태 변화
- reference block이 없는 상품에서 UI 깨지지 않는지

### 수동 검증
- 모바일 first viewport에서 두 섹션 hierarchy 확인
- 화해 참고 정보가 홈 어디에도 새지 않는지 확인
- 외부 링크가 모두 `rel="noopener noreferrer"` 인지 확인
- stale source 배지와 copy가 정상 동작하는지 확인

---

## 18. Distribution / repeat-use 보강

이 플랜은 UI만으로 완결되지 않는다. 최소한 아래 3축 중 1개 이상이 같이 움직여야 한다.

1. **SEO landing** — 플랫폼/카테고리/가격 하락 키워드 기반 진입
2. **Alert loop** — 이메일/구독 중심의 재방문 장치
3. **Retailer-specific sharing** — "올영에서 지금 변한 것", "쿠팡에서 지금 싸진 것" 공유 단위

즉, 홈 개편은 acquisition/distribution 없이 단독 승부하지 않는다.

---

## 19. Dream State Delta

```text
CURRENT
  혼합 피드 + 컬렉션 중심 탐색
      ↓
THIS PLAN
  쿠팡/올영 2섹션 + 상세 판단 엔진 + 화해는 참고 1줄
      ↓
12-MONTH IDEAL
  플랫폼별 변화 감지 + 동일 상품 비교 + 구독/알림 최적화 + 내부 랭킹 신뢰 엔진
```

이 플랜은 12개월 ideal의 **첫 번째 명확한 UI 계약**이다.  
즉, 지금은 `dual-source judgment UI`를 고정하고, `cross-source canonical intelligence`는 이후 단계로 미룬다.

---

## AUTOPLAN REVIEW — CEO

### 0A. Premise challenge
- **확정된 것**: 사용자는 홈을 쿠팡/올영 2섹션으로 나누고, 우리 데이터 중심 + 화해 참고-only 방향을 원한다.
- **확정되지 않은 것**: 2섹션 구조 자체가 CTR/수익/재방문을 개선하는지, 차트가 실제 신뢰를 높이는지, 화해 1줄 참고가 행동에 도움이 되는지는 아직 가설이다.
- **핵심 교정**: 이 플랜의 product thesis는 “듀얼 플랫폼 브라우징 앱”이 아니라 **buy-now decision engine + alerts** 여야 한다.

### 0B. Existing code leverage map
- 홈 merged signal feed → 분리 helper로 재사용 가능
- 소스별 detail route + 차트 → detail intelligence shell의 기반
- collection subscription infra → product-watch로 직접 재사용 불가, 별도 모델 필요
- data exposure policy → allowlist adapter 명세의 기준 문서

### 0C. Dream state diagram
```text
CURRENT
  merged feed + collections + source-specific detail
      ↓
THIS PLAN
  strongest opportunity strip + dual platform sections + verified-only references
      ↓
12-MONTH IDEAL
  alert-first decision engine + canonical product graph + personalized signal trust layer
```

### 0C-bis. Implementation alternatives
| 접근 | 장점 | 단점 | 판정 |
|---|---|---|---|
| Dual-section only | 현재 코드 재사용 최대 | wedge/retention이 약함 | 기각 |
| Alert-first only | retention 검증 빠름 | 현재 사용자 지시(2섹션)와 어긋남 | 부분 채택 |
| Hybrid: strongest strip + dual sections + detail intelligence | 사용자 지시 유지 + wedge 보강 | helper/계측 추가 필요 | **채택** |
| Olive Young-first only | 수익성 강함 | 쿠팡 비교축 약화 | 보류 |

### 0D. Mode selection
- **SELECTIVE EXPANSION**으로 진행
- 사용자 baseline(쿠팡/올영 2섹션)은 유지
- 단, wedge를 지키기 위해 strongest-opportunity strip / repeat-use metrics / product-watch backend를 scope 안으로 끌어들임

### 0E. Temporal interrogation
- **Hour 1**: strongest signal strip + detail CTR 계측이 살아 있어야 함
- **Day 7**: section CTR, affiliate CTR, alert opt-in 전환을 볼 수 있어야 함
- **Month 1**: revisit와 revenue-per-100-detail-views로 product pull을 판정해야 함
- **Month 6 regret test**: “우리는 UI만 다듬고 alert/graph/moat를 못 만들었는가?”

### 0F. Premise gate
- **Passed via explicit user instruction (2026-04-15)**
- 사용자 지시: “쿠팡, 올영 두 가지 섹션으로 하고, 우리만의 데이터를 보여주는 것으로 방향을 잡았다.”

### CEO DUAL VOICES — CONSENSUS TABLE
| Dimension | Analyst | Critic | Consensus |
|---|---|---|---|
| Premises valid? | 4/10 | 4/10 | **CONFIRMED issue** — explicit but weakly validated |
| Right problem to solve? | Partly right, too UI-first | Right problem, wrong wedge | **CONFIRMED issue** — decision engine framing 필요 |
| Scope calibration correct? | Too complete before proof | UI refactor > wedge proof | **CONFIRMED issue** |
| Alternatives sufficiently explored? | No | No | **CONFIRMED issue** |
| Competitive/market risks covered? | Under-addressed | Under-addressed | **CONFIRMED issue** |
| 6-month trajectory sound? | Weak pull risk | Copyable UI risk | **CONFIRMED issue** |

### CEO completion summary
- Strategic direction: **salvageable and improved**
- Required correction: UI-first → **decision/alert-first**
- Highest-confidence additions: strongest-opportunity strip, repeat-use metrics, product-watch backend, distribution follow-up

---

## AUTOPLAN REVIEW — DESIGN

### Design scope assessment
- UI scope: **Yes**
- Existing design system doc: **No DESIGN.md**
- Existing codebase calibration: `Cormorant Garamond` + `Noto Sans KR`, warm cream palette, narrow app shell, row/list heavy mobile UI

### Design litmus summary
- The plan is no longer generic in direction, but it was under-specified around hierarchy contract, state model, and desktop behavior.
- The revised plan now locks: decision strip contract, row anatomy, visual spec, state tiers, alert entry model, and desktop shell behavior.

### DESIGN DUAL VOICES — CONSENSUS TABLE
| Dimension | Designer | Critic | Consensus |
|---|---|---|---|
| IA | 7/10 | 6/10 | **CONFIRMED issue** — strip authority + category browse removal must be explicit |
| Interaction states | 5/10 | 4/10 | **CONFIRMED issue** — freshness/alert/availability states missing |
| User journey | 5/10 | 6/10 | **CONFIRMED issue** — reward/confidence beat needed |
| Anti-slop specificity | 4/10 | 7/10 | **DISAGREE** — good guardrails exist, but interaction specificity was too low |
| Design-system alignment | 7/10 | 8/10 | **CONFIRMED acceptable** |
| Responsive/a11y | 5/10 | 6/10 | **CONFIRMED issue** — desktop contract needed |
| Unresolved decisions | 4/10 | 3/10 | **CONFIRMED issue** |

### Design completion summary
- Locked decisions:
  - home core에서 collections 제거
  - decision strip fixed contract
  - desktop 2-column allowed within wider shell
  - primary / secondary / tertiary CTA order
  - reference block default collapsed
- Remaining taste pressure is low enough to implement without design drift

---

## AUTOPLAN REVIEW — ENG

### Scope challenge
- The visible change looks like a home UI refactor, but the real blast radius includes:
  - signal contracts
  - typed legal boundaries
  - detail normalization
  - alert backend mismatch
  - test wiring
- Minimal safe path is **not** “just split the current helper and tweak layout.”

### ENG DUAL VOICES — CONSENSUS TABLE
| Dimension | Architect | Critic | Consensus |
|---|---|---|---|
| Architecture sound? | 5/10 | 5/10 | **CONFIRMED issue** — merged home + duplicated detail 구조가 bottleneck |
| Test coverage sufficient? | 3/10 | 2/10 | **CONFIRMED issue** |
| Performance risks addressed? | 5/10 | 6/10 | **CONFIRMED moderate risk** |
| Legal boundary enforcement? | 4/10 | 3/10 | **CONFIRMED issue** |
| Error paths handled? | 4/10 | 4/10 | **CONFIRMED issue** |
| Deployment risk manageable? | 5/10 | 6/10 | **CONFIRMED moderate risk** |

### Architecture ASCII diagram
```text
HomePage
├─ Promise.allSettled
│  ├─ getHomeSummary
│  ├─ getCoupangSignals
│  └─ getOliveYoungSignals
├─ DecisionStrip
├─ PlatformSignalSection(Coupang)
└─ PlatformSignalSection(OliveYoung)

DetailPage(source)
├─ source loader
├─ normalize detail model
├─ buildReasonBullets
├─ buildReferenceViewModel(verified only)
├─ PriceChart
├─ AlertCTA
└─ BuyCTA / CompareCTA

ProductWatch backend
├─ create
├─ verify
└─ unsubscribe
```

### Failure modes registry
| Failure mode | Severity | Plan response |
|---|---|---|
| one source fails, other succeeds | High | `Promise.allSettled` + section-local state |
| stale data shown as fresh | High | stale badge at 24h + timestamp explicit |
| legal boundary leak (B field on home) | Critical | typed view model + allowlist adapter + flag |
| detail alert CTA lies about product watch | Critical | product-watch backend or downgraded CTA copy |
| verified reference missing | Medium | link-only fallback or no block |
| duplicated cross-source same SKU | Medium | v1 explicit no-dedupe rule |

### Eng completion summary
- Hidden complexity is concentrated in **data contracts**, not styling
- The revised plan is implementation-safe only if helper split, typed adapters, and alert backend alignment happen before UI polish

---

## Cross-phase themes

1. **UI는 수단이고 wedge는 decision engine다**
   - CEO 2 voices + design critic + eng voices 공통
2. **alert / repeat-use loop가 핵심인데 현재 backend가 부족하다**
   - CEO analyst, eng critic 공통
3. **legal boundary는 문서가 아니라 typed adapter로 강제해야 한다**
   - eng 2 voices 공통
4. **current home merged feed 구조를 먼저 해체해야 한다**
   - design + eng 공통

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|---|---|---|---|---|
| 1 | CEO | Product thesis를 dual-platform UI가 아니라 buy-now decision engine으로 재프레이밍 | P1, P2 | 6개월 방어력은 layout가 아니라 판단/재방문 엔진에 있음 | 순수 2섹션 브라우징만 유지 |
| 2 | CEO | strongest-opportunity strip를 2섹션 위에 추가 | P1, P5 | 사용자에게 먼저 보여줄 것은 플랫폼이 아니라 가장 강한 신호 | rigid platform split only |
| 3 | CEO | platform split/차트/reference를 가설로 명시 | P3, P6 | 검증되지 않은 전제를 사실처럼 구현하면 학습이 막힘 | 전부 확정사항처럼 유지 |
| 4 | CEO | repeat-usage / revenue metrics를 성공지표에 포함 | P1 | CTR만으로는 사업성을 증명할 수 없음 | dwell/CTR만 측정 |
| 5 | CEO | alternative table에 alert-first / unified feed / SEO 진입을 반영 | P1, P3 | dismissed alternatives를 문서화해 후회 비용을 줄임 | 대안 미기재 |
| 6 | Design | collections browse를 home core에서 제거 | P5 | 3개 hierarchy 동시 유지 시 정보구조 붕괴 | 기존 collections를 홈에 계속 병치 |
| 7 | Design | decision strip contract를 headline/metrics/timestamp로 고정 | P5 | strip가 hero인지 status bar인지 떠 있으면 구현 drift 발생 | 추상적 strip 유지 |
| 8 | Design | detail primary/secondary/tertiary CTA 우선순위를 고정 | P5 | primary action ambiguity는 monetization과 UX를 동시에 해침 | buy/compare/alert를 구현자 임의 결정 |
| 9 | Design | reference block default collapsed + verified-only | P1, P5 | A등급 판단 UI보다 앞에 오면 법적/UX 경계가 흐려짐 | inline open reference block |
| 10 | Eng | source-specific helper + summary payload + `Promise.allSettled` 채택 | P1, P5 | partial/stale/error states를 current merged helper로는 표현 불가 | merged helper filter patch |
| 11 | Eng | typed allowlist adapters를 architecture precondition으로 추가 | P1 | 문서 규칙만으로는 legal boundary를 못 지킴 | 코드상 암묵적 안전성에 의존 |
| 12 | Eng | detail alert CTA는 product-watch backend 없이는 열지 않음 | P1, P5 | collection 구독을 product watch처럼 라벨링하면 UX 거짓말이 됨 | collection alert 재라벨링 |
| 13 | Eng | test runner를 `node:test` + `tsx` + Playwright로 고정 | P4, P5 | 새 의존성 없이 현 runtime으로 충분히 lake를 boil 가능 | Vitest/Jest 신규 도입 |
| 14 | Eng | v1 cross-source dedupe는 하지 않음 | P3, P5 | canonical matching 없는 상태에서 억지 dedupe는 오탐 위험이 큼 | 약한 문자열 매칭 dedupe |
