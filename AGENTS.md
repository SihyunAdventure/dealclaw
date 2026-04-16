<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Operations / Infra (2026-04-17~)

크롤러 자동화는 **M3 MacBook + Tailscale + macOS launchd** 로 운영됩니다. AWS Fargate/EC2 추측 금지.

- **호스트**: `sihyun@sihyuns-macbook-pro-m3` (Tailscale hostname). 외부 노출 없음
- **원격 디렉토리**: `/Users/sihyun/apps/hotinbeauty` (env: `HOTINBEAUTY_M3_DIR`)
- **스케줄러**: macOS launchd label `com.hotinbeauty.crawl`
  - plist: `~/Library/LaunchAgents/com.hotinbeauty.crawl.plist` (정의는 `scripts/install-mac-launchd.sh` 가 생성)
  - entry: `~/.local/bin/hotinbeauty-crawl` → `scripts/run-scheduled-crawls.sh`
  - 슬롯: 매시 정각 06, 09~21 KST
  - 로그: `~/Library/Logs/hotinbeauty/crawl-YYYY-MM-DD.log`
- **배포**: `bash scripts/m3-deploy-crawler.sh` (tar SSH 전송 → npm test → tsc → eslint → launchd reload). non-interactive SSH PATH 문제로 ssh 명령은 `bash -lc '...'` 로 감쌈
- **헬스체크**: `bash scripts/m3-crawler-healthcheck.sh` (원격 `crawler-healthcheck.sh` 호출)
- **AWS 자원**: **SES만 사용** (이메일 알림 via `lib/email/ses.ts`, identity `hi@hotinbeauty.com`). ECS/Fargate/EC2/EventBridge/ECR 모두 미사용 — 검색해도 0개. 옛 ADR `docs/adr/aws-cron-adr.md` 는 superseded
- **DB**: Neon Postgres serverless. `DATABASE_URL` in `.env.local` (M3에도 동일 필요). neon-http 드라이버는 **트랜잭션 미지원** + 거대 batch insert 시 drizzle SQL builder가 stack overflow → 1k row chunk로 분할 (예: `src/crawl/hwahae-storage.ts` `INSERT_CHUNK_SIZE`)
- **CI/CD**: `.github/workflows/` 없음. 푸시 후 main 머지 → 수동 `m3-deploy-crawler.sh` 실행

## Crawler runtime map

| 플랫폼 | entry | 스케줄 KST | 정의 |
|---|---|---|---|
| coupang | `src/scripts/run-crawl.ts` | 09~20 시간분산 | `src/data/collections.ts` `scheduleHourKst` |
| oliveyoung | `src/scripts/run-oliveyoung-crawl.ts` | 09, 21 | `OLIVEYOUNG_SCHEDULE_HOURS_KST` env |
| hwahae | `src/scripts/run-hwahae-crawl.ts` | 06 full / 12 probe | `HWAHAE_FULL_SCHEDULE_HOUR_KST`, `HWAHAE_PROBE_SCHEDULE_HOUR_KST` |

세 크롤러 모두 `scripts/run-scheduled-crawls.sh` 가 KST 시각으로 dispatch.

## Commit / PR conventions (commit-msg hook 강제)

이 프로젝트의 commit-msg hook은 **`feat|fix|perf|refactor` 타입에 Linear 이슈 키(`SIH-XXX`) 누락을 차단**합니다. 작업 시작 전 또는 적어도 commit 직전에:

1. Linear 이슈가 있는지 확인. 없으면 `dw-linear-create-issue "제목" "설명"` 으로 발급 (returns `SIH-XXX` URL)
2. commit 메시지: `<type>(<scope>): <subject> (SIH-XXX)`
3. PR 본문에 `Fixes SIH-XXX` 라인 포함 → 머지 시 Linear 자동 close
4. `chore|docs|style|test|ci|build` prefix는 hook 통과 (이슈 키 불필요)
5. 우회 환경변수 없음 — 이슈를 만드는 게 정답

`gsp` / `commit-push-pr` 슬래시 커맨드는 위 검증을 자동화하니 1회성 작업엔 그쪽 사용 권장.

## Common pitfalls

- 새 카테고리를 `src/data/collections.ts`에 추가해도 즉시 안 돔 — 해당 `scheduleHourKst` 슬롯이 도래해야 첫 데이터. 강제 검증은 `npm run crawl -- --collection=<slug>`
- `npx tsx <script>` 는 프로젝트 루트에서만 모듈 resolve 됨. `/tmp` 에 임시 스크립트 만들면 dotenv/drizzle import 실패
- drizzle insert: 수만 row 이상이면 항상 chunk. neon-http는 transaction 없음
- `git push` 전 `git remote -v` / `gh auth status` 확인 (Linear workflow defaults 참조)
