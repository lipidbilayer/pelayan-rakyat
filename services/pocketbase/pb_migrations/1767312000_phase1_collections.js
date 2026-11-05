/// <reference path="../pb_data/types.d.ts" />

const MODERATOR_RULE = "@request.auth.role = 'moderator' || @request.auth.role = 'admin'";

function selectField(name, values, required) {
  return new SelectField({
    name: name,
    values: values,
    maxSelect: 1,
    required: !!required,
  });
}

function hiddenText(name) {
  return new TextField({ name: name, hidden: true });
}

migrate((app) => {
  // Sources come first: parties and positions refer to them.
  const sources = new Collection({ type: "base", name: "sources" });
  sources.fields.add(new URLField({ name: "url", required: true }));
  sources.fields.add(new TextField({ name: "publisher", required: true }));
  sources.fields.add(new DateField({ name: "published_at" }));
  sources.fields.add(selectField("kind", ["official", "media", "reference", "social"], true));
  sources.fields.add(new BoolField({ name: "is_specific" }));
  sources.fields.add(new URLField({ name: "archived_url" }));
  // Back-relation rules are applied after the positions collection exists.
  sources.listRule = null;
  sources.viewRule = null;
  sources.createRule = MODERATOR_RULE;
  sources.updateRule = MODERATOR_RULE;
  sources.deleteRule = null;
  sources.indexes.push("CREATE UNIQUE INDEX idx_sources_url ON sources (url)");
  app.save(sources);

  const parties = new Collection({ type: "base", name: "parties" });
  parties.fields.add(new TextField({ name: "code", required: true, pattern: "^[a-z][a-z-]*$" }));
  parties.fields.add(new TextField({ name: "name", required: true }));
  parties.fields.add(new TextField({ name: "short_name", required: true }));
  parties.fields.add(new NumberField({ name: "ballot_number_2024", onlyInt: true }));
  parties.fields.add(new RelationField({
    name: "sources",
    collectionId: sources.id,
    maxSelect: 100,
    cascadeDelete: false,
  }));
  parties.fields.add(selectField("verification_status", ["needs_verification", "verified", "rejected"], true));
  parties.listRule = "verification_status = 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  parties.viewRule = "verification_status = 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  parties.createRule = MODERATOR_RULE;
  parties.updateRule = MODERATOR_RULE;
  parties.deleteRule = null;
  parties.indexes.push("CREATE UNIQUE INDEX idx_parties_code ON parties (code)");
  app.save(parties);

  const people = new Collection({ type: "base", name: "people" });
  people.fields.add(new TextField({ name: "slug", required: true, pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" }));
  people.fields.add(new TextField({ name: "full_name", required: true }));
  people.fields.add(new JSONField({ name: "published_names" }));
  people.fields.add(new JSONField({ name: "name_variants" }));
  people.fields.add(selectField("verification_status", ["needs_verification", "verified", "rejected"], true));
  people.fields.add(new DateField({ name: "verified_at" }));
  people.fields.add(new RelationField({ name: "verified_by", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1 }));
  people.fields.add(hiddenText("notes"));
  people.listRule = "verification_status = 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  people.viewRule = "verification_status = 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  people.createRule = MODERATOR_RULE;
  people.updateRule = MODERATOR_RULE;
  people.deleteRule = null;
  people.indexes.push("CREATE UNIQUE INDEX idx_people_slug ON people (slug)");
  app.save(people);

  const institutions = new Collection({ type: "base", name: "institutions" });
  institutions.fields.add(new TextField({ name: "code", required: true }));
  institutions.fields.add(new TextField({ name: "name", required: true }));
  institutions.fields.add(selectField("kind", [
    "governor_office", "city_government", "dprd_dki", "dpr_ri", "dpd_ri",
    "polda_metro", "polres",
  ], true));
  institutions.fields.add(new TextField({ name: "jurisdiction", required: true }));
  institutions.fields.add(new BoolField({ name: "is_partisan" }));
  institutions.listRule = "";
  institutions.viewRule = "";
  institutions.createRule = MODERATOR_RULE;
  institutions.updateRule = MODERATOR_RULE;
  institutions.deleteRule = null;
  institutions.indexes.push("CREATE UNIQUE INDEX idx_institutions_code ON institutions (code)");
  app.save(institutions);

  institutions.fields.add(new RelationField({ name: "parent", collectionId: institutions.id, maxSelect: 1 }));
  app.save(institutions);

  const dapil = new Collection({ type: "base", name: "dapil" });
  dapil.fields.add(new TextField({ name: "code", required: true }));
  dapil.fields.add(new TextField({ name: "name", required: true }));
  dapil.fields.add(selectField("level", ["dprd_dki", "dpr_ri"], true));
  dapil.fields.add(new NumberField({ name: "seats", onlyInt: true, required: true }));
  dapil.fields.add(new JSONField({ name: "areas" }));
  dapil.listRule = "";
  dapil.viewRule = "";
  dapil.createRule = MODERATOR_RULE;
  dapil.updateRule = MODERATOR_RULE;
  dapil.deleteRule = null;
  dapil.indexes.push("CREATE UNIQUE INDEX idx_dapil_code ON dapil (code)");
  app.save(dapil);

  const positions = new Collection({ type: "base", name: "positions" });
  positions.fields.add(new RelationField({ name: "person", collectionId: people.id, maxSelect: 1, required: true, cascadeDelete: false }));
  positions.fields.add(new RelationField({ name: "institution", collectionId: institutions.id, maxSelect: 1, required: true, cascadeDelete: false }));
  positions.fields.add(selectField("title", [
    "Gubernur", "Wakil Gubernur", "Wali Kota", "Wakil Wali Kota", "Bupati",
    "Wakil Bupati", "Anggota", "Ketua", "Wakil Ketua", "Kapolda", "Wakapolda",
    "Kapolres",
  ], true));
  positions.fields.add(new RelationField({ name: "dapil", collectionId: dapil.id, maxSelect: 1 }));
  positions.fields.add(new RelationField({ name: "party", collectionId: parties.id, maxSelect: 1 }));
  positions.fields.add(new TextField({ name: "faction" }));
  positions.fields.add(new TextField({ name: "komisi" }));
  positions.fields.add(selectField("appointment_type", ["elected", "appointed", "replacement"], true));
  positions.fields.add(new BoolField({ name: "is_acting" }));
  positions.fields.add(new TextField({ name: "rank" }));
  positions.fields.add(new DateField({ name: "start_date" }));
  positions.fields.add(selectField("start_date_precision", ["day", "month", "unknown"]));
  positions.fields.add(new DateField({ name: "end_date" }));
  positions.fields.add(selectField("end_date_precision", ["day", "month", "unknown"]));
  positions.fields.add(selectField("status", ["active", "inactive", "ended"], true));
  positions.fields.add(new TextField({ name: "previous_post" }));
  positions.fields.add(new RelationField({ name: "sources", collectionId: sources.id, maxSelect: 100, required: true }));
  positions.fields.add(selectField("verification_status", ["needs_verification", "verified", "rejected"], true));
  positions.fields.add(new DateField({ name: "verified_at" }));
  positions.fields.add(new RelationField({ name: "verified_by", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, hidden: true }));
  positions.fields.add(hiddenText("rejection_reason"));
  positions.fields.add(hiddenText("notes"));
  positions.listRule = "verification_status = 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  positions.viewRule = "verification_status = 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  positions.createRule = MODERATOR_RULE;
  positions.updateRule = MODERATOR_RULE;
  positions.deleteRule = null;
  positions.indexes.push("CREATE UNIQUE INDEX idx_positions_natural_key ON positions (person, institution, title, COALESCE(start_date, ''))");
  app.save(positions);

  positions.fields.add(new RelationField({ name: "replaces", collectionId: positions.id, maxSelect: 1 }));
  app.save(positions);

  const sourcesForRules = app.findCollectionByNameOrId("sources");
  sourcesForRules.listRule = "positions_via_sources.verification_status ?= 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  sourcesForRules.viewRule = "positions_via_sources.verification_status ?= 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  app.save(sourcesForRules);

  const importBatches = new Collection({ type: "base", name: "import_batches" });
  importBatches.fields.add(new JSONField({ name: "file_names" }));
  importBatches.fields.add(new JSONField({ name: "file_sha256" }));
  importBatches.fields.add(selectField("mode", ["dry_run", "apply"], true));
  importBatches.fields.add(new JSONField({ name: "summary" }));
  importBatches.fields.add(selectField("status", ["ok", "failed"], true));
  importBatches.listRule = MODERATOR_RULE;
  importBatches.viewRule = MODERATOR_RULE;
  importBatches.createRule = null;
  importBatches.updateRule = null;
  importBatches.deleteRule = null;
  app.save(importBatches);

  const revisions = new Collection({ type: "base", name: "revisions" });
  revisions.fields.add(new TextField({ name: "target_collection", required: true }));
  revisions.fields.add(new TextField({ name: "target_id", required: true }));
  revisions.fields.add(selectField("action", ["create", "update", "delete", "verify", "reject", "import"], true));
  revisions.fields.add(new JSONField({ name: "before" }));
  revisions.fields.add(new JSONField({ name: "after" }));
  revisions.fields.add(new RelationField({ name: "actor", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1 }));
  revisions.fields.add(new RelationField({ name: "import_batch", collectionId: importBatches.id, maxSelect: 1 }));
  revisions.fields.add(new TextField({ name: "reason" }));
  revisions.listRule = MODERATOR_RULE;
  revisions.viewRule = MODERATOR_RULE;
  revisions.createRule = null;
  revisions.updateRule = null;
  revisions.deleteRule = null;
  app.save(revisions);

  const statusEvents = new Collection({ type: "base", name: "status_events" });
  statusEvents.fields.add(new RelationField({ name: "position", collectionId: positions.id, maxSelect: 1, required: true, cascadeDelete: false }));
  statusEvents.fields.add(selectField("status", ["active", "inactive", "ended"], true));
  statusEvents.fields.add(new DateField({ name: "effective_date", required: true }));
  statusEvents.fields.add(new RelationField({ name: "sources", collectionId: sources.id, maxSelect: 100, required: true }));
  statusEvents.fields.add(new TextField({ name: "note" }));
  statusEvents.fields.add(selectField("verification_status", ["needs_verification", "verified", "rejected"], true));
  statusEvents.listRule = "verification_status = 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  statusEvents.viewRule = "verification_status = 'verified' || @request.auth.role = 'moderator' || @request.auth.role = 'admin'";
  statusEvents.createRule = MODERATOR_RULE;
  statusEvents.updateRule = MODERATOR_RULE;
  statusEvents.deleteRule = null;
  app.save(statusEvents);

  // Fix the revisions relation target now that import_batches exists.
  // (It was created with a string name above, which PocketBase resolves by name.)

  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("role")) {
    users.fields.add(selectField("role", ["admin", "moderator", "contributor"], false));
  }
  users.createRule = null;
  users.updateRule = MODERATOR_RULE;
  users.deleteRule = null;
  app.save(users);

  // Seed institutions.
  const institutionCollection = app.findCollectionByNameOrId("institutions");
  function institution(code, name, kind, jurisdiction, isPartisan, parentCode) {
    const record = new Record(institutionCollection);
    record.set("code", code);
    record.set("name", name);
    record.set("kind", kind);
    record.set("jurisdiction", jurisdiction);
    record.set("is_partisan", isPartisan);
    if (parentCode) {
      const parent = app.findFirstRecordByData("institutions", "code", parentCode);
      record.set("parent", parent.id);
    }
    app.save(record);
  }

  institution("gubernur-dki", "Gubernur DKI Jakarta", "governor_office", "DKI Jakarta", true, null);
  institution("pemkot-jakarta-pusat", "Pemerintah Kota Jakarta Pusat", "city_government", "Jakarta Pusat", false, null);
  institution("pemkot-jakarta-utara", "Pemerintah Kota Jakarta Utara", "city_government", "Jakarta Utara", false, null);
  institution("pemkot-jakarta-barat", "Pemerintah Kota Jakarta Barat", "city_government", "Jakarta Barat", false, null);
  institution("pemkot-jakarta-selatan", "Pemerintah Kota Jakarta Selatan", "city_government", "Jakarta Selatan", false, null);
  institution("pemkot-jakarta-timur", "Pemerintah Kota Jakarta Timur", "city_government", "Jakarta Timur", false, null);
  institution("pemkab-kepulauan-seribu", "Pemerintah Kabupaten Kepulauan Seribu", "city_government", "Kepulauan Seribu", false, null);
  institution("dprd-dki", "DPRD DKI Jakarta", "dprd_dki", "DKI Jakarta", true, null);
  institution("dpr-ri-jakarta", "DPR RI (Jakarta)", "dpr_ri", "DKI Jakarta", true, null);
  institution("dpd-ri-jakarta", "DPD RI (Jakarta)", "dpd_ri", "DKI Jakarta", false, null);
  institution("polda-metro-jaya", "Polda Metro Jaya", "polda_metro", "Polda Metro Jaya", false, null);
  const polres = [
    ["polres-metro-jakarta-pusat", "Polres Metro Jakarta Pusat"],
    ["polres-metro-jakarta-utara", "Polres Metro Jakarta Utara"],
    ["polres-metro-jakarta-barat", "Polres Metro Jakarta Barat"],
    ["polres-metro-jakarta-selatan", "Polres Metro Jakarta Selatan"],
    ["polres-metro-jakarta-timur", "Polres Metro Jakarta Timur"],
    ["polres-kepulauan-seribu", "Polres Kepulauan Seribu"],
    ["polres-pelabuhan-tanjung-priok", "Polres Pelabuhan Tanjung Priok"],
  ];
  for (const [code, name] of polres) {
    institution(code, name, "polres", "Polda Metro Jaya", false, "polda-metro-jaya");
  }

  // Seed dapil.
  const dapilCollection = app.findCollectionByNameOrId("dapil");
  const dprdSeats = [12, 9, 9, 10, 10, 10, 10, 12, 12, 12];
  for (let i = 1; i <= 10; i++) {
    const record = new Record(dapilCollection);
    record.set("code", "dprd-dki-" + i);
    record.set("name", "DKI Jakarta " + i);
    record.set("level", "dprd_dki");
    record.set("seats", dprdSeats[i - 1]);
    record.set("areas", []);
    app.save(record);
  }
  const dprSeats = [6, 7, 8];
  const dprRoman = ["I", "II", "III"];
  for (let i = 0; i < 3; i++) {
    const record = new Record(dapilCollection);
    record.set("code", "dpr-dki-" + dprRoman[i].toLowerCase());
    record.set("name", "DKI Jakarta " + dprRoman[i]);
    record.set("level", "dpr_ri");
    record.set("seats", dprSeats[i]);
    record.set("areas", []);
    app.save(record);
  }
}, (app) => {
  for (const name of [
    "sources", "parties", "people", "institutions", "dapil", "positions",
    "status_events", "revisions", "import_batches",
  ]) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      app.delete(collection);
    } catch (e) {
      // Ignore missing collections during rollback.
    }
  }

  try {
    const users = app.findCollectionByNameOrId("users");
    const field = users.fields.getByName("role");
    if (field) {
      users.fields.remove(field);
      app.save(users);
    }
  } catch (e) {
    // Ignore missing users collection during rollback.
  }
});