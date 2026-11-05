#!/bin/sh
# PocketBase container entrypoint.
# Creates the first superuser from the environment only when the data
# directory has no database yet, then starts the server.
set -eu

DATA_DIR="${PB_DATA_DIR:-/pb_data}"
MIGRATIONS_DIR="${PB_MIGRATIONS_DIR:-/pb/pb_migrations}"
HOOKS_DIR="${PB_HOOKS_DIR:-/pb/pb_hooks}"
HTTP_ADDR="${PB_HTTP_ADDR:-0.0.0.0:8090}"

ENCRYPTION_ARGS=""
if [ -n "${PB_ENCRYPTION_KEY:-}" ]; then
  ENCRYPTION_ARGS="--encryptionEnv PB_ENCRYPTION_KEY"
fi

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/data.db" ]; then
  if [ -z "${PB_ADMIN_EMAIL:-}" ] || [ -z "${PB_ADMIN_PASSWORD:-}" ]; then
    echo "ERROR: PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required on first boot." >&2
    exit 1
  fi

  echo "First boot: creating PocketBase superuser from environment."
  # shellcheck disable=SC2086
  /pb/pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" \
    --dir "$DATA_DIR" \
    --migrationsDir "$MIGRATIONS_DIR" \
    --automigrate=false \
    $ENCRYPTION_ARGS
fi

# shellcheck disable=SC2086
PB_HOOKS_MODE=serve exec /pb/pocketbase serve \
  --http "$HTTP_ADDR" \
  --dir "$DATA_DIR" \
  --migrationsDir "$MIGRATIONS_DIR" \
  --hooksDir "$HOOKS_DIR" \
  --hooksWatch=false \
  --hooksPool 1 \
  --automigrate=false \
  $ENCRYPTION_ARGS
