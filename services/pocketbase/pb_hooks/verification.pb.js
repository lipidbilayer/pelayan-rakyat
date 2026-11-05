/// <reference path="../pb_data/types.d.ts" />

const VERIFIED_COLLECTIONS = ["parties", "people", "positions", "records", "promise_updates", "replies"];

for (const collectionName of VERIFIED_COLLECTIONS) {
  onRecordEnrich((e) => {
    e.next();
  }, collectionName);
}

function hasSpecificSource(app, record) {
  const ids = record.get("sources") || [];
  for (const id of ids) {
    const source = app.findRecordById("sources", id);
    if (source.get("is_specific") && (source.get("kind") === "official" || source.get("kind") === "media")) {
      return true;
    }
  }
  return false;
}

for (const collectionName of ["parties", "positions"]) {
  onRecordUpdate((e) => {
    const record = e.record;
    const newStatus = record.get("verification_status");
    if (newStatus === "verified") {
      const ids = record.get("sources") || [];
      let hasSpecific = false;
      for (const id of ids) {
        const source = e.app.findRecordById("sources", id);
        if (source.get("is_specific") && (source.get("kind") === "official" || source.get("kind") === "media")) {
          hasSpecific = true;
        }
      }
      if (!hasSpecific) throw new BadRequestError("verification requires a specific official or media source");
    }
    e.next();
  }, collectionName);
}

