# Phase 6 UI 플랜 — CEO Dual Voice Review

**생성**: 2026-04-15 / `/autoplan` Phase 1 (CEO) 산출물
**대상 플랜**: `docs/hwahae/phase6-ui-plan.md`
**결과**: REVISE — 양쪽 모두 6/6 차원에서 전제 약점 지적

## Consensus Table

| 차원 | Claude subagent | Codex | Consensus |
|---|---|---|---|
| 1. 전제 valid? | FAIL — 검증 없음 | FAIL — MSG, 증거 0 | **DISAGREE** |
| 2. Right problem? | FAIL — 탐색 vs 구매 의도 | FAIL — 데이터→렌더, wedge 없음 | **DISAGREE** |
| 3. Scope calibration? | FAIL — 5 테마 균등 투자 | FAIL — 2524 노드 트리 쓸모 | **DISAGREE** |
| 4. Alternatives explored? | FAIL — Option C 반사적 기각 | FAIL — 같음, 근거 "대공사" | **DISAGREE** |
| 5. Competitive risk? | FAIL — 글로우픽 누락 | FAIL — 쉽게 복제됨 | **DISAGREE** |
| 6. 6-month trajectory? | FAIL — kill criteria 없음 | FAIL — 6.2~6.5 검증 전 장식 | **DISAGREE** |

6/6 동시 DISAGREE는 드문 강도. 각자 독립적으로 같은 걸 찾아냄.

## User Challenges (양쪽이 원래 방향 바꾸라고 합의)

1. **전제 1~2 재검토** — "통합 뷰티 포털"은 검증된 가설 아니라 내부 욕망. 쿠팡+화해+올영 한 세션 소비 증거 0. 하나 선택하고 올인 필요
2. **Search/filter bar 필수** — "out of scope" 처리는 오류. "지성 토너 2만원 이하" 같은 goal-driven 의도가 진짜 사용자 니즈
3. **TOS/법무는 P0 blocker** — "미해결 질문" 으로 tier-down 하면 안 됨. Phase 6.0 진입 전 해결
4. **Option C 데이터로 재검토** — 현 쿠팡 홈 affiliate 수익 비중·retention 없이 B 선택은 현상유지 편향
5. **1h 스모크 먼저** — 11h 투자 전 `/rankings/category/2` 단일 페이지 + GA 이벤트로 가설 검증. CTR 안 나오면 전체 kill
6. **Wedge 필요** — UI 자체는 복제 쉬움. 방어력은 "의사결정 엔진" (조건 조합 추천, 크로스소스 변화 감지)

## 양쪽이 합격 처리한 것

- 성능 예산 (ISR 레벨, lazy tree expand) 공학적으로 타당
- Stacked PR 롤아웃 (6.0→6.5) kill switch 가능
- 컴포넌트 재사용 전략 (`<ProductCard>` extend) 표면적 절약

## Codex 원문 핵심

> 2524 노드, lazy expand, drawer, sidebar는 "가능한 렌더링"이지 "원하는 탐색"이 아니다. 100-depth 트리는 유저가 아니라 크롤러를 위한 구조다. 첫 출시에서 필요한 건 10~20개 핵심 카테고리와 3~5개 고의도 진입점이다.

> 6개월 뒤 defensible한 건 UI가 아니라 의사결정 엔진이다. 화해/올영/쿠팡이 비슷한 랭킹 화면 내면 끝난다. 방어력은 "어떤 피부 고민/가격대/리뷰 토픽 조합에서 지금 사야 할 것" 같은 판단, 혹은 크로스소스 변화 감지 알림에 있다. 이 계획엔 그 wedge가 없다.

> 6개월 후 가장 foolish해 보일 결정은 6.2~6.5까지 다 깔아놓고 "아무도 `/rankings`에 안 온다"를 발견하는 것이다.

## Claude 원문 핵심

> "No search bar" is a strategic miscalibration, not a scope cut. Real intent is often goal-driven. Shipping 121k products behind only a category tree optimizes for browsers, not buyers — and browsers don't convert coupang affiliate links.

> Premise #2 ("통합 뷰티 포털") contradicts premise #5 and Option B rationale. You're building a traffic magnet with no monetization path while claiming portal unification.

> TOS/legal is an unresolved question, not a risk. If 화해 sends a cease-and-desist after 6.3 ships, all 11h is waste. Resolve BEFORE 6.0, not after 6.5.

## 세션 결정

- autoplan Phase 2 (Design) / Phase 3 (Eng) 진행 **보류**
- 사용자가 아래 정보 확보 후 다음 세션에서 reframe
- 본 플랜 doc v1 은 그대로 커밋 → 다음 버전(v2)에서 반영

## 사용자가 확보해야 할 정보

1. **화해 TOS / robots.txt 정책** — 제3자 데이터 공개 노출 가능 여부
2. **현 쿠팡 홈 지표** — DAU, 세션당 페이지뷰, affiliate 클릭 수익, retention (D1/D7)
3. **경쟁 분석** — 글로우픽 / 올리브영 자체 UI 현재 상태 및 gap
4. **비즈니스 목표 우선순위** — 수익(쿠팡) vs 성장(신규 유입) vs 브랜드(신뢰도)

## 다음 세션 재개 시 권장 순서

1. 위 정보 기반으로 plan v2 작성 (Option B / B+wedge / C 중 택1)
2. 1h 스모크 (`/rankings/category/2` + GA) 먼저 구현 → 실측
3. CTR 기준 충족 시 Phase 6.1~6.5 리뷰 재개 (autoplan Phase 2/3)
4. 기준 미달 시 wedge 중심 재설계 (의사결정 엔진, 변화 감지 알림 등)
