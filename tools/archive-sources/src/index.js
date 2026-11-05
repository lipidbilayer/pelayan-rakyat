import { readFileSync } from "node:fs";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const EMAIL = process.env.PB_SUPERUSER_EMAIL || process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD.");
  process.exit(2);
}

async function auth() {
  const response = await fetch(PB_URL + "/api/collections/_superusers/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) throw new Error("auth failed: " + response.status);
  return (await response.json()).token;
}

async function listSources(token) {
  const items = [];
  let page = 1;
  while (true) {
    const response = await fetch(PB_URL + "/api/collections/sources/records?perPage=200&page=" + page, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await response.json();
    items.push(...(data.items || []));
    if (page >= (data.totalPages || 1)) break;
    page += 1;
  }
  return items;
}

async function update(token, id, body) {
  const response = await fetch(PB_URL + "/api/collections/sources/records/" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("update failed: " + response.status);
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const token = await auth();
  const sources = await listSources(token);
  for (const source of sources) {
    const status = source.archive_status || "pending";
    if (status === "ok") continue;
    // Retry at most 5 times: track attempts in a simple counter via archived_at absence.
    try {
      const response = await fetch("https://web.archive.org/save/" + encodeURIComponent(source.url), {
        method: "GET",
        redirect: "manual",
      });
      const location = response.headers.get("location") || response.headers.get("Location");
      const archivedUrl = location && location.startsWith("http") ? location : "https://web.archive.org/web/*/" + source.url;
      await update(token, source.id, {
        archived_url: archivedUrl,
        archived_at: new Date().toISOString(),
        archive_status: "ok",
      });
      console.log("archived", source.url, "->", archivedUrl);
    } catch (error) {
      await update(token, source.id, {
        archive_status: "failed",
      }).catch(() => {});
      console.error("failed", source.url, error.message);
    }
    await sleep(10000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
