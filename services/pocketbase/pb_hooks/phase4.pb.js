/// <reference path="../pb_data/types.d.ts" />

// Phase 4: crowdsourcing.
//
// Contributors never write collection records directly. Every submission and
// flag goes through a custom route that validates every field, checks ALTCHA,
// applies per-user limits and writes with the authenticated user as submitter.
// Moderator-only routes return the internal fields and contributor details that
// the collection rules deliberately hide.

const MODERATOR_ROLES = ["moderator", "admin"];
const SUBMISSION_FIELDS = [
  "kind", "person", "suggested_type", "url", "second_url", "quote", "note",
  "occurred_at", "target_record", "target_person",
];
const FLAG_FIELDS = ["record", "reason", "note"];
const FLAG_REASONS = ["wrong_person", "inaccurate", "missing_context", "dead_source", "other"];
const SUBMISSION_STATUSES = ["new", "in_review", "converted", "duplicate", "rejected"];

function readText(path, fallback) {
  try {
    const raw = $os.readFile(path);
    if (typeof raw === "string") return raw;
    const chars = [];
    for (let i = 0; i < raw.length; i++) chars.push(String.fromCharCode(raw[i]));
    return chars.join("");
  } catch (err) {
    if (fallback === undefined) throw err;
    return fallback;
  }
}

function limitsConfig() {
  const raw = readText("/pb/config/phase4-limits.json", "{}");
  return JSON.parse(raw);
}

function blockedHosts() {
  const raw = readText("/pb/config/blocked-hosts.txt", "");
  return raw
    .split(/\r?\n/)
    .map(function (line) { return line.trim().toLowerCase(); })
    .filter(function (line) { return line && line.charAt(0) !== "#"; });
}

let cachedConfig = null;
function config() {
  if (!cachedConfig) cachedConfig = limitsConfig();
  return cachedConfig;
}

function nowMs() {
  const path = $os.getenv("PB_TEST_NOW_FILE") || "/pb_data/test-now";
  try {
    const raw = readText(path, "").trim();
    if (raw) return parseInt(raw, 10);
  } catch (err) {}
  return Date.now();
}

function jakartaDayStart(ms) {
  const JAKARTA_OFFSET = 7 * 60 * 60 * 1000;
  const shifted = new Date(ms + JAKARTA_OFFSET);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - JAKARTA_OFFSET;
}

function roleOf(auth) {
  if (!auth) return "";
  try {
    return auth.get ? auth.get("role") : auth.role;
  } catch (err) {
    return "";
  }
}

function authId(auth) {
  if (!auth) return "";
  return auth.id || "";
}

function requireAuth(e) {
  const id = authId(e.auth);
  if (!id) throw new UnauthorizedError("Silakan masuk terlebih dahulu.");
  return e.auth;
}

function requireModerator(e) {
  const auth = requireAuth(e);
  const role = roleOf(auth);
  if (MODERATOR_ROLES.indexOf(role) === -1) throw new ForbiddenError("Akses moderator diperlukan.");
  return auth;
}

function requestBody(e) {
  try {
    const info = e.requestInfo();
    return (info && info.body) || {};
  } catch (err) {
    return {};
  }
}

function requestQuery(e) {
  try {
    const info = e.requestInfo();
    return (info && info.query) || {};
  } catch (err) {
    return {};
  }
}

function rejectUnknownFields(body, allowed, extra) {
  const extraFields = extra || [];
  for (const key in body) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (allowed.indexOf(key) === -1 && extraFields.indexOf(key) === -1) {
      throw new BadRequestError("Field tidak diizinkan: " + key);
    }
  }
}

function trimString(value, max) {
  const text = String(value === null || value === undefined ? "" : value).trim();
  if (max && text.length > max) throw new BadRequestError("Teks terlalu panjang (maksimal " + max + " karakter).");
  return text;
}

function parseHttpUrl(value) {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(String(value || ""));
  if (!match) return null;
  const protocol = match[1].toLowerCase() + ":";
  let authority = match[2];
  let username = "";
  let password = "";
  const at = authority.lastIndexOf("@");
  if (at >= 0) {
    const credentials = authority.slice(0, at);
    authority = authority.slice(at + 1);
    const colon = credentials.indexOf(":");
    username = colon >= 0 ? credentials.slice(0, colon) : credentials;
    password = colon >= 0 ? credentials.slice(colon + 1) : "";
  }
  let hostname = authority;
  if (hostname.charAt(0) === "[") {
    const end = hostname.indexOf("]");
    if (end < 0) return null;
    hostname = hostname.slice(0, end + 1);
  } else {
    const colon = hostname.lastIndexOf(":");
    if (colon >= 0) hostname = hostname.slice(0, colon);
  }
  return {
    protocol: protocol,
    username: username,
    password: password,
    hostname: hostname.toLowerCase(),
    pathname: match[3] || "/",
    query: match[4] || "",
  };
}

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const parsed = parseHttpUrl(value);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return "";
  const host = parsed.hostname.replace(/^www\./, "");
  const params = [];
  const drop = ["fbclid", "gclid", "igshid", "mc_cid", "mc_eid", "ref", "ref_src"];
  for (const pair of parsed.query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    const val = eq >= 0 ? pair.slice(eq + 1) : "";
    const lower = decodeURIComponent(key).toLowerCase();
    if (lower.indexOf("utm_") === 0) continue;
    if (drop.indexOf(lower) >= 0) continue;
    params.push([key, val]);
  }
  params.sort(function (a, b) {
    if (a[0] === b[0]) return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    return a[0] < b[0] ? -1 : 1;
  });
  const query = params.map(function (pair) { return pair[0] + "=" + pair[1]; }).join("&");
  let pathname = parsed.pathname || "/";
  if (pathname.length > 1 && pathname.charAt(pathname.length - 1) === "/") pathname = pathname.slice(0, -1);
  return parsed.protocol + "//" + host + pathname + (query ? "?" + query : "");
}

