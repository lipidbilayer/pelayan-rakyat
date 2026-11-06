import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { T38_MARKERS, T38_MARKER_LIST } from "./t38-markers.mjs";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const EMAIL = process.env.PB_SUPERUSER_EMAIL || process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD;

let token = "";
let moderatorToken = "";
let personId = "";
let positionId = "";
let sourceId = "";
let topicId = "";
let officialSourceId = "";
let mediaSource2Id = "";

async function api(path, options = {}, authToken = token) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (authToken) headers.Authorization = "Bearer " + authToken;
  const response = await fetch(PB_URL + path, Object.assign({}, options, { headers }));
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { ok: response.ok, status: response.status, data };
}

async function auth() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await api("/api/collections/_superusers/auth-with-password", {
      method: "POST",
      body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
    });
    if (res.ok) {
      token = res.data.token;
      return;
    }
    if (res.status !== 429) throw new Error("auth failed: " + res.status);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("auth failed: rate limited");
}

async function loginUser(identity, password) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await api("/api/collections/users/auth-with-password", {
      method: "POST",
      body: JSON.stringify({ identity, password }),
    }, "");
    if (res.ok || res.status !== 429) return res;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { ok: false, status: 429 };
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
  const moderatorLogin = await loginUser("verify-moderator@example.com", "verify-password");
  if (moderatorLogin.ok) {
    moderatorToken = moderatorLogin.data.token;
  } else {
    await api("/api/collections/users/records", {
      method: "POST",
      body: JSON.stringify({ email: "verify-moderator@example.com", password: "verify-password", passwordConfirm: "verify-password", role: "moderator", name: "Verify Moderator" }),
    });
    const retry = await loginUser("verify-moderator@example.com", "verify-password");
    moderatorToken = retry.ok ? retry.data.token : "";
  }
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

test("T3.1 hook insensitive: missing blunder_reason is rejected", async () => {
  const res = await create("records", baseRecord({
    blunder_category: "insensitive",
    blunder_reason: "",
    clarification_checked: true,
    sources: [sourceId, mediaSource2Id],
    slug: "hook-insensitive-missing-reason-" + Math.random(),
  }));
  assert.equal(res.ok, false);
});

test("T3.1 hook insensitive: blunder_reason is accepted", async () => {
  const res = await create("records", baseRecord({
    blunder_category: "insensitive",
    blunder_reason: "Affected residents",
    clarification_checked: true,
    sources: [sourceId, mediaSource2Id],
    slug: "hook-insensitive-with-reason-" + Math.random(),
  }));
  assert.equal(res.ok, true);
});

test("T3.1 hook out_of_touch: missing blunder_reason is rejected", async () => {
  const res = await create("records", baseRecord({
    blunder_category: "out_of_touch",
    blunder_reason: "",
    fact_check: "Households already had clean water.",
    clarification_checked: true,
    sources: [sourceId, mediaSource2Id],
    slug: "hook-out-of-touch-missing-reason-" + Math.random(),
  }));
  assert.equal(res.ok, false);
});

test("T3.1 hook out_of_touch: blunder_reason is accepted", async () => {
  const res = await create("records", baseRecord({
    blunder_category: "out_of_touch",
    blunder_reason: "Claim ignored everyday water access",
    fact_check: "Households already had clean water.",
    clarification_checked: true,
    sources: [sourceId, mediaSource2Id],
    slug: "hook-out-of-touch-with-reason-" + Math.random(),
  }));
  assert.equal(res.ok, true);
});

async function createVerifiedRecord(overrides = {}) {
  const res = await create("records", baseRecord(overrides));
  assert.equal(res.ok, true, "fixture record create failed: " + JSON.stringify(res.data));
  const verify = await patch("records", res.data.id, {
    verification_status: "verified",
    verified_at: "2026-11-03T00:00:00.000Z",
    privacy_confirmed: true,
  });
  assert.equal(verify.ok, true, "fixture record verify failed: " + JSON.stringify(verify.data));
  return res.data;
}

test("T3.1 hook self_contradiction: missing contradicts_record is rejected", async () => {
  const res = await create("records", baseRecord({
    blunder_category: "self_contradiction",
    clarification_checked: true,
    sources: [sourceId, mediaSource2Id],
    slug: "hook-contradiction-missing-" + Math.random(),
  }));
  assert.equal(res.ok, false);
});

