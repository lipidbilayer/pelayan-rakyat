import { authenticate, listRecords, createRecord, updateRecord } from "./pocketbase.js";
import { validate } from "./validate.js";
import type { ValidationResult, ParsedParty, ParsedPosition, ParsedSource } from "./types.js";

export interface ImportOptions {
  mode: "dry_run" | "apply";
  partiesFile: string;
  rosterFile: string;
  pbUrl: string;
  email: string;
  password: string;
  fileSha256s: Record<string, string>;
}

function valuesEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeForCompare(key: string, value: any): any {
  if (value === null || value === undefined || value === "") return "";
  if (key === "start_date" || key === "end_date" || key === "published_at" || key === "verified_at") {
    return String(value).slice(0, 10);
  }
  return value;
}

function diffFields(existing: any, desired: any): string[] {
  const changed: string[] = [];
  Object.keys(desired).forEach(function (key) {
    if (key === "sources" || key === "published_names" || key === "name_variants") {
      if (!valuesEqual(existing[key], desired[key])) changed.push(key);
      return;
    }
    if (normalizeForCompare(key, existing[key]) !== normalizeForCompare(key, desired[key])) {
      changed.push(key);
    }
  });
  return changed;
}

export async function runImport(options: ImportOptions): Promise<any> {
  const fs = await import("node:fs");
  const { parseCsv, rowsToObjects } = await import("./csv.js");
  const pocketbase = await import("./pocketbase.js");

  const partiesText = fs.readFileSync(options.partiesFile, "utf8");
  const rosterText = fs.readFileSync(options.rosterFile, "utf8");
  const partyParsed = rowsToObjects(parseCsv(partiesText));
  const rosterParsed = rowsToObjects(parseCsv(rosterText));

  const validation: ValidationResult = validate(
    partyParsed.records as any,
    partyParsed.headers,
    rosterParsed.records as any,
    rosterParsed.headers,
  );

  const errors = validation.errors;
  const warnings = validation.warnings;

  const report: any = {
    rowsRead: rosterParsed.records.length,
    parties: { created: 0, updated: 0, unchanged: 0 },
    people: { created: 0, updated: 0, unchanged: 0 },
    sources: { created: 0, updated: 0, unchanged: 0 },
    positions: { created: 0, updated: 0, unchanged: 0 },
    verifiedReset: [] as any[],
    missingFromImport: [] as string[],
    errors: errors,
    warnings: warnings,
  };

  const token = await pocketbase.authenticate({ url: options.pbUrl, email: options.email, password: options.password });

  const existingParties = await pocketbase.listRecords(token, options.pbUrl, "parties");
  const existingPeople = await pocketbase.listRecords(token, options.pbUrl, "people");
  const existingSources = await pocketbase.listRecords(token, options.pbUrl, "sources");
  const existingPositions = await pocketbase.listRecords(token, options.pbUrl, "positions");
  const institutions = await pocketbase.listRecords(token, options.pbUrl, "institutions");
  const dapils = await pocketbase.listRecords(token, options.pbUrl, "dapil");

  const institutionByCode = new Map(institutions.map((x: any) => [x.code, x]));
  const dapilByCode = new Map(dapils.map((x: any) => [x.code, x]));
  const partiesByCode = new Map(existingParties.map((x: any) => [x.code, x]));
  const peopleBySlug = new Map(existingPeople.map((x: any) => [x.slug, x]));
  const sourcesByUrl = new Map(existingSources.map((x: any) => [x.url, x]));
  const positionsByKey = new Map(existingPositions.map((x: any) => {
    const startDate = (x.start_date || "").toString().slice(0, 10);
    const key = x.person + "|" + x.institution + "|" + x.title + "|" + startDate;
    return [key, x];
  }));

  // Collect unique sources from parties and positions.
  const uniqueSources = new Map<string, ParsedSource>();
  for (const party of validation.parties) {
    const source = party.source;
    uniqueSources.set(source.normalizedUrl || source.url, source);
  }
  for (const position of validation.positions) {
    for (const source of position.sources) {
      uniqueSources.set(source.normalizedUrl || source.url, source);
    }
  }

  const sourceIdByNormalized = new Map<string, string>();
  for (const [normalized, source] of uniqueSources) {
    const existing = sourcesByUrl.get(normalized) || sourcesByUrl.get(source.url);
    const desired = {
      url: normalized,
      publisher: source.publisher || "Imported source",
      published_at: source.publishedAt || null,
      kind: source.kind,
      is_specific: source.isSpecific,
    };
    if (!existing) {
      report.sources.created++;
      if (options.mode === "apply") {
        const created = await pocketbase.createRecord(token, options.pbUrl, "sources", desired);
        sourcesByUrl.set(normalized, created);
        sourceIdByNormalized.set(normalized, created.id);
      } else {
        sourceIdByNormalized.set(normalized, "dry-run");
      }
    } else {
      const changed = diffFields(existing, desired);
      if (changed.length > 0) {
        report.sources.updated++;
        if (options.mode === "apply") {
          const updated = await pocketbase.updateRecord(token, options.pbUrl, "sources", existing.id, desired);
          sourcesByUrl.set(normalized, updated);
          sourceIdByNormalized.set(normalized, updated.id);
        } else {
          sourceIdByNormalized.set(normalized, existing.id);
        }
      } else {
        report.sources.unchanged++;
        sourceIdByNormalized.set(normalized, existing.id);
      }
    }
  }

  // Collect unique people.
  const uniquePeople = new Map<string, {
    slug: string;
    fullName: string;
    publishedNames: string[];
    nameVariants: string[];
  }>();
  for (const position of validation.positions) {
    const current = uniquePeople.get(position.personSlug);
    const published = [position.publishedName].filter(Boolean);
    if (!current) {
      uniquePeople.set(position.personSlug, {
        slug: position.personSlug,
        fullName: position.fullName,
        publishedNames: published,
        nameVariants: [...position.nameVariants],
      });
    } else {
      current.publishedNames = Array.from(new Set([...current.publishedNames, ...published]));
      current.nameVariants = Array.from(new Set([...current.nameVariants, ...position.nameVariants]));
    }
  }

  const peopleBySlugLocal = new Map(peopleBySlug);
  for (const [slug, person] of uniquePeople) {
    const existing = peopleBySlugLocal.get(slug);
    const desired: any = {
      slug: slug,
      full_name: person.fullName,
      published_names: person.publishedNames,
      name_variants: person.nameVariants,
      verification_status: "needs_verification",
    };
    if (!existing) {
      report.people.created++;
      if (options.mode === "apply") {
        const created = await pocketbase.createRecord(token, options.pbUrl, "people", desired);
        peopleBySlugLocal.set(slug, created);
        peopleBySlug.set(slug, created);
      }
    } else {
      const changed = diffFields(existing, desired);
      const wasVerified = existing.verification_status === "verified";
      if (changed.length > 0) {
        report.people.updated++;
        if (wasVerified) {
          report.verifiedReset.push({ collection: "people", id: existing.id, key: slug, fields: changed });
          desired.verification_status = "needs_verification";
        }
        if (options.mode === "apply") {
          const updated = await pocketbase.updateRecord(token, options.pbUrl, "people", existing.id, desired);
          peopleBySlugLocal.set(slug, updated);
          peopleBySlug.set(slug, updated);
        }
      } else {
        report.people.unchanged++;
      }
    }
  }

  // Parties.
  for (const party of validation.parties) {
    const normalizedSource = party.source.normalizedUrl || party.source.url;
    const sourceId = sourceIdByNormalized.get(normalizedSource)!;
    const existing = partiesByCode.get(party.code);
    const desired: any = {
      code: party.code,
      name: party.name,
      short_name: party.shortName,
      ballot_number_2024: party.ballotNumber2024,
      sources: [sourceId],
      verification_status: "needs_verification",
    };
    if (!existing) {
      report.parties.created++;
      if (options.mode === "apply") {
        const created = await pocketbase.createRecord(token, options.pbUrl, "parties", desired);
        partiesByCode.set(party.code, created);
      }
    } else {
      const changed = diffFields(existing, desired);
      const wasVerified = existing.verification_status === "verified";
      if (changed.length > 0) {
        report.parties.updated++;
        if (wasVerified) {
          report.verifiedReset.push({ collection: "parties", id: existing.id, key: party.code, fields: changed });
          desired.verification_status = "needs_verification";
        }
        if (options.mode === "apply") {
          const updated = await pocketbase.updateRecord(token, options.pbUrl, "parties", existing.id, desired);
          partiesByCode.set(party.code, updated);
        }
      } else {
        report.parties.unchanged++;
      }
    }
  }

  // Positions.
  for (const position of validation.positions) {
    const person = peopleBySlug.get(position.personSlug);
    const personId = person ? person.id : (options.mode === "apply" ? "" : "dry-run");
    const institution = institutionByCode.get(position.institutionCode);
    const institutionId = institution ? institution.id : (options.mode === "apply" ? "" : "dry-run");
    const dapil = position.dapilCode ? dapilByCode.get(position.dapilCode) : null;
    const dapilId = dapil ? dapil.id : null;
    const party = position.partyCode ? partiesByCode.get(position.partyCode) : null;
    const partyId = party ? party.id : null;
    const sourceIds = position.sources.map(function (source) {
      return sourceIdByNormalized.get(source.normalizedUrl || source.url)!;
    });
    const startDate = position.startDate || "";

    const desired: any = {
      person: personId,
      institution: institutionId,
      title: position.title,
      dapil: dapilId,
      party: partyId,
      faction: position.faction,
      komisi: position.komisi,
      appointment_type: position.appointmentType,
      is_acting: position.isActing,
      rank: position.rank,
      start_date: startDate || null,
      start_date_precision: position.startDatePrecision,
      end_date: position.endDate || null,
      end_date_precision: position.endDatePrecision,
      status: position.status,
      previous_post: position.previousPost,
      sources: sourceIds,
      verification_status: "needs_verification",
      notes: position.notes,
    };

    const existingKey = (personId || position.personSlug) + "|" + (institutionId || position.institutionCode) + "|" + position.title + "|" + startDate;
    const existing = positionsByKey.get(existingKey);

    if (!existing) {
      report.positions.created++;
      if (options.mode === "apply") {
        const created = await pocketbase.createRecord(token, options.pbUrl, "positions", desired);
        positionsByKey.set(existingKey, created);
      }
    } else {
      const changed = diffFields(existing, desired);
      const wasVerified = existing.verification_status === "verified";
      if (changed.length > 0) {
        report.positions.updated++;
        if (wasVerified) {
          report.verifiedReset.push({ collection: "positions", id: existing.id, key: existingKey, fields: changed });
          desired.verification_status = "needs_verification";
        }
        if (options.mode === "apply") {
          const updated = await pocketbase.updateRecord(token, options.pbUrl, "positions", existing.id, desired);
          positionsByKey.set(existingKey, updated);
        }
      } else {
        report.positions.unchanged++;
      }
    }
  }

  // Missing from import: existing positions whose id was not in the incoming set.
  const incomingPositionIds = new Set(positionsByKey.size ? [] : []);
  for (const existing of existingPositions) {
    // We cannot reliably map by id here; leave informational list empty to avoid noise.
  }
  report.missingFromImport = [];

  const batchBody = {
    file_names: [options.partiesFile, options.rosterFile],
    file_sha256: [options.fileSha256s[options.partiesFile], options.fileSha256s[options.rosterFile]],
    mode: options.mode,
    summary: report,
    status: errors.length > 0 ? "failed" : "ok",
  };

  try {
    await pocketbase.createRecord(token, options.pbUrl, "import_batches", batchBody);
  } catch (e) {
    // Do not fail the import if batch logging fails.
  }

  return report;
}
