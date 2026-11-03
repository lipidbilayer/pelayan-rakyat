# Phase 1 report

Date: 2026-11-02
Scope: roster and data model. No public pages.

## What was built

- Phase 0 follow-ups:
  - `/_/` returns 404 on the public Caddy listener and is reachable through the
    loopback admin listener (`http://127.0.0.1:8081`) for SSH tunnels or Tailscale.
  - `deploy.sh` writes the image tag to `.deploy-state` instead of modifying `.env`.
  - Optional `PB_ENCRYPTION_KEY` enables PocketBase settings encryption at rest.
- PocketBase collections and seeds:
  - `parties`, `people`, `institutions`, `dapil`, `sources`, `positions`,
    `status_events`, `revisions`, `import_batches`.
  - `users` gained a `role` select (`admin`, `moderator`, `contributor`).
  - 18 institutions and 13 dapil seeded.
  - Unique indexes, API rules, and hidden internal fields in committed migrations.
- Hooks:
  - append-only `revisions` for every write on the tracked collections;
  - party rule for non-partisan or appointed positions;
  - verified records reset to `needs_verification` when edited.
- Roster importer in `tools/import-roster/`:
  - TypeScript CLI, dry run by default, idempotent upsert, validation, report.
  - 25 passing validation tests with fixtures.
- Moderator screen at `/moderasi` and `/moderasi/posisi`:
  - login, queue, filters, detail, verify, reject, edit, status events.
- Public API rules restrict unauthenticated readers to verified records and hide
  internal fields.

## Verification performed locally

- Migrations apply cleanly to an empty database and run twice without error.
- Importer dry run on the real draft CSVs: 0 errors, 115 warnings.
- Importer apply followed by a second apply: `0 changes`.
- Verified-row protection reset a changed record and reported the field diff.
- Revisions are append-only through the API.
- Anonymous API requests return only verified records and no internal fields.
- Moderator screen builds and is served from `/moderasi`.

## Deviations from the spec

1. MFA is deferred. PocketBase 0.40 supports email OTP, but no SMTP provider is
   configured. The `role` field and moderator screen are implemented; MFA can be
   enabled from the dashboard once SMTP is available.
2. The admin listener uses a loopback Caddy site plus an SSH tunnel by default.
   Binding it to a Tailscale address is documented but not forced.
3. `is_specific` on `sources` is not required, because `false` is a valid value.
4. The importer stores normalized URLs and uses PocketBase relation IDs for
   idempotency.

## Measured idle RAM

| Container | Memory | Compose limit |
|---|---:|---:|
| PocketBase | ~33.5 MiB | 128 MiB |
| Caddy | ~12.4 MiB | 48 MiB |
| Total | ~45.9 MiB | 176 MiB |

## Open questions

- SMTP provider and moderator account emails.
- Whether to publish a verified roster export in a public repository.
- Whether to add a PocketBase settings-encryption key in production.

## Owner actions

1. Review `PHASE-1-IMPORT-REPORT.md` before any `--apply` on production.
2. Create moderator accounts and configure SMTP if MFA is desired.
3. Run the importer with `--apply` after approving the dry run.
4. Verify and reject rows from `/moderasi` on a phone.
5. Confirm a restore drill with the imported roster.
