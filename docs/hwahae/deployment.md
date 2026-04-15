# 화해 크롤러 배포 런북 (M3 맥북 + launchd)

맥북 서버에서 매일 KST 06:00 에 화해 랭킹을 크롤해 Neon Postgres 에 저장하는 자동화 설정.

## 전제

- macOS (Apple Silicon 기준, Intel 도 동일 명령)
- Node.js 20+ 설치 (nvm 권장)
- Neon Postgres `DATABASE_URL` 확보
- 프로젝트 경로는 `~/Documents/...` 이든 어디든 OK (TCC 우회는 entry script 가 `~/.local/bin` 에 사는 것으로 처리됨)

## 초기 설치

```bash
# 1) 프로젝트 루트에서
npm install

# 2) .env.local 생성 (git ignore)
cat > .env.local <<'EOF'
DATABASE_URL=postgres://...
# (선택) HWAHAE_USER_AGENT=Mozilla/5.0 ...
EOF

# 3) 드라이런 — 네트워크 + 파서 + 크롤러 경로 검증
npm run crawl:hwahae:dry

# 4) 실 DB 한 번 저장해 보기
npm run crawl:hwahae

# 5) launchd 등록 (06:00 KST 자동 실행)
scripts/install-hwahae-launchd.sh install

# 6) 수동 trigger 로 launchd 경로 검증
scripts/install-hwahae-launchd.sh run-now
tail -f ~/Library/Logs/hotinbeauty/hwahae-$(date +%Y-%m-%d).log
```

## 운영 명령

```bash
# 현재 상태 + 최근 로그 60줄
scripts/install-hwahae-launchd.sh status

# 재로드 (plist 또는 entry script 수정 후)
scripts/install-hwahae-launchd.sh reload

# 즉시 실행
scripts/install-hwahae-launchd.sh run-now

# 제거
scripts/install-hwahae-launchd.sh uninstall
```

## 로그 위치

| 파일 | 역할 | rotation |
|---|---|---|
| `~/Library/Logs/hotinbeauty/hwahae-YYYY-MM-DD.log` | 실행별 상세 로그 (entry script 가 기록) | 일자 파편 — 후속: 90일 이상 삭제 스크립트 예정 |
| `~/Library/Logs/hotinbeauty/hwahae-launchd.out.log` | launchd plist stdout | newsyslog (5MB × 7) |
| `~/Library/Logs/hotinbeauty/hwahae-launchd.err.log` | launchd plist stderr | newsyslog (5MB × 7) |

### newsyslog 설정 (선택, 권장)

```bash
# __USER__ 를 본인 사용자명으로 치환
sed "s/__USER__/$USER/g" scripts/newsyslog-hotinbeauty.conf \
  | sudo tee /etc/newsyslog.d/hotinbeauty.conf >/dev/null

# 강제 1회 실행해 유효성 확인
sudo /usr/sbin/newsyslog -vv
```

## 스케줄·머신 가용성

- 스케줄: `StartCalendarInterval { Hour=6, Minute=0 }` — 시스템 타임존(KST) 기준
- 맥북 휴면 중엔 launchd 가 해당 시각의 fire 를 건너뜀 → **그 날은 skip** 됨
- upsert 기반이라 다음날 실행으로 자동 복원
- 연속 skip 여부는 `hwahae_crawl_runs` 의 `finished_at` 으로 읽기 대시보드에서 확인 권장 (마지막 성공 > 48h 전이면 알림)

## 동시 실행·run-now 주의

- launchd 는 같은 label 의 동시 실행을 방지함
- 사용자가 `run-now` 를 스케줄 시각에 가깝게 연속으로 누르면 별도 실행으로 취급됨
- **주의**: `hwahae_ranking_snapshots` / `hwahae_product_topics` / `hwahae_brand_ranking_snapshots` 는 append-only — 같은 day 에 여러 run 을 하면 동일 (product, theme, theme_id) 에 대해 초 단위만 다른 **snapshot 중복 row** 가 생성됨
- 분석 쿼리에서는 `DISTINCT ON (date_trunc('day', crawled_at))` 또는 윈도우 함수로 하루 1개 선택 권장
- 정상 스케줄 + 가끔 `run-now` 는 데이터 손상 없음 — upsert products/brands, append snapshots

## 올영 크롤과의 공존

- 같은 맥북에 올영 launchd (`com.hotinbeauty.crawl`, 09:00+21:00) 공존
- label/entry/log 전부 분리됨 — 충돌 없음
- `.env.local`, `node_modules` 는 공유 (read-only 소비라 OK)

## 트러블슈팅

| 증상 | 원인/조치 |
|---|---|
| `launchctl list com.hotinbeauty.hwahae-crawl` 가 없음 | `scripts/install-hwahae-launchd.sh install` 재실행 |
| 로그에 `DATABASE_URL 미설정` | `.env.local` 부재/권한. entry script 가 `cd $PROJECT_PATH` 전에 돌진 않는지 확인 |
| 로그에 `HTTP 500` 반복 | hwahae 측 rate-limit. `--max-leaves=N` 로 축소 후 재실행하거나 concurrency 낮춤 (SIH-569 PR 수정) |
| TCC "Operation not permitted" | 직접 `launchctl` 에 프로젝트 경로 지정했을 가능성. install 스크립트 재실행해 `~/.local/bin` 경로로 바꿀 것 |
| 어제 실행 결과가 이상함 | `tail ~/Library/Logs/hotinbeauty/hwahae-YYYY-MM-DD.log` + `launchctl list com.hotinbeauty.hwahae-crawl` 의 `LastExitStatus` 확인 |

## Not in scope (후속 이슈)

- 실패 시 Discord/Slack 웹훅 알림
- 90일 이상 된 `hwahae-YYYY-MM-DD.log` 자동 삭제 스크립트
- 장기 skip 감지 알림 (hwahae_crawl_runs 기반 대시보드)
- 크롤 성공률·소요시간 메트릭 수집
