#!/usr/bin/env bash

set -Eeuo pipefail

KST_HOUR="$(TZ=Asia/Seoul date +%H)"
OLIVEYOUNG_HOURS="${OLIVEYOUNG_SCHEDULE_HOURS_KST:-09,21}"
HWAHAE_FULL_HOUR="${HWAHAE_FULL_SCHEDULE_HOUR_KST:-06}"
HWAHAE_PROBE_HOUR="${HWAHAE_PROBE_SCHEDULE_HOUR_KST:-12}"

echo "[schedule] kst_hour=$KST_HOUR oliveyoung_hours=$OLIVEYOUNG_HOURS hwahae_full_hour=$HWAHAE_FULL_HOUR hwahae_probe_hour=$HWAHAE_PROBE_HOUR"

FAILED=0

run_task() {
  local name="$1"
  shift

  echo "[schedule] start $name"
  if "$@"; then
    echo "[schedule] complete $name"
  else
    local exit_code=$?
    echo "[schedule] failed $name exit=$exit_code"
    FAILED=1
  fi
}

matches_hour() {
  local needle="$1"
  local csv="$2"
  IFS=',' read -r -a parts <<<"$csv"
  for part in "${parts[@]}"; do
    if [[ "$(printf '%02d' "${part#0}")" == "$needle" || "$part" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

run_task "coupang" npm run crawl

if matches_hour "$KST_HOUR" "$OLIVEYOUNG_HOURS"; then
  run_task "oliveyoung" npm run crawl:oliveyoung
else
  echo "[schedule] skip oliveyoung (current_kst_hour=$KST_HOUR)"
fi

if [[ "$KST_HOUR" == "$HWAHAE_FULL_HOUR" ]]; then
  run_task "hwahae-full" npm run crawl:hwahae
elif [[ "$KST_HOUR" == "$HWAHAE_PROBE_HOUR" ]]; then
  run_task "hwahae-probe" npm run crawl:hwahae -- --themes=trending --max-leaves=1
else
  echo "[schedule] skip hwahae (current_kst_hour=$KST_HOUR)"
fi

exit "$FAILED"
