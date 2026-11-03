import { parseCsv, rowsToObjects } from "./csv.js";
import { normalizeUrl, sourceKind, isSpecificUrl } from "./source-kind.js";
import type {
  CsvRow,
  ValidationError,
  ValidationWarning,
  ValidationResult,
  ParsedParty,
  ParsedPosition,
  ParsedSource,
} from "./types.js";

const PARTY_HEADER = ["party_code", "name", "short_name", "ballot_number_2024", "source_url"];
const ROSTER_HEADER = [
  "person_slug", "full_name", "name_as_published", "name_variants", "body", "position_title",
  "jurisdiction", "dapil", "party_code", "faction", "komisi", "appointment_type", "is_acting",
  "rank", "start_date", "end_date", "status", "previous_post", "source_url_1", "source_name_1",
  "source_date_1", "source_url_2", "source_name_2", "source_date_2", "verification_status", "notes",
];

const BODIES = new Set(["governor_office", "city_government", "dprd_dki", "dpr_ri", "dpd_ri", "polda_metro", "polres"]);
const TITLES = new Set(["Gubernur", "Wakil Gubernur", "Wali Kota", "Wakil Wali Kota", "Bupati", "Wakil Bupati", "Anggota", "Ketua", "Wakil Ketua", "Kapolda", "Wakapolda", "Kapolres"]);
const STATUSES = new Set(["active", "inactive", "ended"]);
const APPOINTMENTS = new Set(["elected", "appointed", "replacement"]);

const INSTITUTION_BY_BODY: Record<string, (jurisdiction: string) => string> = {
  governor_office: () => "gubernur-dki",
  city_government: (jurisdiction) => {
    const map: Record<string, string> = {
      "Jakarta Pusat": "pemkot-jakarta-pusat",
      "Jakarta Utara": "pemkot-jakarta-utara",
      "Jakarta Barat": "pemkot-jakarta-barat",
      "Jakarta Selatan": "pemkot-jakarta-selatan",
      "Jakarta Timur": "pemkot-jakarta-timur",
      "Kepulauan Seribu": "pemkab-kepulauan-seribu",
    };
    return map[jurisdiction] || "";
  },
  dprd_dki: () => "dprd-dki",
  dpr_ri: () => "dpr-ri-jakarta",
  dpd_ri: () => "dpd-ri-jakarta",
  polda_metro: () => "polda-metro-jaya",
  polres: (jurisdiction) => {
    const map: Record<string, string> = {
      "Polres Metro Jakarta Pusat": "polres-metro-jakarta-pusat",
      "Polres Metro Jakarta Utara": "polres-metro-jakarta-utara",
      "Polres Metro Jakarta Barat": "polres-metro-jakarta-barat",
      "Polres Metro Jakarta Selatan": "polres-metro-jakarta-selatan",
      "Polres Metro Jakarta Timur": "polres-metro-jakarta-timur",
      "Polres Kepulauan Seribu": "polres-kepulauan-seribu",
      "Polres Pelabuhan Tanjung Priok": "polres-pelabuhan-tanjung-priok",
    };
    return map[jurisdiction] || "";
  },
};

const DAPIL_SEATS: Record<string, number> = {
  "dprd-dki-1": 12, "dprd-dki-2": 9, "dprd-dki-3": 9, "dprd-dki-4": 10,
  "dprd-dki-5": 10, "dprd-dki-6": 10, "dprd-dki-7": 10, "dprd-dki-8": 12,
  "dprd-dki-9": 12, "dprd-dki-10": 12,
  "dpr-dki-i": 6, "dpr-dki-ii": 7, "dpr-dki-iii": 8,
};

const SEEDED_DAPIL = new Set(Object.keys(DAPIL_SEATS));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function lineNumberOf(index: number): number {
  return index + 2; // header is line 1
}

function makeSource(url: string, publisher: string, publishedAt: string): ParsedSource {
  const normalized = normalizeUrl(url);
  return {
    url: url.trim(),
    normalizedUrl: normalized,
    publisher: publisher.trim(),
    publishedAt: publishedAt.trim(),
    kind: sourceKind(normalized || url.trim()),
    isSpecific: isSpecificUrl(normalized || url.trim()),
  };
}

