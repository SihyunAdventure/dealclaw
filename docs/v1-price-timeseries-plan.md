# v1 가격 시계열 & M3 SSH 워크플로 Plan

**작성**: 2026-04-15
**스코프**: 쿠팡 per-product 시계열 + 1h 주기 수집 + 제품 상세 차트 UI + 작업 맥 → M3 운영 워크플로 정착
**Out of scope**: 캐노니컬 제품 매칭(v2), 화해 데이터 모델(SIH-568 진행 중), rist/orbit/conveyor EC2 이전(`ec2-to-m3-migration.md` 별도)

---

## 배경

- 올영은 `oliveyoung_ranking_snapshots`로 제품별 시계열 이미 확보 → 주식 차트 가능
- 쿠팡은 `products`(현재 상태) + `price_history`(카테고리 집계)만 있음 → **제품별 시계열 없음**
- hotinbeauty 크롤은 M3 (`100.108.169.66`)에서 launchd로 09:00/21:00 KST 운영 중
- 작업은 메인 맥에서 하고, Tailscale SSH로 M3 제어하는 패턴을 정착시켜야 함

## 합의된 방향 (대화 기록)

1. v1은 소스별 탭으로만 노출. 캐노니컬 매칭은 v2.
2. 쿠팡 시계열은 일단 **1시간 간격으로 전체 수집**, 실제 변동 주기는 데이터 쌓이고 분석
3. 올영 구조(`<source>_products` + `<source>_price_snapshots`)를 표준 패턴으로
4. 화해는 SIH-568 끝난 뒤 이 패턴에 맞추기

---

## Phase 1 — 쿠팡 시계열 스키마 🗄️

### 1.1 테이블 추가
`lib/db/schema/coupang.ts`:

```ts
export const coupangPriceSnapshots = pgTable(
  "coupang_price_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    coupangId: text("coupang_id").notNull(),          // 역조회용 캐시
    collection: text("collection").notNull(),          // 역조회용 캐시
    salePrice: integer("sale_price").notNull(),
    originalPrice: integer("original_price"),
    discountRate: integer("discount_rate").default(0),
    unitPriceValue: integer("unit_price_value"),
    isRocket: boolean("is_rocket").default(false),
    rank: integer("rank"),                             // 카테고리 내 해당 시점 순위
    badges: text("badges").array(),
    crawledAt: timestamp("crawled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_cp_snap_product_time").on(t.productId, t.crawledAt),
    index("idx_cp_snap_coupang_time").on(t.coupangId, t.crawledAt),
    index("idx_cp_snap_collection_time").on(t.collection, t.crawledAt),
  ],
);
```

### 1.2 기존 `priceHistory`는 유지
- 용도: 카테고리 최저가 변동 (컬렉션 레벨)
- 새 `coupangPriceSnapshots`: 제품별 시계열 (차트용)

### 1.3 마이그레이션
- `npx drizzle-kit generate` → migration 파일 확인
- Neon 적용: `npx drizzle-kit migrate` (또는 기존 workflow)

**완료 조건**: Neon에 `coupang_price_snapshots` 존재, 3개 인덱스 생성됨.

---

## Phase 2 — 수집 레이어 📥

### 2.1 저장 로직 추가
- `src/crawl/` 아래 (올영의 `oliveyoung-storage.ts` 패턴 참고)
- 쿠팡 크롤 완료 후 현재: `products` upsert → 여기에 **snapshot insert 병행**
- 한 번의 crawl run에서 products N개 → snapshots N개 동시 기록

### 2.2 기존 `coupang-search.ts` 수정 지점 확인
- 파서 결과 → storage 진입점에서 snapshot 함수 호출
- rank는 크롤 결과 순서로 부여 (1부터)

