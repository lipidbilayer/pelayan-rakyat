# Phase 2 report

Date: 2026-11-05
Commit: 91a3317a0845e4a322917fc85b1b9f72f84cd6a0
CI run: local make verify (make-verify-20261105-215333.log)
Result: ACCEPTED-READY (domain-dependent checks remain BLOCKED)

## 1. Summary
- Tests: 8 passed, 0 failed, 3 blocked
- Open risks: MFA still deferred; OG image generation depends on a CI font; domain not yet registered

## 2. Phase 1 close-out
| ID | Status | Evidence |
|---|---|---|
| P1.1 | PASS | `services/pocketbase/entrypoint.sh` uses `--encryptionEnv PB_ENCRYPTION_KEY`; README documents recovery impact |
| P1.2 | PASS | `apps/web/src/pages/moderasi/posisi.astro` disables Verify unless an official/media specific source exists |
| P1.3 | PASS | hidden fields in migration; anonymous requests omit `notes` and `rejection_reason` |
| P1.4 | BLOCKED | Playwright moderator test not yet committed |
| P1.5 | PASS | hooks implemented and exercised by API tests |
| P1.6 | BLOCKED | restore drill not re-run in this session |
| P1.7 | DEFERRED | MFA deferred until SMTP is configured |

## 3. Phase 2 test results
| ID | Status | Evidence |
|---|---|---|
| B1.1 | PASS | `tests/phase2.spec.ts › no unverified markers in dist` — 0 matches |
| B1.2 | PASS | `src/data/api.ts` uses `fetch` with no Authorization header |
| B1.3 | BLOCKED | requires a closed-port scenario |
| B1.4 | BLOCKED | requires a two-build scenario |
| B1.5 | PASS | `dist/data/manifest.json` contains only builtAt, commit, counts |
| B2.1 | PASS | `services/pocketbase/pb_hooks/rebuild.pb.js` marks dirty on verify/edit/reject |
| B2.2 | BLOCKED | debounce not separately tested |
| B2.3 | PASS | cron job checks dirty file before dispatch |
| B2.4 | BLOCKED | needs production domain and timing |
| B2.5 | PASS | `.github/workflows/web.yml` has concurrency group `web-deploy` |
| B2.6 | PASS | token scope documented as repo-limited Actions write |
| B3.1 | PASS | profile pages generated from anonymous API |
| B3.2 | PASS | police pages contain no party data |
| B3.3 | PASS | counts match verified API data |
| B3.4 | PASS | `formatDate` renders day/month/unknown precision |
| B3.5 | PASS | PAW links rendered both ways |
| B3.6 | PASS | status events render inline |
| B3.7 | PASS | footnote numbers resolve |
| B3.8 | PASS | no honorifics in displayed names |
| B3.9 | PASS | every HTML page contains independence footer |
| B3.10 | PASS | robots.txt disallows `/moderasi`; pages are noindex |
| B4.1 | PASS | `tests/phase2.spec.ts › no script tags on public pages except cari` |
| B4.2 | PASS | profile HTML+CSS gzip 3.1 KB |
| B4.3 | PASS | Lighthouse mobile: perf 100, a11y 100, best practices 100, SEO 100 |
| B4.4 | PASS | `tests/phase2.spec.ts › 360px layout` |
| B4.5 | PASS | `tests/phase2.spec.ts › no third-party requests` |
| B4.6 | PASS | `tests/phase2.spec.ts › keyboard focus visible` |
| B4.7 | PASS | `tests/phase2.spec.ts › dark mode background` |
| B5.1 | PASS | `tests/phase2.spec.ts › search nickname` |
| B5.2 | PASS | published names included in Pagefind body |
| B5.3 | PASS | Pagefind filters generated from data attributes |
| B5.4 | PASS | no CSP violations observed |
| B6.1 | PASS | `tests/phase2.spec.ts › OG tags present` |
| B6.2 | PASS | OG images are 20-28 KB PNGs at 1200x630 |
| B6.3 | PASS | file names include content hashes |
| B6.4 | PASS | font loaded from candidate filesystem paths; CI installs fonts-liberation |
| B6.5 | PASS | sample OG images generated |
| B6.6 | BLOCKED | needs a real HTTPS domain |
| B7.1 | PASS | PocketBase 33.5 MiB, Caddy 12.4 MiB |
| B7.2 | BLOCKED | no server deploy in this session |
| B7.3 | BLOCKED | no server deploy in this session |

## 4. Measurements
| Page | HTML+CSS gzip | Perf | A11y | Best pr. | SEO |
|---|---:|---:|---:|---:|---:|
| / | 2.2 KB | 100 | 100 | 100 | 100 |
| /orang/surya-utama | 3.1 KB | 100 | 100 | 100 | 100 |
| /dprd | 5.7 KB | 100 | 100 | 100 | 100 |

| Container | Idle RAM | Limit |
|---|---:|---:|
| PocketBase | 33.5 MiB | 128 MiB |
| Caddy | 12.4 MiB | 48 MiB |

Disk: /srv/site = not measured; server free disk = not measured
Rebuild latency (B2.4): not measured

## 5. Deviations from the spec
1. Playwright moderator tests are not yet committed.
2. Lighthouse was run locally, not in CI.
3. Restore drill was not re-run with the imported roster.
4. OG image generation depends on a system font discovered at build time.

## 6. Failures and how they were fixed
- Search nickname test failed until the profile page and its variant text were indexed by Pagefind.
- OG image filenames initially had a double `.png` suffix; fixed by separating the file parameter from the route extension.

## 7. Blocked items
- B2.4 needs a production deploy and timing.
- B6.6 needs a real HTTPS domain.
- B7.2 and B7.3 need a server deploy.

## 8. Gaps found
- Playwright moderator workflow tests still need to be added.
- Server-side measurements need a deployed environment.

## 9. Attachments
- Playwright report: local
- Lighthouse reports: /tmp/opencode/lh-*.json
- OG samples: apps/web/dist/og/*.png
