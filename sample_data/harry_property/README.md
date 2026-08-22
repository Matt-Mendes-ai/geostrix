# Harry Property — real drillhole data (37 holes)

Real, publicly-filed drillhole data from BC's Assessment Report Indexing System (ARIS), assessment
report **#37584** — 37 diamond-drill holes (`17HR-###`) drilled in 2017 at the **Harry property**,
Golden Triangle, BC (Teuton Resources). Sourced from the BC Geological Survey's compiled drillhole
geopackage (`bcgs_ardh.gpkg`, provided by the user) rather than hand-entered — this is real collar
geometry, real lithology logging, and real multi-element assay results, not synthetic.

## What's real vs. synthesized

**Real (extracted directly from the source database):**
- `collars.csv` — 37 holes: x/y/z (EPSG 3156, NAD83 UTM 9N — matches the app's default), azimuth,
  dip, length.
- `litho.csv` — 343 real logged lithology intervals. Unit codes are the property's own shorthand
  (DACT = dacite tuff, VCL = volcaniclastic, FINT = felsic intrusive, SED = sediment, MINT = mafic
  intrusive, BSL = basalt, ANDS = andesite, CAS/OVB = casing/overburden) — not the same code set as
  the original synthetic `sample_data/` dataset one level up, since these are the property's actual
  logging codes.
- `assay_wide.csv` — 6,297 real assay composites: Au/Ag/Cu/Pb/Zn/As (ppm) + Al/Fe/Mg/Ca/Na/K/Ti/S
  (%). Multiple analytical methods per sample (e.g. a routine ICP pass and a high-grade re-assay in
  a different unit) were reconciled to a single consistent unit per element before export — see the
  extraction notes below if reusing this pipeline on another AR number. Below-detection-limit
  results (stored as e.g. `<0.001` in the source) were left blank rather than guessed.

**No real data available, so synthesized (grounded in the real litho/assay data above, same
methodology as the original `sample_data/` set — not random):** `alt.csv`, `vein.csv`,
`geotech.csv`, `mnlgy.csv`, `magsusc.csv`, `structure.csv`. The source database has no alteration,
vein, geotechnical, mineralization-point, magnetic-susceptibility, or structural-orientation tables
at all — only collars, lithology, and assays. Alteration/vein/mineralization zones were placed
around each hole's own real assay anomalies (not arbitrary depths): intervals scoring high on a
simple Au/Cu/Pb/Zn-weighted anomaly score got a QSP/SIL alteration halo, nearby quartz-sulfide
veining, and mineralization points with the sulfide chosen by whichever base metal actually
dominates that interval's real assays (Cu-dominant → chalcopyrite, Pb-dominant → galena, etc.).
Geotech RQD is lower through overburden and through those same anomalous zones. Magnetic
susceptibility is lower in the synthesized alteration and higher in the real mafic units (BSL/MINT/
ANDS). Structure picks are contacts at the real litho boundaries plus a few vein-related picks,
using one consistent regional dip/azimuth trend with per-pick jitter (there's no real orientation
data to draw from). Treat these six files as illustrative, not as the property's actual structural
geology.

**Not present:** a separate `survey.csv` — the source database doesn't have a downhole survey
table for this AR, only collar azimuth/dip/length, so every hole imports via GeoStrix's
straight-hole fallback (a synthesized 2-station survey from the collar's own azimuth/dip). Real
downhole surveys, if the holes deviate meaningfully, aren't captured here.

## Geophysics test data (`geophys_mag_survey.csv`, `geophys_resistivity.tif`)

Two files for exercising the Geophysics module's two importers (TASKS.csv #25 CSV point clouds,
#24 GeoTIFF drape) — **entirely synthetic, not real geophysical data**, but built to sit exactly
over this property's real footprint and tell a consistent, geologically plausible story alongside
the real assay results, the same way `alt.csv`/`vein.csv`/etc. were synthesized above.

- `geophys_mag_survey.csv` — a simulated ground magnetic/IP survey grid: 3,528 points on N-S lines
  100 m apart, stations every 25 m, columns `x,y,z,value,label` (`value` = total-field magnetic
  intensity in nT, `label` = `TMI_nT`). A gentle regional gradient (~53,000–54,000 nT, a realistic
  BC total-field range) has magnetic LOWS superimposed at the property's five most Cu/Au-anomalous
  drill collars (ranked from the real `assay_wide.csv` data, weighted toward Cu and Au) — modelling
  magnetite destruction in the alteration halo around real mineralization, the same narrative
  `magsusc.csv` already uses. `z` sits near the real collars' average elevation (~1150 m) with
  small jitter, i.e. a ground survey rather than an airborne one flown well above terrain.
- `geophys_resistivity.tif` — a matching synthetic apparent-resistivity grid (220×200 cells,
  ohm-m), same five anomaly centers but as conductivity LOWS (resistivity lows) — sulfide
  mineralization is conductive, so this is the complementary IP/resistivity signature a real crew
  would expect to see coincide with the magnetic lows above. Built with Python's `tifffile`
  (ModelPixelScale/ModelTiepoint tags only — no full GeoKey CRS block, same as the app's own
  no-reprojection assumption: it's trusted to already be in the project's EPSG).

Both cover the same extent as the real collars (462,200–464,560 E, 6,176,700–6,180,350 N, EPSG
3156) so they visually line up with the drillholes in the 3D view — import either or both via the
Geophysics module and use "View in 3D" to see them alongside the real Harry property holes.

## Import order

Same as the top-level `sample_data/`: `collars.csv` → `litho.csv` → `alt.csv` → `vein.csv` →
`geotech.csv` → `mnlgy.csv` → `magsusc.csv` → `structure.csv` → `assay_wide.csv` (via the Geochem
module's assay importer). No `survey.csv` to import — skip that step.

## Source

BC Geological Survey compiled Assessment Report Drill Hole (ARDH) geopackage, ARIS assessment
report [#37584](https://apps.nrs.gov.bc.ca/pub/aris) (Harry property, Teuton Resources, 2017).