### 2.3 로컬 검증
```bash
# 작업 맥에서
npm run crawl:coupang -- --collection=cleansing-foam --dry-run=false
# 이후 Neon 콘솔 또는 psql로:
# SELECT count(*) FROM coupang_price_snapshots WHERE crawled_at > now() - interval '5 min';
```

**완료 조건**: 1회 실행 시 products 행 수 = snapshots 행 수.

---

## Phase 3 — 1시간 주기 ⏰

### 3.1 M3 launchd plist 수정
- 현재: `~/Library/LaunchAgents/com.hotinbeauty.crawl.plist` (StartCalendarInterval 09:00, 21:00)
- 변경: **StartInterval 3600** (1h 주기) 또는 StartCalendarInterval 매시 정각
- 또는 **쿠팡만 1h, 올영은 그대로 09/21** 분리 (플릿 2개)

### 3.2 변경 절차 (작업 맥 → SSH)
```bash
ssh sihyun@100.108.169.66

# 백업
cp ~/Library/LaunchAgents/com.hotinbeauty.crawl.plist \
   ~/Library/LaunchAgents/com.hotinbeauty.crawl.plist.bak-$(date +%Y%m%d)

# 편집 (작업 맥에서 편집 후 scp가 편함)
# unload → load
launchctl unload ~/Library/LaunchAgents/com.hotinbeauty.crawl.plist
launchctl load ~/Library/LaunchAgents/com.hotinbeauty.crawl.plist
launchctl list | grep hotinbeauty
```

### 3.3 관찰 (3~7일)
수집 후 확인 쿼리:
- 같은 `coupangId`의 `salePrice` 변동 빈도 (distinct price per day)
- `coupangId` 재등장률 (매 시간 같은 제품이 들어오는지)
- 컬렉션별 상위 10 재등장률

**완료 조건**:
- 1h 주기로 안정 가동 (3일간 실패 0회)
- 주기 조정 여부 결정 (e.g., 3h로 완화해도 의미있는 데이터가 남는지)
- 결과를 이 문서 하단 "관찰 결과" 섹션에 기록

---

## Phase 4 — 제품 상세 시계열 차트 📈

### 4.1 라우트 설계
- 올영: `/p/oy/[productId]` (productId = goodsNo)
- 쿠팡: `/p/cp/[coupangId]`
- 두 경로 모두 server component에서 DB 조회

### 4.2 차트 라이브러리
- **Recharts** 우선 검토 (Next.js 친화, tree-shakeable, 가볍)
- 대안: Visx(D3 베이스, 커스텀 자유도 ↑), lightweight-charts(금융 차트 전문)
- MVP는 Recharts가 빠름

### 4.3 차트에 그릴 것
- Y축: 가격 (salePrice 기준)
- X축: 시간 (crawled_at)
- 보조: 할인율 영역, 오특/로켓 뱃지 마커
- 올영 추가: 랭킹 라인 (역축)

### 4.4 페이지 구조
```
[제품 카드: 이미지 / 브랜드 / 이름 / 현재가 / 링크]
[가격 시계열 차트]
[최근 가격 이벤트: "2일 전 2000원 할인 시작" 같은 변곡점]
[외부 링크: 플랫폼에서 보기]
```

### 4.5 홈 연결
- 기존 랭킹/카테고리 카드에 href 추가 → 상세 라우트

**완료 조건**: 올영 1개, 쿠팡 1개 제품 상세 페이지에서 차트 렌더링 성공 (로컬).

---

## Phase 5 — M3 SSH 운영 워크플로 🔧

### 5.1 기본 정보
| 항목 | 값 |
|---|---|
| 호스트 | `sihyun@100.108.169.66` (Tailscale) |
| 앱 경로 | `/Users/sihyun/apps/hotinbeauty` |
| 엔트리 | `~/.local/bin/hotinbeauty-crawl` |
| launchd | `~/Library/LaunchAgents/com.hotinbeauty.crawl.plist` |
| DB | Neon (`.env.local` DATABASE_URL, chmod 600) |

