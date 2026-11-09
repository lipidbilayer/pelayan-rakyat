/// <reference path="../pb_data/types.d.ts" />

const MODERATOR_RULE = "@request.auth.role = 'moderator' || @request.auth.role = 'admin'";
const CONTRIBUTOR_OR_MODERATOR = "submitter = @request.auth.id || " + MODERATOR_RULE;

function selectField(name, values, required) {
  return new SelectField({ name: name, values: values, maxSelect: 1, required: !!required });
}

function hiddenText(name, max) {
  return new TextField({ name: name, max: max || 0, hidden: true });
}

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch (err) {
    return value.toLowerCase();
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const params = [];
  for (const [key, val] of parsed.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (lower.indexOf("utm_") === 0) continue;
    if (["fbclid", "gclid", "igshid", "mc_cid", "mc_eid", "ref", "ref_src"].indexOf(lower) >= 0) continue;
    params.push([key, val]);
  }
  params.sort(function (a, b) {
    return a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : (a[0] < b[0] ? -1 : 1);
  });
  const query = params.map(function (pair) {
    return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
  }).join("&");
  let pathname = parsed.pathname || "/";
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  return parsed.protocol.toLowerCase() + "//" + host + pathname + (query ? "?" + query : "");
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const addUserField = function (field) {
    if (!users.fields.getByName(field.name)) users.fields.add(field);
  };
  addUserField(new TextField({ name: "display_name", max: 40, hidden: true }));
  addUserField(new NumberField({ name: "trust_level", onlyInt: true, min: 0, max: 2, hidden: true }));
  addUserField(new DateField({ name: "suspended_until", hidden: true }));
  addUserField(new TextField({ name: "suspension_reason", hidden: true }));
  addUserField(new DateField({ name: "accepted_terms_at", hidden: true }));
  addUserField(new TextField({ name: "accepted_terms_version", hidden: true }));
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.createRule = null;
  users.updateRule = MODERATOR_RULE;
  users.deleteRule = null;
  app.save(users);

  const submissions = new Collection({ type: "base", name: "submissions" });
  submissions.fields.add(selectField("kind", ["tip", "correction"], true));
  submissions.fields.add(new RelationField({ name: "submitter", collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  submissions.fields.add(new RelationField({ name: "person", collectionId: app.findCollectionByNameOrId("people").id, maxSelect: 1, cascadeDelete: false }));
  submissions.fields.add(selectField("suggested_type", ["statement", "promise", "action", "vote", "unsure"]));
  submissions.fields.add(new TextField({ name: "url", required: true, max: 2000 }));
  submissions.fields.add(hiddenText("url_normalized", 2000));
  submissions.fields.add(new TextField({ name: "second_url", max: 2000 }));
  submissions.fields.add(new TextField({ name: "quote", max: 1000 }));
  submissions.fields.add(new TextField({ name: "note", required: true, min: 20, max: 1000 }));
  submissions.fields.add(new DateField({ name: "occurred_at" }));
  submissions.fields.add(new RelationField({ name: "target_record", collectionId: app.findCollectionByNameOrId("records").id, maxSelect: 1, cascadeDelete: false }));
  submissions.fields.add(new RelationField({ name: "target_person", collectionId: app.findCollectionByNameOrId("people").id, maxSelect: 1, cascadeDelete: false }));
  submissions.fields.add(selectField("status", ["new", "in_review", "converted", "duplicate", "rejected"], true));
  submissions.fields.add(selectField("rejection_code", ["no_public_source", "not_public_conduct", "duplicate", "unverifiable", "out_of_scope", "abusive"]));
  submissions.fields.add(new RelationField({ name: "converted_record", collectionId: app.findCollectionByNameOrId("records").id, maxSelect: 1, cascadeDelete: false }));
  submissions.fields.add(new NumberField({ name: "also_reported_by_count", onlyInt: true, min: 0 }));
  submissions.fields.add(new RelationField({ name: "reviewed_by", collectionId: users.id, maxSelect: 1, hidden: true }));
  submissions.fields.add(new DateField({ name: "reviewed_at", hidden: true }));
  submissions.fields.add(hiddenText("moderator_note", 2000));
  submissions.fields.add(hiddenText("submitted_day", 20));
  submissions.listRule = CONTRIBUTOR_OR_MODERATOR;
  submissions.viewRule = CONTRIBUTOR_OR_MODERATOR;
  submissions.createRule = null;
  submissions.updateRule = MODERATOR_RULE;
  submissions.deleteRule = null;
  submissions.indexes.push("CREATE INDEX idx_submissions_url ON submissions (url_normalized)");
  submissions.indexes.push("CREATE INDEX idx_submissions_submitter ON submissions (submitter)");
  submissions.indexes.push("CREATE INDEX idx_submissions_status ON submissions (status)");
  app.save(submissions);

  // Self-relation must be added after the collection has an id.
  const savedSubmissions = app.findCollectionByNameOrId("submissions");
  if (!savedSubmissions.fields.getByName("duplicate_of")) {
    savedSubmissions.fields.add(new RelationField({ name: "duplicate_of", collectionId: savedSubmissions.id, maxSelect: 1, cascadeDelete: false }));
    app.save(savedSubmissions);
  }

  const flags = new Collection({ type: "base", name: "flags" });
  flags.fields.add(new RelationField({ name: "record", collectionId: app.findCollectionByNameOrId("records").id, maxSelect: 1, required: true, cascadeDelete: false }));
  flags.fields.add(selectField("reason", ["wrong_person", "inaccurate", "missing_context", "dead_source", "other"], true));
  flags.fields.add(new TextField({ name: "note", max: 500 }));
  flags.fields.add(new RelationField({ name: "submitter", collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  flags.fields.add(selectField("status", ["open", "resolved", "dismissed"], true));
  flags.fields.add(hiddenText("moderator_note", 2000));
  flags.fields.add(hiddenText("submitted_day", 20));
  flags.listRule = CONTRIBUTOR_OR_MODERATOR;
  flags.viewRule = CONTRIBUTOR_OR_MODERATOR;
  flags.createRule = null;
  flags.updateRule = MODERATOR_RULE;
  flags.deleteRule = null;
  flags.indexes.push("CREATE UNIQUE INDEX idx_flags_open_once ON flags (record, submitter) WHERE status = 'open'");
  flags.indexes.push("CREATE INDEX idx_flags_record ON flags (record)");
  app.save(flags);

  const records = app.findCollectionByNameOrId("records");
  // C4.1: rejected records must not be readable by anonymous visitors.
  records.listRule = "verification_status = 'verified'";
  records.viewRule = "verification_status = 'verified'";
  if (!records.fields.getByName("from_submissions")) {
    records.fields.add(new RelationField({ name: "from_submissions", collectionId: submissions.id, maxSelect: 100, hidden: true, cascadeDelete: false }));
  }
  if (!records.fields.getByName("from_citizen_report")) {
    records.fields.add(new BoolField({ name: "from_citizen_report" }));
  }
  app.save(records);

  const sources = app.findCollectionByNameOrId("sources");
  if (!sources.fields.getByName("url_normalized")) {
    sources.fields.add(new TextField({ name: "url_normalized", max: 2000, hidden: true }));
  }
  app.save(sources);
  for (const source of app.findAllRecords("sources")) {
    source.set("url_normalized", normalizeUrl(source.get("url")));
    app.save(source);
  }
}, (app) => {
  for (const name of ["flags", "submissions"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (err) {}
  }
  try {
    const records = app.findCollectionByNameOrId("records");
    for (const fieldName of ["from_submissions", "from_citizen_report"]) {
      const field = records.fields.getByName(fieldName);
      if (field) records.fields.remove(field);
    }
    app.save(records);
  } catch (err) {}
  try {
    const sources = app.findCollectionByNameOrId("sources");
    const field = sources.fields.getByName("url_normalized");
    if (field) sources.fields.remove(field);
    app.save(sources);
  } catch (err) {}
  try {
    const users = app.findCollectionByNameOrId("users");
    for (const fieldName of ["display_name", "trust_level", "suspended_until", "suspension_reason", "accepted_terms_at", "accepted_terms_version"]) {
      const field = users.fields.getByName(fieldName);
      if (field) users.fields.remove(field);
    }
    app.save(users);
  } catch (err) {}
});
