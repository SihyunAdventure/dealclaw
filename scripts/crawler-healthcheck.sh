#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="${HOTINBEAUTY_LAUNCHD_LABEL:-com.hotinbeauty.crawl}"
LOG_DIR="${HOTINBEAUTY_LOG_DIR:-$HOME/Library/Logs/hotinbeauty}"
TODAY_LOG="$LOG_DIR/crawl-$(date +%Y-%m-%d).log"

echo "== hotinbeauty crawler healthcheck =="
echo "host=$(hostname)"
echo "time=$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "app_dir=$APP_DIR"

echo
echo "--- launchd ---"
launchctl list "$LABEL" 2>/dev/null || echo "__NOT_LOADED__"

echo
echo "--- repo ---"
cd "$APP_DIR"
git status --short --branch 2>/dev/null || true
git rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/^/branch=/' || true
command -v node >/dev/null && echo "node=$(node -v)"
command -v npm >/dev/null && echo "npm=$(npm -v)"
node -e "const p=require('./package.json'); console.log('crawl_scripts=' + Object.keys(p.scripts).filter((key) => key.includes('crawl')).join(','))" 2>/dev/null || true

echo
echo "--- platform coverage ---"
find src scripts -type f | rg 'hwahae|화해' >/dev/null 2>&1 \
  && echo "hwahae_runtime=present" \
  || echo "hwahae_runtime=absent"
echo "hwahae_schedule_full_kst=${HWAHAE_FULL_SCHEDULE_HOUR_KST:-06}"
echo "hwahae_schedule_probe_kst=${HWAHAE_PROBE_SCHEDULE_HOUR_KST:-12}"

echo
echo "--- today log tail ---"
tail -n 80 "$TODAY_LOG" 2>/dev/null || echo "__NO_TODAY_LOG__"

if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

if [ -z "${DATABASE_URL:-}" ] || ! command -v psql >/dev/null 2>&1; then
  echo
  echo "__NO_DATABASE_URL_OR_PSQL__"
  exit 0
fi

echo
echo "--- recent crawl_runs ---"
psql "$DATABASE_URL" -P pager=off -c "
  select
    collection,
    product_count,
    status,
    finished_at at time zone 'Asia/Seoul' as finished_kst
  from crawl_runs
  order by finished_at desc
  limit 8;
"

echo
echo "--- recent non-completed crawl_runs (7d) ---"
psql "$DATABASE_URL" -P pager=off -c "
  select
    collection,
    product_count,
    status,
    error_message,
    finished_at at time zone 'Asia/Seoul' as finished_kst
  from crawl_runs
  where status <> 'completed'
    and finished_at >= now() - interval '7 days'
  order by finished_at desc
  limit 12;
"

echo
echo "--- recent oliveyoung_crawl_runs ---"
psql "$DATABASE_URL" -P pager=off -c "
  select
    product_count,
    status,
    coalesce(error_message, '') as error_message,
    finished_at at time zone 'Asia/Seoul' as finished_kst
  from oliveyoung_crawl_runs
  order by finished_at desc
  limit 8;
"

echo
echo "--- recent non-completed oliveyoung_crawl_runs (7d) ---"
psql "$DATABASE_URL" -P pager=off -c "
  select
    product_count,
    status,
    coalesce(error_message, '') as error_message,
    finished_at at time zone 'Asia/Seoul' as finished_kst
  from oliveyoung_crawl_runs
  where status <> 'completed'
    and finished_at >= now() - interval '7 days'
  order by finished_at desc
  limit 12;
"

echo
echo "--- recent hwahae_crawl_runs ---"
psql "$DATABASE_URL" -P pager=off -c "
  select
    theme,
    product_count,
    status,
    coalesce(error_message, '') as error_message,
    finished_at at time zone 'Asia/Seoul' as finished_kst
  from hwahae_crawl_runs
  order by finished_at desc
  limit 8;
" 2>/dev/null || echo "__HWAHAE_TABLE_MISSING__"

echo
echo "--- recent non-completed hwahae_crawl_runs (7d) ---"
psql "$DATABASE_URL" -P pager=off -c "
  select
    theme,
    product_count,
    status,
    coalesce(error_message, '') as error_message,
    finished_at at time zone 'Asia/Seoul' as finished_kst
  from hwahae_crawl_runs
  where status <> 'completed'
    and finished_at >= now() - interval '7 days'
  order by finished_at desc
  limit 12;
" 2>/dev/null || echo "__HWAHAE_TABLE_MISSING__"
