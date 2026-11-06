import { defineConfig } from "astro/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// SITE_URL is injected by CI or the local shell. The fallback keeps local
// builds working without configuration; canonical URLs are only placeholders.
const site = process.env.SITE_URL || "http://localhost";

// Record the verified-people count of every successful build. The next build
// compares against this file and aborts on a large drop unless ALLOW_DROP=true.
function writeLastManifest() {
  return {
    name: "write-last-manifest",
    hooks: {
      "astro:build:done": ({ dir }) => {
        const outDir = fileURLToPath(dir);
        const built = JSON.parse(readFileSync(join(outDir, "data", "manifest.json"), "utf8"));
        const target = process.env.LAST_MANIFEST_PATH || join(process.cwd(), "last-manifest.json");
        writeFileSync(target, JSON.stringify({ builtAt: built.builtAt, counts: built.counts }, null, 2) + "\n");
      },
    },
  };
}

export default defineConfig({
  site,
  output: "static",
  build: {
    format: "directory",
  },
  trailingSlash: "ignore",
  integrations: [writeLastManifest()],
});
