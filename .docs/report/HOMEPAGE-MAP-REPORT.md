# Homepage map report

Date: 2026-11-11
Evidence commit: Working copy verified with `./scripts/verify.sh` (exit 0)

## 1. Summary

The homepage map is one continuous CSS "world". The camera translates and
scales the same geometry through multiple levels:

1. Indonesia (national)
2. Jawa (island)
3. DKI Jakarta, Banten, and Jawa Barat (province drill-downs)
4. Kota / Kabupaten administrasi

There is no level swap and no cross-fade. DKI Jakarta, Banten, and Jawa Barat
use simplified squary polygonal geometry where shared borders share identical
mathematical coordinates in the Java world space, completely eliminating gaps
and overlaps.

When zoomed into Jakarta, neighbouring Banten and Jawa Barat remain visible and
greyed out, flush against Jakarta's west, south, and east borders, maintaining
seamless geographic context. Furthermore, Banten and Jawa Barat are now fully
drillable into their respective kota and kabupaten regions.

## 2. What was improved

- Refined simplified squary polygons to faceted low-poly shapes with at most 10
  corners each (5 to 10 vertices per polygon across national, island, province, and
  kota levels), fulfilling the "maximum of 10 corners" constraint while eliminating
  rigid rectangular looks.
- Eliminated northern coastal sea notch in DKI Jakarta (`DKI_BASE` and `Jakarta Utara`),
  replacing the deep inland cut with a natural, continuous 10-vertex coastal profile
  (`y = 9%..12%`) that keeps the Jakarta Utara label firmly on land.
- Fixed coastal gaps in Banten: `BANTEN_BASE` and all 8 kotas now share collinear
  perimeter equations, completely preventing sea or background layers from showing
  through along western, southern, and eastern coastlines.
- Shared edges between Banten (`x=19.52%, y=19.28%-29.76%`), DKI Jakarta, and
  Jawa Barat (`y=29.76%, x=19.52%-23.91%` and `x=23.91%, y=19.46%-29.76%`)
  match with 0px gap and 0px overlap.
- Neighboring provinces correctly grey out with `var(--land)` when viewing a
  specific province (e.g. DKI Jakarta is properly greyed out when Banten or
  Jawa Barat is selected).
- Enabled continuous CSS-only zoom and kota/kabupaten layers for Banten
  (`scale(14.003)`) and Jawa Barat (`scale(11.655)`).
- Synchronized breadcrumbs, zoom-out buttons, sidebar panels, and projected
  unscaled labels for all drillable provinces.

## 3. Implementation

| Item | Value |
|---|---|
| Java box (world %) | `left 23.02`, `top 65`, `size 20` |
| DKI box (world %) | `left 26.924`, `top 68.61`, `width 0.878`, `height 2.342` |
| Banten box (world %) | `left 24.162`, `top 68.334`, `width 2.762`, `height 7.142` |
| Jawa Barat box (world %) | `left 26.448`, `top 68.80`, `width 4.762`, `height 8.580` |
| Island camera | `translate(-115.1%, -325%) scale(5)` |
| DKI province/kota camera | `translate(-1118.37%, -2929.55%) scale(42.699)` |
| Banten province camera | `translate(-307.69%, -956.68%) scale(14.003)` |
| Jawa Barat province camera | `translate(-293.88%, -801.86%) scale(11.655)` |

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
