#!/usr/bin/env bash

set -Eeuo pipefail

HOST="${HOTINBEAUTY_M3_HOST:-sihyun@sihyuns-macbook-pro-m3}"
REMOTE_DIR="${HOTINBEAUTY_M3_DIR:-/Users/sihyun/apps/hotinbeauty}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_NOW="${HOTINBEAUTY_M3_RUN_NOW:-1}"

FILES=(
  lib/db/schema/hwahae.ts
  package.json
  scripts/crawler-healthcheck.sh
  scripts/install-mac-launchd.sh
  scripts/run-scheduled-crawls.sh
  src/crawl/coupang-run-policy.ts
  src/crawl/coupang-run-policy.test.ts
  src/crawl/coupang-search.ts
  src/crawl/hwahae-parser.ts
  src/crawl/hwahae-ranking.ts
  src/crawl/hwahae-storage.ts
  src/crawl/hwahae-types.ts
  src/crawl/run-logger.ts
  src/crawl/types.ts
  src/data/collections.ts
  src/scripts/run-crawl.ts
  src/scripts/run-hwahae-crawl.ts
  src/scripts/run-oliveyoung-crawl.ts
)

echo "== hotinbeauty M3 crawler deploy =="
echo "host: $HOST"
echo "remote: $REMOTE_DIR"
echo "run_now: $RUN_NOW"

cd "$ROOT_DIR"

ssh "$HOST" "mkdir -p '$REMOTE_DIR'"

tar -czf - "${FILES[@]}" \
  | ssh "$HOST" "cd '$REMOTE_DIR' && tar -xzf -"

ssh "$HOST" "bash -lc '
  set -Eeuo pipefail
  cd \"$REMOTE_DIR\"
  npm test
  npx tsc --noEmit
  npx eslint src/scripts/run-crawl.ts src/scripts/run-oliveyoung-crawl.ts src/scripts/run-hwahae-crawl.ts src/crawl/coupang-run-policy.ts src/crawl/coupang-run-policy.test.ts src/crawl/coupang-search.ts src/crawl/hwahae-parser.ts src/crawl/hwahae-ranking.ts src/crawl/hwahae-storage.ts src/crawl/hwahae-types.ts src/crawl/run-logger.ts src/data/collections.ts src/crawl/types.ts
  scripts/install-mac-launchd.sh reload
  if [ \"$RUN_NOW\" = \"1\" ]; then
    scripts/install-mac-launchd.sh run-now
  else
    echo run-now skipped \"(HOTINBEAUTY_M3_RUN_NOW=0)\"
  fi
'"

echo "✅ deployed crawler files and restarted launchd on $HOST"
