# 화해 크롤 Phase 5 배포 계획 (SIH-571)

SIH-570 Phase 4 엔트리 `src/scripts/run-hwahae-crawl.ts` 를 맥북 서버에서 매일 KST 06:00 에 실행시키는 launchd 구성.

## 목표 상태

- 맥북 (M3) 이 켜져 있는 동안 매일 06:00 KST 에 자동 실행
- 실행 로그: `~/Library/Logs/hotinbeauty/hwahae-YYYY-MM-DD.log`
- 실패 시 재시도 없음 — 다음날 자동 재실행 (crawl 은 upsert 라 idempotent)
- 사용자 수동 trigger 가능 (`install-hwahae-launchd.sh run-now`)
- 올영 크롤(09:00/21:00)과 시간대 분리

## 구성요소

### 1. npm script
`package.json` 에 추가:
```json
"crawl:hwahae": "tsx src/scripts/run-hwahae-crawl.ts",
"crawl:hwahae:dry": "tsx src/scripts/run-hwahae-crawl.ts --dry-run"
```

### 2. launchd plist
```
Label:                 com.hotinbeauty.hwahae-crawl
ProgramArguments:      [$HOME/.local/bin/hotinbeauty-hwahae-crawl]
WorkingDirectory:      $HOME
StartCalendarInterval: { Hour=6, Minute=0 }        # KST(시스템 TZ)
RunAtLoad:             false
StandardOutPath:       ~/Library/Logs/hotinbeauty/hwahae-launchd.out.log
StandardErrorPath:     ~/Library/Logs/hotinbeauty/hwahae-launchd.err.log
ProcessType:           Background
```

### 3. Entry wrapper (`~/.local/bin/hotinbeauty-hwahae-crawl`)
- ~/Documents 안 스크립트 실행 금지(macOS TCC) 우회용 — 올영 패턴 재사용
- `set -Eeuo pipefail`
- PATH + nvm 로드 → `cd $PROJECT_PATH` → `npm run crawl:hwahae`
- stdout/stderr 를 date-stamped 로그로 append

### 4. 설치 스크립트 (`scripts/install-hwahae-launchd.sh`)
동사: `install | reload | uninstall | status | run-now` (올영 스크립트와 동일 인터페이스)

## 설계 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| Label | `com.hotinbeauty.hwahae-crawl` | 올영 `com.hotinbeauty.crawl` 과 충돌 방지 |
| 시간 | 06:00 KST | 화해 갱신 05:00 직후 · 올영과 3시간 이상 간격 |
| 트리거 | `StartCalendarInterval` 단일 | 하루 1회면 충분. sleep 중이면 skip — 다음날 upsert 로 복원 |
| `RunAtLoad` | `false` | 재부팅·install 시 즉시 실행 방지 (수동 `run-now` 로 확인) |
| 재시도 | 없음 | neon-http 트랜잭션 미지원 + upsert idempotent → 다음 실행이 복원 |
| 비밀값 | `.env.local` (프로젝트 루트) | 올영과 동일. dotenv 로드. Keychain 은 과한 복잡도 |
| 로그 rotation | date-stamped 파일 | newsyslog 설정 대신 단순. 30일 이상 된 파일은 별도 clean-up cron 으로 |
| 모니터링 | `status` 명령 + `tail -f` | Discord/Slack 알림은 Phase 5 범위 밖 (후속 이슈로 분리) |
| Tailscale | 의존 없음 | 실행 자체는 로컬. Tailscale 은 원격 관리 편의 용도 |

## 배포 절차 (사용자)

```bash
# 1. 의존성 준비
npm install
echo "DATABASE_URL=..." >> .env.local

# 2. 드라이런으로 크롤 path 확인
npm run crawl:hwahae:dry

# 3. 실 DB 한 번 돌려봐서 저장 확인
npm run crawl:hwahae

# 4. launchd 등록
scripts/install-hwahae-launchd.sh install

# 5. 수동 trigger 로 launchd 경로 확인
scripts/install-hwahae-launchd.sh run-now

# 6. 상태 확인
scripts/install-hwahae-launchd.sh status
```

## 예상 실행 프로파일

- 카테고리 트리 SSR 3회 + gateway 리프 ~380개 × 1req + brand SSR 1회 = **~384 req**
- 병렬 15 기준 예상 **~40초** (gateway-api.md 실측 124ms/req × 380 / 15)
- DB 저장:
  - products upsert ~3800건 (5 테마 × leaf별 100 상품 중 중복 제거)
  - ranking_snapshots 4000건 append
  - product_topics 10000건 append
  - category_nodes upsert 2500건
  - brands upsert ~500건
  - brand_snapshots 10건 append
  - themes upsert 5건
  - crawl_runs 5건 append
- neon-http 한 번에 한 쿼리 → 총 ~20000 query 실행 = **약 2~5분** 예상

## 리스크 & 오픈 이슈

### 머신 가용성
- 맥북 휴면 or 전원 끊김 → 그 날 skip → 다음날 upsert 로 복원 (허용)
- 장기 부재(1주+) → 랭킹 시계열에 gap 생김. acceptance: snapshots 는 append-only 라 읽기 쪽에서 nullable 전제

### 시크릿
- `.env.local` 은 git ignore 됨 — 올영과 동일
- 교체 시: `.env.local` 수정 후 `install-hwahae-launchd.sh reload`

### 로그 디스크 사용
- hwahae 로그 ~5MB/day × 365 ≈ 1.8GB/year — 수용 가능
- 별도 cleanup: 추후 `scripts/trim-hwahae-logs.sh` (90일 이상 삭제) 추가 이슈로 분리

### 중복 실행 방어
- launchd 기본: plist 의 단일 실행. 이전 인스턴스가 아직 실행 중이면 새 스케줄 건너뜀
- `run-hwahae-crawl.ts` 는 external lock 없음 — 수동 + cron 중복 실행 시 DB upsert 경합 있으나 데이터 오염 없음

## Not in scope (후속 이슈)

- 실패 시 Discord/Slack 알림 (별도 이슈)
- 로그 rotation automation (90일 트림)
- 다중 머신 분산 실행 (현재는 M3 단일)
- 크롤 스케줄 UI (HUD 화면)

## 구현 Artifact 목록

1. `package.json` — `crawl:hwahae`, `crawl:hwahae:dry` 스크립트
2. `scripts/install-hwahae-launchd.sh` — 설치/제거/상태/수동실행
3. `docs/hwahae/deployment.md` — 배포 런북 (사용자 용)
4. (선택) `scripts/trim-hwahae-logs.sh` — 후속 이슈로 분리

테스트:
- `install-hwahae-launchd.sh install` → plist 존재 · launchctl list 성공 → `run-now` → 로그 출력 확인
- CI 는 shellcheck 정도만
