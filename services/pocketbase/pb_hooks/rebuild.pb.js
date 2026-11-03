/// <reference path="../pb_data/types.d.ts" />

const PUBLIC_COLLECTIONS = ["parties", "people", "positions", "status_events"];

for (const collectionName of PUBLIC_COLLECTIONS) {
  onRecordCreate((e) => {
    const status = e.record.get("verification_status");
    if (status === "verified") {
      try {
        $os.writeFile(($os.getenv("PB_SITE_DIRTY_FILE") || "/pb_data/site_dirty"), "1");
      } catch (err) {
        console.error("[rebuild] cannot mark dirty: " + err);
      }
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
      try {
        $os.writeFile(($os.getenv("PB_SITE_DIRTY_FILE") || "/pb_data/site_dirty"), "1");
      } catch (err) {
        console.error("[rebuild] cannot mark dirty: " + err);
      }
    }
    e.next();
  }, collectionName);

  onRecordDelete((e) => {
    const status = e.record.get("verification_status");
    if (status === "verified") {
      try {
        $os.writeFile(($os.getenv("PB_SITE_DIRTY_FILE") || "/pb_data/site_dirty"), "1");
      } catch (err) {
        console.error("[rebuild] cannot mark dirty: " + err);
      }
    }
    e.next();
  }, collectionName);
}

cronAdd("site_rebuild", "*/10 * * * *", () => {
  let dirty = false;
  try {
    dirty = $os.readFile(($os.getenv("PB_SITE_DIRTY_FILE") || "/pb_data/site_dirty")) === "1";
  } catch (err) {
    dirty = false;
  }
  if (!dirty) {
    return;
  }

  const token = $os.getenv("GITHUB_TOKEN");
  const repository = $os.getenv("GITHUB_REPOSITORY");
  if (!token || !repository) {
    console.error("[rebuild] GITHUB_TOKEN or GITHUB_REPOSITORY is missing");
    return;
  }

  try {
    $http.send({
      url: "https://api.github.com/repos/" + repository + "/dispatches",
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "User-Agent": "pelayan-rakyat",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: "content_changed" }),
    });
    $os.writeFile(($os.getenv("PB_SITE_DIRTY_FILE") || "/pb_data/site_dirty"), "0");
  } catch (err) {
    console.error("[rebuild] repository_dispatch failed: " + err);
  }
});