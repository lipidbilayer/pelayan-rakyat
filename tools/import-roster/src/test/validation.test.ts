import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, rowsToObjects } from "../csv.js";
import { validate } from "../validate.js";

const PARTY_HEADER = "party_code,name,short_name,ballot_number_2024,source_url";
const ROSTER_HEADER = "person_slug,full_name,name_as_published,name_variants,body,position_title,jurisdiction,dapil,party_code,faction,komisi,appointment_type,is_acting,rank,start_date,end_date,status,previous_post,source_url_1,source_name_1,source_date_1,source_url_2,source_name_2,source_date_2,verification_status,notes";

function makePartyCsv(rows: string[]): { headers: string[]; records: any[] } {
  return rowsToObjects(parseCsv([PARTY_HEADER, ...rows].join("\n")));
}

function makeRosterCsv(rows: string[]): { headers: string[]; records: any[] } {
  return rowsToObjects(parseCsv([ROSTER_HEADER, ...rows].join("\n")));
}

function basePartyRow(code = "pkb"): string {
  return `${code},Partai,PKB,1,https://example.com/party`;
}

function baseRosterRow(overrides: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    person_slug: "test-person",
    full_name: "Test Person",
    name_as_published: "Test Person",
    name_variants: "",
    body: "city_government",
    position_title: "Wali Kota",
    jurisdiction: "Jakarta Pusat",
    dapil: "",
    party_code: "",
    faction: "",
    komisi: "",
    appointment_type: "appointed",
    is_acting: "",
    rank: "",
    start_date: "2025-01-01",
    end_date: "",
    status: "active",
    previous_post: "",
    source_url_1: "https://example.com/source",
    source_name_1: "Example",
    source_date_1: "2025-01-01",
    source_url_2: "",
    source_name_2: "",
    source_date_2: "",
    verification_status: "needs_verification",
    notes: "",
  };
  Object.assign(values, overrides);
  return ROSTER_HEADER.split(",").map((header) => values[header] ?? "").join(",");
}

test("header mismatch is an error", () => {
  const parties = makePartyCsv([]);
  const roster = makeRosterCsv([]);
  // Break roster header
  const badRoster = rowsToObjects(parseCsv("wrong_header\n" + baseRosterRow()));
  const result = validate(parties.records as any, parties.headers, badRoster.records as any, badRoster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("header does not match")));
});

test("unknown body is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ body: "unknown_body" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("unknown body")));
});

test("unknown title is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ position_title: "Menteri" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("unknown position_title")));
});

test("unknown status is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ status: "pending" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("unknown status")));
});

test("unknown appointment type is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ appointment_type: "selected" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("unknown appointment_type")));
});

test("bad date format is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ start_date: "01-01-2025" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("bad start_date format")));
});

test("end before start is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ status: "ended", end_date: "2024-01-01" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("end_date is before start_date")));
});

test("blank start_date on active row is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ start_date: "" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("start_date is required")));
});

test("ended row without end_date is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ status: "ended", end_date: "" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("ended row requires end_date")));
});

test("end_date on non-ended row is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ end_date: "2025-02-01" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("end_date is only allowed")));
});

test("party_code not in parties.csv is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ party_code: "nope" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("party_code not found")));
});

test("party on appointed row is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ party_code: "pkb", appointment_type: "appointed" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("party_code must be empty")));
});

test("party on police row is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ body: "polres", position_title: "Kapolres", jurisdiction: "Polres Metro Jakarta Pusat", appointment_type: "appointed", party_code: "pkb" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("party_code must be empty")));
});

test("missing dapil on DPRD Anggota is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ body: "dprd_dki", position_title: "Anggota", jurisdiction: "DKI Jakarta", dapil: "", appointment_type: "elected" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("dapil is required")));
});

test("unknown dapil is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ body: "dprd_dki", position_title: "Anggota", jurisdiction: "DKI Jakarta", dapil: "DKI Jakarta 99", appointment_type: "elected" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("dapil is not one of the seeded")));
});

test("missing source_url_1 is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ source_url_1: "" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("source_url_1 is required")));
});

test("non-http source url is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ source_url_1: "ftp://example.com" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("source_url_1 must be http")));
});

