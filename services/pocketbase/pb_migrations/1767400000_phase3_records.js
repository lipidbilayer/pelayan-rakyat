/// <reference path="../pb_data/types.d.ts" />

const MODERATOR_RULE = "@request.auth.role = 'moderator' || @request.auth.role = 'admin'";

function selectField(name, values, required) {
  return new SelectField({ name: name, values: values, maxSelect: 1, required: !!required });
}

function hiddenText(name) {
  return new TextField({ name: name, hidden: true });
}

migrate((app) => {
  const topics = new Collection({ type: "base", name: "topics" });
  topics.fields.add(new TextField({ name: "code", required: true }));
  topics.fields.add(new TextField({ name: "name", required: true }));
  topics.fields.add(new TextField({ name: "description" }));
  topics.listRule = "";
  topics.viewRule = "";
  topics.createRule = MODERATOR_RULE;
  topics.updateRule = MODERATOR_RULE;
  topics.deleteRule = null;
  topics.indexes.push("CREATE UNIQUE INDEX idx_topics_code ON topics (code)");
  app.save(topics);

  const topicSeeds = [
    ["banjir", "Banjir & rob", "Banjir, rob dan genangan"],
    ["transportasi", "Transportasi", "Transportasi umum dan lalu lintas"],
    ["sampah", "Sampah", "Pengelolaan sampah"],
    ["perumahan", "Perumahan", "Perumahan dan permukiman"],
    ["air-bersih", "Air bersih", "Air bersih dan sanitasi"],
    ["anggaran", "APBD & anggaran", "Anggaran dan keuangan daerah"],
    ["kesehatan", "Kesehatan", "Kesehatan publik"],
    ["pendidikan", "Pendidikan", "Pendidikan"],
    ["keamanan", "Keamanan", "Keamanan dan ketertiban"],
    ["lingkungan", "Lingkungan", "Lingkungan hidup"],
    ["pelayanan-publik", "Pelayanan publik", "Pelayanan publik"],
    ["integritas", "Korupsi & integritas", "Korupsi dan integritas"],
    ["ham", "HAM", "Hak asasi manusia"],
    ["ekonomi", "Ekonomi", "Ekonomi dan usaha"],
    ["ketenagakerjaan", "Ketenagakerjaan", "Ketenagakerjaan"],
  ];
  const topicCollection = app.findCollectionByNameOrId("topics");
  for (const [code, name, description] of topicSeeds) {
    const record = new Record(topicCollection);
    record.set("code", code);
    record.set("name", name);
    record.set("description", description);
    app.save(record);
  }

  const records = new Collection({ type: "base", name: "records" });
  records.fields.add(selectField("type", ["statement", "promise", "action", "vote"], true));
  records.fields.add(new RelationField({ name: "person", collectionId: app.findCollectionByNameOrId("people").id, maxSelect: 1, required: true }));
  records.fields.add(new RelationField({ name: "related_people", collectionId: app.findCollectionByNameOrId("people").id, maxSelect: 50 }));
  records.fields.add(new RelationField({ name: "position", collectionId: app.findCollectionByNameOrId("positions").id, maxSelect: 1 }));
  records.fields.add(new TextField({ name: "title", required: true, max: 120 }));
  records.fields.add(new TextField({ name: "summary", max: 600 }));
  records.fields.add(new TextField({ name: "context", required: true, min: 40, max: 1000 }));
  records.fields.add(new DateField({ name: "occurred_at", required: true }));
  records.fields.add(selectField("occurred_at_precision", ["day", "month"]));
  records.fields.add(new TextField({ name: "event_name" }));
  records.fields.add(new RelationField({ name: "topics", collectionId: app.findCollectionByNameOrId("topics").id, maxSelect: 50, required: true }));
  records.fields.add(new RelationField({ name: "sources", collectionId: app.findCollectionByNameOrId("sources").id, maxSelect: 50 }));
  records.fields.add(new URLField({ name: "video_url" }));
  records.fields.add(new NumberField({ name: "video_start_seconds" }));
  records.fields.add(new NumberField({ name: "video_end_seconds" }));
  records.fields.add(new BoolField({ name: "privacy_confirmed" }));
  records.fields.add(new TextField({ name: "quote" }));
  records.fields.add(selectField("quote_language", ["id", "en", "other"]));
  records.fields.add(selectField("blunder_category", ["", "factually_wrong", "insensitive", "out_of_touch", "self_contradiction"]));
  records.fields.add(new TextField({ name: "blunder_reason" }));
  records.fields.add(new TextField({ name: "fact_check" }));
  records.fields.add(new RelationField({ name: "fact_check_sources", collectionId: app.findCollectionByNameOrId("sources").id, maxSelect: 50 }));
  records.fields.add(new BoolField({ name: "clarification_checked" }));
  records.fields.add(selectField("follow_up_status", ["none_yet", "apologized", "clarified", "retracted", "doubled_down", "no_response"]));
  records.fields.add(new DateField({ name: "follow_up_date" }));
  records.fields.add(new RelationField({ name: "follow_up_sources", collectionId: app.findCollectionByNameOrId("sources").id, maxSelect: 50 }));
  records.fields.add(new TextField({ name: "follow_up_note" }));
  records.fields.add(selectField("promise_made_in", ["visi_misi", "debate", "campaign_speech", "inauguration", "other"]));
  records.fields.add(new DateField({ name: "promise_deadline" }));
  records.fields.add(new TextField({ name: "promise_target" }));
  records.fields.add(selectField("action_kind", ["policy", "budget", "audit", "service_outcome", "attendance", "legal_case", "other"]));
  records.fields.add(selectField("legal_status", ["", "reported", "investigated", "suspect", "charged", "convicted", "acquitted", "dropped", "appeal"]));
  records.fields.add(new TextField({ name: "legal_authority" }));
  records.fields.add(new TextField({ name: "decision_name" }));
  records.fields.add(selectField("vote_level", ["individual", "faction"]));
  records.fields.add(selectField("vote_position", ["setuju", "menolak", "abstain", "walkout", "tidak_hadir"]));
  records.fields.add(new TextField({ name: "faction" }));
  records.fields.add(new TextField({ name: "slug", required: true }));
  records.fields.add(new DateField({ name: "first_published_at" }));
  records.fields.add(new TextField({ name: "card_quote", max: 180 }));
  records.fields.add(selectField("verification_status", ["needs_verification", "verified", "rejected"], true));
  records.fields.add(new DateField({ name: "verified_at" }));
  records.fields.add(new RelationField({ name: "verified_by", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, hidden: true }));
  records.fields.add(hiddenText("rejection_reason"));
  records.fields.add(hiddenText("notes"));
  records.listRule = "verification_status = 'verified'";
  records.viewRule = "verification_status = 'verified' || (verification_status = 'rejected' && rejection_reason != '')";
  records.createRule = MODERATOR_RULE;
  records.updateRule = MODERATOR_RULE;
  records.deleteRule = null;
  records.indexes.push("CREATE UNIQUE INDEX idx_records_slug ON records (slug)");
  app.save(records);

  // Self-relation for contradicts_record now that records exists.
  const recordsCollection = app.findCollectionByNameOrId("records");
  recordsCollection.fields.add(new RelationField({ name: "contradicts_record", collectionId: recordsCollection.id, maxSelect: 1 }));
  // Remove duplicate if the earlier field failed; ignore errors.
  app.save(recordsCollection);

  const promiseUpdates = new Collection({ type: "base", name: "promise_updates" });
  promiseUpdates.fields.add(new RelationField({ name: "promise", collectionId: app.findCollectionByNameOrId("records").id, maxSelect: 1, required: true }));
  promiseUpdates.fields.add(selectField("status", ["not_rated", "in_progress", "kept", "partially_kept", "stalled", "broken"], true));
  promiseUpdates.fields.add(new DateField({ name: "effective_date", required: true }));
  promiseUpdates.fields.add(new RelationField({ name: "sources", collectionId: app.findCollectionByNameOrId("sources").id, maxSelect: 50, required: true }));
  promiseUpdates.fields.add(new TextField({ name: "note" }));
  promiseUpdates.fields.add(selectField("verification_status", ["needs_verification", "verified", "rejected"], true));
  promiseUpdates.fields.add(new DateField({ name: "verified_at" }));
  promiseUpdates.fields.add(new RelationField({ name: "verified_by", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, hidden: true }));
  promiseUpdates.fields.add(hiddenText("rejection_reason"));
  promiseUpdates.fields.add(hiddenText("notes"));
  promiseUpdates.listRule = "verification_status = 'verified'";
  promiseUpdates.viewRule = "verification_status = 'verified'";
  promiseUpdates.createRule = MODERATOR_RULE;
  promiseUpdates.updateRule = MODERATOR_RULE;
  promiseUpdates.deleteRule = null;
  app.save(promiseUpdates);

  const recordChanges = new Collection({ type: "base", name: "record_changes" });
  recordChanges.fields.add(new RelationField({ name: "record", collectionId: app.findCollectionByNameOrId("records").id, maxSelect: 1, required: true }));
  recordChanges.fields.add(new DateField({ name: "changed_at", required: true }));
  recordChanges.fields.add(new TextField({ name: "public_change_note", required: true }));
  recordChanges.fields.add(selectField("kind", ["correction", "update", "withdrawn"], true));
  recordChanges.listRule = "record.verification_status != 'needs_verification'";
  recordChanges.viewRule = "record.verification_status != 'needs_verification'";
  recordChanges.createRule = null;
  recordChanges.updateRule = null;
  recordChanges.deleteRule = null;
  app.save(recordChanges);

  const replies = new Collection({ type: "base", name: "replies" });
  replies.fields.add(new RelationField({ name: "record", collectionId: app.findCollectionByNameOrId("records").id, maxSelect: 1, required: true }));
  replies.fields.add(new TextField({ name: "responder_name", required: true }));
  replies.fields.add(new TextField({ name: "responder_role" }));
  replies.fields.add(new DateField({ name: "received_at", required: true }));
  replies.fields.add(selectField("channel", ["email", "letter", "public_statement", "other"]));
  replies.fields.add(hiddenText("identity_check"));
  replies.fields.add(new TextField({ name: "text", required: true, max: 2000 }));
  replies.fields.add(selectField("status", ["pending", "published", "declined"], true));
  replies.fields.add(hiddenText("decline_reason"));
  replies.fields.add(selectField("verification_status", ["needs_verification", "verified", "rejected"], true));
  replies.fields.add(new DateField({ name: "verified_at" }));
  replies.fields.add(new RelationField({ name: "verified_by", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, hidden: true }));
  replies.listRule = "status = 'published' && record.verification_status = 'verified'";
  replies.viewRule = "status = 'published' && record.verification_status = 'verified'";
  replies.createRule = MODERATOR_RULE;
  replies.updateRule = MODERATOR_RULE;
  replies.deleteRule = null;
  app.save(replies);

  // Add archiving fields to sources.
  const sources = app.findCollectionByNameOrId("sources");
  if (!sources.fields.getByName("archived_url")) {
    sources.fields.add(new URLField({ name: "archived_url" }));
  }
  if (!sources.fields.getByName("archived_at")) {
    sources.fields.add(new DateField({ name: "archived_at" }));
  }
  if (!sources.fields.getByName("archive_status")) {
    sources.fields.add(selectField("archive_status", ["pending", "ok", "failed"]));
  }
  app.save(sources);
}, (app) => {
  for (const name of ["topics", "records", "promise_updates", "record_changes", "replies"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (e) {}
  }
  try {
    const sources = app.findCollectionByNameOrId("sources");
    for (const fieldName of ["archived_url", "archived_at", "archive_status"]) {
      const field = sources.fields.getByName(fieldName);
      if (field) sources.fields.remove(field);
    }
    app.save(sources);
  } catch (e) {}
});