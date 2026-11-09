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
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { ok: response.ok, status: response.status, data };
}
async function create(collection, body) {
  const res = await api("/api/collections/" + collection + "/records", { method: "POST", body: JSON.stringify(body) });
  assert.equal(res.ok, true, `create ${collection} failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}
async function patch(collection, id, body) {
  const res = await api("/api/collections/" + collection + "/records/" + id, { method: "PATCH", body: JSON.stringify(body) });
  assert.equal(res.ok, true, `patch ${collection} failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

async function main() {
  let auth = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    auth = await api("/api/collections/_superusers/auth-with-password", { method: "POST", body: JSON.stringify({ identity: EMAIL, password: PASSWORD }) });
    if (auth.ok) break;
    if (auth.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.equal(auth && auth.ok, true, "auth failed");
  token = auth.data.token;

  const topics = await api("/api/collections/topics/records?perPage=1");
  const topicId = topics.data.items[0].id;

  // contributor with marker display name + email
  const contributor = await create("users", {
    email: "t416leakemail@example.com",
    password: "verify-password",
    passwordConfirm: "verify-password",
    role: "contributor",
    display_name: "T416LEAKDISPLAYNAME",
    trust_level: 0,
    accepted_terms_at: "2026-11-03T00:00:00.000Z",
    accepted_terms_version: "2026-11-06",
  });

  // person + record for flag
  const person = await create("people", { slug: "t416-leak-person", full_name: "T4.16 Leak Person", verification_status: "needs_verification" });
  const mediaA = await create("sources", { url: "https://example.com/t416-a", publisher: "T416 A", kind: "media", is_specific: true });
  const mediaB = await create("sources", { url: "https://example.com/t416-b", publisher: "T416 B", kind: "media", is_specific: true });
  const rec = await create("records", {
    type: "statement", person: person.id, title: "T4.16 fixture", summary: "x", context: "This fixture context is long enough for the record creation hook to accept it.",
    occurred_at: "2026-11-01", topics: [topicId], sources: [mediaA.id, mediaB.id], quote: "q", privacy_confirmed: true,
    verification_status: "needs_verification", slug: "t416-leak-record",
  });
  await patch("records", rec.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", privacy_confirmed: true });

  // submission with markers
  const submission = await create("submissions", {
    kind: "tip", submitter: contributor.id, person: person.id, suggested_type: "unsure",
    url: "https://example.com/t416-submission", url_normalized: "https://example.com/t416-submission",
    quote: "T416LEAKQUOTEMARKER", note: "T416LEAKNOTEMARKER text long enough to pass validation",
    status: "new", also_reported_by_count: 0, moderator_note: "T416LEAKMODERATORNOTE",
  });

  // flag with marker
  await create("flags", {
    record: rec.id, reason: "other", note: "T416LEAKFLAGNOTE", submitter: contributor.id, status: "open", moderator_note: "T416LEAKMODERATORNOTE",
  });

  // converted verified record showing "Berawal dari laporan warga"
  const convSub = await create("submissions", {
    kind: "tip", submitter: contributor.id, person: person.id, suggested_type: "statement",
    url: "https://example.com/t416-converted", url_normalized: "https://example.com/t416-converted",
    quote: "q", note: "Converted submission note long enough for validation", status: "converted",
    also_reported_by_count: 0, converted_record: null,
  });
  const convRec = await create("records", {
    type: "statement", person: person.id, title: "T4.14 converted record", summary: "x",
    context: "This fixture context is long enough for the record creation hook to accept it.",
    occurred_at: "2026-11-01", topics: [topicId], sources: [mediaA.id, mediaB.id], quote: "q",
    privacy_confirmed: true, verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z",
    slug: "t414-converted-record", from_submissions: [convSub.id], from_citizen_report: true,
  });
  await patch("submissions", convSub.id, { converted_record: convRec.id, status: "converted" });

  console.log("[T4.16] seeded markers");
}

main().catch((e) => { console.error(e); process.exit(1); });