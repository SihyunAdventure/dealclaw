#!/usr/bin/env bash
# hotinbeauty 크롤러 AWS Fargate 엔트리포인트.
# ECS Task로 실행될 때 호출된다. CloudWatch Logs가 stdout/stderr 수집.

set -Eeuo pipefail

# 설정 체크 — Secrets Manager에서 주입되어야 함
for var in DATABASE_URL HIB_AWS_SES_ACCESS_KEY_ID HIB_AWS_SES_SECRET_ACCESS_KEY EMAIL_FROM; do
  if [ -z "${!var:-}" ]; then
    echo "[entrypoint] 필수 env $var 미설정 — Secrets Manager 연결 확인" >&2
    exit 2
  fi
done

START_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[entrypoint] start=$START_TS node=$(node -v) mode=${EMAIL_DRY_RUN:-0}"

# 크롤 + DB upsert + crawl_runs 기록
# (향후 SIH-556 detect-new-low + SES 발송 훅이 run-crawl 내부에 통합될 예정)
# chrome.ts는 headful Chrome을 spawn → Xvfb 가상 디스플레이 필요
xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" \
  npx tsx src/scripts/run-crawl.ts

EXIT_CODE=$?
END_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[entrypoint] end=$END_TS exit=$EXIT_CODE"

exit $EXIT_CODE
