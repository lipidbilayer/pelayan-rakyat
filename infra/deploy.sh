#!/usr/bin/env bash
# Server-side deploy. Runs on the VPS from /opt/pelayan-rakyat.
#
# Usage:
#   ./deploy.sh ghcr.io/<owner>/<repo>/pocketbase:<git-sha>
#
# Never builds on the server: the image is built and pushed by GitHub Actions.
set -euo pipefail

cd "$(dirname "$0")"

IMAGE="${1:-}"
if [ -z "$IMAGE" ]; then
  echo "Usage: $0 ghcr.io/<owner>/<repo>/pocketbase:<git-sha>" >&2
  exit 2
fi

if [ ! -f .env ]; then
  echo "ERROR: $PWD/.env is missing. Copy .env.example and fill it in." >&2
  exit 1
fi

# Optional GHCR login for private packages. Values are read without sourcing
# .env (the file contains values with spaces, e.g. the backup cron).
GHCR_USER_VALUE="$(grep -E '^GHCR_USER=' .env | head -n 1 | cut -d= -f2- || true)"
GHCR_TOKEN_VALUE="$(grep -E '^GHCR_TOKEN=' .env | head -n 1 | cut -d= -f2- || true)"
if [ -n "${GHCR_TOKEN_VALUE}" ] && [ -n "${GHCR_USER_VALUE}" ]; then
  printf '%s' "${GHCR_TOKEN_VALUE}" | docker login ghcr.io --username "${GHCR_USER_VALUE}" --password-stdin
fi

export PB_IMAGE="$IMAGE"
COMPOSE=(docker compose --env-file .env)
if [ -f .deploy-state ]; then
  COMPOSE+=(--env-file .deploy-state)
fi
COMPOSE+=(-f docker-compose.yml)

"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d --no-build --remove-orphans
# Recreate Caddy so edits to Caddyfile or ADMIN_ALLOWLIST/SITE_ADDRESS in .env
# are applied; bind-mounted config changes alone do not restart the container.
"${COMPOSE[@]}" up -d --no-build --force-recreate caddy

# Wait for the healthchecks so a broken deploy fails loudly instead of
# reporting success while the site is down.
for _ in $(seq 1 45); do
  pb_id="$("${COMPOSE[@]}" ps -q pocketbase || true)"
  caddy_id="$("${COMPOSE[@]}" ps -q caddy || true)"

  pb_status="missing"
  caddy_status="missing"
  if [ -n "${pb_id}" ]; then
    pb_status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${pb_id}" 2>/dev/null || echo missing)"
  fi
  if [ -n "${caddy_id}" ]; then
    caddy_status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${caddy_id}" 2>/dev/null || echo missing)"
  fi

  if [ "${pb_status}" = "healthy" ] && [ "${caddy_status}" = "healthy" ]; then
    echo "Deploy healthy: ${IMAGE}"
    # Remember the deployed image without modifying .env. Compose reads this
    # file through --env-file when it exists.
    printf 'PB_IMAGE=%s\n' "${IMAGE}" > .deploy-state
    "${COMPOSE[@]}" ps
    docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
    exit 0
  fi

  sleep 2
done

echo "ERROR: containers did not become healthy (pocketbase=${pb_status:-?}, caddy=${caddy_status:-?})." >&2
"${COMPOSE[@]}" ps >&2 || true
"${COMPOSE[@]}" logs --tail=80 >&2 || true
exit 1
