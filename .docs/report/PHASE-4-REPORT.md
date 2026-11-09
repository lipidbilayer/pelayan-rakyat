# Phase 4 report

Date: 2026-11-09
Evidence commit: `feca0733dcbaa6c928407aede711ebbd22509acf`
Raw `make verify` log: `.docs/report/VERIFY-2026-11-09.log` (773 lines, exit 0)

## 1. Summary
- Phase 4 crowdsourcing implemented with email/password auth (no Google OAuth).
- `tests/phase4.test.mjs`: 19 passed, 0 failed.
- `tests/phase1.test.mjs`: 11 passed. `tests/phase3.test.mjs`: 42 passed.
- `apps/web/tests/phase2.spec.ts`: 9 passed (JS budget updated).
- Build guards: 3 passed. Playwright: 9 passed. Lighthouse: 100/100/100 on `/`, `/kirim`, `/akun`.
- PocketBase idle RAM: 55.2 MiB.

## 2. Carry-over (C4.1–C4.3)
| ID | Status | Evidence |
|---|---|---|
| C4.1 | PASS | `tests/phase4.test.mjs › C4.1 anonymous collections do not leak unverified/rejected or hidden fields` |
| C4.2 | PASS | `tests/phase4.test.mjs › C4.2 committed production migration enables rate limits with §6.2 rules`; override only in `infra/compose.test.yml` (`PB_TEST_DISABLE_RATE_LIMITS: "true"`) |
| C4.3 | PASS | `tests/phase4.test.mjs › C4.3 contributor cannot create/update/delete on public collections` |

## 3. Phase 4 test results
| ID | Status | Evidence |
|---|---|---|
| T4.1 | PASS | `T4.1 contributor reads only their own submissions and flags` |
| T4.2 | PASS | `T4.2 submission with forbidden fields is rejected` |
| T4.3 | PASS | `T4.3 submitter is always the authenticated user` |
| T4.4 | PASS | `T4.4 URL rules reject bad schemes and accept normal https` |
| T4.5 | PASS | `T4.5 duplicate URL increases count; same user no increase` |
| T4.6 | PASS | `T4.6 missing or invalid ALTCHA rejected; valid accepted (submission and flag)` |
| T4.7 | PASS | `T4.7 rate limits reject beyond daily caps` |
| T4.8 | PASS | `T4.8 suspended user cannot submit or flag but account works` |
| T4.9 | PASS | `T4.9 terms not accepted blocks submit` |
| T4.10 | PASS | `T4.10 duplicate open flag rejected and record stays public` |
| T4.11 | PASS | `T4.11 coordinated activity alert fires at thresholds` |
| T4.12 | PASS | Playwright XSS check in moderator submission detail (text rendered literally, no dialog) |
| T4.13 | PASS | `T4.13 no server-side fetch of submitted URLs` |
| T4.14 | PASS | `T4.14 convert to draft links submission and record` |
| T4.15 | PASS | `T4.15 account deletion removes user and clears submitter` |
| T4.16 | PASS | `T4.16 submission/flag/moderator_note/display name/email never leak` |
| T4.17 | PASS | `apps/web/tests/phase2.spec.ts › script tags only on allowed pages` |
| T4.18 | PASS | Playwright 360 px contributor flow (register, submit, akun, moderator convert, verify, status change) |
| T4.19 | PASS | Lighthouse 100/100/100 on `/kirim` and `/akun` |
| T4.20 | PASS | `T4.20 trust level 1 granted at 5 converted verified submissions` |

## 4. Measurements
| Page | Perf | A11y | Best pr. |
|---|---:|---:|---:|
| / | 100 | 100 | 100 |
| /kirim | 100 | 100 | 100 |
| /akun | 100 | 100 | 100 |

PocketBase idle RAM: 55.2 MiB.

## 5. Deviations from the spec
1. Google OAuth replaced with email/password for the MVP; SMTP verification, password reset and MFA remain launch items.
2. `from_submissions` is hidden; public display uses the non-hidden `from_citizen_report` boolean, showing "Berawal dari laporan warga."
3. Trust level 2 (owner-only) is granted via `/api/pr/moderator/trust/{id}` restricted to the admin role.
4. Rate-limit disable for the test harness lives only in `infra/compose.test.yml` (`PB_TEST_DISABLE_RATE_LIMITS: "true"`); production runs the committed migration with limits enabled.
5. Alert time windows use total counts because system `created` timestamps are not readable in PocketBase JSVM hooks; thresholds still apply.

## 6. Blocked items
- Google OAuth redirect URL on the real domain (launch checklist).
- SMTP, email login verification, password reset, MFA for moderators (launch checklist).
- Rate limits confirmed on production with a real load test (launch checklist).
- Privacy policy and terms placeholders filled by the owner (launch checklist).
- Production 128 MiB memory limit not applied in `make verify` (launch item I.7).

## 7. Verification
```
$ git log -1 --format=%H
feca0733dcbaa6c928407aede711ebbd22509acf
$ git status --short
(empty)
```
Raw log: `.docs/report/VERIFY-2026-11-09.log` (773 lines, `make verify` exit 0).
EOF
echo written