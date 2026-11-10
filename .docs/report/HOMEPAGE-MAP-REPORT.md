# Homepage map report

Date: 2026-11-10
Evidence commit: `1c229e4`
Raw `make verify` log: `.docs/report/VERIFY-2026-11-10.log` (774 lines, exit 0)

## 1. Summary

The homepage map is now one continuous CSS "world". The camera translates and
scales the same geometry through four levels:

1. Indonesia (national)
2. Jawa (island)
3. DKI Jakarta (province)
4. Kota administrasi (kota)

There is no level swap and no cross-fade. The kota layer lives at DKI's actual
coordinates inside the Java geometry, so province and kota shapes keep the exact
shape they have on the island view. No `<script>` was added; the state machine
is still radio inputs plus `:checked` CSS selectors.

## 2. What was wrong

- The island-to-province step swapped to a different, larger copy of the city
  map (opacity fade) instead of zooming the existing one.
- The city layer used `transform:scaleX(2.6)`, which distorted the province and
  all kota shapes. DKI therefore looked different at province level than on the
  island map.
- The `.pr-java` wrapper intercepted pointer events over the whole Java
  bounding box, so parts of the island were not clickable.

## 3. Implementation

| Item | Value |
|---|---|
| Java box (world %) | `left 23.02`, `top 65`, `size 20` |
| City box (world %) | `left 26.924`, `top 68.61`, `width 0.878`, `height 2.342` |
| Island camera | `translate(-115.1%, -325%) scale(5)` |
| Province/kota camera | `translate(-1118.37%, -2929.55%) scale(42.699)` |

- `CITY_BOX` now matches the real DKI Jakarta bounding box (geoBoundaries ADM1,
  ODbL) so the province silhouette is the actual simplified Jakarta shape rather
  than a rectangle: a western bulge, the Jakarta Bay in the centre, and the
  eastern Cakung arm. The 4.39 x 11.71 slot keeps the 1:1.01 aspect of the real
  region; the camera (`100 / 2.342 = 42.699`) fills the frame height, leaving a
  small sea margin above for Kepulauan Seribu. No axis is stretched.
- The kota layer uses simplified geoBoundaries ADM2 outlines so the six
  administrasi (including Kepulauan Seribu) tile the real silhouette. A pale
  DKI base closes the seams and a grey underlay closes the gap to Banten/Jawa
  Barat while leaving the bay as sea.
- Banten and Jawa Barat coast points were moved to `19.52% 19.01%` and
  `23.91% 19.00%` so DKI sits in its coastal slot without poking into the sea
  or leaving gaps.
- The kota layer is nested inside `.pr-java` at
  `left:15.335%; top:18.045%; width:12%; height:12%`.
- DKI is rendered by the kota layer itself; the separate DKI province polygon
  was removed. A transparent `pr-dki-hit` target covers it at island level.
- `.pr-java` is `pointer-events:none`; child targets re-enable pointer events
  only in the state where they are actionable. Island clicks reach
  `.pr-java-hit`, island-level DKI clicks reach `.pr-dki-hit`, and kota clicks
  reach the kota shapes.
- Map labels are rendered in an unscaled overlay inside `.pr-map-frame`. Their
  frame positions are projected at build time with the same camera constants
  (`CAMS` in `src/pages/index.astro`). This keeps text at 12 px and avoids a
  Chromium paint bug where inversely transformed text inside a heavily scaled
  layer was painted at stale positions. Label fade-in is delayed until the
  0.9 s camera transition finishes.
- Labels are hidden below 720 px, matching the previous responsive behavior.

## 4. Interaction checks

Playwright `tests/map.spec.ts` covers national -> island -> province -> kota and
asserts the camera matrices. Real pointer clicks were also checked manually
against the built site:

| Action | Result |
|---|---|
| Click inside Java | `st-pulau` checked, camera `matrix(5, 0, 0, 5, ...)` |
| Click DKI patch | `st-provinsi` checked, camera `matrix(41.667, 0, 0, 41.667, ...)` |
| Click Jakarta Selatan shape | `st-kota-selatan` checked |
| Click Jakarta Timur label | `st-kota-timur` checked |

## 5. Verification

`make verify` on the evidence commit:

- `tests/phase1.test.mjs`: 11 passed, 0 failed.
- `tests/phase3.test.mjs`: 42 passed, 0 failed.
- `tests/phase4.test.mjs`: 19 passed, 0 failed.
- Build guards: 3 passed, 0 failed.
- Playwright: 10 passed (including the no-script and 360 px guards).
- PocketBase idle RAM: 55.89 MiB, not OOM-killed.

Lighthouse from the same run (Perf / A11y / Best practices):

| Page | Perf | A11y | Best pr. | SEO |
|---|---:|---:|---:|---:|
| `/` | 100 | 100 | 100 | 100 |
| `/dprd` | 100 | 100 | 100 | 100 |
| `/janji` | 100 | 100 | 100 | 100 |
| `/kirim` | 100 | 100 | 100 | 67 |
| `/akun` | 100 | 100 | 100 | 67 |

`/kirim` and `/akun` are intentionally `noindex`, so the SEO audit reports
"Page is blocked from indexing" (67). The reported categories are 100.

## 6. Evidence

```
$ git log -1 --format=%H
1c229e4
$ git status --short
(empty)
```

Raw log: `.docs/report/VERIFY-2026-11-10.log` (774 lines, `make verify` exit 0).
