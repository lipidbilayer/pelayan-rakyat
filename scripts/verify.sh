#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONTAINER="pocketbase"
CADDY="pelayan-verify-caddy"
DATA_DIR="$(mktemp -d)"
NETWORK="pelayan-verify-net"
docker build -q -t pelayan-rakyat/pocketbase:local services/pocketbase >/dev/null
docker rm -f "$CONTAINER" "$CADDY" >/dev/null 2>&1 || true
docker network rm "$NETWORK" >/dev/null 2>&1 || true
docker network create "$NETWORK" >/dev/null
docker run -d --name "$CONTAINER" --network "$NETWORK" \
  -e PB_ADMIN_EMAIL=admin@example.com \
  -e PB_ADMIN_PASSWORD=verify-password \
  -v "$DATA_DIR:/pb_data:z" \
  -p 127.0.0.1:8090:8090 \
  pelayan-rakyat/pocketbase:local >/dev/null

cleanup() {
  docker rm -f "$CONTAINER" "$CADDY" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8090/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done

# Seed verified roster data for public-page tests.
(
  cd tools/import-roster
  npm ci >/dev/null
  npm run build >/dev/null
  PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=admin@example.com PB_SUPERUSER_PASSWORD=verify-password \
    node dist/src/cli.js --parties "$ROOT/.docs/data/parties.csv" --roster "$ROOT/.docs/data/roster.csv" --apply >/dev/null
)
# Verify one searchable person for the search test.
python3 - "$ROOT" <<'PY'
import json, urllib.request, urllib.error, sys, time
base="http://127.0.0.1:8090"
def auth():
    for _ in range(10):
        req=urllib.request.Request(base+"/api/collections/_superusers/auth-with-password", data=json.dumps({"identity":"admin@example.com","password":"verify-password"}).encode(), headers={"Content-Type":"application/json"})
        try:
            return json.load(urllib.request.urlopen(req))["token"]
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(2)
    raise SystemExit("auth failed: rate limited")
token=auth()
# The test suite creates many records in a burst; production rate limits would
# turn valid assertions into 429s. The limits stay enabled in production.
def settings(method, data=None):
    req=urllib.request.Request(base+"/api/settings", data=None if data is None else json.dumps(data).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method=method)
    return json.load(urllib.request.urlopen(req))
current=settings("GET")
current["rateLimits"]["enabled"]=False
settings("PATCH", current)
def list_ids(coll, filter=""):
    ids=[]; page=1
    while True:
        url=base+"/api/collections/"+coll+"/records?perPage=200&page="+str(page)
        if filter: url += "&filter="+filter
        r=urllib.request.Request(url, headers={"Authorization":"Bearer "+token})
        d=json.load(urllib.request.urlopen(r))
        ids += [x["id"] for x in d["items"]]
        if page >= d["totalPages"]: break
        page += 1
    return ids
for coll in ["parties","people"]:
    for idv in list_ids(coll):
        body={"verification_status":"verified","verified_at":"2026-11-03T00:00:00.000Z"}
        r=urllib.request.Request(base+"/api/collections/"+coll+"/records/"+idv, data=json.dumps(body).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method="PATCH")
        urllib.request.urlopen(r)
# Leave a couple of positions unverified for the moderator test.
position_ids=list_ids("positions")
for idv in position_ids[2:]:
    body={"verification_status":"verified","verified_at":"2026-11-03T00:00:00.000Z"}
    r=urllib.request.Request(base+"/api/collections/positions/records/"+idv, data=json.dumps(body).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method="PATCH")
    urllib.request.urlopen(r)
# Ensure name variants for search.
people=list_ids("people","slug='surya-utama'")
if people:
    r=urllib.request.Request(base+"/api/collections/people/records/"+people[0], data=json.dumps({"name_variants":["Uya Kuya"]}).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method="PATCH")
    urllib.request.urlopen(r)
    r=urllib.request.Request(base+"/api/collections/people/records/"+people[0], data=json.dumps({"verification_status":"verified","verified_at":"2026-11-03T00:00:00.000Z"}).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method="PATCH")
    urllib.request.urlopen(r)

# Create a moderator account for Playwright tests.
try:
    urllib.request.urlopen(urllib.request.Request(base+"/api/collections/users/records", data=json.dumps({"email":"verify-moderator@example.com","password":"verify-password","passwordConfirm":"verify-password","role":"moderator","name":"Verify Moderator"}).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}))
except Exception:
    pass
PY

# Seed the fresh T3.8 leak markers before the build so the build can leak them
# if the collection rules or hidden fields are wrong.
PB_URL=http://127.0.0.1:8090 \
PB_SUPERUSER_EMAIL=admin@example.com \
PB_SUPERUSER_PASSWORD=verify-password \
  node tests/t38-seed.mjs

make build

PB_URL=http://127.0.0.1:8090 \
PB_SUPERUSER_EMAIL=admin@example.com \
PB_SUPERUSER_PASSWORD=verify-password \
  node --test tests/phase1.test.mjs

PB_URL=http://127.0.0.1:8090 \
PB_SUPERUSER_EMAIL=admin@example.com \
PB_SUPERUSER_PASSWORD=verify-password \
  node --test tests/phase3.test.mjs

# Local build guards: closed API port, verified-people drop, missing OFL font.
node --test tests/build-guards.test.mjs

cd apps/web
# Start Caddy for Playwright and Lighthouse.
docker run -d --name "$CADDY" --network "$NETWORK" \
  -e SITE_ADDRESS=http://:80 \
  -e ADMIN_LISTEN_ADDRESS=http://127.0.0.1:8081 \
  -v "$ROOT/infra/Caddyfile:/etc/caddy/Caddyfile:ro,z" \
  -v "$ROOT/apps/web/dist:/srv/site:ro,z" \
  -p 127.0.0.1:80:80 \
  caddy:2.11.7-alpine >/dev/null
sleep 5

PB_PUBLIC_URL=http://127.0.0.1:8090 npx playwright test

# Lighthouse via the same Caddy container
for url in "" "dprd" "janji"; do
  npx lighthouse "http://127.0.0.1/$url" --output=json --output-path="/tmp/pelayan-lh-$(echo $url | tr / -).json" --chrome-flags="--headless" --form-factor=mobile >/tmp/pelayan-lh.log 2>&1
done
docker rm -f "$CADDY" >/dev/null 2>&1 || true

# Memory check
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' pocketbase
test "$(docker inspect -f '{{.State.OOMKilled}}' pocketbase)" = "false"