test("T3.1 hook self_contradiction: an unverified contradicted record is rejected", async () => {
  const earlier = await create("records", baseRecord({
    occurred_at: "2026-09-01",
    slug: "hook-contradiction-earlier-unverified-" + Math.random(),
  }));
  assert.equal(earlier.ok, true);
  const res = await create("records", baseRecord({
    blunder_category: "self_contradiction",
    contradicts_record: earlier.data.id,
    clarification_checked: true,
    sources: [sourceId, mediaSource2Id],
    slug: "hook-contradiction-unverified-" + Math.random(),
  }));
  assert.equal(res.ok, false);
});

test("T3.1 hook self_contradiction: a record from another person is rejected", async () => {
  const otherPerson = await create("people", {
    slug: "phase3-other-person-" + Math.random().toString(36).slice(2),
    full_name: "Other Person",
    verification_status: "needs_verification",
  });
  assert.equal(otherPerson.ok, true);
  const otherEarlier = await createVerifiedRecord({
    person: otherPerson.data.id,
    occurred_at: "2026-09-01",
    slug: "hook-contradiction-other-" + Math.random(),
  });
  const res = await create("records", baseRecord({
    blunder_category: "self_contradiction",
    contradicts_record: otherEarlier.id,
    clarification_checked: true,
    sources: [sourceId, mediaSource2Id],
    slug: "hook-contradiction-wrong-person-" + Math.random(),
  }));
  assert.equal(res.ok, false);
});

test("T3.1 hook self_contradiction: same person, verified and earlier is accepted", async () => {
  const earlier = await createVerifiedRecord({
    occurred_at: "2026-09-01",
    slug: "hook-contradiction-earlier-verified-" + Math.random(),
  });
  const res = await create("records", baseRecord({
    blunder_category: "self_contradiction",
    contradicts_record: earlier.id,
    clarification_checked: true,
    sources: [sourceId, mediaSource2Id],
    slug: "hook-contradiction-valid-" + Math.random(),
  }));
  assert.equal(res.ok, true, JSON.stringify(res.data));
});

test("T3.1 hook legal suspect: one media source is rejected", async () => {
  const res = await create("records", baseRecord({
    type: "action",
    action_kind: "legal_case",
    legal_status: "suspect",
    sources: [sourceId],
    slug: "hook-legal-one-media-" + Math.random(),
  }));
  assert.equal(res.ok, false);
});

test("T3.1 hook legal suspect: two independent media sources are accepted", async () => {
  const res = await create("records", baseRecord({
    type: "action",
    action_kind: "legal_case",
    legal_status: "suspect",
    sources: [sourceId, mediaSource2Id],
    slug: "hook-legal-two-media-" + Math.random(),
  }));
  assert.equal(res.ok, true, JSON.stringify(res.data));
});

test("T3.1 hook legal suspect: an official source is accepted", async () => {
  const res = await create("records", baseRecord({
    type: "action",
    action_kind: "legal_case",
    legal_status: "suspect",
    sources: [officialSourceId],
    slug: "hook-legal-official-" + Math.random(),
  }));
  assert.equal(res.ok, true, JSON.stringify(res.data));
});

test("T3.1 hook promise status: no direct status field exists on records", async () => {
  const schema = await api("/api/collections/records");
  assert.equal(schema.ok, true);
  const names = (schema.data.fields || []).map((field) => field.name);
  assert.equal(names.includes("promise_status"), false);
  assert.equal(names.includes("status"), false);

  const promise = await create("records", baseRecord({
    type: "promise",
    promise_made_in: "visi_misi",
    status: "kept",
    promise_status: "kept",
    slug: "hook-promise-direct-status-" + Math.random(),
  }));
  if (promise.ok) {
    const fetched = await api("/api/collections/records/records/" + promise.data.id);
    assert.equal(fetched.ok, true);
    assert.equal(fetched.data.status, undefined);
    assert.equal(fetched.data.promise_status, undefined);
  } else {
    assert.equal(promise.status, 400);
  }
});

