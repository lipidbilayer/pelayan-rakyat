/// <reference path="../pb_data/types.d.ts" />

function containsBanned(text, bannedWords, legalStatus) {
  const lower = (text || "").toLowerCase();
  for (const word of bannedWords) {
    if (lower.indexOf(word.toLowerCase()) >= 0) {
      if (word.toLowerCase() === "koruptor" && legalStatus === "convicted") continue;
      return word;
    }
  }
  return "";
}

for (const collectionName of ["records"]) {
  onRecordCreate((e) => {
    console.log("[records] create fired, sources=" + JSON.stringify(e.record.get("sources")));
    const record = e.record;
    const app = e.app;
    const type = record.get("type");
    const title = record.get("title") || "";
    const summary = record.get("summary") || "";
    const context = record.get("context") || "";
    const occurredAt = record.get("occurred_at");
    const legalStatus = record.get("legal_status") || "";
    const bannedRaw = (function () {
      try {
        var raw = $os.readFile("/pb/config/banned-words.txt");
        if (typeof raw === "string") return raw;
        var chars = [];
        for (var i = 0; i < raw.length; i++) chars.push(String.fromCharCode(raw[i]));
        return chars.join("");
      } catch (err) {
        return "bodoh\ngoblok\ntolol\nbego\nngawur\nasal bunyi\nmemalukan\nparah\npembohong\nmunafik\nkoruptor\nblunder";
      }
    })();
    const bannedWords = bannedRaw.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);

    var badTitle = "";
    var lowerTitle = (title || "").toLowerCase();
    for (var i = 0; i < bannedWords.length; i++) {
      var word = bannedWords[i].toLowerCase();
      if (lowerTitle.indexOf(word) >= 0) {
        if (word === "koruptor" && legalStatus === "convicted") continue;
        badTitle = bannedWords[i];
        break;
      }
    }
    if (badTitle) throw new BadRequestError("banned word in title: " + badTitle);
    var badSummary = "";
    var lowerSummary = (summary || "").toLowerCase();
    for (var i = 0; i < bannedWords.length; i++) {
      var word = bannedWords[i].toLowerCase();
      if (lowerSummary.indexOf(word) >= 0) {
        if (word === "koruptor" && legalStatus === "convicted") continue;
        badSummary = bannedWords[i];
        break;
      }
    }
    if (badSummary) throw new BadRequestError("banned word in summary: " + badSummary);

    if (context.length < 40) throw new BadRequestError("context must be at least 40 characters");
    if (!occurredAt) throw new BadRequestError("occurred_at is required");
    if (new Date(occurredAt) > new Date()) throw new BadRequestError("occurred_at cannot be in the future");
    const followUpCreate = record.get("follow_up_status");
    if (followUpCreate === "no_response") {
      const days = (Date.now() - new Date(occurredAt).getTime()) / 86400000;
      if (days < 14) throw new BadRequestError("no_response requires 14 days");
    }

    const sourceIds = record.get("sources") || [];
    let hasSpecificOfficialOrMedia = false;
    for (const id of sourceIds) {
      const source = app.findRecordById("sources", id);
      const isSpecific = source.get("is_specific");
      const kind = source.get("kind");
      if (isSpecific && (kind === "official" || kind === "media")) {
        hasSpecificOfficialOrMedia = true;
      }
    }
    if (!hasSpecificOfficialOrMedia) throw new BadRequestError("at least one specific official or media source is required");


    if (type === "statement" && !(record.get("quote") || "").trim()) {
      throw new BadRequestError("statement requires a quote");
    }
    if (type === "promise" && !(record.get("promise_made_in") || "").trim()) {
      throw new BadRequestError("promise requires promise_made_in");
    }

    const blunderCategory = record.get("blunder_category") || "";
    if (blunderCategory) {
      if (blunderCategory === "factually_wrong") {
        if (!(record.get("fact_check") || "").trim()) throw new BadRequestError("fact_check is required");
        const factSources = record.get("fact_check_sources") || [];
        if (!factSources.length) throw new BadRequestError("fact_check_sources is required");
      }
      if (blunderCategory === "insensitive" || blunderCategory === "out_of_touch") {
        if (!(record.get("blunder_reason") || "").trim()) throw new BadRequestError("blunder_reason is required");
      }
      if (blunderCategory === "out_of_touch") {
        if (!(record.get("fact_check") || "").trim() && !(record.get("fact_check_sources") || []).length) {
          throw new BadRequestError("out_of_touch requires evidence");
        }
      }
      if (blunderCategory === "self_contradiction") {
        const contradicts = record.get("contradicts_record");
        if (!contradicts) throw new BadRequestError("contradicts_record is required");
        const earlier = app.findRecordById("records", contradicts);
        if (earlier.get("person") !== record.get("person")) throw new BadRequestError("contradicts_record must be by the same person");
        if (earlier.get("verification_status") !== "verified") throw new BadRequestError("contradicted record must be verified");
        if ((earlier.get("occurred_at") || "") >= (occurredAt || "")) throw new BadRequestError("contradicted record must be earlier");
      }
      if (blunderCategory && record.get("verification_status") === "verified" && !(record.get("clarification_checked"))) {
        throw new BadRequestError("clarification_checked is required for a blunder");
      }
      // Extra evidence.
      const hasVideoTimestamp = !!(record.get("video_url") && record.get("video_start_seconds") !== null && record.get("video_start_seconds") !== undefined);
      let distinctMediaPublishers = 0;
      const publishers = new Set();
      if (!hasVideoTimestamp) {
        for (const id of sourceIds) {
          const source = app.findRecordById("sources", id);
          if (source.get("kind") === "media" && source.get("is_specific")) {
            publishers.add(source.get("publisher"));
          }
        }
        distinctMediaPublishers = publishers.size;
      }
      if (!hasVideoTimestamp && distinctMediaPublishers < 2) {
        throw new BadRequestError("a blunder requires a primary source or two independent media sources");
      }
    }

    if (record.get("card_quote")) {
      const quote = record.get("quote") || "";
      if (!quote.includes(record.get("card_quote"))) {
        throw new BadRequestError("card_quote must be a continuous excerpt of quote");
      }
    }

    if (type === "action" && record.get("action_kind") === "legal_case") {
      const status = record.get("legal_status") || "";
      const later = ["suspect", "charged", "convicted", "acquitted", "dropped", "appeal"];
      if (later.indexOf(status) >= 0) {
        let hasOfficial = false;
        let mediaPublishers = new Set();
        for (const id of sourceIds) {
          const source = app.findRecordById("sources", id);
          if (source.get("kind") === "official" && source.get("is_specific")) hasOfficial = true;
          if (source.get("kind") === "media" && source.get("is_specific")) mediaPublishers.add(source.get("publisher"));
        }
        if (!hasOfficial && mediaPublishers.size < 2) {
          throw new BadRequestError("legal case status requires an official source or two independent media sources");
        }
      }
      if (legalStatus !== "convicted") {
        const badTitle2 = (title || "").toLowerCase().indexOf("koruptor") >= 0;
        const badSummary2 = (summary || "").toLowerCase().indexOf("koruptor") >= 0;
        if (badTitle2 || badSummary2) throw new BadRequestError("koruptor is only allowed when convicted");
      }
    }

    e.next();
  }, "records");

  onRecordUpdate((e) => {
    const record = e.record;
    const app = e.app;
    const type = record.get("type");
    const title = record.get("title") || "";
    const summary = record.get("summary") || "";
    const context = record.get("context") || "";
    const occurredAt = record.get("occurred_at");
    const legalStatus = record.get("legal_status") || "";
    const bannedRaw = (function () {
      try {
        var raw = $os.readFile("/pb/config/banned-words.txt");
        if (typeof raw === "string") return raw;
        var chars = [];
        for (var i = 0; i < raw.length; i++) chars.push(String.fromCharCode(raw[i]));
        return chars.join("");
      } catch (err) {
        return "bodoh\ngoblok\ntolol\nbego\nngawur\nasal bunyi\nmemalukan\nparah\npembohong\nmunafik\nkoruptor\nblunder";
      }
    })();
    const bannedWords = bannedRaw.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);

    var badTitle = "";
    var lowerTitle = (title || "").toLowerCase();
    for (var i = 0; i < bannedWords.length; i++) {
      var word = bannedWords[i].toLowerCase();
      if (lowerTitle.indexOf(word) >= 0) {
        if (word === "koruptor" && legalStatus === "convicted") continue;
        badTitle = bannedWords[i];
        break;
      }
    }
    if (badTitle) throw new BadRequestError("banned word in title: " + badTitle);
    var badSummary = "";
    var lowerSummary = (summary || "").toLowerCase();
    for (var i = 0; i < bannedWords.length; i++) {
      var word = bannedWords[i].toLowerCase();
      if (lowerSummary.indexOf(word) >= 0) {
        if (word === "koruptor" && legalStatus === "convicted") continue;
        badSummary = bannedWords[i];
        break;
      }
    }
    if (badSummary) throw new BadRequestError("banned word in summary: " + badSummary);

    if (context.length < 40) throw new BadRequestError("context must be at least 40 characters");
    if (!occurredAt) throw new BadRequestError("occurred_at is required");
    if (new Date(occurredAt) > new Date()) throw new BadRequestError("occurred_at cannot be in the future");
    const followUpCreate = record.get("follow_up_status");
    if (followUpCreate === "no_response") {
      const days = (Date.now() - new Date(occurredAt).getTime()) / 86400000;
      if (days < 14) throw new BadRequestError("no_response requires 14 days");
    }

    if (record.get("card_quote")) {
      const quote = record.get("quote") || "";
      if (!quote.includes(record.get("card_quote"))) {
        throw new BadRequestError("card_quote must be a continuous excerpt of quote");
      }
    }

    // Original verification status.
    let originalStatus = "";
    try {
      const original = app.findRecordById("records", record.id);
      originalStatus = original.get("verification_status");
    } catch (err) {
      originalStatus = "";
    }
    const newStatus = record.get("verification_status");

    // Require public change note when editing a verified record.
    let publicChangeNote = "";
    try {
      const info = (typeof e.requestInfo === "function") ? e.requestInfo() : null;
      const body = info && (info.body || info.data);
      if (body && body.public_change_note) publicChangeNote = String(body.public_change_note);
    } catch (err) {
      publicChangeNote = "";
    }

    let originalRecord = null;
    try {
      originalRecord = app.findRecordById("records", record.id);
    } catch (err) {
      originalRecord = null;
    }

    const changed = originalRecord && JSON.stringify(originalRecord.export ? originalRecord.export() : {}) !== JSON.stringify(record.export ? record.export() : {});
    // Use a simpler changed detection: compare a few fields.
    let hasChanged = false;
    if (originalRecord) {
      const fieldsToCompare = ["title", "summary", "context", "quote", "occurred_at", "verification_status", "blunder_category", "follow_up_status"];
      for (const field of fieldsToCompare) {
        if (originalRecord.get(field) !== record.get(field)) {
          hasChanged = true;
          break;
        }
      }
    }

    if (originalStatus === "verified" && newStatus === "verified") {
      if (!publicChangeNote.trim()) {
        throw new BadRequestError("public_change_note is required when editing a verified record");
      }
    }

    // Withdrawal notice: if a verified record is rejected, require a public note.
    if (originalStatus === "verified" && newStatus === "rejected") {
      const note = record.get("rejection_reason") || "";
      if (!note.trim()) {
        throw new BadRequestError("rejection_reason is required when withdrawing a public record");
      }
    }

    // Verification-time checks.
    if (newStatus === "verified") {
      if (!record.get("privacy_confirmed")) throw new BadRequestError("privacy_confirmed is required");
      const sourceIds2 = record.get("sources") || [];
      let hasSpecific = false;
      for (const id of sourceIds2) {
        const source = app.findRecordById("sources", id);
        if (source.get("is_specific") && (source.get("kind") === "official" || source.get("kind") === "media")) hasSpecific = true;
      }
      if (!hasSpecific) throw new BadRequestError("at least one specific official or media source is required");
      const blunderCategory2 = record.get("blunder_category") || "";
      if (blunderCategory2) {
        if (!record.get("clarification_checked")) throw new BadRequestError("clarification_checked is required for a blunder");
        if (blunderCategory2 === "factually_wrong") {
          if (!(record.get("fact_check") || "").trim()) throw new BadRequestError("fact_check is required");
          if (!(record.get("fact_check_sources") || []).length) throw new BadRequestError("fact_check_sources is required");
        }
        if (blunderCategory2 === "insensitive" || blunderCategory2 === "out_of_touch") {
          if (!(record.get("blunder_reason") || "").trim()) throw new BadRequestError("blunder_reason is required");
        }
        if (blunderCategory2 === "out_of_touch") {
          if (!(record.get("fact_check") || "").trim() && !(record.get("fact_check_sources") || []).length) throw new BadRequestError("out_of_touch requires evidence");
        }
        if (blunderCategory2 === "self_contradiction") {
          const contradicts = record.get("contradicts_record");
          if (!contradicts) throw new BadRequestError("contradicts_record is required");
          const earlier = app.findRecordById("records", contradicts);
          if (earlier.get("person") !== record.get("person")) throw new BadRequestError("contradicts_record must be by the same person");
          if (earlier.get("verification_status") !== "verified") throw new BadRequestError("contradicted record must be verified");
          if ((earlier.get("occurred_at") || "") >= (record.get("occurred_at") || "")) throw new BadRequestError("contradicted record must be earlier");
        }
        const hasVideoTimestamp = !!(record.get("video_url") && record.get("video_start_seconds") !== null && record.get("video_start_seconds") !== undefined);
        if (!hasVideoTimestamp) {
          const publishers = new Set();
          for (const id of sourceIds2) {
            const source = app.findRecordById("sources", id);
            if (source.get("kind") === "media" && source.get("is_specific")) publishers.add(source.get("publisher"));
          }
          if (publishers.size < 2) throw new BadRequestError("a blunder requires a primary source or two independent media sources");
        }
      }
      const legalStatus2 = record.get("legal_status") || "";
      if (record.get("action_kind") === "legal_case" && ["suspect","charged","convicted","acquitted","dropped","appeal"].indexOf(legalStatus2) >= 0) {
        let hasOfficial = false;
        let mediaPublishers = new Set();
        for (const id of sourceIds2) {
          const source = app.findRecordById("sources", id);
          if (source.get("kind") === "official" && source.get("is_specific")) hasOfficial = true;
          if (source.get("kind") === "media" && source.get("is_specific")) mediaPublishers.add(source.get("publisher"));
        }
        if (!hasOfficial && mediaPublishers.size < 2) throw new BadRequestError("legal case status requires an official source or two independent media sources");
      }
      if (legalStatus2 !== "convicted") {
        const t = (record.get("title") || "").toLowerCase();
        const s = (record.get("summary") || "").toLowerCase();
        if (t.indexOf("koruptor") >= 0 || s.indexOf("koruptor") >= 0) throw new BadRequestError("koruptor is only allowed when convicted");
      }
      const followUp = record.get("follow_up_status");
      if (followUp === "no_response") {
        const occurred = record.get("occurred_at");
        const days = (Date.now() - new Date(occurred).getTime()) / 86400000;
        if (days < 14) throw new BadRequestError("no_response requires 14 days");
      }
    }

    e.next();

    // Create record_changes entries.
    try {
      if (originalStatus === "verified" && newStatus === "verified" && hasChanged && publicChangeNote.trim()) {
        const changes = app.findCollectionByNameOrId("record_changes");
        const change = new Record(changes);
        change.set("record", record.id);
        change.set("changed_at", new Date().toISOString().slice(0, 10));
        change.set("public_change_note", publicChangeNote.trim());
        change.set("kind", "correction");
        app.save(change);
      }
      if (originalStatus === "verified" && newStatus === "rejected") {
        const changes = app.findCollectionByNameOrId("record_changes");
        const change = new Record(changes);
        change.set("record", record.id);
        change.set("changed_at", new Date().toISOString().slice(0, 10));
        change.set("public_change_note", (record.get("rejection_reason") || "").trim());
        change.set("kind", "withdrawn");
        app.save(change);
      }
    } catch (err) {
      console.error("[records] record_changes failed: " + err);
    }
  }, "records");

  onRecordDelete((e) => {
    e.next();
  }, "records");
}

