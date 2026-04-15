#!/usr/bin/env bash
# EC2 엔트리 포인트 — crontab 에서 호출.
# - DATABASE_URL 은 SSM Parameter Store 에서 런타임 주입 (파일에 안 남김)
# - Xvfb 가상 디스플레이 위에서 headful Chrome 실행 (Cloudflare 통과)
# - 쿠팡이 아닌 올영 전용

set -Eeuo pipefail

REPO_DIR="/home/ec2-user/apps/hotinbeauty"
LOG_DIR="/home/ec2-user/logs"
mkdir -p "$LOG_DIR"

LOG="$LOG_DIR/hotinbeauty-oliveyoung-$(date +%Y-%m-%d).log"
exec >> "$LOG" 2>&1

echo ""
echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') olive-young crawl start ==="

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# Node.js: NVM 을 쓰는 경우 로드
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi

cd "$REPO_DIR"

echo "node=$(node -v) npm=$(npm -v) pwd=$(pwd)"

# SSM Parameter Store 에서 DATABASE_URL 읽어 환경변수로만 주입.
# IAM role 이 ssm:GetParameter + kms:Decrypt 권한 있어야 함.
export DATABASE_URL="$(aws ssm get-parameter \
  --name /hotinbeauty/DATABASE_URL \
  --with-decryption \
  --region ap-northeast-2 \
  --query Parameter.Value \
  --output text)"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[fatal] DATABASE_URL 주입 실패 — SSM Parameter 확인 필요"
  exit 1
fi

# Xvfb 1440x900 가상 디스플레이 안에서 headful Chrome 실행.
# --window-position 등 off-screen 플래그는 Linux 분기에서 자동 skip 됨.
exec xvfb-run -a --server-args="-screen 0 1440x900x24" \
  npm run crawl:oliveyoung

echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') olive-young crawl end ==="
