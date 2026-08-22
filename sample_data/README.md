# Sample drillhole dataset

A small synthetic dataset (6 holes, `OR-26-01` through `OR-26-06`) built to exercise every import
type in GeoStrix at once. It's a plausible VMS-style property: a silicified/sulfide-bearing breccia
target (`SILBX`) with a QSP/CHL/SIL alteration halo, quartz-sulfide veining, elevated Au-Ag-Cu-Zn-Pb-As
assays, lower RQD in the broken breccia, a magnetic-susceptibility low through the altered zone
(magnetite destruction), and structural picks (contacts, a fault + shear zone in the graphitic
argillite, foliation, veins). Not real assay data — don't use it for anything but testing the app.

Coordinates are EPSG 3156 (NAD83 UTM Zone 9N), consistent with the project's default EPSG.

## Files & suggested import order

1. `collars.csv` — 6 holes, x/y/z/azimuth/dip/length
2. `survey.csv` — downhole survey stations every 50m, each hole drifting a steady ~1°/station
   shallower in dip and ~2°/station clockwise in azimuth from its collar orientation (a typical
   real-world deviation trend, replacing the earlier unstructured jitter)
3. `litho.csv` — lithology intervals (unit codes match `src/lib/layers.js` `UNIT_NAMES`)
4. `alt.csv` — alteration intervals
5. `vein.csv` — vein intervals
6. `geotech.csv` — RQD% intervals (3m composites)
7. `mnlgy.csv` — mineralization point observations
8. `magsusc.csv` — magnetic susceptibility (SI units), 5m composites
9. `structure.csv` — structure plane picks (dip/dip-azimuth)
10. `assay_wide.csv` — 2m assay composites: Au/Ag/Cu/Pb/Zn/As + Al/Fe/Mg/Ca/Na/K/Ti majors (enough
    for the Jensen cation plot and Alteration Box Plot; import via the Geochem module's assay
    importer, not the generic layer importer)

All column headers match the aliases GeoStrix's import mapper already looks for, so each file
should auto-map on import without needing to hand-pick columns — but the mapping dialog will still
show up in case you want to double check.

## `harry_property/` — real drillhole data (37 holes)

A second, more realistic dataset: 37 real holes from the **Harry property** (Golden Triangle, BC),
extracted from BC's public ARIS assessment-report drillhole database — real collars, real logged
lithology, real multi-element assays, with only the layer types that database doesn't contain
(alteration, veins, geotech, mineralization points, mag susc, structure) synthesized around the
real anomalous intervals. See `harry_property/README.md` for exactly what's real vs. synthesized
and why. Same import order pattern, minus `survey.csv` (not present for this property — the app's
straight-hole fallback handles it from collar azimuth/dip). It also includes two synthetic
Geophysics-module test files (`geophys_mag_survey.csv`, `geophys_resistivity.tif`) sized to this
property's real footprint — see that folder's README for details.
