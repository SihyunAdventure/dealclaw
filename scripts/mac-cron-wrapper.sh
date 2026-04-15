#!/usr/bin/env bash
# macOS launchd용 크롤 래퍼.
# launchd는 사용자 PATH/nvm 상속 안 함 → 여기서 환경 구성.

set -Eeuo pipefail

LOG_DIR="$HOME/Library/Logs/hotinbeauty"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/crawl-$(date +%Y-%m-%d).log"

exec >> "$LOG" 2>&1
echo ""
echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') crawl start ==="

# nvm로 설치된 Node 쓰는 경우 로드. /opt/homebrew 사용 시 PATH만 있으면 됨.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "[err] .env.local 없음 - 프로젝트 루트에 환경변수 파일 필요"
  exit 1
fi

echo "node=$(node -v) npm=$(npm -v)"
npm run crawl
echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') crawl end (exit=$?) ==="