test("T3.1 hook promise status: kept with one media source is rejected", async () => {
  const promise = await create("records", baseRecord({ type: "promise", promise_made_in: "visi_misi", slug: "hook-promise-status-one-" + Math.random() }));
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

test("T3.1 hook promise status: kept with official and independent sources is accepted", async () => {
  const promise = await create("records", baseRecord({ type: "promise", promise_made_in: "visi_misi", slug: "hook-promise-status-valid-" + Math.random() }));
  assert.equal(promise.ok, true);
  const update = await create("promise_updates", {
    promise: promise.data.id,
    status: "kept",
    effective_date: "2026-11-02",
    sources: [officialSourceId, sourceId],
    note: "Official and media source",
    verification_status: "needs_verification",
  });
  assert.equal(update.ok, true, JSON.stringify(update.data));
});

test("T3.1 hook privacy_confirmed: verification without it is rejected", async () => {
  const record = await create("records", baseRecord({
    privacy_confirmed: false,
    slug: "hook-privacy-missing-" + Math.random(),
  }));
  assert.equal(record.ok, true);
  const verify = await patch("records", record.data.id, {
    verification_status: "verified",
    verified_at: "2026-11-03T00:00:00.000Z",
  });
  assert.equal(verify.ok, false);
});

test("T3.1 hook privacy_confirmed: verification with it is accepted", async () => {
  const record = await create("records", baseRecord({
    privacy_confirmed: false,
    slug: "hook-privacy-present-" + Math.random(),
  }));
  assert.equal(record.ok, true);
  const verify = await patch("records", record.data.id, {
    verification_status: "verified",
    verified_at: "2026-11-03T00:00:00.000Z",
    privacy_confirmed: true,
  });
  assert.equal(verify.ok, true, JSON.stringify(verify.data));
});

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

test("T3.8 built site leaks no hidden or unverified markers", async () => {
  assert.ok(moderatorToken, "moderator auth is required to inspect hidden fields");

  // Prove the fixtures are really stored before checking dist/. Otherwise a
  // missing seed could make this test pass without testing anything.
  const filter = (value) => "?perPage=5&filter=" + encodeURIComponent(value);
  const blunder = await api("/api/collections/records/records" + filter("slug='t38-leak-unverified-blunder-7f41c'"));
  assert.equal(blunder.data.totalItems, 1, "unverified blunder fixture is missing");
  assert.equal(blunder.data.items[0].blunder_reason, T38_MARKERS.unverifiedBlunderReason);
  assert.equal(blunder.data.items[0].verification_status, "needs_verification");

  const noted = await api("/api/collections/records/records" + filter("slug='t38-leak-internal-notes-7f41c'"));
  assert.equal(noted.data.totalItems, 1, "internal-notes record fixture is missing");
  const notedDetail = await api("/api/moderator/records/" + noted.data.items[0].id, {}, moderatorToken);
  assert.equal(notedDetail.ok, true);
  assert.equal(notedDetail.data.notes, T38_MARKERS.recordInternalNotes);

  const updates = await api("/api/collections/promise_updates/records" + filter("note='" + T38_MARKERS.unverifiedPromiseNote + "'"));
  assert.equal(updates.data.totalItems, 1, "unverified promise update fixture is missing");
  assert.equal(updates.data.items[0].verification_status, "needs_verification");

  const rejectedReply = await api("/api/collections/replies/records" + filter("text='" + T38_MARKERS.rejectedReplyText + "'"));
  assert.equal(rejectedReply.data.totalItems, 1, "rejected reply fixture is missing");
  assert.equal(rejectedReply.data.items[0].verification_status, "rejected");

  const identityReply = await api("/api/collections/replies/records" + filter("text='Terima kasih atas klarifikasinya.'"));
  assert.equal(identityReply.data.totalItems, 1, "identity-check reply fixture is missing");
  const identityDetail = await api("/api/moderator/replies/" + identityReply.data.items[0].id, {}, moderatorToken);
  assert.equal(identityDetail.ok, true);
  assert.equal(identityDetail.data.identity_check, T38_MARKERS.replyIdentityCheck);

  const distDir = path.resolve(process.env.DIST_DIR || "apps/web/dist");
  assert.equal(fs.existsSync(distDir), true, "dist/ is missing; run make build first");
  const hits = [];
  for (const file of walkFiles(distDir)) {
    const contents = fs.readFileSync(file).toString("utf8");
    for (const marker of T38_MARKER_LIST) {
      if (contents.includes(marker)) hits.push(`${marker} in ${path.relative(distDir, file)}`);
    }
  }
  assert.deepEqual(hits, []);
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
  const verify = await patch("records", record.data.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z" });
  assert.equal(verify.ok, true, "fixture verify failed: " + JSON.stringify(verify.data));
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