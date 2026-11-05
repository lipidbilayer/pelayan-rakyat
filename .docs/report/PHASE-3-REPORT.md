# Phase 3 report

Date: 2026-11-05
Scope: records, promises, replies, public pages and source archiving.

## What was built

- Migrations for `topics`, `records`, `promise_updates`, `record_changes`, `replies`, and source archiving fields.
- 15 seeded topics.
- Hooks enforcing editorial rules: banned words, context length, future dates, source quality, blunder requirements, promise updates, legal-case sources, `card_quote` excerpts, public change notes and withdrawal notices.
- Revisions and rebuild triggers extended to the new public collections.
- Public pages: filled profile Catatan section, `/orang/[slug]/catatan`, `/catatan/[slug]`, `/janji`, `/topik/[code]`, and latest records on the home page.
- OG quote cards for records.
- Source archiving CLI in `tools/archive-sources/`.

## Verification performed locally

- Migrations apply cleanly and run twice without error.
- Banned-word hook blocked a direct API write (`bodoh` in title).
- Astro build succeeds with the new pages and OG images.
- Hook file loads without errors.

## Deviations and gaps

- Playwright tests for moderator workflows are not yet committed.
- Archiving job is a CLI for a dev server, not yet scheduled.
- MFA remains deferred.
- Lighthouse and page-weight measurements were not rerun for Phase 3 pages.

## Owner actions

1. Review and approve the first verified records.
2. Run the source archiving CLI from the dev server.
3. Configure SMTP if MFA is desired.
4. Run Lighthouse and Playwright in CI.
