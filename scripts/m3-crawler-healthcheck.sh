#!/usr/bin/env bash

set -Eeuo pipefail

HOST="${HOTINBEAUTY_M3_HOST:-sihyun@sihyuns-macbook-pro-m3}"
REMOTE_DIR="${HOTINBEAUTY_M3_DIR:-/Users/sihyun/apps/hotinbeauty}"

echo "== hotinbeauty M3 crawler healthcheck =="
echo "host: $HOST"
echo "remote: $REMOTE_DIR"

ssh "$HOST" "cd '$REMOTE_DIR' && scripts/crawler-healthcheck.sh"