// Promise updates.
for (const collectionName of ["promise_updates"]) {
  onRecordCreate((e) => {
    const record = e.record;
    const app = e.app;
    const promiseId = record.get("promise");
    const promise = app.findRecordById("records", promiseId);
    if (promise.get("type") !== "promise") throw new BadRequestError("promise must be a promise record");
    const status = record.get("status");
    const effectiveDate = record.get("effective_date");
    if (!effectiveDate) throw new BadRequestError("effective_date is required");
    if (new Date(effectiveDate) > new Date()) throw new BadRequestError("effective_date cannot be in the future");
    const sourceIds = record.get("sources") || [];
    let hasSpecific = false;
    for (const id of sourceIds) {
      const source = app.findRecordById("sources", id);
      if (source.get("is_specific") && (source.get("kind") === "official" || source.get("kind") === "media")) hasSpecific = true;
    }
    if (!hasSpecific) throw new BadRequestError("at least one specific source is required");
    if (status === "kept" || status === "partially_kept" || status === "broken") {
      if (sourceIds.length < 2) throw new BadRequestError("this status requires at least 2 sources");
      let hasOfficial = false;
      for (const id of sourceIds) {
        const source = app.findRecordById("sources", id);
        if (source.get("kind") === "official" && source.get("is_specific")) hasOfficial = true;
      }
      if (!hasOfficial) throw new BadRequestError("this status requires an official source");
    }
    e.next();
  }, collectionName);

  onRecordUpdate((e) => {
    e.next();
  }, collectionName);

  onRecordDelete((e) => {
    e.next();
  }, collectionName);
}

// Replies.
for (const collectionName of ["replies"]) {
  onRecordCreate((e) => {
    const record = e.record;
    const text = record.get("text") || "";
    if (text.length > 2000) throw new BadRequestError("text is too long");
    if (record.get("status") === "declined" && !(record.get("decline_reason") || "").trim()) {
      throw new BadRequestError("decline_reason is required when declining");
    }
    e.next();
  }, collectionName);

  onRecordUpdate((e) => {
    e.next();
  }, collectionName);

  onRecordDelete((e) => {
    e.next();
  }, collectionName);
}