### 5.2 표준 배포 흐름
작업 맥에서:
```bash
# 1. 로컬 커밋/푸시
git push origin feat/xxx

# 2. M3 업데이트
ssh sihyun@100.108.169.66 << 'EOF'
cd ~/apps/hotinbeauty
git fetch
git checkout main && git pull    # (또는 해당 브랜치)
npm install
npm run build
EOF

# 3. launchd 재시작 (plist 바꾼 경우만)
ssh sihyun@100.108.169.66 \
  "launchctl unload ~/Library/LaunchAgents/com.hotinbeauty.crawl.plist && \
   launchctl load ~/Library/LaunchAgents/com.hotinbeauty.crawl.plist"

# 4. 수동 테스트 실행
ssh sihyun@100.108.169.66 '~/.local/bin/hotinbeauty-crawl'

# 5. 로그 확인 (launchd stdout 경로는 plist의 StandardOutPath 참고)
ssh sihyun@100.108.169.66 'tail -n 100 /tmp/hotinbeauty-crawl.log'
```

### 5.3 배포 스크립트 (선택, 편의용)
`scripts/m3-deploy.sh` (작업 맥에서 실행):
```bash
#!/usr/bin/env bash
set -euo pipefail
HOST="sihyun@100.108.169.66"
BRANCH="${1:-main}"
ssh "$HOST" "cd ~/apps/hotinbeauty && git fetch && git checkout $BRANCH && git pull && npm install && npm run build"
echo "✅ deployed $BRANCH on M3"
```

### 5.4 migration 실행 정책
- DB migration은 작업 맥에서 바로 실행 OK (Neon 공유)
- `.env.local`의 DATABASE_URL만 맞으면 됨

### 5.5 주의사항
- M3 절전 모드 / 자동 업데이트로 launchd가 놓치는 케이스 주기 확인 (M3 재부팅 후 launchctl list 검증)
- `.env.local` 변경 시 scp로 동기화 (Git ignore 대상)
- Chrome 자동 업데이트로 크롤 실패 가능 → 실패 감지 알림 (Phase 6 후보)

**완료 조건**: 위 흐름을 이 문서에 적은 대로 1회 완주 (pull → build → manual run → log 확인).

---

## Phase 6 — 후속 과제 (이 plan 밖)

- 크롤 실패 알림 (Discord/Telegram webhook)
- 쿠팡 주기 최적화 (Phase 3 관찰 결과 기반)
- 캐노니컬 제품 매칭 (v2, 별도 plan)
- 화해 데이터 모델 표준 패턴 정렬 (SIH-568 머지 후)

---

## 실행 순서 권장

1. **Phase 1 → 2 → 3** 연속 (데이터부터 쌓여야 UI가 의미 있음)
2. 데이터 3~5일 쌓이는 동안 **Phase 4** (UI) 병행 가능
3. **Phase 5**는 언제든 (지금 이미 부분적으로 가능)

## 리스크

| 리스크 | 완화 |
|---|---|
| 쿠팡 1h가 Akamai 차단 유발 | 첫날은 주의 모니터링, 차단 감지 시 3h로 후퇴 |
| snapshots 데이터 폭증 (12컬렉션 × 최대 100개 × 24회/일 = 28.8k rows/일) | 인덱스는 있음. Neon 용량은 한 달 ~860k rows까지 문제 없음. 파티셔닝은 3개월 후 판단 |
| M3 재부팅 후 launchd 누락 | 1주에 1회 `launchctl list` 점검 |
| Chrome 자동 업데이트로 크롤 실패 | launchd 실패 감지 → 알림 (Phase 6) |

---

## 관찰 결과 (Phase 3 후 채움)

- [ ] 1h 주기 안정 가동일 수: __일
- [ ] coupangId 재등장률: __%
- [ ] 가격 변동 중위값: __시간
- [ ] 최종 결정 주기: __h
