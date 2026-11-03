/// <reference path="../pb_data/types.d.ts" />

// Reconcile backup settings from the container environment on every boot.
// PocketBase stores settings in the database, so this keeps the S3 credentials
// and schedule in sync with .env without a manual dashboard step.
//
// The built-in backup cron writes a full pb_data snapshot to the configured
// S3-compatible bucket. No secrets are logged.
onBootstrap((e) => {
  e.next();

  var env = function (key, fallback) {
    var value = $os.getenv(key);
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    return value;
  };

  var envBool = function (key, fallback) {
    var raw = String(env(key, fallback ? "true" : "false")).toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes";
  };

  try {
    var settings = $app.settings();
    var changed = false;
    var enabled = envBool("PB_BACKUP_S3_ENABLED", false);

    if (enabled) {
      var desired = {
        enabled: true,
        bucket: env("PB_BACKUP_S3_BUCKET", ""),
        region: env("PB_BACKUP_S3_REGION", "auto"),
        endpoint: env("PB_BACKUP_S3_ENDPOINT", ""),
        accessKey: env("PB_BACKUP_S3_ACCESS_KEY", ""),
        secret: env("PB_BACKUP_S3_SECRET", ""),
        forcePathStyle: envBool("PB_BACKUP_S3_FORCE_PATH_STYLE", true),
      };

      var missing = [];
      var required = ["bucket", "region", "endpoint", "accessKey", "secret"];
      for (var i = 0; i < required.length; i++) {
        if (!desired[required[i]]) {
          missing.push(required[i]);
        }
      }

      if (missing.length > 0) {
        console.error(
          "[backups] PB_BACKUP_S3_ENABLED is true but these values are empty: " +
            missing.join(", "),
        );
        return;
      }

      var s3 = settings.backups.s3;
      for (var key in desired) {
        if (s3[key] !== desired[key]) {
          s3[key] = desired[key];
          changed = true;
        }
      }

      var cron = env("PB_BACKUP_CRON", "0 2 * * *");
      var keep = parseInt(env("PB_BACKUP_KEEP", "14"), 10);
      if (!(keep > 0)) {
        keep = 14;
      }

      if (settings.backups.cron !== cron) {
        settings.backups.cron = cron;
        changed = true;
      }
      if (settings.backups.cronMaxKeep !== keep) {
        settings.backups.cronMaxKeep = keep;
        changed = true;
      }
    } else {
      // Do not leave a cron job writing backups to local disk on the
      // 10 GB server when remote backups are explicitly disabled.
      if (settings.backups.s3.enabled) {
        settings.backups.s3.enabled = false;
        changed = true;
      }
      if (settings.backups.cron) {
        settings.backups.cron = "";
        changed = true;
      }
    }

    if (changed) {
      $app.save(settings);
      console.log("[backups] settings reconciled from environment");
    }
  } catch (err) {
    console.error("[backups] failed to reconcile settings: " + err);
  }
});
