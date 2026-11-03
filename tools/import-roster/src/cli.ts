import { runImport } from "./importer.js";
import { sha256 } from "./pocketbase.js";
import { readFileSync } from "node:fs";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const partiesFile = arg("--parties");
  const rosterFile = arg("--roster");
  const apply = process.argv.includes("--apply");
  if (!partiesFile || !rosterFile) {
    console.error("Usage: import-roster --parties parties.csv --roster roster.csv [--apply]");
    process.exit(2);
  }

  const pbUrl = process.env.PB_URL || "http://127.0.0.1:8090";
  const email = process.env.PB_SUPERUSER_EMAIL || process.env.PB_ADMIN_EMAIL || "";
  const password = process.env.PB_SUPERUSER_PASSWORD || process.env.PB_ADMIN_PASSWORD || "";
  if (!email || !password) {
    console.error("Set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD (or PB_ADMIN_*).");
    process.exit(2);
  }

  const partiesText = readFileSync(partiesFile, "utf8");
  const rosterText = readFileSync(rosterFile, "utf8");

  const report = await runImport({
    mode: apply ? "apply" : "dry_run",
    partiesFile: partiesFile,
    rosterFile: rosterFile,
    pbUrl: pbUrl,
    email: email,
    password: password,
    fileSha256s: {
      [partiesFile]: sha256(partiesText),
      [rosterFile]: sha256(rosterText),
    },
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.errors && report.errors.length > 0) {
    process.exit(1);
  }
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
