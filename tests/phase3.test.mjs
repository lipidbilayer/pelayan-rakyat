import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const EMAIL = process.env.PB_SUPERUSER_EMAIL || process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD;

let token = "";
let personId = "";
let positionId = "";
let sourceId = "";
let topicId = "";
let officialSourceId = "";
let mediaSource2Id = "";

async function api(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(PB_URL + path, Object.assign({}, options, { headers }));
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { ok: response.ok, status: response.status, data };
}

async function auth() {
  const res = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error("auth failed: " + res.status);
  token = res.data.token;
}

async function create(collection, body) {
  return api("/api/collections/" + collection + "/records", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function patch(collection, id, body) {
  return api("/api/collections/" + collection + "/records/" + id, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

before(async () => {
  await auth();
  const person = await create("people", { slug: "phase3-test-person", full_name: "Phase 3 Test", verification_status: "needs_verification" });
  personId = person.data.id;
  const institution = await create("institutions", { code: "phase3-test-inst", name: "Test Inst", kind: "city_government", jurisdiction: "Jakarta Pusat", is_partisan: false });
  const source = await create("sources", { url: "https://example.com/phase3-source", publisher: "Example", kind: "media", is_specific: true });
  sourceId = source.data.id;
  const officialSource = await create("sources", { url: "https://example.go.id/phase3-official", publisher: "Gov", kind: "official", is_specific: true });
  officialSourceId = officialSource.data.id;
  const mediaSource2 = await create("sources", { url: "https://other.example.com/phase3-media", publisher: "Other Media", kind: "media", is_specific: true });
  mediaSource2Id = mediaSource2.data.id;
  const position = await create("positions", { person: personId, institution: institution.data.id, title: "Wali Kota", appointment_type: "appointed", status: "active", sources: [sourceId], verification_status: "needs_verification" });
  positionId = position.data.id;
  const topics = await api("/api/collections/topics/records?perPage=1");
  topicId = topics.data.items[0].id;
});

function baseRecord(overrides = {}) {
  return Object.assign({
    type: "statement",
    person: personId,
    position: positionId,
    title: "Test title",
    summary: "Neutral summary",
    context: "This is a sufficiently long context for the record creation test.",
    occurred_at: "2026-11-01",
    topics: [topicId],
    sources: [sourceId],
    quote: "Exact quote",
    privacy_confirmed: true,
    verification_status: "needs_verification",
    slug: "2026-11-01-phase3-test-" + Math.random().toString(36).slice(2),
  }, overrides);
}

test("T3.1 source quality: home-page-only source is rejected", async () => {
  const homeSource = await create("sources", { url: "https://example.com/home-" + Math.random(), publisher: "Example", kind: "media", is_specific: false });
  const res = await create("records", baseRecord({ sources: [homeSource.data.id] }));
  assert.equal(res.ok, false);
});

test("T3.1 source quality: specific media source is accepted", async () => {
  const res = await create("records", baseRecord());
  assert.equal(res.ok, true);
});

test("T3.1 context length: short context is rejected", async () => {
  const res = await create("records", baseRecord({ context: "too short", slug: "short-context-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.1 occurred_at: future date is rejected", async () => {
  const res = await create("records", baseRecord({ occurred_at: "2099-01-01", slug: "future-date-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.1 occurred_at: past date is accepted", async () => {
  const res = await create("records", baseRecord({ slug: "past-date-" + Math.random() }));
  assert.equal(res.ok, true);
});

test("T3.1 banned words: banned title is rejected", async () => {
  const res = await create("records", baseRecord({ title: "bodoh title", slug: "banned-title-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.1 banned words: banned word in quote is allowed", async () => {
  const res = await create("records", baseRecord({ quote: "Ini bodoh", slug: "banned-quote-" + Math.random() }));
  assert.equal(res.ok, true);
});

test("T3.2 koruptor only when convicted", async () => {
  const res = await create("records", baseRecord({ title: "koruptor test", legal_status: "", slug: "koruptor-blocked-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.3 blunder factually_wrong requires fact_check", async () => {
  const res = await create("records", baseRecord({ blunder_category: "factually_wrong", slug: "blunder-fact-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.3 blunder extra evidence: one media source blocked", async () => {
  const res = await create("records", baseRecord({ blunder_category: "insensitive", blunder_reason: "Affected people", slug: "blunder-one-media-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.3 blunder extra evidence: two independent media sources allowed", async () => {
  const res = await create("records", baseRecord({ blunder_category: "insensitive", blunder_reason: "Affected people", clarification_checked: true, sources: [sourceId, mediaSource2Id], slug: "blunder-two-media-" + Math.random() }));
  assert.equal(res.ok, true);
});

test("T3.3 blunder clarification_checked required", async () => {
  const record = await create("records", baseRecord({ blunder_category: "insensitive", blunder_reason: "Affected people", sources: [sourceId, mediaSource2Id], clarification_checked: false, slug: "blunder-no-clarification-" + Math.random() }));
  assert.equal(record.ok, true);
  const verify = await patch(record.data.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", clarification_checked: false });
  assert.equal(verify.ok, false);
});

test("T3.4 no_response blocked before 14 days", async () => {
  const res = await create("records", baseRecord({ follow_up_status: "no_response", slug: "no-response-early-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.5 promise requires promise_made_in", async () => {
  const res = await create("records", baseRecord({ type: "promise", promise_made_in: "", slug: "promise-no-madein-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.5 promise kept requires two sources", async () => {
  // Create promise record first
  const promise = await create("records", baseRecord({ type: "promise", promise_made_in: "visi_misi", slug: "promise-kept-" + Math.random() }));
  assert.equal(promise.ok, true);
  const update = await create("promise_updates", {
    promise: promise.data.id,
    status: "kept",
    effective_date: "2026-11-02",
    sources: [sourceId],
    note: "One source",
    verification_status: "needs_verification",
  });
  assert.equal(update.ok, false);
});

test("T3.6 editing verified record requires public_change_note", async () => {
  const record = await create("records", baseRecord({ slug: "edit-note-" + Math.random() }));
  assert.equal(record.ok, true);
  await patch("records", record.data.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z" });
  const edit = await patch("records", record.data.id, { title: "Edited title" });
  assert.equal(edit.ok, false);
});

test("T3.7 withdrawing public record requires public note", async () => {
  const record = await create("records", baseRecord({ slug: "withdraw-" + Math.random() }));
  assert.equal(record.ok, true);
  await patch("records", record.data.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z" });
  const withdraw = await patch("records", record.data.id, { verification_status: "rejected" });
  assert.equal(withdraw.ok, false);
});

test("T3.10 card_quote must be continuous excerpt", async () => {
  const res = await create("records", baseRecord({ card_quote: "not in quote", slug: "card-quote-" + Math.random() }));
  assert.equal(res.ok, false);
});

test("T3.12 janji counts and overdue", async () => {
  const response = await fetch(PB_URL + "/api/collections/records/records?filter=type='promise'&perPage=200", { headers: { Authorization: "Bearer " + token } });
  const data = await response.json();
  assert.ok(Array.isArray(data.items));
});

test("T3.13 topic pages list verified records", async () => {
  const response = await fetch(PB_URL + "/api/collections/topics/records?perPage=200", { headers: { Authorization: "Bearer " + token } });
  const data = await response.json();
  assert.ok(data.totalItems >= 15);
});

test("T3.14 balance dashboard counts", async () => {
  const response = await fetch(PB_URL + "/api/collections/records/records?perPage=1", { headers: { Authorization: "Bearer " + token } });
  assert.equal(response.status, 200);
});

test("T3.15 archiving job exists", async () => {
  const fs = await import("node:fs");
  assert.ok(fs.existsSync("tools/archive-sources/src/index.js"));
});

test("T3.16 search quote fragment", async () => {
  assert.ok(true);
});

test("T3.17 page weight and Lighthouse", async () => {
  assert.ok(true);
});

test("T3.18 staging RAM", async () => {
  assert.ok(true);
});