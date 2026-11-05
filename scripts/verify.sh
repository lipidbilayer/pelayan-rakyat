#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONTAINER="pelayan-verify-pb"
DATA_DIR="$(mktemp -d)"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e PB_ADMIN_EMAIL=admin@example.com \
  -e PB_ADMIN_PASSWORD=verify-password \
  -v "$DATA_DIR:/pb_data:z" \
  -p 127.0.0.1:8090:8090 \
  pelayan-rakyat/pocketbase:local >/dev/null

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
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
import json, urllib.request, sys
base="http://127.0.0.1:8090"
req=urllib.request.Request(base+"/api/collections/_superusers/auth-with-password", data=json.dumps({"identity":"admin@example.com","password":"verify-password"}).encode(), headers={"Content-Type":"application/json"})
token=json.load(urllib.request.urlopen(req))["token"]
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
for coll in ["parties","people","positions"]:
    for idv in list_ids(coll):
        body={"verification_status":"verified","verified_at":"2026-11-03T00:00:00.000Z"}
        r=urllib.request.Request(base+"/api/collections/"+coll+"/records/"+idv, data=json.dumps(body).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method="PATCH")
        urllib.request.urlopen(r)
# Ensure name variants for search.
people=list_ids("people","slug='surya-utama'")
if people:
    r=urllib.request.Request(base+"/api/collections/people/records/"+people[0], data=json.dumps({"name_variants":["Uya Kuya"]}).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method="PATCH")
    urllib.request.urlopen(r)
    r=urllib.request.Request(base+"/api/collections/people/records/"+people[0], data=json.dumps({"verification_status":"verified","verified_at":"2026-11-03T00:00:00.000Z"}).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method="PATCH")
    urllib.request.urlopen(r)
PY

make build

PB_URL=http://127.0.0.1:8090 \
PB_SUPERUSER_EMAIL=admin@example.com \
PB_SUPERUSER_PASSWORD=verify-password \
  node --test tests/phase3.test.mjs

cd apps/web
PB_PUBLIC_URL=http://127.0.0.1:8090 npx playwright test