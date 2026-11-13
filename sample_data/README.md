# Sample drillhole dataset

A small synthetic dataset (6 holes, `OR-26-01` through `OR-26-06`) built to exercise every import
type in GeoStrix at once. It's a plausible VMS-style property: a silicified/sulphide-bearing breccia
target (`SILBX`) with a QSP/CHL/SIL alteration halo, quartz-sulphide veining, elevated Au-Ag-Cu-Zn-Pb-As
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

## The BC samples (Harry, Perk-Rocky, Silvertip, Woodjam) are not here

GeoStrix's samples from BC's public assessment reports are no longer in this repository or the installer: BC's
copyright terms do not let GeoStrix redistribute assessment-report data. Harry (report 37584), Perk-Rocky (42317) and
Silvertip (42807) are downloaded from the Province's public servers the first time they are opened in the app, after it
says where from and how big, and are converted on the computer with the same code that built them
(`electron/sampleSources.js`). Woodjam (41597) is not offered: its data package is 1.94 GB. `perk_rocky/` keeps only
its Copernicus terrain, which GeoStrix may share.

## `synthetic_geophysics/` — simulated geophysics

Two simulated Geophysics test files (`geophys_mag_survey.csv`, `geophys_resistivity.tif`) laid over the Harry
property's footprint (EPSG:3156). They used to sit in `harry_property/`; they are GeoStrix's own and stay. See that
folder's README.
