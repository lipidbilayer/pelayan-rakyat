/// <reference path="../pb_data/types.d.ts" />


const TRACKED_COLLECTIONS = [
  "parties", "people", "institutions", "dapil", "sources", "positions",
  "status_events", "topics", "records", "promise_updates", "replies",
];

for (const collectionName of TRACKED_COLLECTIONS) {
  onRecordCreate((e) => {
    var name = "";
    try {
      name = e.record.collection().name;
    } catch (inner) {
      name = "unknown";
      console.error("[revisions] collection name error: " + inner);
    }

    if (name === "positions") {
      var party = e.record.get("party");
      if (party) {
        var appointmentType = e.record.get("appointment_type");
        var institutionId = e.record.get("institution");
        if (institutionId) {
          var institution = e.app.findRecordById("institutions", institutionId);
          var isPartisan = institution.get("is_partisan");
          if (appointmentType === "appointed" || !isPartisan) {
            throw new BadRequestError(
              "party must be empty for non-partisan institutions or appointed positions",
            );
          }
        }
      }
    }

    try {
      e.next();
    } catch (inner) {
      console.error("[revisions] e.next failed: " + inner);
      throw inner;
    }

    try {
      var createdExport = null;
      try {
        createdExport = e.record.publicExport();
      } catch (inner) {
        createdExport = null;
      }

      var revisions = e.app.findCollectionByNameOrId("revisions");
      var revision = new Record(revisions);
      revision.set("target_collection", name);
      revision.set("target_id", e.record.id);
      revision.set("action", "create");
      revision.set("before", null);
      revision.set("after", createdExport);

      var actorId = "";
      try {
        var info = (typeof e.requestInfo === "function") ? e.requestInfo() : null;
        var auth = info && (info.auth || info.authRecord);
        if (auth && auth.collectionName === "users" && auth.id) {
          actorId = auth.id;
        }
      } catch (inner) {
        actorId = "";
      }
      if (actorId) {
        revision.set("actor", actorId);
      }

      var batchId = "";
      try {
        var info2 = (typeof e.requestInfo === "function") ? e.requestInfo() : null;
        var headers = info2 && (info2.headers || info2.Headers);
        if (headers) {
          batchId = headers["x-import-batch"] || headers["X-Import-Batch"] || "";
        }
      } catch (inner) {
        batchId = "";
      }
      if (batchId) {
        revision.set("import_batch", batchId);
      }

      e.app.save(revision);
    } catch (err) {
      console.error("[revisions] create failed: " + err);
    }
  }, collectionName);

  onRecordUpdate((e) => {
    var name = "";
    try {
      name = e.record.collection().name;
    } catch (inner) {
      name = "unknown";
    }
    var app = e.app;

    var original = null;
    try {
      original = app.findRecordById(name, e.record.id);
    } catch (err) {
      original = null;
    }

    if (name === "positions") {
      var party = e.record.get("party");
      if (party) {
        var appointmentType = e.record.get("appointment_type");
        var institutionId = e.record.get("institution");
        if (institutionId) {
          var institution = app.findRecordById("institutions", institutionId);
          var isPartisan = institution.get("is_partisan");
          if (appointmentType === "appointed" || !isPartisan) {
            throw new BadRequestError(
              "party must be empty for non-partisan institutions or appointed positions",
            );
          }
        }
      }
    }

    if (original) {
      var originalStatus = original.get("verification_status");
      var newStatus = e.record.get("verification_status");
      if (originalStatus === "verified" && newStatus === "verified") {
        var originalComparable = "";
        var newComparable = "";
        try {
          var od = original.publicExport();
          delete od.id;
          delete od.created;
          delete od.updated;
          delete od.verification_status;
          delete od.verified_at;
          delete od.verified_by;
          originalComparable = JSON.stringify(od);
        } catch (inner) {
          originalComparable = "";
          console.error("[revisions] original export error: " + inner);
        }
        try {
          var nd = e.record.publicExport();
          delete nd.id;
          delete nd.created;
          delete nd.updated;
          delete nd.verification_status;
          delete nd.verified_at;
          delete nd.verified_by;
          newComparable = JSON.stringify(nd);
        } catch (inner) {
          newComparable = "";
          console.error("[revisions] new export error: " + inner);
        }
        if (originalComparable !== newComparable) {
          e.record.set("verification_status", "needs_verification");
          e.record.set("verified_at", "");
          e.record.set("verified_by", "");
        }
      }
    }

    try {
      e.next();
    } catch (inner) {
      console.error("[revisions] e.next failed: " + inner);
      throw inner;
    }

    try {
      var overrideAction = null;
      try {
        var info = (typeof e.requestInfo === "function") ? e.requestInfo() : null;
        var headers = info && (info.headers || info.Headers);
        if (headers) {
          overrideAction = headers["x-revision-action"] || headers["X-Revision-Action"];
        }
      } catch (inner) {
        overrideAction = null;
      }

      var action = overrideAction || "update";
      if (!overrideAction) {
        var originalStatus2 = original ? original.get("verification_status") : "";
        var newStatus2 = e.record.get("verification_status");
        if (newStatus2 === "verified" && originalStatus2 !== "verified") {
          action = "verify";
        } else if (newStatus2 === "rejected" && originalStatus2 !== "rejected") {
          action = "reject";
        }
      }

      var beforeExport = null;
      var afterExport = null;
      try {
        beforeExport = original ? original.publicExport() : null;
      } catch (inner) {
        beforeExport = null;
      }
      try {
        afterExport = e.record.publicExport();
      } catch (inner) {
        afterExport = null;
      }

      var revisions = app.findCollectionByNameOrId("revisions");
      var revision = new Record(revisions);
      revision.set("target_collection", name);
      revision.set("target_id", e.record.id);
      revision.set("action", action);
      revision.set("before", beforeExport);
      revision.set("after", afterExport);

      var actorId = "";
      try {
        var info2 = (typeof e.requestInfo === "function") ? e.requestInfo() : null;
        var auth = info2 && (info2.auth || info2.authRecord);
        if (auth && auth.collectionName === "users" && auth.id) {
          actorId = auth.id;
        }
      } catch (inner) {
        actorId = "";
      }
      if (actorId) {
        revision.set("actor", actorId);
      }

      var batchId = "";
      try {
        var info3 = (typeof e.requestInfo === "function") ? e.requestInfo() : null;
        var headers2 = info3 && (info3.headers || info3.Headers);
        if (headers2) {
          batchId = headers2["x-import-batch"] || headers2["X-Import-Batch"] || "";
        }
      } catch (inner) {
        batchId = "";
      }
      if (batchId) {
        revision.set("import_batch", batchId);
      }

      app.save(revision);
    } catch (err) {
      console.error("[revisions] update failed: " + err);
    }
  }, collectionName);

  onRecordDelete((e) => {
    var name = "";
    try {
      name = e.record.collection().name;
    } catch (inner) {
      name = "unknown";
    }
    var app = e.app;

    var beforeExport = null;
    try {
      beforeExport = e.record.publicExport();
    } catch (inner) {
      beforeExport = null;
    }
    var record = e.record;

    try {
      e.next();
    } catch (inner) {
      console.error("[revisions] e.next failed: " + inner);
      throw inner;
    }

    try {
      var revisions = app.findCollectionByNameOrId("revisions");
      var revision = new Record(revisions);
      revision.set("target_collection", name);
      revision.set("target_id", record.id);
      revision.set("action", "delete");
      revision.set("before", beforeExport);
      revision.set("after", null);

      var actorId = "";
      try {
        var info = (typeof e.requestInfo === "function") ? e.requestInfo() : null;
        var auth = info && (info.auth || info.authRecord);
        if (auth && auth.collectionName === "users" && auth.id) {
          actorId = auth.id;
        }
      } catch (inner) {
        actorId = "";
      }
      if (actorId) {
        revision.set("actor", actorId);
      }

      var batchId = "";
      try {
        var info2 = (typeof e.requestInfo === "function") ? e.requestInfo() : null;
        var headers = info2 && (info2.headers || info2.Headers);
        if (headers) {
          batchId = headers["x-import-batch"] || headers["X-Import-Batch"] || "";
        }
      } catch (inner) {
        batchId = "";
      }
      if (batchId) {
        revision.set("import_batch", batchId);
      }

      app.save(revision);
    } catch (err) {
      console.error("[revisions] delete failed: " + err);
    }
  }, collectionName);
}

// Revisions are append-only, even for superusers using the API.
onRecordUpdate((e) => {
  throw new BadRequestError("revisions are append-only");
}, "revisions");

onRecordDelete((e) => {
  throw new BadRequestError("revisions are append-only");
}, "revisions");