import { defineConfig } from "astro/config";

// SITE_URL is injected by CI or the local shell. The fallback keeps local
// builds working without configuration; canonical URLs are only placeholders.
const site = process.env.SITE_URL || "http://localhost";

export default defineConfig({
  site,
  output: "static",
  build: {
    format: "directory",
  },
  trailingSlash: "ignore",
});
