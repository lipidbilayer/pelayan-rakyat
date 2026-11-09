import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const EMAIL = process.env.PB_SUPERUSER_EMAIL || "admin@example.com";
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD || "verify-password";
const ALTCHA_KEY = "verify-altcha-key";
const TERMS_VERSION = "2026-11-06";

let superToken = "";
let moderatorToken = "";

async function api(path, options = {}, token = superToken) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(PB_URL + path, Object.assign({}, options, { headers }));
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { ok: response.ok, status: response.status, data };
}

async function auth() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await api("/api/collections/_superusers/auth-with-password", { method: "POST", body: JSON.stringify({ identity: EMAIL, password: PASSWORD }) });
    if (res.ok) { superToken = res.data.token; return; }
    if (res.status !== 429) throw new Error("superuser auth failed: " + res.status);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("superuser auth failed");
}

function sha256Hex(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function hs256(text, secret) { return crypto.createHmac("sha256", secret).update(text).digest("hex"); }
function solveAltcha(ch) {
  const { challenge, salt, signature, maxnumber } = ch;
  const limit = maxnumber || 100000;
  let n = 0;
  for (; n <= limit; n++) {
    if (sha256Hex(salt + String(n)) === challenge) break;
  }
  return Buffer.from(JSON.stringify({ algorithm: "SHA-256", challenge, number: n, salt, signature })).toString("base64");
}

async function create(collection, body, tokenOverride) {
  const res = await api("/api/collections/" + collection + "/records", { method: "POST", body: JSON.stringify(body) }, tokenOverride || superToken);
  if (!res.ok) throw new Error("create " + collection + " failed: " + res.status + " " + JSON.stringify(res.data));
  return res.data;
}
async function patch(collection, id, body, tokenOverride) {
  return api("/api/collections/" + collection + "/records/" + id, { method: "PATCH", body: JSON.stringify(body) }, tokenOverride || superToken);
}

function nowIso() { return new Date().toISOString(); }

before(async () => {
  await auth();
  // moderator
  try {
    await create("users", { email: "phase4-moderator@example.com", password: "verify-password", passwordConfirm: "verify-password", role: "moderator", name: "Phase4 Moderator", accepted_terms_at: "2026-11-03T00:00:00.000Z", accepted_terms_version: TERMS_VERSION });
  } catch (e) {}
  for (let i = 0; i < 10; i++) {
    const res = await api("/api/collections/users/auth-with-password", { method: "POST", body: JSON.stringify({ identity: "phase4-moderator@example.com", password: "verify-password" }) }, "");
    if (res.ok) { moderatorToken = res.data.token; break; }
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
});

// C4.1 anonymous sweep
test("C4.1 anonymous collections do not leak unverified/rejected or hidden fields", async () => {
  const cols = await api("/api/collections", {}, "");
  // anonymous may not list collections; use superuser list but test anonymous data access
  const superCols = await api("/api/collections");
  const hiddenByCollection = {};
  for (const c of superCols.data.items) {
    hiddenByCollection[c.name] = (c.fields || []).filter((f) => f.hidden).map((f) => f.name);
  }
  const publicAllowed = new Set(["parties","people","institutions","dapil","sources","positions","status_events","topics","records","promise_updates","record_changes","replies"]);
  for (const c of superCols.data.items) {
    if (c.name.startsWith("_")) continue;
    const res = await api("/api/collections/" + c.name + "/records?perPage=5", {}, "");
    // private collections must return nothing (or 403)
    if (!publicAllowed.has(c.name)) {
      if (res.ok) assert.equal((res.data.items || []).length, 0, c.name + " leaks rows anonymously");
      continue;
    }
    if (!res.ok) continue;
    for (const row of res.data.items || []) {
      if (row.verification_status !== undefined) {
        assert.equal(row.verification_status, "verified", c.name + " has non-verified row");
      }
      if (c.name === "replies") assert.equal(row.status, "published");
      for (const hidden of hiddenByCollection[c.name] || []) {
        assert.equal(Object.prototype.hasOwnProperty.call(row, hidden), false, c.name + " leaks hidden field " + hidden);
      }
    }
    // view each
    for (const row of (res.data.items || []).slice(0, 3)) {
      const v = await api("/api/collections/" + c.name + "/records/" + row.id, {}, "");
      if (v.ok) {
        for (const hidden of hiddenByCollection[c.name] || []) {
          assert.equal(Object.prototype.hasOwnProperty.call(v.data, hidden), false, c.name + " view leaks " + hidden);
        }
      }
    }
  }
});

// C4.2 production rate limits
test("C4.2 committed production migration enables rate limits with §6.2 rules", async () => {
  const migration = fs.readFileSync("services/pocketbase/pb_migrations/1767700001_phase4_rate_limits.js", "utf8");
  assert.match(migration, /settings\.rateLimits\.enabled = true/);
  assert.match(migration, /submissions:create/);
  assert.match(migration, /flags:create/);
  assert.match(migration, /POST \/api\/pr\/submissions/);
  assert.match(migration, /POST \/api\/pr\/flags/);
  // 20 requests / 3600 seconds
  assert.match(migration, /20, 3600/);
  // test compose disables limits
  const compose = fs.readFileSync("infra/compose.test.yml", "utf8");
  assert.match(compose, /PB_TEST_DISABLE_RATE_LIMITS:\s*"true"/);
  // verify.sh must not PATCH settings
  const verify = fs.readFileSync("scripts/verify.sh", "utf8");
  assert.doesNotMatch(verify, /rateLimits.*enabled.*False|current\["rateLimits"\]/);
});

// C4.3 contributor role sweep
test("C4.3 contributor cannot create/update/delete on public collections", async () => {
  // create a contributor
  const email = "c43-contrib@example.com";
  try {
    await create("users", { email: email, password: "verify-password", passwordConfirm: "verify-password", role: "contributor", accepted_terms_at: "2026-11-03T00:00:00.000Z", accepted_terms_version: TERMS_VERSION });
  } catch (e) {}
  const login = await api("/api/collections/users/auth-with-password", { method: "POST", body: JSON.stringify({ identity: email, password: "verify-password" }) }, "");
  const token = login.data.token;
  const cols = await api("/api/collections", {}, superToken);
  for (const c of cols.data.items) {
    if (c.name.startsWith("_")) continue;
    // create
    const createRes = await api("/api/collections/" + c.name + "/records", { method: "POST", body: JSON.stringify({}) }, token);
    assert.ok(createRes.status === 400 || createRes.status === 403 || createRes.status === 404, c.name + " create allowed");
    // update/delete on first row if exists
    const list = await api("/api/collections/" + c.name + "/records?perPage=1", {}, superToken);
    const row = (list.data.items || [])[0];
    if (row) {
      const up = await api("/api/collections/" + c.name + "/records/" + row.id, { method: "PATCH", body: JSON.stringify({}) }, token);
      assert.ok(up.status === 400 || up.status === 403 || up.status === 404, c.name + " update allowed");
      const del = await api("/api/collections/" + c.name + "/records/" + row.id, { method: "DELETE" }, token);
      assert.ok(del.status === 400 || del.status === 403 || del.status === 404, c.name + " delete allowed");
    }
  }
});

// helper to create contributor
async function newContributor(prefix) {
  const email = prefix + "@example.com";
  try {
    await create("users", { email: email, password: "verify-password", passwordConfirm: "verify-password", role: "contributor", accepted_terms_at: "2026-11-03T00:00:00.000Z", accepted_terms_version: TERMS_VERSION });
  } catch (e) {}
  let login = null;
  for (let i = 0; i < 10; i++) {
    login = await api("/api/collections/users/auth-with-password", { method: "POST", body: JSON.stringify({ identity: email, password: "verify-password" }) }, "");
    if (login.ok) break;
    if (login.status !== 429) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!login.ok) throw new Error("login failed: " + login.status + " " + JSON.stringify(login.data));
  return { email: email, token: login.data.token, id: login.data.record.id };
}

async function getChallenge() {
  const ch = await api("/api/pr/altcha/challenge", {}, "");
  return ch.data;
}

// T4.1
test("T4.1 contributor reads only own submissions and flags", async () => {
  const a = await newContributor("t41-a");
  const b = await newContributor("t41-b");
  // create submission as a via route
  const ch = await getChallenge();
  const altcha = solveAltcha(ch);
  const sub = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t41-a", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, a.token);
  assert.equal(sub.ok, true);
  // b cannot see a's submission
  const listB = await api("/api/collections/submissions/records?perPage=50", {}, b.token);
  assert.equal((listB.data.items || []).length, 0);
  // a sees own
  const listA = await api("/api/collections/submissions/records?perPage=50", {}, a.token);
  assert.ok((listA.data.items || []).length >= 1);
});

// T4.2 non-allowed fields rejected
test("T4.2 submission with forbidden fields is rejected", async () => {
  const u = await newContributor("t42");
  const ch = await getChallenge();
  const altcha = solveAltcha(ch);
  const res = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t42", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha, status: "converted", submitter: "x", reviewed_by: "y" }) }, u.token);
  assert.equal(res.ok, false);
});

// T4.3 submitter is auth user
test("T4.3 submitter is always the authenticated user", async () => {
  const u = await newContributor("t43");
  const ch = await getChallenge();
  const altcha = solveAltcha(ch);
  const res = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t43", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
  assert.equal(res.ok, true);
  const list = await api("/api/collections/submissions/records?perPage=5", {}, u.token);
  const row = (list.data.items || [])[0];
  assert.equal(row.submitter, u.id);
});

// T4.4 URL rules
test("T4.4 URL rules reject bad schemes and accept normal https", async () => {
  const u = await newContributor("t44");
  const bad = ["javascript:alert(1)", "data:text/plain,x", "file:///etc/passwd", "http://127.0.0.1/x", "https://bit.ly/abc", "https://user:pass@example.com/x"];
  for (const url of bad) {
    const ch = await getChallenge();
    const altcha = solveAltcha(ch);
    const res = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: url, note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
    assert.equal(res.ok, false, url + " should be rejected");
  }
  const ch = await getChallenge();
  const altcha = solveAltcha(ch);
  const ok = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/article", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
  assert.equal(ok.ok, true);
});

// T4.5 duplicate normalization
test("T4.5 duplicate URL increases count; same user no increase", async () => {
  const a = await newContributor("t45-a");
  const b = await newContributor("t45-b");
  const ch1 = await getChallenge(); const alt1 = solveAltcha(ch1);
  const first = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t45", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: alt1 }) }, a.token);
  assert.equal(first.ok, true);
  // b submits same URL with tracking params / trailing slash / www
  const ch2 = await getChallenge(); const alt2 = solveAltcha(ch2);
  const dup = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://www.example.com/t45/?utm_source=x", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: alt2 }) }, b.token);
  assert.equal(dup.ok, true);
  assert.equal(dup.data.duplicate, true);
  // same user again
  const ch3 = await getChallenge(); const alt3 = solveAltcha(ch3);
  const dup2 = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t45", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: alt3 }) }, a.token);
  assert.equal(dup2.ok, true);
  assert.equal(dup2.data.duplicate, true);
});

// T4.6 ALTCHA
test("T4.6 missing or invalid ALTCHA rejected; valid accepted (submission and flag)", async () => {
  const u = await newContributor("t46");
  const noCaptcha = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t46", note: "Laporan panjang yang cukup untuk validasi minimal" }) }, u.token);
  assert.equal(noCaptcha.ok, false);
  const badCaptcha = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t46", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: "AAAA" }) }, u.token);
  assert.equal(badCaptcha.ok, false);

  // create a verified record for flag
  const person = await create("people", { slug: "t46-person", full_name: "T46", verification_status: "needs_verification" });
  const mediaA = await create("sources", { url: "https://example.com/t46-a", publisher: "A", kind: "media", is_specific: true });
  const mediaB = await create("sources", { url: "https://example.com/t46-b", publisher: "B", kind: "media", is_specific: true });
  const topics = await api("/api/collections/topics/records?perPage=1");
  const topicId = topics.data.items[0].id;
  const rec = await create("records", { type: "statement", person: person.id, title: "T46 rec", summary: "x", context: "This fixture context is long enough for the record creation hook to accept it.", occurred_at: "2026-11-01", topics: [topicId], sources: [mediaA.id, mediaB.id], quote: "q", privacy_confirmed: true, verification_status: "needs_verification", slug: "t46-rec" });
  await patch("records", rec.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", privacy_confirmed: true });

  const ch = await getChallenge(); const altcha = solveAltcha(ch);
  const subOk = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t46-ok", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
  assert.equal(subOk.ok, true);

  const ch2 = await getChallenge(); const altcha2 = solveAltcha(ch2);
  const flagOk = await api("/api/pr/flags", { method: "POST", body: JSON.stringify({ record: rec.id, reason: "other", note: "Keterangan masalah", altcha: altcha2 }) }, u.token);
  assert.equal(flagOk.ok, true);
});

// T4.7 rate limits
test("T4.7 rate limits reject beyond daily caps", async () => {
  const u = await newContributor("t47");
  // backdate user created to >24h
  await api("/api/pr/test/backdate-user", { method: "POST", body: JSON.stringify({ id: u.id, created: "2020-01-01 00:00:00.000Z" }) }, superToken);
  // set clock to a fixed day
  const fixedNow = Date.parse("2026-11-06T10:00:00.000Z");
  await api("/api/pr/test/now", { method: "POST", body: JSON.stringify({ now: fixedNow }) }, superToken);
  // trust 0: 10 submissions/day. Submit 10 then 11th rejected.
  for (let i = 0; i < 10; i++) {
    const ch = await getChallenge(); const altcha = solveAltcha(ch);
    const r = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t47-" + i, note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
    assert.equal(r.ok, true, "submission " + i + " should pass");
  }
  const ch = await getChallenge(); const altcha = solveAltcha(ch);
  const rejected = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t47-overflow", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
  assert.equal(rejected.ok, false);
  // reset clock to next day
  await api("/api/pr/test/now", { method: "POST", body: JSON.stringify({ now: fixedNow + 24 * 3600 * 1000 }) }, superToken);
  const ch2 = await getChallenge(); const altcha2 = solveAltcha(ch2);
  const nextDay = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t47-nextday", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha2 }) }, u.token);
  assert.equal(nextDay.ok, true);
  await api("/api/pr/test/reset-now", { method: "POST" }, superToken);
});

// T4.8 suspended
test("T4.8 suspended user cannot submit or flag but account works", async () => {
  const u = await newContributor("t48");
  // suspend via moderator action? direct patch
  await patch("users", u.id, { suspended_until: "2099-01-01 00:00:00.000Z", suspension_reason: "test" }, superToken);
  const ch = await getChallenge(); const altcha = solveAltcha(ch);
  const sub = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t48", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
  assert.equal(sub.ok, false);
  const acc = await api("/api/pr/account", {}, u.token);
  assert.equal(acc.ok, true);
  await patch("users", u.id, { suspended_until: "", suspension_reason: "" }, superToken);
});

// T4.9 terms not accepted
test("T4.9 terms not accepted blocks submit", async () => {
  const email = "t49@example.com";
  try {
    await create("users", { email: email, password: "verify-password", passwordConfirm: "verify-password", role: "contributor", accepted_terms_at: "", accepted_terms_version: "" });
  } catch (e) {}
  const login = await api("/api/collections/users/auth-with-password", { method: "POST", body: JSON.stringify({ identity: email, password: "verify-password" }) }, "");
  const token = login.data.token;
  const ch = await getChallenge(); const altcha = solveAltcha(ch);
  const res = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t49", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, token);
  assert.equal(res.ok, false);
});

// T4.10 flags: second open flag rejected; ten flags don't change record
test("T4.10 duplicate open flag rejected and record stays public", async () => {
  const u = await newContributor("t410");
  // verified record
  const person = await create("people", { slug: "t410-person", full_name: "T410", verification_status: "needs_verification" });
  const mediaA = await create("sources", { url: "https://example.com/t410-a", publisher: "A", kind: "media", is_specific: true });
  const mediaB = await create("sources", { url: "https://example.com/t410-b", publisher: "B", kind: "media", is_specific: true });
  const topics = await api("/api/collections/topics/records?perPage=1");
  const topicId = topics.data.items[0].id;
  const rec = await create("records", { type: "statement", person: person.id, title: "T410 rec", summary: "x", context: "This fixture context is long enough for the record creation hook to accept it.", occurred_at: "2026-11-01", topics: [topicId], sources: [mediaA.id, mediaB.id], quote: "q", privacy_confirmed: true, verification_status: "needs_verification", slug: "t410-rec" });
  await patch("records", rec.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", privacy_confirmed: true });
  // first flag
  const ch1 = await getChallenge(); const alt1 = solveAltcha(ch1);
  const f1 = await api("/api/pr/flags", { method: "POST", body: JSON.stringify({ record: rec.id, reason: "other", note: "masalah", altcha: alt1 }) }, u.token);
  assert.equal(f1.ok, true);
  // second open flag by same user rejected
  const ch2 = await getChallenge(); const alt2 = solveAltcha(ch2);
  const f2 = await api("/api/pr/flags", { method: "POST", body: JSON.stringify({ record: rec.id, reason: "other", note: "masalah2", altcha: alt2 }) }, u.token);
  assert.equal(f2.ok, false);
  // record still verified
  const pub = await api("/api/collections/records/records/" + rec.id, {}, "");
  assert.equal(pub.data.verification_status, "verified");
});

// T4.11 coordinated alerts
test("T4.11 coordinated activity alert fires at thresholds", async () => {
  const fixedNow = Date.now();
  await api("/api/pr/test/now", { method: "POST", body: JSON.stringify({ now: fixedNow }) }, superToken);
  // 5 flags on one record within an hour
  const person = await create("people", { slug: "t411-person-" + Date.now(), full_name: "T411", verification_status: "needs_verification" });
  const mediaA = await create("sources", { url: "https://example.com/t411-a-" + Date.now(), publisher: "A", kind: "media", is_specific: true });
  const mediaB = await create("sources", { url: "https://example.com/t411-b-" + Date.now(), publisher: "B", kind: "media", is_specific: true });
  const topics = await api("/api/collections/topics/records?perPage=1");
  const topicId = topics.data.items[0].id;
  const rec = await create("records", { type: "statement", person: person.id, title: "T411 rec", summary: "x", context: "This fixture context is long enough for the record creation hook to accept it.", occurred_at: "2026-11-01", topics: [topicId], sources: [mediaA.id, mediaB.id], quote: "q", privacy_confirmed: true, verification_status: "needs_verification", slug: "t411-rec-" + Date.now() });
  await patch("records", rec.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", privacy_confirmed: true });
  // 4 flags -> no alert
  for (let i = 0; i < 4; i++) {
    const u = await newContributor("t411-" + i);
    const ch = await getChallenge(); const altcha = solveAltcha(ch);
    const fr = await api("/api/pr/flags", { method: "POST", body: JSON.stringify({ record: rec.id, reason: "other", note: "masalah " + i, altcha: altcha }) }, u.token);
    }
  let dash = await api("/api/pr/moderator/dashboard", {}, moderatorToken);
  let flagAlerts = (dash.data.alerts || []).filter((a) => a.type === "flags");
  assert.equal(flagAlerts.length, 0);
  // 5th flag -> alert
  const u5 = await newContributor("t411-4");
  const ch5 = await getChallenge(); const alt5 = solveAltcha(ch5);
  await api("/api/pr/flags", { method: "POST", body: JSON.stringify({ record: rec.id, reason: "other", note: "masalah 4", altcha: alt5 }) }, u5.token);
  dash = await api("/api/pr/moderator/dashboard", {}, moderatorToken);
  flagAlerts = (dash.data.alerts || []).filter((a) => a.type === "flags");
  flagAlerts = (dash.data.alerts || []).filter((a) => a.type === "flags");
  assert.ok(flagAlerts.length >= 1);
  await api("/api/pr/test/reset-now", { method: "POST" }, superToken);
});

// T4.13 no server-side fetch
test("T4.13 no server-side fetch of submitted URLs", async () => {
  // start a local listener
  const http = await import("node:http");
  let hits = 0;
  const server = http.createServer(function (req, res) { hits += 1; res.end("ok"); });
  server.unref();
  server.listen(0, "127.0.0.1");
  await new Promise((r) => setTimeout(r, 200));
  const port = server.address().port;
  const u = await newContributor("t413");
  const ch = await getChallenge(); const altcha = solveAltcha(ch);
  const url = "http://localhost:" + port + "/secret";
  const sub = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: url, note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
  assert.equal(sub.ok, true);
  // trigger moderator flow
  const id = sub.data.id;
  await api("/api/pr/moderator/submission/" + id + "/action", { method: "POST", body: JSON.stringify({ action: "in_review" }) }, moderatorToken);
  await new Promise((r) => setTimeout(r, 500));
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(hits, 0);
});

// T4.14 convert to draft
test("T4.14 convert to draft links submission and record", async () => {
  const u = await newContributor("t414");
  const person = await create("people", { slug: "t414-person-" + Date.now(), full_name: "T414", verification_status: "needs_verification" });
  const ch = await getChallenge(); const altcha = solveAltcha(ch);
  const sub = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t414-" + Date.now(), note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha, suggested_type: "statement", quote: "kutipan", person: person.id, occurred_at: "2026-11-01" }) }, u.token);
  assert.equal(sub.ok, true);
  const conv = await api("/api/pr/moderator/submission/" + sub.data.id + "/action", { method: "POST", body: JSON.stringify({ action: "convert" }) }, moderatorToken);
  assert.equal(conv.ok, true);
  assert.ok(conv.data.record && conv.data.record.id);
  const record = await api("/api/collections/records/records/" + conv.data.record.id, {}, superToken);
  assert.equal(record.data.verification_status, "needs_verification");
  assert.ok((record.data.from_submissions || []).indexOf(sub.data.id) >= 0);
  // verify record
  await patch("records", conv.data.record.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", privacy_confirmed: true }, moderatorToken);
  // dist contains "Berawal dari laporan warga" for seeded converted record
  const distFile = "apps/web/dist/catatan/t414-converted-record/index.html";
  if (fs.existsSync(distFile)) {
    const html = fs.readFileSync(distFile, "utf8");
    assert.ok(html.includes("Berawal dari laporan warga"));
  }
});

// T4.15 account deletion
test("T4.15 account deletion removes user and clears submitter", async () => {
  const u = await newContributor("t415");
  const ch = await getChallenge(); const altcha = solveAltcha(ch);
  await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t415", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u.token);
  const del = await api("/api/pr/delete-account", { method: "POST" }, u.token);
  assert.equal(del.ok, true);
  // user gone
  const login = await api("/api/collections/users/auth-with-password", { method: "POST", body: JSON.stringify({ identity: u.email, password: "verify-password" }) }, "");
  assert.equal(login.ok, false);
  // submission remains with empty submitter
  const list = await api("/api/collections/submissions/records?filter=" + encodeURIComponent("url='https://example.com/t415'"), {}, superToken);
  if ((list.data.items || []).length) {
    assert.equal(list.data.items[0].submitter, "");
  }
});

// T4.16 data leak
test("T4.16 submission/flag/moderator_note/display name/email never leak", async () => {
  const markers = ["T416LEAKDISPLAYNAME", "T416LEAKNOTEMARKER", "T416LEAKQUOTEMARKER", "T416LEAKMODERATORNOTE", "T416LEAKFLAGNOTE", "t416leakemail@example.com"];
  // dist scan
  function walk(dir, cb) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = dir + "/" + e.name;
      if (e.isDirectory()) walk(full, cb); else cb(full);
    }
  }
  walk("apps/web/dist", function (file) {
    const content = fs.readFileSync(file, "utf8");
    for (const m of markers) assert.ok(!content.includes(m), file + " contains " + m);
  });
  // anonymous API scan
  const cols = await api("/api/collections", {}, superToken);
  for (const c of cols.data.items) {
    if (c.name.startsWith("_")) continue;
    const res = await api("/api/collections/" + c.name + "/records?perPage=200", {}, "");
    if (!res.ok) continue;
    const text = JSON.stringify(res.data);
    for (const m of markers) assert.ok(!text.includes(m), c.name + " leaks " + m);
  }
});

// T4.20 trust level
test("T4.20 trust level 1 granted at 5 converted verified submissions", async () => {
  const u = await newContributor("t420");
  // backdate
  await api("/api/pr/test/backdate-user", { method: "POST", body: JSON.stringify({ id: u.id, created: "2020-01-01 00:00:00.000Z" }) }, superToken);
  const person = await create("people", { slug: "t420-person-" + Date.now(), full_name: "T420", verification_status: "needs_verification" });
  const mediaA = await create("sources", { url: "https://example.com/t420-a-" + Date.now(), publisher: "A", kind: "media", is_specific: true });
  const mediaB = await create("sources", { url: "https://example.com/t420-b-" + Date.now(), publisher: "B", kind: "media", is_specific: true });
  for (let i = 0; i < 5; i++) {
    const ch = await getChallenge(); const altcha = solveAltcha(ch);
    const sub = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t420-" + i + "-" + Date.now(), note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha, person: person.id }) }, u.token);
    assert.equal(sub.ok, true);
    const conv = await api("/api/pr/moderator/submission/" + sub.data.id + "/action", { method: "POST", body: JSON.stringify({ action: "convert" }) }, moderatorToken);
    assert.equal(conv.ok, true);
    await patch("records", conv.data.record.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", privacy_confirmed: true }, moderatorToken);
  }
  const acc = await api("/api/pr/account", {}, u.token);
  assert.equal(acc.data.trust_level, 1);

  // negative: abusive rejection prevents trust
  const u2 = await newContributor("t420b");
  await api("/api/pr/test/backdate-user", { method: "POST", body: JSON.stringify({ id: u2.id, created: "2020-01-01 00:00:00.000Z" }) }, superToken);
  const person2 = await create("people", { slug: "t420b-person-" + Date.now(), full_name: "T420b", verification_status: "needs_verification" });
  // 4 converted verified + 1 abusive rejection
  for (let i = 0; i < 4; i++) {
    const ch = await getChallenge(); const altcha = solveAltcha(ch);
    const sub = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t420b-" + i + "-" + Date.now(), note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha, person: person2.id }) }, u2.token);
    const conv = await api("/api/pr/moderator/submission/" + sub.data.id + "/action", { method: "POST", body: JSON.stringify({ action: "convert" }) }, moderatorToken);
    await patch("records", conv.data.record.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", privacy_confirmed: true }, moderatorToken);
  }
  // one abusive rejection
  const ch = await getChallenge(); const altcha = solveAltcha(ch);
  const bad = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t420b-bad", note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha }) }, u2.token);
  await api("/api/pr/moderator/submission/" + bad.data.id + "/action", { method: "POST", body: JSON.stringify({ action: "reject", rejection_code: "abusive" }) }, moderatorToken);
  // add one more converted to reach 5
  const ch2 = await getChallenge(); const altcha2 = solveAltcha(ch2);
  const sub5 = await api("/api/pr/submissions", { method: "POST", body: JSON.stringify({ url: "https://example.com/t420b-5-" + Date.now(), note: "Laporan panjang yang cukup untuk validasi minimal", altcha: altcha2, person: person2.id }) }, u2.token);
  const conv5 = await api("/api/pr/moderator/submission/" + sub5.data.id + "/action", { method: "POST", body: JSON.stringify({ action: "convert" }) }, moderatorToken);
  await patch("records", conv5.data.record.id, { verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z", privacy_confirmed: true }, moderatorToken);
  const acc2 = await api("/api/pr/account", {}, u2.token);
  assert.equal(acc2.data.trust_level, 0);
});