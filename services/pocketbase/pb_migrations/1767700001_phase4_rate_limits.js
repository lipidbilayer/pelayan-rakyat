/// <reference path="../pb_data/types.d.ts" />

// Production rate limits for Phase 4. The test harness disables rate limiting
// through infra/compose.test.yml only; production always runs this migration.
migrate(
  (app) => {
    const settings = app.settings();
    if ($os.getenv("PB_TEST_DISABLE_RATE_LIMITS") === "true") {
      settings.rateLimits.enabled = false;
    } else {
      settings.rateLimits.enabled = true;
    }

    const rules = settings.rateLimits.rules || [];
    const ensure = (label, maxRequests, duration, audience) => {
      const existing = rules.find((rule) => rule.label === label);
      if (existing) {
        existing.maxRequests = maxRequests;
        existing.duration = duration;
        if (audience !== undefined) existing.audience = audience;
        return;
      }
      rules.push({ label: label, maxRequests: maxRequests, duration: duration, audience: audience || "" });
    };

    // Keep the PocketBase login/baseline limits (Phase 0).
    ensure("*:auth", 2, 3);
    ensure("*:create", 20, 5);
    ensure("/api/batch", 3, 1);
    ensure("/api/", 300, 10);

    // §6.2: per-IP writes to submissions and flags, 20 per hour.
    ensure("submissions:create", 20, 3600);
    ensure("flags:create", 20, 3600);
    ensure("POST /api/pr/submissions", 20, 3600);
    ensure("POST /api/pr/flags", 20, 3600);

    settings.rateLimits.rules = rules;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    const remove = [
      "submissions:create",
      "flags:create",
      "POST /api/pr/submissions",
      "POST /api/pr/flags",
    ];
    settings.rateLimits.rules = (settings.rateLimits.rules || []).filter(
      (rule) => remove.indexOf(rule.label) === -1,
    );
    app.save(settings);
  },
);