function validateUrl(raw, label) {
  const value = trimString(raw, 2000);
  if (!value) throw new BadRequestError(label + " wajib diisi.");
  if (!/^https?:\/\//i.test(value)) throw new BadRequestError(label + " harus memakai http:// atau https://.");
  const parsed = parseHttpUrl(value);
  if (!parsed) throw new BadRequestError(label + " bukan tautan yang valid.");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestError(label + " harus memakai http:// atau https://.");
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestError(label + " tidak boleh memuat nama pengguna atau kata sandi.");
  }
  const host = parsed.hostname;
  if (!host) throw new BadRequestError(label + " tidak punya host.");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.charAt(0) === "[") {
    throw new BadRequestError(label + " tidak boleh memakai alamat IP.");
  }
  const blocked = blockedHosts();
  for (const entry of blocked) {
    if (host === entry || host.slice(-(entry.length + 1)) === "." + entry) {
      throw new BadRequestError("Kirim tautan asli, bukan tautan pendek.");
    }
  }
  return { value: value, normalized: normalizeUrl(value) };
}

function base64Decode(input) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const text = String(input || "").replace(/=+$/, "");
  let output = "";
  let bits = 0;
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    const index = chars.indexOf(text.charAt(i));
    if (index === -1) continue;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return output;
}

function altchaSecret() {
  const secret = $os.getenv("PB_ALTCHA_HMAC_KEY") || "";
  if (!secret) throw new Error("PB_ALTCHA_HMAC_KEY is not configured");
  return secret;
}

function verifyAltcha(token) {
  const raw = trimString(token, 10000);
  if (!raw) throw new BadRequestError("Verifikasi captcha wajib diisi.");
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    try {
      parsed = JSON.parse(base64Decode(raw));
    } catch (inner) {
      throw new BadRequestError("Verifikasi captcha tidak valid.");
    }
  }
  if (!parsed || parsed.algorithm !== "SHA-256") throw new BadRequestError("Verifikasi captcha tidak valid.");
  const number = parseInt(parsed.number, 10);
  const salt = String(parsed.salt || "");
  const challenge = String(parsed.challenge || "");
  const signature = String(parsed.signature || "");
  if (!isFinite(number) || number < 0 || !salt || !challenge || !signature) {
    throw new BadRequestError("Verifikasi captcha tidak valid.");
  }
  const expiresMatch = salt.match(/[?&]expires=(\d+)/);
  if (expiresMatch && nowMs() > parseInt(expiresMatch[1], 10)) {
    throw new BadRequestError("Verifikasi captcha sudah kedaluwarsa. Muat ulang halaman.");
  }
  const hash = $security.sha256(salt + number);
  if (!$security.equal(hash, challenge)) throw new BadRequestError("Verifikasi captcha gagal.");
  const expected = $security.hs256(challenge, altchaSecret());
  if (!$security.equal(expected, signature)) throw new BadRequestError("Verifikasi captcha gagal.");
}