function dapilCode(name: string): string {
  const trimmed = name.trim();
  const romanMatch = trimmed.match(/^DKI Jakarta (I{1,3})$/);
  if (romanMatch) {
    return "dpr-dki-" + romanMatch[1].toLowerCase();
  }
  const numberMatch = trimmed.match(/^DKI Jakarta (\d+)$/);
  if (numberMatch) {
    return "dprd-dki-" + numberMatch[1];
  }
  return "";
}

function isPolice(body: string): boolean {
  return body === "polda_metro" || body === "polres";
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

export function validate(
  partyRows: CsvRow[],
  partyHeaders: string[],
  rosterRows: CsvRow[],
  rosterHeaders: string[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const parties: ParsedParty[] = [];
  const positions: ParsedPosition[] = [];

  if (JSON.stringify(partyHeaders) !== JSON.stringify(PARTY_HEADER)) {
    errors.push({ line: 1, message: "party CSV header does not match the spec" });
  }
  if (JSON.stringify(rosterHeaders) !== JSON.stringify(ROSTER_HEADER)) {
    errors.push({ line: 1, message: "roster CSV header does not match the spec" });
  }

  const partyCodes = new Set<string>();
  partyRows.forEach(function (row, index) {
    const line = lineNumberOf(index);
    const code = (row.party_code || "").trim();
    if (!code) {
      errors.push({ line: line, message: "missing party_code" });
      return;
    }
    if (partyCodes.has(code)) {
      errors.push({ line: line, personSlug: undefined, message: "duplicate party_code " + code });
    }
    partyCodes.add(code);

    const sourceUrl = (row.source_url || "").trim();
    if (!sourceUrl) {
      errors.push({ line: line, message: "party row has no source_url" });
    } else if (!/^https?:\/\//i.test(sourceUrl)) {
      errors.push({ line: line, message: "party source_url must be http(s)" });
    }

    const ballotRaw = (row.ballot_number_2024 || "").trim();
    let ballot: number | undefined;
    if (ballotRaw) {
      ballot = Number(ballotRaw);
      if (!Number.isInteger(ballot)) {
        errors.push({ line: line, message: "ballot_number_2024 must be an integer" });
      }
    }

    const source = makeSource(sourceUrl, "", "");
    parties.push({
      code: code,
      name: (row.name || "").trim(),
      shortName: (row.short_name || "").trim(),
      ballotNumber2024: ballot,
      source: source,
    });
  });

  // Honorific check regex.
  const honorificRe = /\b(H\.|Hj\.|dr\.|Ir\.|Lc\.|S\.H\.|Kombes|AKBP|Irjen|Komjen|\(Purn\))/i;

  const slugNames = new Map<string, string>();
  const naturalKeys = new Set<string>();
  const notesCounts = new Map<string, number>();

  rosterRows.forEach(function (row, index) {
    const line = lineNumberOf(index);
    const slug = (row.person_slug || "").trim();
    const fullName = (row.full_name || "").trim();

    if (!slug) {
      errors.push({ line: line, message: "missing person_slug" });
      return;
    }
    if (slugNames.has(slug) && slugNames.get(slug) !== fullName) {
      errors.push({ line: line, personSlug: slug, message: "same person_slug with different full_name" });
    }
    slugNames.set(slug, fullName);

    if ((row.verification_status || "").trim() !== "needs_verification") {
      errors.push({ line: line, personSlug: slug, message: "verification_status must be needs_verification in the CSV" });
    }

    const body = (row.body || "").trim();
    if (!BODIES.has(body)) {
      errors.push({ line: line, personSlug: slug, message: "unknown body: " + body });
    }

    const title = (row.position_title || "").trim();
    if (!TITLES.has(title)) {
      errors.push({ line: line, personSlug: slug, message: "unknown position_title: " + title });
    }

    const status = (row.status || "").trim();
    if (!STATUSES.has(status)) {
      errors.push({ line: line, personSlug: slug, message: "unknown status: " + status });
    }

    const appointmentType = (row.appointment_type || "").trim();
    if (!APPOINTMENTS.has(appointmentType)) {
      errors.push({ line: line, personSlug: slug, message: "unknown appointment_type: " + appointmentType });
    }

    const institutionCode = INSTITUTION_BY_BODY[body] ? INSTITUTION_BY_BODY[body]((row.jurisdiction || "").trim()) : "";
    if (body && !institutionCode) {
      errors.push({ line: line, personSlug: slug, message: "unknown institution for body/jurisdiction" });
    }

    const partyCode = (row.party_code || "").trim();
    if (partyCode && !partyCodes.has(partyCode)) {
      errors.push({ line: line, personSlug: slug, message: "party_code not found in parties.csv: " + partyCode });
    }
    if (partyCode && (isPolice(body) || appointmentType === "appointed")) {
      errors.push({ line: line, personSlug: slug, message: "party_code must be empty for police or appointed rows" });
    }

    const dapilName = (row.dapil || "").trim();
    let dapilCodeValue = "";
    if (title === "Anggota" && (body === "dprd_dki" || body === "dpr_ri")) {
      if (!dapilName) {
        errors.push({ line: line, personSlug: slug, message: "dapil is required for DPRD/DPR Anggota" });
      } else {
        dapilCodeValue = dapilCode(dapilName);
        if (!dapilCodeValue || !SEEDED_DAPIL.has(dapilCodeValue)) {
          errors.push({ line: line, personSlug: slug, message: "dapil is not one of the seeded dapil: " + dapilName });
        }
      }
    } else if (dapilName) {
      dapilCodeValue = dapilCode(dapilName);
    }

    const startDate = (row.start_date || "").trim();
    const endDate = (row.end_date || "").trim();
    if (!DATE_RE.test(startDate) && startDate !== "") {
      errors.push({ line: line, personSlug: slug, message: "bad start_date format: " + startDate });
    }
    if (!DATE_RE.test(endDate) && endDate !== "") {
      errors.push({ line: line, personSlug: slug, message: "bad end_date format: " + endDate });
    }
    if (status !== "ended" && startDate === "") {
      errors.push({ line: line, personSlug: slug, message: "start_date is required unless status = ended" });
    }
    if (status === "ended" && endDate === "") {
      errors.push({ line: line, personSlug: slug, message: "ended row requires end_date" });
    }
    if (status !== "ended" && endDate !== "") {
      errors.push({ line: line, personSlug: slug, message: "end_date is only allowed when status = ended" });
    }
    if (startDate && endDate && endDate < startDate) {
      errors.push({ line: line, personSlug: slug, message: "end_date is before start_date" });
    }

    const sourceUrl1 = (row.source_url_1 || "").trim();
    if (!sourceUrl1) {
      errors.push({ line: line, personSlug: slug, message: "source_url_1 is required" });
    } else if (!/^https?:\/\//i.test(sourceUrl1)) {
      errors.push({ line: line, personSlug: slug, message: "source_url_1 must be http(s)" });
    }
    const sourceUrl2 = (row.source_url_2 || "").trim();
    if (sourceUrl2 && !/^https?:\/\//i.test(sourceUrl2)) {
      errors.push({ line: line, personSlug: slug, message: "source_url_2 must be http(s)" });
    }

    const naturalKey = slug + "|" + institutionCode + "|" + title + "|" + startDate;
    if (naturalKeys.has(naturalKey)) {
      errors.push({ line: line, personSlug: slug, message: "duplicate natural key" });
    }
    naturalKeys.add(naturalKey);

    const notes = (row.notes || "").trim();
    if (notes) {
      notesCounts.set(notes, (notesCounts.get(notes) || 0) + 1);
    }

    // Warnings
    if (honorificRe.test(fullName)) {
      warnings.push({ line: line, personSlug: slug, message: "full_name may contain an honorific or rank" });
    }

    const source1 = sourceUrl1 ? makeSource(sourceUrl1, row.source_name_1 || "", row.source_date_1 || "") : null;
    const source2 = sourceUrl2 ? makeSource(sourceUrl2, row.source_name_2 || "", row.source_date_2 || "") : null;
    const sources = [source1, source2].filter(Boolean) as ParsedSource[];
    sources.forEach(function (source, index) {
      if (!source.isSpecific) {
        warnings.push({
          line: line,
          personSlug: slug,
          message: "source_url_" + (index + 1) + " is a home page (" + source.url + ")",
        });
      }
    });
    if (sources.length > 0 && sources.every(function (source) { return !source.isSpecific; })) {
      warnings.push({ line: line, personSlug: slug, message: "weak source: no specific source" });
    }
    if (sources.length > 0 && sources.every(function (source) { return source.kind === "reference" || source.kind === "social"; })) {
      warnings.push({ line: line, personSlug: slug, message: "only reference or social sources" });
    }

    const startPrecision = startDate === ""
      ? "unknown"
      : (notes.indexOf("start_date approximate (month only)") >= 0 ? "month" : "day");
    const endPrecision = endDate === ""
      ? "unknown"
      : (notes.indexOf("end_date approximate (month only)") >= 0 ? "month" : "day");

    const nameVariants = (row.name_variants || "").trim()
      ? (row.name_variants || "").split(";").map(function (x) { return x.trim(); }).filter(Boolean)
      : [];

    const publishedName = (row.name_as_published || "").trim();

    positions.push({
      personSlug: slug,
      fullName: fullName,
      publishedName: publishedName,
      nameVariants: nameVariants,
      body: body,
      institutionCode: institutionCode,
      title: title,
      jurisdiction: (row.jurisdiction || "").trim(),
      dapilName: dapilName,
      dapilCode: dapilCodeValue,
      partyCode: partyCode,
      faction: (row.faction || "").trim(),
      komisi: (row.komisi || "").trim(),
      appointmentType: appointmentType as ParsedPosition["appointmentType"],
      isActing: (row.is_acting || "").trim().toLowerCase() === "true",
      rank: (row.rank || "").trim(),
      startDate: startDate,
      startDatePrecision: startPrecision,
      endDate: endDate,
      endDatePrecision: endPrecision,
      status: status as ParsedPosition["status"],
      previousPost: (row.previous_post || "").trim(),
      sources: sources,
      verificationStatus: "needs_verification",
      notes: notes,
      csvLine: line,
    });
  });

  function expandToken(token: string): Set<string> {
    const value = token.toLowerCase().replace(/[^a-z]/g, "");
    const initials: Record<string, string[]> = {
      m: ["muhammad", "mohammad", "mohamad", "mohamed"],
      moh: ["mohammad", "mohamad", "mohamed"],
      muh: ["muhammad", "mohamad"],
    };
    if (Object.prototype.hasOwnProperty.call(initials, value)) {
      return new Set(initials[value]);
    }
    return new Set([value]);
  }

  function normalizeNameTokens(fullName: string): string[] {
    return fullName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .map(function (token) { return token.trim(); })
      .filter(Boolean);
  }

  function tokensMatch(left: string, right: string): boolean {
    const leftSet = expandToken(left);
    const rightSet = expandToken(right);
    for (const item of leftSet) {
      if (rightSet.has(item)) return true;
    }
    return false;
  }

  function allTokensSubset(smaller: string[], larger: string[]): boolean {
    return smaller.every(function (token) {
      return larger.some(function (other) { return tokensMatch(token, other); });
    });
  }

  // Possible duplicate person names.
  const slugList = Array.from(slugNames.keys());
  slugList.forEach(function (slugA, indexA) {
    slugList.slice(indexA + 1).forEach(function (slugB) {
      const nameA = slugNames.get(slugA) || "";
      const nameB = slugNames.get(slugB) || "";
      const tokensA = normalizeNameTokens(nameA);
      const tokensB = normalizeNameTokens(nameB);
      if (tokensA.length === 0 || tokensB.length === 0) return;

      // Skip pairs already disambiguated by a -2 slug plus an explicit note.
      const notesA = positions.find(function (p) { return p.personSlug === slugA; })?.notes || "";
      const notesB = positions.find(function (p) { return p.personSlug === slugB; })?.notes || "";
      if ((slugA.endsWith("-2") || slugB.endsWith("-2")) &&
          /different people|orang yang berbeda|not the same/i.test(notesA + " " + notesB)) {
        return;
      }

      const smaller = tokensA.length <= tokensB.length ? tokensA : tokensB;
      const larger = tokensA.length <= tokensB.length ? tokensB : tokensA;
      const fullA = tokensA.join(" ");
      const fullB = tokensB.join(" ");

      let flagged = false;
      if (smaller.length >= 2 && allTokensSubset(smaller, larger)) {
        flagged = true;
      }
      if (!flagged && fullA.length > 6 && fullB.length > 6 && levenshtein(fullA, fullB) <= 2) {
        flagged = true;
      }

      if (flagged) {
        const line = positions.find(function (p) { return p.personSlug === slugA; })?.csvLine || 0;
        warnings.push({ line: line, personSlug: slugA, message: "possible duplicate person: " + slugA + " / " + slugB });
      }
    });
  });

  // Same notes on 3+ rows: one grouped warning per distinct note.
  notesCounts.forEach(function (count, notes) {
    if (count >= 3) {
      const slugs = positions
        .filter(function (position) { return position.notes === notes; })
        .map(function (position) { return position.personSlug; });
      const first = positions.find(function (position) { return position.notes === notes; });
      warnings.push({
        line: first ? first.csvLine : 0,
        personSlug: first ? first.personSlug : undefined,
        message: "notes text repeated on " + count + " rows: \"" + notes + "\" (" + slugs.slice(0, 5).join(", ") + ")",
      });
    }
  });

  // Counts warnings.
  const activeByDapilDprd = new Map<string, number>();
  const activeByDapilDpr = new Map<string, number>();
  let dpdCount = 0;
  let kapolresCount = 0;
  positions.forEach(function (position) {
    if (position.status !== "active") return;
    if (position.body === "dprd_dki" && position.title === "Anggota" && position.dapilCode) {
      activeByDapilDprd.set(position.dapilCode, (activeByDapilDprd.get(position.dapilCode) || 0) + 1);
    }
    if (position.body === "dpr_ri" && position.title === "Anggota" && position.dapilCode) {
      activeByDapilDpr.set(position.dapilCode, (activeByDapilDpr.get(position.dapilCode) || 0) + 1);
    }
    if (position.body === "dpd_ri") dpdCount++;
    if (position.title === "Kapolres") kapolresCount++;
  });

  DAPIL_SEATS && Object.keys(DAPIL_SEATS).forEach(function (code) {
    if (code.startsWith("dprd-dki")) {
      const actual = activeByDapilDprd.get(code) || 0;
      if (actual !== DAPIL_SEATS[code]) {
        const example = positions.find(function (p) { return p.dapilCode === code; });
        warnings.push({ line: example ? example.csvLine : 0, personSlug: example ? example.personSlug : undefined, message: "DPRD dapil " + code + " has " + actual + " active Anggota, expected " + DAPIL_SEATS[code] });
      }
    }
    if (code.startsWith("dpr-dki")) {
      const actual = activeByDapilDpr.get(code) || 0;
      if (actual !== DAPIL_SEATS[code]) {
        const example = positions.find(function (p) { return p.dapilCode === code; });
        warnings.push({ line: example ? example.csvLine : 0, personSlug: example ? example.personSlug : undefined, message: "DPR dapil " + code + " has " + actual + " active Anggota, expected " + DAPIL_SEATS[code] });
      }
    }
  });

  if (dpdCount !== 4) {
    warnings.push({ line: 0, message: "DPD has " + dpdCount + " rows, expected 4" });
  }
  if (kapolresCount !== 7) {
    warnings.push({ line: 0, message: "Kapolres has " + kapolresCount + " rows, expected 7" });
  }

  return { errors: errors, warnings: warnings, parties: parties, positions: positions };
}
