#!/usr/bin/env bash
set -euo pipefail

ROOT="/mnt/Data/Workspace/personal/pelayan-rakyat"
LOCK="/tmp/pelayan-rebuild.lock"
DIRTY="/pb_data/site_dirty"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "rebuild already running"
  exit 0
fi

if [ ! -f "$DIRTY" ] || [ "$(cat "$DIRTY" 2>/dev/null || true)" != "1" ]; then
  echo "dirty=false; no build"
  exit 0
fi

cd "$ROOT"
make build
make deploy-staging
echo "0" > "$DIRTY"
echo "dirty=true; build and deploy complete"