function jakartaDayString(ms) {
  const JAKARTA_OFFSET = 7 * 60 * 60 * 1000;
  const shifted = new Date(ms + JAKARTA_OFFSET);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function dayCount(app, collection, userId, startMs) {
  const day = jakartaDayString(nowMs());
  try {
    const rows = app.findRecordsByFilter(collection, "submitter = {:user} && submitted_day = {:day}", "", 0, 0, { user: userId, day: day });
    return rows.length;
  } catch (err) {
    return 0;
  }
}

function accountAgeHours(user) {
  const created = user.get("created");
  const t = new Date(created).getTime();
  if (!isFinite(t)) return 0;
  return (nowMs() - t) / 3600000;
}

function suspensionActive(user) {
  const until = user.get("suspended_until");
  if (!until) return false;
  const time = new Date(until).getTime();
  return isFinite(time) && time > nowMs();
}

function currentTermsVersion() {
  return config().termsVersion || "2026-11-06";
}

function ensureContributorReady(user) {
  if (!user) throw new UnauthorizedError("Silakan masuk terlebih dahulu.");
  if (suspensionActive(user)) throw new ForbiddenError("Akun Anda sedang ditangguhkan.");
  const accepted = String(user.get("accepted_terms_at") || "");
  const version = String(user.get("accepted_terms_version") || "");
  if (!accepted || version !== currentTermsVersion()) {
    throw new ForbiddenError("Anda harus menyetujui ketentuan kontributor terlebih dahulu.");
  }
}

function dailyLimit(user, kind) {
  const cfg = config();
  const age = accountAgeHours(user);
  const trust = parseInt(user.get("trust_level") || 0, 10);
  const table = kind === "flag" ? cfg.flagsPerDay : cfg.submissionsPerDay;
  if (age < (cfg.newAccountHours || 24)) return table.newAccount;
  if (trust >= 1) return table.trust1;
  return table.trust0;
}

function enforceDailyLimit(app, user, kind) {
  const collection = kind === "flag" ? "flags" : "submissions";
  const used = dayCount(app, collection, user.id, jakartaDayStart(nowMs()));
  const limit = dailyLimit(user, kind);
  if (used >= limit) {
    throw new BadRequestError(
      "Batas harian tercapai (" + limit + " per hari). Coba lagi besok.",
    );
  }
}

function findUserByEmail(app, email) {
  try {
    return app.findFirstRecordByData("users", "email", email);
  } catch (err) {
    return null;
  }
}

function findUser(app, id) {
  if (!id) return null;
  try {
    return app.findRecordById("users", id);
  } catch (err) {
    return null;
  }
}

function userSummary(app, id) {
  const user = findUser(app, id);
  if (!user) return null;
  return {
    id: user.id,
    email: user.get("email") || "",
    display_name: user.get("display_name") || "",
    trust_level: parseInt(user.get("trust_level") || 0, 10),
    created: user.get("created") || "",
    suspended_until: user.get("suspended_until") || "",
    suspended: suspensionActive(user),
  };
}

function submissionHistory(app, userId) {
  const counts = { new: 0, in_review: 0, converted: 0, duplicate: 0, rejected: 0, total: 0 };
  if (!userId) return counts;
  try {
    const rows = app.findRecordsByFilter("submissions", "submitter = {:user}", "", 0, 0, { user: userId });
    for (const row of rows) {
      const status = row.get("status");
      if (counts[status] === undefined) counts[status] = 0;
      counts[status] += 1;
      counts.total += 1;
    }
  } catch (err) {}
  return counts;
}

function submissionView(app, record) {
  return {
    id: record.id,
    kind: record.get("kind"),
    submitter: record.get("submitter") || "",
    person: record.get("person") || "",
    suggested_type: record.get("suggested_type") || "",
    url: record.get("url") || "",
    second_url: record.get("second_url") || "",
    quote: record.get("quote") || "",
    note: record.get("note") || "",
    occurred_at: record.get("occurred_at") || "",
    target_record: record.get("target_record") || "",
    target_person: record.get("target_person") || "",
    status: record.get("status"),
    rejection_code: record.get("rejection_code") || "",
    duplicate_of: record.get("duplicate_of") || "",
    converted_record: record.get("converted_record") || "",
    also_reported_by_count: parseInt(record.get("also_reported_by_count") || 0, 10),
    reviewed_by: record.get("reviewed_by") || "",
    reviewed_at: record.get("reviewed_at") || "",
    moderator_note: record.get("moderator_note") || "",
    created: record.get("created") || "",
    updated: record.get("updated") || "",
  };
}

function safeLink(url) {
  return String(url || "");
}

function writeRevision(app, targetCollection, targetId, action, before, after, actorId, reason) {
  try {
    const collection = app.findCollectionByNameOrId("revisions");
    const revision = new Record(collection);
    revision.set("target_collection", targetCollection);
    revision.set("target_id", targetId);
    revision.set("action", action);
    revision.set("before", before || null);
    revision.set("after", after || null);
    if (actorId) revision.set("actor", actorId);
    if (reason) revision.set("reason", reason);
    app.save(revision);
  } catch (err) {
    console.error("[phase4] revision failed: " + err);
  }
}

function recomputeTrust(app, userId) {
  if (!userId) return;
  const user = findUser(app, userId);
  if (!user) return;
  const current = parseInt(user.get("trust_level") || 0, 10);
  if (current >= 2) return;
  let submissions = [];
  try {
    submissions = app.findRecordsByFilter("submissions", "submitter = {:user}", "", 0, 0, { user: userId });
  } catch (err) {
    return;
  }
  const abusive = submissions.some(function (row) { return row.get("rejection_code") === "abusive"; });
  let verifiedConverted = 0;
  for (const row of submissions) {
    if (row.get("status") !== "converted") continue;
    const recordId = row.get("converted_record");
    if (!recordId) continue;
    try {
      const result = app.findRecordById("records", recordId);
      if (result.get("verification_status") === "verified") verifiedConverted += 1;
    } catch (err) {}
  }
  const threshold = (config().trust && config().trust.convertedVerified) || 5;
  let desired = current;
  if (!abusive && !suspensionActive(user) && verifiedConverted >= threshold) desired = 1;
  if (desired !== current) {
    user.set("trust_level", desired);
    app.save(user);
    writeRevision(
      app,
      "users",
      user.id,
      "update",
      { trust_level: current },
      { trust_level: desired, reason: "automatic trust level" },
      "",
      "trust level recomputed",
    );
  }
}

function rebuildSourceNormalized(app, record) {
  const normalized = normalizeUrl(record.get("url"));
  if (normalized) record.set("url_normalized", normalized);
}

// ---------------------------------------------------------------------------
// Bootstrap / retention
// ---------------------------------------------------------------------------

onBootstrap((e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

  e.next();
});

cronAdd("phase4-retention", "0 3 * * *", () => {
  try {
    const months = (config().retention && config().retention.rejectedMonths) || 12;
    const cutoff = new Date(nowMs() - months * 30 * 24 * 3600 * 1000).toISOString();
    const rows = $app.findRecordsByFilter("submissions", "status = 'rejected' && created < {:cutoff}", "", 0, 0, { cutoff: cutoff });
    for (const row of rows) {
      if (!row.get("note") && !row.get("quote")) continue;
      row.set("note", "[isi dihapus setelah 12 bulan]");
      row.set("quote", "");
      row.set("moderator_note", "");
      $app.save(row);
    }
  } catch (err) {
    console.error("[phase4] retention job failed: " + err);
  }
});

// ---------------------------------------------------------------------------
// Collection invariants: normal README links, trust and source dedupe.
// ---------------------------------------------------------------------------

onRecordCreate((e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

  rebuildSourceNormalized(e.app, e.record);
  e.next();
}, "sources");

onRecordUpdate((e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

  rebuildSourceNormalized(e.app, e.record);
  e.next();
}, "sources");

onRecordCreate((e) => {
  e.next();
  const record = e.record;
  const app = e.app;
  const ids = record.get("from_submissions") || [];
  if (String(record.get("verification_status")) === "verified") {
    for (const submissionId of ids) {
      try {
        const submission = app.findRecordById("submissions", submissionId);
        $app.store().get("phase4").recomputeTrust(app, submission.get("submitter"));
      } catch (err) {
      }
    }
  }
}, "records");

onRecordUpdate((e) => {
  e.next();
  const record = e.record;
  const app = e.app;
  const ids = record.get("from_submissions") || [];
  if (String(record.get("verification_status")) === "verified") {
    for (const submissionId of ids) {
      try {
        const submission = app.findRecordById("submissions", submissionId);
        $app.store().get("phase4").recomputeTrust(app, submission.get("submitter"));
      } catch (err) {
      }
    }
  }
}, "records");

// ---------------------------------------------------------------------------
// Custom routes
// ---------------------------------------------------------------------------

if ($os.getenv("PB_HOOKS_MODE") === "serve") {
  if ($os.getenv("PB_TEST_MODE") === "1") {
    routerAdd("POST", "/api/pr/test/now", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

      const body = requestBody(e);
      const value = parseInt(body.now, 10);
      if (!isFinite(value) || value < 0) throw new BadRequestError("now is required");
      $os.writeFile($os.getenv("PB_TEST_NOW_FILE") || "/pb_data/test-now", String(value), 0o644);
      return e.json(200, { now: value });
    });

    routerAdd("POST", "/api/pr/test/reset-now", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

      try {
        $os.remove($os.getenv("PB_TEST_NOW_FILE") || "/pb_data/test-now");
      } catch (err) {}
      return e.json(200, { reset: true });
    });

    routerAdd("POST", "/api/pr/test/backdate-user", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

      const body = requestBody(e);
      const id = String(body.id || "");
      const created = String(body.created || "");
      if (!id || !created) throw new BadRequestError("id and created are required");
      const collection = e.app.findCollectionByNameOrId("users");
      const safeId = id.replace(/[^a-z0-9]/gi, "");
      const safeCreated = created.replace(/[^0-9T:.\-Z ]/g, "");
      e.app.db().newQuery("UPDATE users SET created = {:created} WHERE id = {:id}")
        .bind({ created: safeCreated, id: safeId })
        .execute();
      return e.json(200, { id: safeId, created: safeCreated });
    });
  }

  // --- ALTCHA ------------------------------------------------------------
  routerAdd("GET", "/api/pr/altcha/challenge", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    try {
      const cfg = config();
      const number = Math.floor(Math.random() * 50000);
      const expires = nowMs() + 10 * 60 * 1000;
      const salt = $security.randomString(16) + "?expires=" + expires;
      const challenge = $security.sha256(salt + number);
      const signature = $security.hs256(challenge, altchaSecret());
      return e.json(200, {
        algorithm: "SHA-256",
        challenge: challenge,
        maxnumber: cfg.altchaMaxNumber || 50000,
        salt: salt,
        signature: signature,
      });
    } catch (err) {
      console.error("[phase4] challenge failed: " + err);
      throw err;
    }
  });

  // --- Accounts ----------------------------------------------------------
  routerAdd("POST", "/api/pr/register", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const body = requestBody(e);
    rejectUnknownFields(body, ["email", "password", "passwordConfirm", "display_name"]);
    const email = trimString(body.email, 200).toLowerCase();
    const password = String(body.password || "");
    const confirm = String(body.passwordConfirm || "");
    const displayName = trimString(body.display_name, 40);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestError("Email tidak valid.");
    if (password.length < 8) throw new BadRequestError("Kata sandi minimal 8 karakter.");
    if (password !== confirm) throw new BadRequestError("Kata sandi dan konfirmasi tidak sama.");
    if (findUserByEmail(e.app, email)) throw new BadRequestError("Email sudah terdaftar.");
    const users = e.app.findCollectionByNameOrId("users");
    const user = new Record(users);
    user.set("email", email);
    user.setPassword(password);
    user.set("passwordConfirm", password);
    user.set("role", "contributor");
    user.set("trust_level", 0);
    if (displayName) user.set("display_name", displayName);
    e.app.save(user);
    return e.json(201, { id: user.id, email: user.get("email") });
  });

  routerAdd("GET", "/api/pr/account", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireAuth(e);
    const user = findUser(e.app, auth.id);
    if (!user) throw new UnauthorizedError("Akun tidak ditemukan.");
    return e.json(200, {
      id: user.id,
      email: user.get("email") || "",
      display_name: user.get("display_name") || "",
      trust_level: parseInt(user.get("trust_level") || 0, 10),
      suspended: suspensionActive(user),
      suspended_until: suspensionActive(user) ? user.get("suspended_until") : "",
      accepted_terms_at: user.get("accepted_terms_at") || "",
      accepted_terms_version: user.get("accepted_terms_version") || "",
      terms_version: currentTermsVersion(),
      terms_required: String(user.get("accepted_terms_version") || "") !== currentTermsVersion() || !user.get("accepted_terms_at"),
    });
  });

  routerAdd("PATCH", "/api/pr/account", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireAuth(e);
    const body = requestBody(e);
    rejectUnknownFields(body, ["display_name"]);
    const user = findUser(e.app, auth.id);
    if (!user) throw new UnauthorizedError("Akun tidak ditemukan.");
    user.set("display_name", trimString(body.display_name, 40));
    e.app.save(user);
    return e.json(200, {
      id: user.id,
      email: user.get("email") || "",
      display_name: user.get("display_name") || "",
    });
  });

  routerAdd("POST", "/api/pr/accept-terms", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireAuth(e);
    const body = requestBody(e);
    rejectUnknownFields(body, ["version"]);
    const version = trimString(body.version, 40);
    if (version !== currentTermsVersion()) throw new BadRequestError("Versi ketentuan tidak dikenal.");
    const user = findUser(e.app, auth.id);
    if (!user) throw new UnauthorizedError("Akun tidak ditemukan.");
    user.set("accepted_terms_at", new Date(nowMs()).toISOString());
    user.set("accepted_terms_version", version);
    e.app.save(user);
    return e.json(200, { accepted_terms_at: user.get("accepted_terms_at"), accepted_terms_version: version });
  });

  routerAdd("POST", "/api/pr/delete-account", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireAuth(e);
    const user = findUser(e.app, auth.id);
    if (!user) throw new UnauthorizedError("Akun tidak ditemukan.");
    const id = user.id;

    // Keep the record but remove the link to the person (UU PDP).
    for (const collection of ["submissions", "flags"]) {
      const rows = e.app.findRecordsByFilter(collection, "submitter = {:user}", "", 0, 0, { user: id });
      for (const row of rows) {
        row.set("submitter", "");
        e.app.save(row);
      }
    }
    e.app.delete(user);
    try {
      e.app.db().newQuery("VACUUM").execute();
    } catch (err) {}
    return e.json(200, { deleted: true });
  });

  // --- Submissions -------------------------------------------------------
  routerAdd("POST", "/api/pr/submissions", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireAuth(e);
    const body = requestBody(e);
    rejectUnknownFields(body, SUBMISSION_FIELDS, ["altcha"]);
    const user = findUser(e.app, auth.id);
    ensureContributorReady(user);

    const kind = String(body.kind || "tip");
    if (kind !== "tip" && kind !== "correction") throw new BadRequestError("Jenis laporan tidak dikenal.");

    const note = trimString(body.note, 1000);
    if (note.length < 20) throw new BadRequestError("Ceritakan apa yang terjadi (minimal 20 karakter).");
    const quote = trimString(body.quote, 1000);
    const first = validateUrl(body.url, "Tautan");
    const second = body.second_url ? validateUrl(body.second_url, "Tautan kedua") : null;

    const suggested = String(body.suggested_type || "unsure");
    if (["statement", "promise", "action", "vote", "unsure"].indexOf(suggested) === -1) {
      throw new BadRequestError("Jenis catatan tidak dikenal.");
    }
    const person = body.person ? String(body.person) : "";
    const targetRecord = body.target_record ? String(body.target_record) : "";
    const targetPerson = body.target_person ? String(body.target_person) : "";
    if (person) { try { e.app.findRecordById("people", person); } catch (err) { throw new BadRequestError("Orang tidak ditemukan."); } }
    if (targetRecord) { try { e.app.findRecordById("records", targetRecord); } catch (err) { throw new BadRequestError("Catatan tidak ditemukan."); } }
    if (targetPerson) { try { e.app.findRecordById("people", targetPerson); } catch (err) { throw new BadRequestError("Orang tidak ditemukan."); } }
    if (kind === "correction" && !targetRecord && !targetPerson && !person) {
      throw new BadRequestError("Sebutkan profil atau catatan yang ingin dikoreksi.");
    }
    let occurredAt = "";
    if (body.occurred_at) {
      const parsed = new Date(body.occurred_at);
      if (isNaN(parsed.getTime())) throw new BadRequestError("Tanggal tidak valid.");
      if (parsed.getTime() > nowMs()) throw new BadRequestError("Tanggal tidak boleh di masa depan.");
      occurredAt = parsed.toISOString();
    }

    verifyAltcha(body.altcha);
    enforceDailyLimit(e.app, user, "submission");

    // Duplicate detection: newer reports never create a second row.
    let original = null;
    try {
      const matches = e.app.findRecordsByFilter(
        "submissions",
        "url_normalized = {:url} && (status = 'new' || status = 'in_review' || status = 'converted')",
        "",
        1,
        0,
        { url: first.normalized },
      );
      if (matches.length) original = matches[0];
    } catch (err) {
    }

    if (!original) {
      try {
        const sources = e.app.findRecordsByFilter("sources", "url_normalized = {:url}", "", 1, 0, { url: first.normalized });
        if (sources.length) {
          return e.json(200, {
            duplicate: true,
            message: "Sudah pernah dilaporkan dan sudah menjadi sumber. Terima kasih.",
          });
        }
      } catch (err) {}
    }

    if (original) {
      if (original.get("submitter") === user.id) {
        return e.json(200, { duplicate: true, message: "Laporan ini sudah diterima. Terima kasih." });
      }
      const count = parseInt(original.get("also_reported_by_count") || 0, 10) + 1;
      original.set("also_reported_by_count", count);
      e.app.save(original);
      return e.json(200, {
        duplicate: true,
        message: "Sudah dilaporkan. Terima kasih, laporan Anda menambah bobot.",
        also_reported_by_count: count,
      });
    }

    const collection = e.app.findCollectionByNameOrId("submissions");
    const record = new Record(collection);
    record.set("kind", kind);
    record.set("submitter", user.id);
    if (person) record.set("person", person);
    if (targetPerson) record.set("target_person", targetPerson);
    if (targetRecord) record.set("target_record", targetRecord);
    record.set("suggested_type", suggested);
    record.set("url", first.value);
    record.set("url_normalized", first.normalized);
    if (second) record.set("second_url", second.value);
    if (quote) record.set("quote", quote);
    record.set("note", note);
    if (occurredAt) record.set("occurred_at", occurredAt);
    record.set("status", "new");
    record.set("also_reported_by_count", 0);
    record.set("submitted_day", jakartaDayString(nowMs()));
    e.app.save(record);

    return e.json(201, {
      id: record.id,
      status: "new",
      message: "Terima kasih. Laporan Anda akan ditinjau. Pantau statusnya di Akun.",
    });
  });

  // --- Flags -------------------------------------------------------------
  routerAdd("POST", "/api/pr/flags", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireAuth(e);
    const body = requestBody(e);
    rejectUnknownFields(body, FLAG_FIELDS, ["altcha"]);
    const user = findUser(e.app, auth.id);
    ensureContributorReady(user);

    const recordId = String(body.record || "");
    if (!recordId) throw new BadRequestError("Catatan wajib dipilih.");
    let target;
    try {
      target = e.app.findRecordById("records", recordId);
    } catch (err) {
      throw new BadRequestError("Catatan tidak ditemukan.");
    }
    if (target.get("verification_status") !== "verified") throw new BadRequestError("Catatan tidak tersedia untuk publik.");

    const reason = String(body.reason || "");
    if (FLAG_REASONS.indexOf(reason) === -1) throw new BadRequestError("Alasan tidak dikenal.");
    const note = trimString(body.note, 500);
    if (reason === "other" && note.length < 5) throw new BadRequestError("Jelaskan masalahnya untuk alasan Lainnya.");

    verifyAltcha(body.altcha);
    enforceDailyLimit(e.app, user, "flag");

    let existing = [];
    try {
      existing = e.app.findRecordsByFilter(
        "flags",
        "record = {:record} && submitter = {:user} && status = 'open'",
        "",
        1,
        0,
        { record: recordId, user: user.id },
      );
    } catch (err) {}
    if (existing.length) throw new BadRequestError("Anda sudah melaporkan masalah pada catatan ini.");

    const collection = e.app.findCollectionByNameOrId("flags");
    const record = new Record(collection);
    record.set("record", recordId);
    record.set("reason", reason);
    if (note) record.set("note", note);
    record.set("submitter", user.id);
    record.set("status", "open");
    record.set("submitted_day", jakartaDayString(nowMs()));
    e.app.save(record);
    return e.json(201, { id: record.id, status: "open", message: "Terima kasih. Laporan Anda akan ditinjau." });
  });

  // --- Moderator: submissions -------------------------------------------
  routerAdd("GET", "/api/pr/moderator/submissions", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireModerator(e);
    const query = requestQuery(e);
    const status = String(query.status || "");
    const kind = String(query.kind || "");
    const person = String(query.person || "");
    const duplicates = String(query.duplicates || "") === "1";
    const trust = String(query.trust || "");
    const newAccounts = String(query.newAccounts || "") === "1";
    const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
    const perPage = 20;

    let rows = [];
    try {
      rows = e.app.findRecordsByFilter("submissions", "id != ''", "", 0, 0, {});
    } catch (err) {
      rows = [];
    }
    const items = [];
    for (const row of rows) {
      const submitter = userSummary(e.app, row.get("submitter"));
      if (status && row.get("status") !== status) continue;
      if (kind && row.get("kind") !== kind) continue;
      if (person && row.get("person") !== person && row.get("target_person") !== person) continue;
      if (duplicates && parseInt(row.get("also_reported_by_count") || 0, 10) <= 0) continue;
      if (trust !== "" && (!submitter || submitter.trust_level !== parseInt(trust, 10))) continue;
      if (newAccounts) {
        if (!submitter || !submitter.created) continue;
        if ((nowMs() - new Date(submitter.created).getTime()) / 3600000 >= (config().newAccountHours || 24)) continue;
      }
      items.push({ row: row, submitter: submitter });
    }
    items.sort(function (a, b) {
      const countDiff = parseInt(b.row.get("also_reported_by_count") || 0, 10) - parseInt(a.row.get("also_reported_by_count") || 0, 10);
      if (countDiff !== 0) return countDiff;
      return String(a.row.get("created")).localeCompare(String(b.row.get("created")));
    });
    const start = (page - 1) * perPage;
    const pageItems = items.slice(start, start + perPage).map(function (item) {
      const view = submissionView(e.app, item.row);
      view.submitter_info = item.submitter;
      view.person_name = "";
      view.record_title = "";
      if (view.person) { try { view.person_name = e.app.findRecordById("people", view.person).get("full_name"); } catch (err) {} }
      if (view.target_record) { try { view.record_title = e.app.findRecordById("records", view.target_record).get("title"); } catch (err) {} }
      return view;
    });
    return e.json(200, {
      page: page,
      perPage: perPage,
      totalItems: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / perPage)),
      items: pageItems,
    });
  });

  routerAdd("GET", "/api/pr/moderator/submission/{id}", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    requireModerator(e);
    const id = e.request.pathValue("id");
    let record;
    try {
      record = e.app.findRecordById("submissions", id);
    } catch (err) {
      throw new NotFoundError("Laporan tidak ditemukan.");
    }
    const view = submissionView(e.app, record);
    view.submitter_info = userSummary(e.app, view.submitter);
    view.history = submissionHistory(e.app, view.submitter);
    view.person_name = "";
    view.record_title = "";
    view.target_record_title = "";
    if (view.person) { try { view.person_name = e.app.findRecordById("people", view.person).get("full_name"); } catch (err) {} }
    if (view.target_person) { try { view.person_name = e.app.findRecordById("people", view.target_person).get("full_name"); } catch (err) {} }
    if (view.target_record) { try { view.target_record_title = e.app.findRecordById("records", view.target_record).get("title"); } catch (err) {} }
    if (view.converted_record) {
      try { view.converted_record_slug = e.app.findRecordById("records", view.converted_record).get("slug"); } catch (err) {}
    }
    return e.json(200, view);
  });

  routerAdd("POST", "/api/pr/moderator/submission/{id}/action", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireModerator(e);
    const body = requestBody(e);
    const id = e.request.pathValue("id");
    let record;
    try {
      record = e.app.findRecordById("submissions", id);
    } catch (err) {
      throw new NotFoundError("Laporan tidak ditemukan.");
    }
    const action = String(body.action || "");
    const note = trimString(body.moderator_note || "", 2000);
    const now = new Date(nowMs()).toISOString();

    if (action === "in_review") {
      record.set("status", "in_review");
      record.set("reviewed_by", auth.id);
      record.set("reviewed_at", now);
      if (note) record.set("moderator_note", note);
      e.app.save(record);
      return e.json(200, { id: record.id, status: "in_review" });
    }

    if (action === "reject") {
      const code = String(body.rejection_code || "");
      if (["no_public_source", "not_public_conduct", "duplicate", "unverifiable", "out_of_scope", "abusive"].indexOf(code) === -1) {
        throw new BadRequestError("Alasan penolakan wajib dipilih.");
      }
      record.set("status", "rejected");
      record.set("rejection_code", code);
      record.set("reviewed_by", auth.id);
      record.set("reviewed_at", now);
      if (note) record.set("moderator_note", note);
      e.app.save(record);
      return e.json(200, { id: record.id, status: "rejected", rejection_code: code });
    }

    if (action === "duplicate") {
      const originalId = String(body.duplicate_of || "");
      if (!originalId || originalId === id) throw new BadRequestError("Pilih laporan asli.");
      try {
        e.app.findRecordById("submissions", originalId);
      } catch (err) {
        throw new BadRequestError("Laporan asli tidak ditemukan.");
      }
      record.set("status", "duplicate");
      record.set("rejection_code", "duplicate");
      record.set("duplicate_of", originalId);
      record.set("reviewed_by", auth.id);
      record.set("reviewed_at", now);
      if (note) record.set("moderator_note", note);
      e.app.save(record);
      return e.json(200, { id: record.id, status: "duplicate", duplicate_of: originalId });
    }

    if (action === "convert") {
      if (record.get("converted_record")) throw new BadRequestError("Laporan ini sudah dijadikan catatan.");
      if (!record.get("person") && !record.get("target_person")) {
        throw new BadRequestError("Tentukan orangnya sebelum membuat draf catatan.");
      }
      const personId = record.get("person") || record.get("target_person");
      const noteText = String(record.get("note") || "");
      const quoteText = String(record.get("quote") || "");
      const suggested = String(record.get("suggested_type") || "unsure");
      let type = "action";
      if (suggested === "statement") type = quoteText ? "statement" : "action";
      else if (suggested === "promise") type = "promise";
      else if (suggested === "vote") type = "vote";
      const occurredRaw = record.get("occurred_at");
      let occurredDate = now;
      if (occurredRaw && String(occurredRaw).trim() !== "") occurredDate = occurredRaw;
      const sourceCollection = e.app.findCollectionByNameOrId("sources");
      const sourceIds = [];
      const urls = [record.get("url"), record.get("second_url")].filter(Boolean);
      for (const url of urls) {
        const normalizedUrl = normalizeUrl(url);
        let source = null;
        try {
          const found = e.app.findRecordsByFilter("sources", "url_normalized = {:url}", "", 1, 0, { url: normalizedUrl });
          if (found.length) source = found[0];
        } catch (err) {}
        if (!source) {
          source = new Record(sourceCollection);
          source.set("url", url);
          source.set("url_normalized", normalizedUrl);
          source.set("kind", "media");
          source.set("is_specific", true);
          try {
            const parsedUrl = parseHttpUrl(url);
            source.set("publisher", parsedUrl && parsedUrl.hostname ? parsedUrl.hostname.replace(/^www\./, "") : "Sumber laporan warga");
          } catch (err) {
            source.set("publisher", "Sumber laporan warga");
          }
          e.app.save(source);
        }
        sourceIds.push(source.id);
      }

      let topicId = "";
      try {
        topicId = e.app.findFirstRecordByData("topics", "code", "pelayanan-publik").id;
      } catch (err) {
        try {
          const topics = e.app.findRecordsByFilter("topics", "id != ''", "code", 1, 0, {});
          if (topics.length) topicId = topics[0].id;
        } catch (inner) {}
      }

      let title = noteText.split(/\r?\n/)[0].slice(0, 110);
      if (title.length < 5) title = "Laporan warga";
      let context = noteText;
      if (context.length < 40) context = (context + " Laporan ini dikirim oleh warga dan diperiksa moderator.").trim();
      let slug = "laporan-warga-" + new Date(now).toISOString().slice(0, 10) + "-" + String(record.id).slice(0, 6);
      if (!/^[a-z0-9-]+$/.test(slug)) slug = "laporan-warga-" + String(record.id).slice(0, 8);

      const records = e.app.findCollectionByNameOrId("records");
      const draft = new Record(records);
      draft.set("type", type);
      draft.set("person", personId);
      draft.set("title", title);
      draft.set("context", context);
      draft.set("occurred_at", String(occurredDate));
      if (topicId) draft.set("topics", [topicId]);
      draft.set("sources", sourceIds);
      if (quoteText) {
        draft.set("quote", quoteText);
        draft.set("card_quote", quoteText.slice(0, 180));
      }
      if (type === "statement" && !quoteText) draft.set("quote", noteText);
      if (type === "promise" && !draft.get("promise_made_in")) draft.set("promise_made_in", "other");
      draft.set("verification_status", "needs_verification");
      draft.set("slug", slug);
      draft.set("from_submissions", [record.id]);
      draft.set("from_citizen_report", true);
      draft.set("privacy_confirmed", false);
      try {
        e.app.save(draft);
      } catch (err) {
        console.error("[phase4] convert save draft failed: " + err);
        throw err;
      }
      record.set("status", "converted");
      record.set("converted_record", draft.id);
      record.set("reviewed_by", auth.id);
      record.set("reviewed_at", now);
      if (note) record.set("moderator_note", note);
      if (typeof record.Touch === "function") record.Touch();
      e.app.save(record);
      // Force persist status via SQL (dirty tracking may skip nested changes).
      try {
        e.app.db().newQuery("UPDATE submissions SET status = 'converted' WHERE id = {:id}").bind({ id: record.id }).execute();
      } catch (err) {}
      return e.json(200, { id: record.id, status: "converted", record: { id: draft.id, slug: draft.get("slug") } });
    }

    if (action === "suspend") {
      const submitterId = record.get("submitter");
      const user = findUser(e.app, submitterId);
      if (!user) throw new BadRequestError("Kontributor tidak ditemukan.");
      const days = Math.max(1, Math.min(3650, parseInt(body.days || "7", 10) || 7));
      const reason = trimString(body.reason || "Pelanggaran ketentuan kontributor.", 500);
      const before = { suspended_until: user.get("suspended_until") || "", suspension_reason: user.get("suspension_reason") || "" };
      const until = new Date(nowMs() + days * 24 * 3600 * 1000).toISOString().slice(0, 10) + " 23:59:59.000Z";
      user.set("suspended_until", until);
      user.set("suspension_reason", reason);
      e.app.save(user);
      writeRevision(e.app, "users", user.id, "update", before, { suspended_until: until, suspension_reason: reason }, auth.id, "suspension");
      return e.json(200, { id: user.id, suspended_until: until });
    }

    throw new BadRequestError("Aksi tidak dikenal.");
  });

  // --- Moderator: flags and alerts --------------------------------------
  routerAdd("GET", "/api/pr/moderator/flags", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    requireModerator(e);
    let rows = [];
    try {
      rows = e.app.findRecordsByFilter("flags", "status = 'open'", "", 0, 0, {});
    } catch (err) {
      rows = [];
    }
    const groups = {};
    for (const row of rows) {
      const recordId = row.get("record");
      if (!groups[recordId]) {
        groups[recordId] = { record_id: recordId, title: "", slug: "", flags: [], wrong_person: false };
        try {
          const target = e.app.findRecordById("records", recordId);
          groups[recordId].title = target.get("title");
          groups[recordId].slug = target.get("slug");
        } catch (err) {}
      }
      const flag = {
        id: row.id,
        reason: row.get("reason"),
        note: row.get("note") || "",
        status: row.get("status"),
        created: row.get("created"),
        submitter: userSummary(e.app, row.get("submitter")),
      };
      if (flag.reason === "wrong_person") groups[recordId].wrong_person = true;
      groups[recordId].flags.push(flag);
    }
    const items = Object.keys(groups).map(function (key) { return groups[key]; });
    items.sort(function (a, b) {
      if (a.wrong_person !== b.wrong_person) return a.wrong_person ? -1 : 1;
      if (a.flags.length !== b.flags.length) return b.flags.length - a.flags.length;
      return a.title.localeCompare(b.title);
    });
    return e.json(200, { items: items });
  });

  routerAdd("POST", "/api/pr/moderator/flag/{id}", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    requireModerator(e);
    const body = requestBody(e);
    const status = String(body.status || "");
    if (status !== "resolved" && status !== "dismissed") throw new BadRequestError("Status tidak dikenal.");
    const id = e.request.pathValue("id");
    let flag;
    try {
      flag = e.app.findRecordById("flags", id);
    } catch (err) {
      throw new NotFoundError("Laporan tidak ditemukan.");
    }
    flag.set("status", status);
    flag.set("moderator_note", trimString(body.moderator_note || "", 2000));
    e.app.save(flag);
    return e.json(200, { id: flag.id, status: status });
  });

  routerAdd("GET", "/api/pr/moderator/dashboard", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    requireModerator(e);
    const now = nowMs();
    const day = jakartaDayStart(now);
    const all = e.app.findRecordsByFilter("submissions", "id != ''", "", 0, 0, {});
    const byDay = {};
    for (let i = 13; i >= 0; i--) {
      const start = day - i * 24 * 3600 * 1000;
      byDay[new Date(start).toISOString().slice(0, 10)] = 0;
    }
    let converted = 0;
    let reviewed = 0;
    const reviewDurations = [];
    for (const row of all) {
      const created = new Date(row.get("created")).getTime();
      const key = new Date(jakartaDayStart(created)).toISOString().slice(0, 10);
      if (byDay[key] !== undefined) byDay[key] += 1;
      if (row.get("status") === "converted") converted += 1;
      if (row.get("reviewed_at")) {
        reviewed += 1;
        const reviewedAt = new Date(row.get("reviewed_at")).getTime();
        if (isFinite(created) && isFinite(reviewedAt) && reviewedAt >= created) reviewDurations.push(reviewedAt - created);
      }
    }
    reviewDurations.sort(function (a, b) { return a - b; });
    const medianMs = reviewDurations.length
      ? (reviewDurations.length % 2
        ? reviewDurations[Math.floor(reviewDurations.length / 2)]
        : Math.round((reviewDurations[reviewDurations.length / 2 - 1] + reviewDurations[reviewDurations.length / 2]) / 2))
      : 0;
    const openFlags = e.app.findRecordsByFilter("flags", "status = 'open'", "", 0, 0, {});

    // §6.3 coordinated-activity alerts: information only, never automatic action.
    const alerts = [];
    try {
      const cfg = config().alerts || {};

    const flagsByRecord = {};
    for (const flag of openFlags) {
      const recordId = flag.get("record");
      flagsByRecord[recordId] = (flagsByRecord[recordId] || 0) + 1;
    }
    for (const recordId in flagsByRecord) {
      if (flagsByRecord[recordId] >= (cfg.flagsPerRecordPerHour || 5)) {
        let title = "";
        try { title = e.app.findRecordById("records", recordId).get("title"); } catch (err) {}
        alerts.push({ type: "flags", record: recordId, title: title, count: flagsByRecord[recordId], message: "Satu catatan menerima " + flagsByRecord[recordId] + " laporan dalam satu jam." });
      }
    }

    const submissionsByPerson = {};
    const recentSubmissions = all;
    for (const row of recentSubmissions) {
      const target = row.get("person") || row.get("target_person");
      if (!target) continue;
      submissionsByPerson[target] = (submissionsByPerson[target] || 0) + 1;
    }
    for (const personId in submissionsByPerson) {
      if (submissionsByPerson[personId] >= (cfg.submissionsPerPersonPerHour || 10)) {
        let name = "";
        try { name = e.app.findRecordById("people", personId).get("full_name"); } catch (err) {}
        alerts.push({ type: "submissions", person: personId, name: name, count: submissionsByPerson[personId], message: "Satu orang menerima " + submissionsByPerson[personId] + " laporan dalam satu jam." });
      }
    }

    const newUsers = {};
    try {
      const allUsers = e.app.findRecordsByFilter("users", "id != ''", "", 0, 0, {});
      for (const user of allUsers) {
        const created = new Date(user.get("created")).getTime();
        if (isFinite(created) && created >= dayAgo) newUsers[user.id] = true;
      }
    } catch (err) {}
    const targetSubmitters = {};
    for (const row of all) {
      const created = new Date(row.get("created")).getTime();
      if (!isFinite(created) || created < dayAgo) continue;
      if (!newUsers[row.get("submitter")]) continue;
      const target = row.get("target_record") || row.get("person") || row.get("target_person");
      if (!target) continue;
      if (!targetSubmitters[target]) targetSubmitters[target] = {};
      targetSubmitters[target][row.get("submitter")] = true;
    }
    for (const flag of openFlags) {
      const created = new Date(flag.get("created")).getTime();
      if (!isFinite(created) || created < dayAgo) continue;
      if (!newUsers[flag.get("submitter")]) continue;
      const target = "record:" + flag.get("record");
      if (!targetSubmitters[target]) targetSubmitters[target] = {};
      targetSubmitters[target][flag.get("submitter")] = true;
    }
    for (const target in targetSubmitters) {
      const count = Object.keys(targetSubmitters[target]).length;
      if (count >= (cfg.newAccountsPerTarget24h || 5)) {
        alerts.push({ type: "new_accounts", target: target, count: count, message: count + " akun baru melaporkan sasaran yang sama dalam 24 jam." });
      }
    }

    } catch (err) {
      console.error("[phase4] dashboard alert computation failed: " + err);
    }
    const series = Object.keys(byDay).sort().map(function (key) { return { date: key, count: byDay[key] }; });
    return e.json(200, {
      submissions_per_day: series,
      submissions_total: all.length,
      conversion_rate: all.length ? converted / all.length : 0,
      median_time_to_first_review_ms: medianMs,
      reviewed_total: reviewed,
      open_flags: openFlags.length,
      alerts: alerts,
    });
  });

  routerAdd("POST", "/api/pr/moderator/trust/{id}", (e) => {
    const { MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES, readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId, requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString, parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha, dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady, dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory, submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized } = $app.store().get("phase4");

    const auth = requireModerator(e);
    const body = requestBody(e);
    const level = parseInt(body.trust_level, 10);
    if ([0, 1, 2].indexOf(level) === -1) throw new BadRequestError("Trust level tidak dikenal.");
    if (level === 2 && roleOf(auth) !== "admin") throw new ForbiddenError("Hanya pemilik yang dapat memberi trust level 2.");
    const user = findUser(e.app, e.request.pathValue("id"));
    if (!user) throw new NotFoundError("Kontributor tidak ditemukan.");
    const before = parseInt(user.get("trust_level") || 0, 10);
    user.set("trust_level", level);
    e.app.save(user);
    writeRevision(e.app, "users", user.id, "update", { trust_level: before }, { trust_level: level }, auth.id, "manual trust change");
    return e.json(200, { id: user.id, trust_level: level });
  });
}

try {
  const helpers = {
    MODERATOR_ROLES, SUBMISSION_FIELDS, FLAG_FIELDS, FLAG_REASONS, SUBMISSION_STATUSES,
    readText, limitsConfig, blockedHosts, config, nowMs, jakartaDayStart, jakartaDayString, roleOf, authId,
    requireAuth, requireModerator, requestBody, requestQuery, rejectUnknownFields, trimString,
    parseHttpUrl, normalizeUrl, validateUrl, base64Decode, altchaSecret, verifyAltcha,
    dayCount, accountAgeHours, suspensionActive, currentTermsVersion, ensureContributorReady,
    dailyLimit, enforceDailyLimit, findUserByEmail, findUser, userSummary, submissionHistory,
    submissionView, writeRevision, recomputeTrust, rebuildSourceNormalized,
  };
  $app.store().set("phase4", helpers);
} catch (err) {
  console.error("[phase4] helper expose failed: " + err);
}
