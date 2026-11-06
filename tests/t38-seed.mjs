// Seeds the fixtures the T3.8 leak test looks for. This runs before the site
// build so the build has a real chance to leak every marker into dist/.
import assert from "node:assert/strict";
import { T38_MARKERS } from "./t38-markers.mjs";

const PB_URL = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const EMAIL = process.env.PB_SUPERUSER_EMAIL || process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD;

let token = "";

async function api(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(PB_URL + path, Object.assign({}, options, { headers }));
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data };
}

async function create(collection, body) {
  const res = await api(`/api/collections/${collection}/records`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  assert.equal(res.ok, true, `create ${collection} failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

async function patch(collection, id, body) {
  const res = await api(`/api/collections/${collection}/records/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  assert.equal(res.ok, true, `patch ${collection} failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

async function verifyRecord(id) {
  return patch("records", id, {
    verification_status: "verified",
    verified_at: "2026-11-03T00:00:00.000Z",
    privacy_confirmed: true,
  });
}

async function main() {
  let auth = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    auth = await api("/api/collections/_superusers/auth-with-password", {
      method: "POST",
      body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
    });
    if (auth.ok) break;
    if (auth.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.equal(auth && auth.ok, true, `auth failed: ${auth && auth.status}`);
  token = auth.data.token;

  const topics = await api("/api/collections/topics/records?perPage=1");
  assert.equal(topics.ok, true, "topics unavailable");
  const topicId = topics.data.items[0].id;

  const person = await create("people", {
    slug: "t38-leak-person-7f41c",
    full_name: "T3.8 Leak Fixture",
    verification_status: "needs_verification",
  });

  const mediaA = await create("sources", {
    url: "https://example.com/t38-media-a",
    publisher: "T38 Media A",
    kind: "media",
    is_specific: true,
  });
  const mediaB = await create("sources", {
    url: "https://example.com/t38-media-b",
    publisher: "T38 Media B",
    kind: "media",
    is_specific: true,
  });

  const base = {
    type: "statement",
    person: person.id,
    title: "T3.8 fixture statement",
    summary: "Neutral fixture summary",
    context: "This fixture context is long enough for the record creation hook to accept it.",
    occurred_at: "2026-11-01",
    topics: [topicId],
    sources: [mediaA.id, mediaB.id],
    quote: "Neutral fixture quote",
    privacy_confirmed: true,
    verification_status: "needs_verification",
  };

  // 1. An unverified record's blunder_reason.
  await create("records", Object.assign({}, base, {
    slug: "t38-leak-unverified-blunder-7f41c",
    blunder_category: "insensitive",
    blunder_reason: T38_MARKERS.unverifiedBlunderReason,
    clarification_checked: true,
  }));

  // 2. A verified record's hidden internal notes. It is public, so only the
  // hidden field protects the marker.
  const noted = await create("records", Object.assign({}, base, {
    slug: "t38-leak-internal-notes-7f41c",
    notes: T38_MARKERS.recordInternalNotes,
  }));
  await verifyRecord(noted.id);

  // 3. A promise record with an unverified update note.
  const promise = await create("records", Object.assign({}, base, {
    type: "promise",
    slug: "t38-leak-promise-7f41c",
    promise_made_in: "visi_misi",
    notes: T38_MARKERS.recordInternalNotes,
  }));
  await verifyRecord(promise.id);
  await create("promise_updates", {
    promise: promise.id,
    status: "in_progress",
    effective_date: "2026-11-02",
    sources: [mediaA.id],
    note: T38_MARKERS.unverifiedPromiseNote,
    verification_status: "needs_verification",
  });

  // 4. A rejected reply on a verified record.
  await create("replies", {
    record: noted.id,
    responder_name: "T3.8 Fixture",
    received_at: "2026-11-02",
    channel: "email",
    text: T38_MARKERS.rejectedReplyText,
    status: "published",
    verification_status: "rejected",
  });

  // 5. A published reply whose hidden identity_check must never be serialized.
  await create("replies", {
    record: noted.id,
    responder_name: "T3.8 Fixture",
    received_at: "2026-11-03",
    channel: "email",
    identity_check: T38_MARKERS.replyIdentityCheck,
    text: "Terima kasih atas klarifikasinya.",
    status: "published",
    verification_status: "verified",
  });

  console.log(`[T3.8] seeded ${Object.keys(T38_MARKERS).length} leak markers for ${PB_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
