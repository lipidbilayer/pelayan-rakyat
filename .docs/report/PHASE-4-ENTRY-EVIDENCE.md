# Phase 4 entry evidence

Date: 2026-11-06

Evidence commit: `1085f7abcc0fbddd021fa4105e5e746858df2b9a`

Raw `make verify` log: `.docs/report/VERIFY-2026-11-06.log` (731 lines, exit 0)

This report covers only the five items requested before Phase 4: T3.1, T3.8, B1.3, B1.4 and I.6. Every other Phase 1–3 row in `OPEN-ITEMS.md`, including P1.6, stays on the launch checklist and is not claimed here.

## Suite totals from the attached log

| Suite | Result | Log line |
|---|---|---|
| Phase 1 API tests | 11 passed, 0 failed | 645–648 |
| Phase 3 API/build tests | 42 passed, 0 failed | 695–698 |
| Local build guards | 3 passed, 0 failed | 709–712 |
| Playwright | 9 passed | 730 |
| PocketBase memory | 60.28 MiB / 30.71 GiB | 731 |

`make verify` exited 0.

## T3.1 — reject and accept tests for the remaining hook rules

All tests are in `tests/phase3.test.mjs`. Each rule has at least one rejection and one acceptance test, and each fixture satisfies the other hook requirements so a failure is attributable to the rule under test.

### `insensitive` and `out_of_touch` require `blunder_reason`

```text
665:✔ T3.1 hook insensitive: missing blunder_reason is rejected (1.66486ms)
666:✔ T3.1 hook insensitive: blunder_reason is accepted (3.408571ms)
667:✔ T3.1 hook out_of_touch: missing blunder_reason is rejected (1.57815ms)
668:✔ T3.1 hook out_of_touch: blunder_reason is accepted (3.33982ms)
```

### `self_contradiction` requires a verified earlier record by the same person

```text
669:✔ T3.1 hook self_contradiction: missing contradicts_record is rejected (1.855011ms)
670:✔ T3.1 hook self_contradiction: an unverified contradicted record is rejected (6.014481ms)
671:✔ T3.1 hook self_contradiction: a record from another person is rejected (11.307822ms)
672:✔ T3.1 hook self_contradiction: same person, verified and earlier is accepted (12.120792ms)
```

### Legal `suspect` and later states require an official source or two independent media sources

```text
673:✔ T3.1 hook legal suspect: one media source is rejected (1.76211ms)
674:✔ T3.1 hook legal suspect: two independent media sources are accepted (3.87495ms)
675:✔ T3.1 hook legal suspect: an official source is accepted (4.27852ms)
```

### Promise status cannot be set directly on the promise record

The test asserts that `records` has neither a `status` nor a `promise_status` field, that a direct value on a promise create is rejected or ignored, and that `kept` only becomes valid through a `promise_updates` row with enough sources.

```text
676:✔ T3.1 hook promise status: no direct status field exists on records (5.481311ms)
677:✔ T3.1 hook promise status: kept with one media source is rejected (4.353721ms)
678:✔ T3.1 hook promise status: kept with official and independent sources is accepted (7.235621ms)
```

### `privacy_confirmed` is required to verify

```text
679:✔ T3.1 hook privacy_confirmed: verification without it is rejected (5.236111ms)
680:✔ T3.1 hook privacy_confirmed: verification with it is accepted (7.721981ms)
```

## T3.8 — new data-leak test with fresh Phase 3 markers

`tests/t38-seed.mjs` runs before the build and writes five new markers:

- an unverified record's `blunder_reason`;
- a rejected reply's `text`;
- a verified reply's hidden `identity_check`;
- an unverified promise update's `note`;
- a public record's hidden internal `notes`.

`tests/phase3.test.mjs` first proves those rows exist (using the moderator endpoint for hidden fields), then walks every file in `apps/web/dist` and requires zero marker matches.

The seed also exposed a real leak: the `replies` list/view rules only checked the parent record's verification, so rejected reply text was readable anonymously. The new migration `services/pocketbase/pb_migrations/1767600000_phase3_reply_rules.js` requires `verification_status = 'verified'` on the reply itself as well.

```text
  2:[T3.8] seeded 5 leak markers for http://127.0.0.1:8090
681:✔ T3.8 built site leaks no hidden or unverified markers (73.501123ms)
```

## B1.3 — closed API port fails the build and leaves the staging symlink unchanged

`tests/build-guards.test.mjs` points the real Astro build at `127.0.0.1:1`, snapshots the staging link, runs the build, and compares the link afterwards. The log shows exit 1 and an unchanged link.

The sandbox has no deployed `/srv/site` and `/srv` is not writable by the test user, so the run records `/srv/site` as `missing` before and after and also applies the same readlink assertion to a real staging symlink proxy. On a host with a deployed `/srv/site`, the same assertion compares the actual symlink target.

```text
703:[B1.3] exit=1 /srv/site missing -> missing (unchanged=true) staging-proxy /mnt/Data/Workspace/personal/pelayan-rakyat/apps/web/.pelayan-b13-KBKNew/previous-site -> /mnt/Data/Workspace/personal/pelayan-rakyat/apps/web/.pelayan-b13-KBKNew/previous-site (unchanged=true)
704:✔ B1.3 closed-port build fails and leaves /srv/site unchanged (962.694491ms)
```

## B1.4 — 10 then 7 fixture people fails; `ALLOW_DROP=1` passes

`tests/build-guards.test.mjs` runs three real Astro builds against a fixture API:

1. 10 verified people: build succeeds and the new Astro integration writes `last-manifest.json`;
2. 7 verified people: the guard aborts with `Verified people dropped from 10 to 7`;
3. 7 verified people with `ALLOW_DROP=1`: build succeeds.

```text
705:[B1.4] 10-person build=0, 7-person build=1, 7-person ALLOW_DROP=0
706:✔ B1.4 two-build drop guard: 10 then 7 people fails and ALLOW_DROP=1 passes (4842.857508ms)
```

The manifest writer was added in `apps/web/astro.config.mjs` (`write-last-manifest`), so the guard now has a real previous-build count instead of relying on a hand-written file.

## I.6 — committed OFL font loaded by path; missing font fails the build

- Font: `apps/web/fonts/OpenSans-Regular.ttf` (217,360 bytes, committed).
- License: `apps/web/fonts/OFL.txt` (SIL Open Font License 1.1, committed beside the font).
- Loader: `apps/web/src/pages/og/[file].png.ts` reads only `OG_FONT_PATH` or `apps/web/fonts/OpenSans-Regular.ttf`. The old `../fonts` and system-font fallbacks were removed.
- No `fonts-liberation` installation remains in the setup.
- `tests/build-guards.test.mjs` temporarily moves the font, runs the real build, requires a non-zero exit with `OG font missing`, and restores the font.

```text
707:[I.6] font removed: build=1 (OG font missing)
708:✔ I.6 missing committed OFL font fails the build (1075.168589ms)
```

## Test harness note

The verify container disables PocketBase rate limits after startup because the API suite creates many records in a burst; production keeps the committed rate-limit settings. This is test-harness configuration only.
