import { test, before } from "node:test";
import assert from "node:assert/strict";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const EMAIL = process.env.PB_SUPERUSER_EMAIL || process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD;

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

before(async () => {
  const res = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  superToken = res.data.token;
  try {
    await api("/api/collections/users/records", {
      method: "POST",
      body: JSON.stringify({ email: "phase1-moderator@example.com", password: "verify-password", passwordConfirm: "verify-password", role: "moderator", name: "Phase 1 Moderator" }),
    }, superToken);
  } catch (e) {}
  const login = await api("/api/collections/users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: "phase1-moderator@example.com", password: "verify-password" }),
  }, "");
  moderatorToken = login.data.token;
});

test("P1.2 verify rule: Wikipedia-only position is rejected", async () => {
  const person = await api("/api/collections/people/records", { method: "POST", body: JSON.stringify({ slug: "p1-wiki-person", full_name: "Wiki Person", verification_status: "needs_verification" }) });
  const inst = await api("/api/collections/institutions/records", { method: "POST", body: JSON.stringify({ code: "p1-wiki-inst", name: "Wiki Inst", kind: "city_government", jurisdiction: "Jakarta Pusat", is_partisan: false }) });
  const source = await api("/api/collections/sources/records", { method: "POST", body: JSON.stringify({ url: "https://id.wikipedia.org/wiki/Test", publisher: "Wikipedia", kind: "reference", is_specific: true }) });
  const position = await api("/api/collections/positions/records", { method: "POST", body: JSON.stringify({ person: person.data.id, institution: inst.data.id, title: "Wali Kota", appointment_type: "appointed", status: "active", sources: [source.data.id], verification_status: "needs_verification" }) });
  const verify = await api("/api/collections/positions/records/" + position.data.id, { method: "PATCH", body: JSON.stringify({ verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z" }) }, moderatorToken);
  assert.equal(verify.ok, false);
});

test("P1.2 verify rule: home-page-only party is rejected", async () => {
  const source = await api("/api/collections/sources/records", { method: "POST", body: JSON.stringify({ url: "https://example.com/", publisher: "Example", kind: "media", is_specific: false }) });
  const party = await api("/api/collections/parties/records", { method: "POST", body: JSON.stringify({ code: "p1-home-party", name: "Home Party", short_name: "HP", sources: [source.data.id], verification_status: "needs_verification" }) });
  const verify = await api("/api/collections/parties/records/" + party.data.id, { method: "PATCH", body: JSON.stringify({ verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z" }) }, moderatorToken);
  assert.equal(verify.ok, false);
});

test("P1.2 verify rule: specific Detik source is allowed", async () => {
  const person = await api("/api/collections/people/records", { method: "POST", body: JSON.stringify({ slug: "p1-detik-person", full_name: "Detik Person", verification_status: "needs_verification" }) });
  const inst = await api("/api/collections/institutions/records", { method: "POST", body: JSON.stringify({ code: "p1-detik-inst", name: "Detik Inst", kind: "city_government", jurisdiction: "Jakarta Pusat", is_partisan: false }) });
  const source = await api("/api/collections/sources/records", { method: "POST", body: JSON.stringify({ url: "https://news.detik.com/test", publisher: "Detik.com", kind: "media", is_specific: true }) });
  const position = await api("/api/collections/positions/records", { method: "POST", body: JSON.stringify({ person: person.data.id, institution: inst.data.id, title: "Wali Kota", appointment_type: "appointed", status: "active", sources: [source.data.id], verification_status: "needs_verification" }) });
  const verify = await api("/api/collections/positions/records/" + position.data.id, { method: "PATCH", body: JSON.stringify({ verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z" }) }, moderatorToken);
  assert.equal(verify.ok, true);
});

test("P1.3 moderator can read notes", async () => {
  const person = await api("/api/collections/people/records", { method: "POST", body: JSON.stringify({ slug: "p1-notes-person", full_name: "Notes Person", notes: "SECRETNOTE", verification_status: "needs_verification" }) });
  const anon = await api("/api/collections/people/records/" + person.data.id, {}, "");
  const mod = await api("/api/moderator/people/" + person.data.id, {}, moderatorToken);
  assert.equal(Object.prototype.hasOwnProperty.call(anon.data, "notes"), false);
  assert.equal(mod.data.notes, "SECRETNOTE");
});

test("P1.3 anonymous cannot read rejection_reason", async () => {
  const person = await api("/api/collections/people/records", { method: "POST", body: JSON.stringify({ slug: "p1-reject-person", full_name: "Reject Person", rejection_reason: "SECRETREASON", verification_status: "rejected" }) });
  const anon = await api("/api/collections/people/records/" + person.data.id, {}, "");
  assert.equal(Object.prototype.hasOwnProperty.call(anon.data, "rejection_reason"), false);
});

test("P1.5 revisions written on create", async () => {
  const before = await api("/api/collections/revisions/records?perPage=1", {}, moderatorToken);
  const totalBefore = before.data.totalItems;
  const person = await api("/api/collections/people/records", { method: "POST", body: JSON.stringify({ slug: "p1-rev-person", full_name: "Rev Person", verification_status: "needs_verification" }) });
  const after = await api("/api/collections/revisions/records?perPage=1", {}, moderatorToken);
  assert.ok(after.data.totalItems > totalBefore);
});

test("P1.5 revisions cannot be updated", async () => {
  const revisions = await api("/api/collections/revisions/records?perPage=1", {}, moderatorToken);
  const id = revisions.data.items[0].id;
  const res = await api("/api/collections/revisions/records/" + id, { method: "PATCH", body: JSON.stringify({ reason: "changed" }) }, moderatorToken);
  assert.equal(res.ok, false);
});

test("P1.5 revisions cannot be deleted", async () => {
  const revisions = await api("/api/collections/revisions/records?perPage=1", {}, moderatorToken);
  const id = revisions.data.items[0].id;
  const res = await api("/api/collections/revisions/records/" + id, { method: "DELETE" }, moderatorToken);
  assert.equal(res.ok, false);
});

test("P1.5 party rule enforced", async () => {
  const inst = await api("/api/collections/institutions/records", { method: "POST", body: JSON.stringify({ code: "partyrule-inst", name: "Party Rule Inst", kind: "city_government", jurisdiction: "Jakarta Pusat", is_partisan: false }) });
  const party = await api("/api/collections/parties/records", { method: "POST", body: JSON.stringify({ code: "partyrule-party", name: "Party", short_name: "P", verification_status: "needs_verification" }) });
  const source = await api("/api/collections/sources/records", { method: "POST", body: JSON.stringify({ url: "https://example.com/partyrule", publisher: "Example", kind: "media", is_specific: true }) });
  const person = await api("/api/collections/people/records", { method: "POST", body: JSON.stringify({ slug: "partyrule-person", full_name: "Party Rule Person", verification_status: "needs_verification" }) });
  const res = await api("/api/collections/positions/records", { method: "POST", body: JSON.stringify({ person: person.data.id, institution: inst.data.id, title: "Wali Kota", appointment_type: "appointed", status: "active", party: party.data.id, sources: [source.data.id], verification_status: "needs_verification" }) });
  assert.equal(res.ok, false);
});

test("P1.5 hard delete blocked", async () => {
  const person = await api("/api/collections/people/records", { method: "POST", body: JSON.stringify({ slug: "p1-harddelete-person", full_name: "Hard Delete Person", verification_status: "needs_verification" }) });
  const res = await api("/api/collections/people/records/" + person.data.id, { method: "DELETE" }, moderatorToken);
  assert.equal(res.ok, false);
});

test("P1.5 verified record resets on edit", async () => {
  const person = await api("/api/collections/people/records", { method: "POST", body: JSON.stringify({ slug: "p1-reset-person", full_name: "Reset Person", verification_status: "needs_verification" }) });
  await api("/api/collections/people/records/" + person.data.id, { method: "PATCH", body: JSON.stringify({ verification_status: "verified", verified_at: "2026-11-03T00:00:00.000Z" }) }, superToken);
  await api("/api/collections/people/records/" + person.data.id, { method: "PATCH", body: JSON.stringify({ full_name: "Reset Person Changed" }) }, superToken);
  const updated = await api("/api/collections/people/records/" + person.data.id, {}, superToken);
  assert.equal(updated.data.verification_status, "needs_verification");
});