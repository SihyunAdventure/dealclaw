# EC2 → M3 홈서버 이전 플랜

**작성**: 2026-04-15 세션 중단 시점
**컨텍스트 리셋을 위한 인수인계 문서**. 새 세션은 이 파일 + `git log` + Neon DB 현황을 읽고 이어가면 됨.

---

## 배경 요약 (TL;DR)

- 쿠팡 중심 프로젝트(hotinbeauty)를 올영 중심으로 피봇.
- 올영 TOP100 랭킹 크롤 + 가격 변동 시계열 추적 인프라 완성 (PR #16).
- 이어서 **EC2(t3.medium, notique-agent) → 집 M3 맥북 홈서버**로 모든 서비스 이전 작업 중.
- Tailscale로 M3 SSH 접근 — 메인 작업 맥에서 제어.

---

## ✅ 완료된 작업

### 1. 올영 DB 인프라 (PR #16 — 머지 대기)
- branch: `feat/SIH-557-oliveyoung-db-ec2`
- `lib/db/schema/{coupang,common,oliveyoung}.ts` 분리 + re-export shell
- 3 신규 테이블: `oliveyoung_products`, `oliveyoung_ranking_snapshots`, `oliveyoung_crawl_runs`
- `src/crawl/oliveyoung-storage.ts`, `src/scripts/run-oliveyoung-crawl.ts`, `scripts/ec2-crawl-oliveyoung.sh` (EC2용 wrapper — M3에선 불필요)
- `npm run crawl:oliveyoung` npm script
- `chrome.ts`에 off-screen/headless 옵션 추가
- Architect APPROVED 완료

### 2. hotinbeauty M3 홈서버 가동 (완료)
- M3: `sihyuns-macbook-pro-m3`, Tailscale IP `100.108.169.66`, user `sihyun`
- 위치: `/Users/sihyun/apps/hotinbeauty`
- 의존성 설치 완료 (Homebrew, node v24.x, aws cli, pnpm, Chrome 147)
- `.env.local` (DATABASE_URL) 복사 완료, chmod 600
- launchd: `~/Library/LaunchAgents/com.hotinbeauty.crawl.plist` (09:00, 21:00 KST)
- entry: `~/.local/bin/hotinbeauty-crawl` (쿠팡 + 올영 sub-shell 격리)
- **수동 실행 검증**: dry-run OK, live run OK (products=120, snapshots=400, runs=5 기록)

### 3. 기존 작업 맥 launchd 제거
- `~/Library/LaunchAgents/com.hotinbeauty.crawl.plist` unload + 삭제 완료
- 이제 쿠팡·올영 크롤 모두 **M3 단독 운영**

### 4. M3 기본 인프라
- Homebrew `/opt/homebrew`
- sudoers NOPASSWD: `/etc/sudoers.d/sihyun` (전체 권한 — 설치 편의용, 보안 신경쓸거면 나중에 부분 제한/삭제)
- Remote Login 켜짐 + Tailscale SSH 활성
- AWS credentials scp 완료 (`~/.aws/{credentials,config}`)

---

## 🔄 진행 중 (다음 세션에서 이어갈 것)

EC2에 남은 3개 서비스를 M3로 이전 + EC2 terminate.

### 우선순위 & 예상 난이도

| 순서 | 서비스 | 복잡도 | 이전 방법 요약 |
|------|-------|-------|-------------|
| 1 | `rist-newsletter` | 🟡 중 | Vercel 배포면 cron trigger만 M3로 |
| 2 | `orbit` | 🔴 고 | Xvfb 의존 → off-screen headful 전환 필요 |
| 3 | `conveyor` (hermes) | 🔴 최고 | 로컬 PostgreSQL 38MB pg_dump → Neon 이전 권장 |
| 4 | EC2 terminate | — | 위 3개 다 이전 + 1~2일 관찰 후 |

---

## 📋 각 서비스 상세 (EC2 정찰 결과)

### rist-newsletter
- 경로: `/home/ec2-user/apps/rist-newsletter`
- 타입: Next.js + Supabase (Supabase 디렉토리 있음)
- 배포: **vercel.json 존재** → Vercel 배포 추정
- `.git` 없음 (rsync로 이관)
- EC2 역할: crontab 매분 `scripts/trigger-cron.sh` 실행
- 이전 액션:
  1. **사용자 확인 필요**: Vercel 배포 맞는지? trigger-cron.sh가 하는 일은?
  2. Vercel이면 → M3 cron이 HTTP trigger만 호출하면 됨 (가장 쉬움)
  3. self-hosted면 → rsync + npm install + Supabase env

### orbit
- 경로: `/home/ec2-user/apps/orbit`
- 타입: Next.js (CLAUDE.md, DESIGN.md 있음)
- 배포: **`.git` 없음**, self-hosted EC2 추정
- 특이점: `orbit.bak-*` 5개 백업 디렉토리 (여러 번 실패한 이력?)
- EC2 역할:
  - `healthcheck-supplier.sh` (5분 cron) — Xvfb + Chrome으로 공급처 사이트 헬스체크
  - `sync-supplier-full.sh`, `sync-supplier-weekly.sh` — 동기화 크롤
- 이전 액션:
  1. **사용자 확인 필요**: orbit 뭐 하는 프로젝트? 어떤 공급처? data 중요성?
  2. rsync로 코드 이관
  3. `Xvfb` → **macOS off-screen headful**로 전환 (hotinbeauty `chrome.ts` 패턴 재활용)
  4. healthcheck/sync 스크립트도 M3용으로 경로 수정
  5. M3 launchd 또는 crontab 등록

### conveyor (hermes)
- 경로: `/home/ec2-user/conveyor`
- 타입: pnpm workspace (server + ui + shared)
- GitHub: `git@github.com:SihyunAdventure/conveyor.git`
- PM2 app: `conveyor-api` (자동 시작 없이 중단 상태)
- ecosystem.config.cjs:
  - script: `dist/app.js`
  - cwd: `/home/ec2-user/conveyor/server`
  - **PORT 3200**
  - DATABASE_URL: `./conveyor-data` (로컬 Postgres)
  - CORS_ORIGIN: `*`
- env: `/home/ec2-user/conveyor/server/.env` (5 lines)
- **DB: PostgreSQL 데이터 디렉토리** `/home/ec2-user/conveyor/server/conveyor-data` (38MB)
  - `PG_VERSION`, `base/`, `global/`, `pg_hba.conf` 포함
- 이전 액션:
  1. **사용자 확인 필요**: 데이터 중요도? Neon으로 옮길지 M3 postgres 유지할지
  2. GitHub에서 M3로 clone (`git clone git@github.com:SihyunAdventure/conveyor.git`)
  3. `pg_dump` → DB 파일 → M3 postgres 또는 Neon 복원
  4. `.env` 파일 scp + DATABASE_URL 업데이트
  5. M3에서 pnpm install + build + pm2 start
  6. pm2 startup (macOS는 launchd로) — `pm2 startup launchd`
  7. **외부 접근 필요**: Tailscale 내에서만 접근하므로 `100.108.169.66:3200` (포트포워딩 불필요)

### 공용 shell 스크립트 (orbit 의존)
- `/home/ec2-user/healthcheck-supplier.sh` — 5분 cron
- `/home/ec2-user/sync-supplier-full.sh`, `sync-supplier-weekly.sh`
- Xvfb + Chrome + `APP_DIR=/home/ec2-user/apps/orbit`
- 이전: orbit 코드 이전 시 같이 scp + 경로 수정 + Xvfb 제거

---

## 🗂️ 환경 정보 (치트시트)

### EC2
- Instance ID: `i-0eb065979dbad85b3`
- 이름: `notique-agent`
- 타입: `t3.medium` (이번 세션에 small→medium 업그레이드)
- 리전: `ap-northeast-2` (서울)
- OS: Amazon Linux 2023
- EBS: 24GB gp3 (16→24 확장함, 파일시스템 growfs 완료)
- Public IP: `43.202.109.241`
- Tailscale: offline (crontab으로만 씀)
- Node: v20.20.2 (nvm at `/home/ec2-user/.nvm/`)
- 기설치: google-chrome, Xvfb, git

### M3 홈서버
- Tailscale 이름: `sihyuns-macbook-pro-m3`
- Tailscale IP: `100.108.169.66`
- User: `sihyun`, Home: `/Users/sihyun`
- OS: macOS 14.5 arm64
- 설치 완료: Homebrew, node, npm, pnpm, awscli, git, Chrome 147
- 절전: 사용자가 "정전/통신 장애 없음"이라 확인
- sudoers NOPASSWD: `/etc/sudoers.d/sihyun`

### 작업 맥 (현재 이 세션)
- Tailscale 이름: `sihyuns-macbook-pro-1`, IP `100.126.142.44`
- hotinbeauty launchd 제거됨 ✅
- 잔해: `~/.local/bin/hotinbeauty-crawl` (삭제해도 됨)
- repo: `/Users/sihyunkim/Documents/Activate/Side/hotinbeauty` (branch: `feat/SIH-557-oliveyoung-db-ec2`)

### Neon DB
- URL: SSM Parameter Store `/hotinbeauty/DATABASE_URL` (SecureString, region ap-northeast-2)
- 로컬 `.env.local`에도 동일 값
- 스키마:
  - `products`, `crawl_runs`, `price_history` (coupang)
  - `subscriptions`, `rate_limits` (common)
  - `oliveyoung_products`, `oliveyoung_ranking_snapshots`, `oliveyoung_crawl_runs`

### GitHub
- hotinbeauty: https://github.com/SihyunAdventure/hotinbeauty (PR #16 open)
- conveyor: git@github.com:SihyunAdventure/conveyor.git
- rist-newsletter: GitHub repo 있을지 `.git`이 없어서 확인 필요
- orbit: 마찬가지로 `.git` 없어서 확인 필요

---

## 🧭 다음 세션 시작 방법

1. `git checkout feat/SIH-557-oliveyoung-db-ec2 && git pull`
2. 이 파일(`.omc/ec2-to-m3-migration.md`) 다시 읽기
3. EC2 start (`aws ec2 start-instances --instance-ids i-0eb065979dbad85b3`) + SSM 복구 대기
4. **사용자에게 물어볼 것 3개** (위 각 서비스 절에 "사용자 확인 필요" 표시):
   - rist-newsletter: Vercel 배포 맞는지, trigger-cron.sh 용도
   - orbit: 프로젝트 정체, 공급처, 데이터 중요성
   - conveyor: Postgres 데이터 중요도, Neon 이전 vs M3 로컬 Postgres
5. 답 받으면 **rist-newsletter → orbit → conveyor** 순으로 진행 (난이도 오름차순)

---

## ⚠️ 주의사항

- **EC2 terminate는 모든 서비스 이전 + 1~2일 관찰 후**. 지금은 stop 상태 유지.
- **conveyor-data 직접 복사 금지** (PostgreSQL은 running 시 pg_dump만 안전한 방법).
- **orbit.bak-* 5개는 일단 건드리지 말 것** (이전 실패 이력 증거일 가능성).
- **M3 NOPASSWD sudoers는 이전 끝나면 제거 권장** (`sudo rm /etc/sudoers.d/sihyun`).

---

## 세션 내 주요 의사결정 기록

1. **쿠팡 유지, 올영 메인** 피봇 — 기존 쿠팡 구독자 때문에 완전 제거 대신 frozen
2. **스키마 분리** — vendor별 파일 분리 + re-export shell로 import 호환
3. **DB 저장 위치** — Neon (기존 쿠팡과 동일 DB, 스키마만 분리)
4. **rank 소스** — `.thumb_flag.best` 대신 `data-impression` 끝 숫자 (오특 상품도 rank 보유 확인)
5. **기본 limit 100** — 오특 포함 전체 랭킹 수집
6. **Chrome 실행 모드** — headless 시 Cloudflare 차단 → **off-screen headful** (`--window-position=-2400,-100`) 채택
7. **EC2 → M3 이전** — 메모리/디스크 이슈 + 비용 절감 + 가정용 IP로 쿠팡 Akamai 회피
8. **M3 접근 방식** — Tailscale + SSH (공개 노출 0)
9. **conveyor 외부 접근** — Tailscale 내에서만 쓰므로 Cloudflare Tunnel 등 불필요