test("duplicate natural key is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({ person_slug: "a" }),
    baseRosterRow({ person_slug: "b", full_name: "B" }),
  ]);
  // Force same natural key by same slug/institution/title/start_date is impossible with different slug;
  // instead duplicate exact row.
  const roster2 = makeRosterCsv([
    baseRosterRow({ person_slug: "same" }),
    baseRosterRow({ person_slug: "same" }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster2.records as any, roster2.headers);
  assert.ok(result.errors.some((e) => e.message.includes("duplicate natural key")));
});

test("same slug different full_name is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({ person_slug: "same", full_name: "One" }),
    baseRosterRow({ person_slug: "same", full_name: "Two" }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("same person_slug with different full_name")));
});

test("verification_status other than needs_verification is an error", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ verification_status: "verified" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.errors.some((e) => e.message.includes("verification_status must be needs_verification")));
});

test("honorific warning", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ full_name: "Dr. Test Person" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("honorific")));
});

test("home page source warning", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ source_url_1: "https://example.com/" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("home page")));
});

test("only reference or social sources warning", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([baseRosterRow({ source_url_1: "https://wikipedia.org/wiki/Test" })]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("only reference or social")));
});

test("similar names warning", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({ person_slug: "m-anwar", full_name: "M Anwar" }),
    baseRosterRow({ person_slug: "muhammad-anwar", full_name: "Muhammad Anwar", start_date: "2025-02-02" }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("possible duplicate person")));
});

test("same notes on 3 rows warning", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({ person_slug: "a", notes: "same note", start_date: "2025-01-01" }),
    baseRosterRow({ person_slug: "b", notes: "same note", start_date: "2025-01-02" }),
    baseRosterRow({ person_slug: "c", notes: "same note", start_date: "2025-01-03" }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("notes text repeated on 3 rows")));
});

test("home page source is named per source", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({ person_slug: "pramono-anung", source_url_1: "https://www.jakarta.go.id", full_name: "Pramono Anung" }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("source_url_1 is a home page")));
  assert.ok(result.warnings.some((w) => w.message.includes("weak source: no specific source")));
});

test("specific source 1 with home page source 2 names only source 2", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({
      person_slug: "basri-baco",
      source_url_1: "https://megapolitan.kompas.com/read/2024/08/26/example",
      source_url_2: "https://dprd-dkijakartaprov.go.id",
      full_name: "Basri Baco",
    }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("source_url_2 is a home page")));
  assert.ok(!result.warnings.some((w) => w.message.includes("weak source: no specific source")));
});

test("reference-only sources warn", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({
      person_slug: "iin-mutmainnah",
      full_name: "Iin Mutmainnah",
      source_url_1: "https://id.wikipedia.org/wiki/Iin_Mutmainnah",
    }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("only reference or social sources")));
});

test("social-only sources warn", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({
      person_slug: "dekananto-eko-purwono",
      full_name: "Dekananto Eko Purwono",
      source_url_1: "https://www.instagram.com/example",
    }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("only reference or social sources")));
});

test("M. Anwar vs Muhammad Anwar is flagged", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({ person_slug: "m-anwar", full_name: "M. Anwar", start_date: "2025-01-01" }),
    baseRosterRow({ person_slug: "muhammad-anwar", full_name: "Muhammad Anwar", start_date: "2025-01-02" }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(result.warnings.some((w) => w.message.includes("possible duplicate person")));
});

test("Fredy Setiawan vs I Putu Yuni Setiawan is not flagged", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({ person_slug: "fredy-setiawan", full_name: "Fredy Setiawan", start_date: "2025-01-01" }),
    baseRosterRow({ person_slug: "i-putu-yuni-setiawan", full_name: "I Putu Yuni Setiawan", start_date: "2025-01-02" }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(!result.warnings.some((w) => w.message.includes("possible duplicate person")));
});

test("Yusuf vs Husen is not flagged", () => {
  const parties = makePartyCsv([basePartyRow()]);
  const roster = makeRosterCsv([
    baseRosterRow({ person_slug: "yusuf", full_name: "Yusuf", start_date: "2025-01-01" }),
    baseRosterRow({ person_slug: "husen", full_name: "Husen", start_date: "2025-01-02" }),
  ]);
  const result = validate(parties.records as any, parties.headers, roster.records as any, roster.headers);
  assert.ok(!result.warnings.some((w) => w.message.includes("possible duplicate person")));
});
