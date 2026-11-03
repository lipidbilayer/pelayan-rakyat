/// <reference path="../pb_data/types.d.ts" />

// Phase 0 baseline settings. Every collection/schema change must be added as
// a committed migration in this directory; production serves with
// --automigrate=false.
migrate(
  (app) => {
    const settings = app.settings();

    settings.meta.appName = "Pelayan Rakyat";
    settings.meta.senderName = "Pelayan Rakyat";

    const siteURL = ($os.getenv("SITE_URL") || "").trim();
    if (siteURL) {
      settings.meta.appURL = siteURL;
    }

    // Built-in rate limiting is disabled by default in PocketBase.
    settings.rateLimits.enabled = true;

    // Caddy overwrites X-Forwarded-For with the real client address before
    // proxying. PocketBase needs this to rate limit per visitor.
    settings.trustedProxy.headers = ["X-Forwarded-For"];
    settings.trustedProxy.useLeftmostIP = false;

    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = false;
    settings.trustedProxy.headers = [];
    app.save(settings);
  },
);
