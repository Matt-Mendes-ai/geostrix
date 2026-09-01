# Synthetic flat-grid dataset (Modeling-module control case)

Built on request: a deliberately boring, near-trivial dataset to isolate whether a modelling problem
is in GemPy's own behaviour or in messy real data feeding it — 100% synthetic, not real assay/geology
data, don't use it for anything but testing.

- **100 drillholes** on a regular 10×10 grid, 50 m spacing (450 m × 450 m footprint), hole IDs
  `FG-0101` .. `FG-1010` (row-column).
- **Flat topography** — every collar at the same elevation (1200 m), so there's no terrain-relief
  contribution to contact-depth variation to account for.
- **Vertical holes** (azimuth 0, dip -90 — this app's CSV convention is negative = down), 250 m long,
  no `survey.csv` — a straight hole needs none (see `desurveyHole`'s own "no survey stations" branch).
- **5 flat-lying units in every hole, same order, same thicknesses** — `OBN` (overburden), `V1`,
  `S5`, `V5`, `S4` (basement, to hole bottom) — reusing this app's own existing `UNIT_NAMES`/
  `LITHO_COLORS` codes (`src/lib/layers.js`) rather than inventing new ones, so they render with
  real, already-defined colours/labels.
- **Contact depths vary only gently** — every internal contact (base of OBN, base of V1, base of S5,
  base of V5) gets the exact same smooth, shared warp added to its nominal depth (a low-frequency
  `sin(i)·cos(j)` function of grid position, not per-unit noise), scaled so the total spread of any
  one contact across all 100 holes is **8 m — safely under the requested 10 m ceiling** (verified
  computationally when the dataset was generated, not eyeballed). Because the warp is identical for
  every contact, the layers stay perfectly parallel (uniform thickness) and never invert order — this
  is "no changes in stratigraphy", just a gentle shared undulation, not a synthetic geological event.
  The very top contact (collar → top of OBN) is pinned at exactly 0 m in every hole, matching the flat
  topography — it is deliberately NOT warped (an early draft of this generator warped it too, which
  put OBN's own top above/below the collar — caught and fixed before this file was written).

## Files & import order

1. `collars.csv` — 100 holes, x/y/z/azimuth/dip/length (EPSG 3156, NAD83 UTM Zone 9N — same as the
   project's default and the other `sample_data/` sets).
2. `litho.csv` — 500 rows (5 per hole), lithology intervals.

No `survey.csv`, `assay_wide.csv`, or any other layer — this dataset exists purely to exercise the
Modeling module's implicit-surface tools (Implicit Model / Stratigraphic Stack) against clean,
known-good input, not to exercise the rest of the app.

## Verified live (2026-09-01)

Imported through the real app UI (both collars and lithology) and confirmed: 100 unique holes, 500
lithology rows with no data problems (every hole has exactly 5 contiguous, non-overlapping intervals
starting at 0 m). Ran the real Stratigraphic Stack tool (via the actual Python/GemPy sidecar, not
mocked) with all 5 units added in youngest-first order — the run correctly gathered 500 interface
points and 5 orientations (100 points per surface, one auto-estimated orientation per surface, since
this dataset has no structure picks), completed, and produced 5 flat, correctly-ordered, non-crossing
surfaces ("Top of OBN" through "Top of S4"), confirmed both in the generated-surfaces list and
visually in the 3D view.
