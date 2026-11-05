/// <reference path="../pb_data/types.d.ts" />

const PUBLIC_COLLECTIONS = ["parties", "people", "positions", "status_events", "records", "promise_updates", "replies"];
const DIRTY_FILE = ($os.getenv("PB_SITE_DIRTY_FILE") || "/pb_data/site_dirty");

for (const collectionName of PUBLIC_COLLECTIONS) {
  onRecordCreate((e) => {
    const status = e.record.get("verification_status");
    if (status === "verified") {
      try { $os.writeFile(DIRTY_FILE, "1"); } catch (err) { console.error("[rebuild] cannot mark dirty: " + err); }
    }
    e.next();
  }, collectionName);

  onRecordUpdate((e) => {
    let originalStatus = "";
    try {
      const original = e.app.findRecordById(e.record.collection().name, e.record.id);
      originalStatus = original.get("verification_status");
    } catch (err) {
      originalStatus = "";
    }
    const newStatus = e.record.get("verification_status");
    if (newStatus === "verified" || originalStatus === "verified") {
      try { $os.writeFile(DIRTY_FILE, "1"); } catch (err) { console.error("[rebuild] cannot mark dirty: " + err); }
    }
    e.next();
  }, collectionName);

  onRecordDelete((e) => {
    const status = e.record.get("verification_status");
    if (status === "verified") {
      try { $os.writeFile(DIRTY_FILE, "1"); } catch (err) { console.error("[rebuild] cannot mark dirty: " + err); }
    }
    e.next();
  }, collectionName);
}