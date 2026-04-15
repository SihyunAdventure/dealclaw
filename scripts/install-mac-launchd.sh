#!/usr/bin/env bash
# hotinbeauty crawl 스케줄 (launchd) 설치 / 재로드 / 해제.
# usage:
#   scripts/install-mac-launchd.sh install
#   scripts/install-mac-launchd.sh reload
#   scripts/install-mac-launchd.sh uninstall
#   scripts/install-mac-launchd.sh status
#   scripts/install-mac-launchd.sh run-now   # 즉시 1회 실행 테스트

set -Eeuo pipefail

LABEL="com.hotinbeauty.crawl"
PROJECT_PATH="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$PROJECT_PATH/ops/launchd/$LABEL.plist.tmpl"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

ensure_log_dir() {
  mkdir -p "$HOME/Library/Logs/hotinbeauty"
}

render() {
  ensure_log_dir
  chmod +x "$PROJECT_PATH/scripts/mac-cron-wrapper.sh"
  sed -e "s|{{PROJECT_PATH}}|$PROJECT_PATH|g" \
      -e "s|{{HOME}}|$HOME|g" "$TEMPLATE" > "$DEST"
  echo "rendered -> $DEST"
}

case "${1:-}" in
  install)
    render
    launchctl unload "$DEST" 2>/dev/null || true
    launchctl load -w "$DEST"
    launchctl list "$LABEL" >/dev/null && echo "installed & loaded: $LABEL"
    ;;
  reload)
    render
    launchctl unload "$DEST" 2>/dev/null || true
    launchctl load -w "$DEST"
    echo "reloaded: $LABEL"
    ;;
  uninstall)
    launchctl unload "$DEST" 2>/dev/null || true
    rm -f "$DEST"
    echo "uninstalled: $LABEL"
    ;;
  status)
    launchctl list "$LABEL" 2>&1 || echo "not loaded"
    echo "--- recent log ---"
    tail -n 50 "$HOME/Library/Logs/hotinbeauty/crawl-$(date +%Y-%m-%d).log" 2>/dev/null || echo "(no log today)"
    ;;
  run-now)
    launchctl kickstart -k "gui/$(id -u)/$LABEL"
    echo "triggered. tail log: tail -f $HOME/Library/Logs/hotinbeauty/crawl-$(date +%Y-%m-%d).log"
    ;;
  *)
    echo "usage: $0 {install|reload|uninstall|status|run-now}"
    exit 1
    ;;
esac
