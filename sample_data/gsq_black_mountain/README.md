# Black Mountain — greisen molybdenum under IP and ground magnetics (Queensland)

A molybdenum-tungsten prospect on EPM 14432 near Mingela, south of Townsville (north Queensland), drilled by Minotaur Exploration in 2006 and 2007 after a
gradient-array IP survey, six dipole-dipole IP lines and a ground magnetic survey. Everything here is real company data from
one open-file report; nothing is synthesized. (The holes sit under the IP: see "IP over the holes".)

Source: Geological Survey of Queensland open-file report cr046541 (company report by Minotaur Exploration Ltd, 2007), (c) State of Queensland, CC BY 4.0
(creativecommons.org/licenses/by/4.0). Converted and trimmed for GeoStrix: the two programs' collars, logs and five assay batches joined into one table each
(the composites under a 1 m re-split and the check assays left out), the 2007 collars converted from AGD84 to AGD66, one hole id corrected, the IP lines' station files rewritten as tables, the ground
magnetics thinned to every 4th reading, the downhole IP (no GeoStrix reader yet) and the PDF reports left out.

## What it contains

| | |
|---|---|
| Holes | 24 RC holes, all in AGD66 / AMG zone 55 (EPSG:20255): 10 of 2006 as surveyed, 14 of 2007 converted from AGD84 / AMG zone 55 (EPSG:20355); a collar azimuth and dip each |
| Logs | lithology (218 intervals) |
| Assays | 660 intervals (227 1 m re-splits and 158 4 m composites of 2006, 275 4 m samples of 2007), 16 elements |
| Geophysics | IP: a gradient-array survey (666 readings, points) and 6 dipole-dipole lines (`.dat` on the line chainage with each line's station coordinates, `.stn`); magnetics: the ground survey as Geosoft line data (`ground_mag_lines.xyz`, 38,038 readings, 85 of them with no value) |
| Mapping | the report area (`report_area_epm14432.zip`, a shapefile in GDA2020 longitude / latitude) |
| Terrain, grids | none |
| Size | 3.2 MB, 21 files, with this README and `build-checks.txt` |

## What the data are

- **Geology, from the logs (not the report's label).** Greisen and granite greisen, quartz-muscovite rock and quartz veins in psammitic gneiss, granite
  and hornfels. Molybdenum reaches 1.76 % (ten intervals at 1,000 ppm or more) with tungsten to 6,220 ppm; tin, bismuth, copper and gold are low. A
  greisen-hosted molybdenum-tungsten system, not a porphyry.
- **Two programs, two datums; the sample opens in AGD66.** The 2006 collars are AGD66 (their columns say so, written with thousands separators), the 2007
  collars "AMG84" (AGD84). The gradient array, the IP stations and the magnetics are AGD66 too (their AMG66 / x_agd66 columns), so the 2007 collars are
  converted to AGD66 with the 7-parameter shifts GeoStrix itself uses for EPSG:20355 and EPSG:20255 (each moves 1.6 m); `collars.csv` keeps each
  hole's coordinates as surveyed in `x_source`, `y_source` and `epsg_source`. Every row is EPSG:20255, and a project opened from these files is in
  AGD66 / AMG zone 55 (EPSG:20255): checked in the app. (With both datums left in the collar file, the import took no coordinate system from it, the
  report area's GDA2020 longitude / latitude became the project's, and the collars were misplaced.)
- **Surveys.** Only the collar's azimuth and dip (RC holes); the dips, written positive down, are negative in `survey.csv` as GeoStrix reads them.
- **Assays: five lab batches, no superseded flag.** The 2006 holes were sampled as 4 m composites, then the mineralised parts re-split at 1 m in eight of
  them; the file keeps the 1 m re-splits and the composites they do not cover (57 composites under a re-split left out), so no interval is counted twice.
  Five multi-element check assays of composites and one 1 m Mo / W re-assay are left out too. The 2006 tables state a unit only for Au, Fe, S and Ti (the
  rest are ppm, as the 2007 table states for the same lab suite); the 2007 Fe, S and Ti were in ppm and are given in per cent, its gold in ppm.
  Below detection is written two ways: `<` and the limit in the 1 m re-splits (kept, 827 cells), and 0 in the composites and the 2007 table (2,172
  cells): when the import asks what the zeros mean, answer "Below detection". An empty cell is an element that batch did not assay.
- **QC.** None in the tables (no standards, blanks or duplicates reported).
- **One hole id.** The 2006 collar table calls hole 11 BMRC02-11; its logs and every assay table call it BMRC06-11, which is used.
- **Overlaps.** None in the lithology or the kept assays.
- **IP over the holes.** 22 of the 24 holes lie inside the gradient-array survey's extent and every collar is within 55 m of one of its readings (median
  10 m); the dipole-dipole lines pass 7 to 30 m from the nearest hole.
- **Downhole IP** was read in 7 holes (in the report): GeoStrix does not read downhole IP yet, so it is not here.

## Rebuild

`node scripts/samples/build-gsq-black-mountain.mjs "<cr046541 download>"` with the report's download from the GSQ Open Data Portal (the portal's `.zip`, or
the folder it unpacks to). The script prints its checks and writes them to `build-checks.txt`.
