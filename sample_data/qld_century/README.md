# Century — real drillholes, soils and magnetics of a shale-hosted zinc-lead-silver deposit (Queensland)

The 1992 drilling of the Century deposit in the Lawn Hill district of north-west Queensland (18.72° S, 138.60° E), from the
Geological Survey of Queensland's exploration geochemistry and drillhole database: 37 holes with their downhole surveys, coded
lithology and assays, and 730 soil samples of the same prospect, with a clip of Geoscience Australia's national magnetic grid.
Everything here is real data as published; **nothing is synthesized**.

What the data show (counted from these files): 37 holes, 113 to 546 m deep, 11,735 m in all (35 diamond holes, one
reverse-circulation hole and one with a reverse-circulation pre-collar), nearly all steep (dips of -65° to -90°). The logs are
black shale (286 intervals) and siltstone (285), with breccia, under limestone (31 of the 34 logged holes start in it); 395 of the 825 logged intervals are described
as numbered mineralisation zones, for example "Mineralisation - Zone 1.2 (sulphidic black shale - Zn-Pb-Ag)". The mineralisation
is layered with the shale and siltstone. Of 1,532 assayed samples, 720 hold 1 % zinc or more and 279 hold 10 % or more; the
highest are 37 % zinc, 44 % lead and 600 ppm silver. The soils reach 9,000 ppm zinc and 1,750 ppm lead.

**How well the holes are located.** The database rates each collar: 34 of the 37 are rated good to **100 m** only, and three to
20 m. The coordinates were converted by the database from the 1992 local grid, so the holes sit correctly beside each other, but
do not rely on their absolute position. The rating is kept in `collars.csv`.

Rebuild with:

```
node scripts/samples/build-qld-century.mjs "<the prospect's tables as CSV>" "<the magnetic clip, a GeoTIFF>"
```

Coordinates: **GDA2020 / MGA zone 54 (EPSG:7854)**, as the database gives them. Elevations are the database's regional RL
(Australian Height Datum).

## Files

| File | Rows | What was taken |
|---|---:|---|
| `collars.csv` | 37 | hole_id, x, y, z, length, hole_type (DD, RC, RCD), location_accuracy_m (the database's rating), epsg. One hole of the 38 has no elevation in the database and is left out |
| `survey.csv` | 367 | hole_id, depth, azimuth, dip. The database holds **magnetic** azimuths only. They were turned to grid azimuths by adding 4.9°: the declination of the IGRF model here on 30 September 1992 (5.7° east), corrected for the grid convergence (0.8°) |
| `litho.csv` | 825 | 34 holes: from, to, lithology (the database's standard rock code: BLSH black shale, SLST siltstone, BX breccia, LMST limestone, ROCK unclassified, MDST mudstone, SDST sandstone, SHLE shale), qualifier (SUL sulphidic, CAR carbonaceous, CALC calcareous, SH sheared ...), and the description as logged, spelling and all |
| `assays.csv` | 1,532 | 26 holes: from, to, sample_id, then Zn, Pb and Ag in ppm for every sample; Cu, As, Cd, Co, Mn and Mo in ppm and Fe in per cent for the 317 samples of three holes. Sample lengths are 0.1 to 4.4 m, mostly about 1 m, over the mineralised intervals only (1,484 m) |
| `soils.csv` | 730 | sample_id, x, y, medium, mesh (543 are the -40 mesh fraction; the rest are not stated), then Zn, Pb, Cu and Mn in ppm and Fe in per cent for every sample, and Ag, As, Cd, Co, Ni, Mo, Cr, V and Sb in ppm for some. The database gives no elevation for them |
| `tmi_80m.tif` | 115 × 118 nodes | total magnetic intensity at an 80 m grid, 3 km around the holes (-85 to -26 nT). The field is quiet here: these are sedimentary rocks, and the deposit has no magnetic expression at this scale. The grid is there as context and to try the filters on |

**Below detection.** The database writes a result below the detection limit as a negative number (-1 is "less than 1"). The
files keep them that way, and GeoStrix reads them as below detection. 18 lead values that the source report gave as 0 are held by
the database as below detection, and stay so here.

**What was left out, and why.**

- 154 composite samples in two lab batches. They were cut over whole geological zones (up to 24 m) and lie over the routine
  samples; keeping both would count the same ground twice. The larger batch was analysed for more elements, so those results
  (among them sulphur, nickel and mercury) are not in this sample.
- One assay row whose depths run backwards in the database (from 221.15 to 112 m).
- The gold column: 275 of its 317 values are a plain 0, which is neither a result nor a detection limit, and the highest is
  0.06 ppm.
- One hole with no elevation.

**Changes made to the sources.** The rows of one prospect were cut from the database's tables and given tidy column names; the
database's number format ("$1800.00") was turned into plain numbers; the survey azimuths were turned from magnetic to grid north;
the magnetic grid was resampled (bilinear) from 3 arc-seconds of longitude and latitude to an 80 m grid in MGA zone 54. GDA94 and
GDA2020 positions differ by under 2 m here, far less than a cell, so the grid was placed without a datum shift. No measurement
was altered.

## Licence and attribution

**The drillholes and soils.** Geological Survey of Queensland, *Whole of Queensland Geochemistry databases*, 2024 release
(https://geoscience.data.qld.gov.au/dataset/whole-of-queensland-geochemistry-databases), from open-file company report CR 24817.
© State of Queensland. The Queensland Government's open data catalogue lists the dataset's licence as "Creative Commons
Attribution 4.0" (https://creativecommons.org/licenses/by/4.0/); the catalogue record was read on 12 November 2026. The State of
Queensland does not endorse GeoStrix, and gives the data without warranty.

**The magnetics.** Geoscience Australia, *Total Magnetic Intensity (TMI) Grid of Australia 2019 — seventh edition — 80 m cell
size*. © Commonwealth of Australia (Geoscience Australia) 2019, released under the Creative Commons Attribution 4.0 International
licence (https://creativecommons.org/licenses/by/4.0/). Geoscience Australia does not endorse GeoStrix.

This is historical exploration data from 1992, bundled to learn the software with. It is not a resource estimate and says nothing
about the ground today.
