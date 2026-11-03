# Restore a Pelayan Rakyat backup

PocketBase's scheduled backup is a ZIP snapshot of the whole `pb_data`
directory. Restoring means replacing the `pb_data` volume with the contents of
that ZIP, then starting the stack again.

This procedure works for a fresh local container and for a fresh server. It
assumes the repository's `infra/docker-compose.yml` and a filled-in `.env`
are present.

> **Stop before deleting anything.** The current volume is removed in step 4.
> If it contains anything you might still need, export a manual backup first.

## 1. Find the backup

In the bucket (Cloudflare R2, Backblaze B2 or another S3-compatible store),
automatic backups are named like:

```
@auto_pb_backup_pelayan_rakyat_20261102T020000Z.zip
```

Download the newest one. With the AWS CLI:

```bash
aws s3 cp \
  "s3://$PB_BACKUP_S3_BUCKET/@auto_pb_backup_pelayan_rakyat_YYYYMMDDTHHMMSSZ.zip" \
  ./restore.zip \
  --endpoint-url "$PB_BACKUP_S3_ENDPOINT" \
  --region "$PB_BACKUP_S3_REGION"
```

For R2, the endpoint is `https://<account-id>.r2.cloudflarestorage.com` and
the region is `auto`. For B2, use `https://s3.<region>.blazeb2.com` and the
bucket's region (for example `us-west-004`).

Verify the download:

```bash
unzip -t restore.zip
```

## 2. Stop the stack

```bash
cd /opt/pelayan-rakyat
docker compose --env-file .env -f docker-compose.yml down
```

## 3. Start a clean data volume

The Compose project is named `pelayan-rakyat`, so the data volume is
`pelayan-rakyat_pb_data`.

```bash
docker volume create pelayan-rakyat_pb_data
```

## 4. Replace the volume contents with the backup

This deletes the old contents of the volume. Run it only after step 1.

```bash
docker run --rm \
  -v pelayan-rakyat_pb_data:/pb_data \
  -v "$PWD/restore.zip:/restore.zip:ro" \
  alpine:3.24.3 \
  sh -c 'rm -rf /pb_data/* /pb_data/.[!.]* /pb_data/..?* 2>/dev/null; unzip -q /restore.zip -d /pb_data; chown -R 0:0 /pb_data'
```

The ZIP contains `data.db`, `auxiliary.db`, `storage/`, `backups/` and the
other PocketBase runtime files at its root. Do not extract it into a
subdirectory.

## 5. Start and verify

```bash
cd /opt/pelayan-rakyat
docker compose --env-file .env -f docker-compose.yml up -d
docker compose --env-file .env -f docker-compose.yml ps
```

Checks:

1. `curl -fsS http://127.0.0.1/api/health` returns `200`.
2. Open `/_/` from an allowlisted IP and sign in with the superuser account
   that existed at backup time.
3. Find the test record that was created before the backup.
4. Confirm the dashboard's backups page still lists the expected backups
   (or that the new scheduled backup runs on the next cron tick).

If the restore is on a different host, make sure `PB_ADMIN_EMAIL` and
`PB_ADMIN_PASSWORD` in `.env` are the credentials you expect. The entrypoint
only creates a superuser when `data.db` is absent; a restored database keeps
its existing accounts.

## Restore through the dashboard (alternative)

If the stack is already running and you only need to roll back data:

1. Sign in at `/_/` from an allowlisted IP.
2. Open **Settings → Backups**.
3. Upload the ZIP, then choose **Restore**.
4. PocketBase restarts itself. Re-check `/api/health` and the test record.

Use the manual volume method for a fresh server where the dashboard is not
reachable yet.

## After a restore

- Re-run the uptime check and confirm both `/` and `/api/health` are green.
- Check that the next scheduled backup appears in the bucket.
- If the restored database predates a migration that is now in the repo,
  PocketBase applies the committed migrations on the next start. Review the
  logs if a migration fails.
