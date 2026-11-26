# Edinburgh Park — epithermal gold-silver prospects with IP, magnetics and soils (Queensland)

Three gold-silver prospects (Fish Creek, Mount Dillon, Molongle) on EPM 15969 west of Bowen (north Queensland), explored by Cleveland Minerals in 2006-2009:
stream-sediment, rock-chip and soil geochemistry, six IP lines, a ground magnetic survey and 23 RC holes. It carries a full QC record: field duplicates and
certified standards in the drill assays and in the soils. Everything here is real company data from one open-file report; nothing is synthesized.

Source: Geological Survey of Queensland open-file report cr058516 (company report by Cleveland Minerals Pty Ltd, 2009), (c) State of Queensland, CC BY 4.0
(creativecommons.org/licenses/by/4.0). Converted and trimmed for GeoStrix: the tables' empty padding rows dropped, the drill and geochemistry tables renamed to
GeoStrix's columns with the units their second row states (iron kept in per cent, gold repeats left out), every person's name left out, the QC samples
marked, the magnetic susceptibility turned to 10^-3 SI, the IP lines' electrodes restored to map coordinates, three IP lines with no electrode positions and
the PDF reports left out.

## What it contains

| | |
|---|---|
| Holes | 23 RC holes (Fish Creek 10, Mount Dillon 10, Molongle 3), 26 survey stations, MGA94 zone 55 (EPSG:28355) |
| Logs | lithology (272 intervals), alteration (162), veins (110), sulphides and magnetite (196, `sulphides.csv`: where no type is logged, the minerals given a percentage name the interval), magnetic susceptibility (1,760 chip intervals) |
| Assays | 832 intervals (2 m and 3 m composites), 20 elements, with 28 field duplicates and 28 OREAS standards marked QC |
| Surface geochemistry | stream sediments (273, two batches), rock chips (174), soils (1,071 with 43 standards and 76 duplicates) |
| Geophysics | IP: 6 lines (3 east-west, 3 north-south), each a table of readings with its electrodes' map positions (C1X / C1Y … P2Y), apparent resistivity and chargeability (Mx); magnetics: the ground survey, 21,366 readings on 30 lines (points) |
| Mapping | the report area (`report_area_epm15969.zip`, a shapefile in GDA2020 longitude / latitude) |
| Terrain, grids | none |
| Size | 2.2 MB, 21 files, with this README and `build-checks.txt` |

## What the data are

- **Geology, from the logs (not the report's label).** Andesite and rhyolite with granite and granodiorite, quartz veins and breccia; propylitic, silica,
  hematite, carbonate and K-feldspar alteration; quartz-calcite veins with pyrite and hematite; pyrite and magnetite are the only sulphide / oxide logged.
  Gold reaches 0.99 ppm in the drilling (32 intervals at 0.1 ppm or more), silver 21 ppm, with arsenic to 200 ppm: a low-grade epithermal gold-silver vein
  system in andesitic to rhyolitic volcanics. Lead and zinc reach the method's 1,000 ppm ceiling in a few intervals (1 and 3): read those as "1,000 or more".
- **QC.** In the drill assays the field duplicates (the second of each DUP1 / DUP2 pair at the same depth, `sample_type` Duplicate, `duplicate_of` the
  original) and the standards (`sample_type` Standard, `standard_id` the OREAS reference) are marked; the rest are Sample. In the soils, the standards and the
  duplicates (with the sample they repeat) likewise, in `qc_type` (the column name the surface-sample import reads as QC). Negative values are the lab's below-detection values, kept.
- **Overlaps.** None in the kept assays or the susceptibility; one lithology and one alteration interval overlap the one before (kept).
- **Surveys.** Every hole has its collar's grid azimuth and dip; three have two downhole camera stations each (grid azimuths, `azimuth_grid`, the magnetic kept beside, `azimuth_magnetic`).
- **IP.** The east-west lines (named by their northing, L7783800 …) gave their electrodes' eastings less 500,000, the north-south lines (named by their
  easting, L563200 …) their northings less 7,700,000: both are restored, so each line file places itself. The contractor's QC flag is kept (`QC` = 1
  accepted; 45 to 403 readings a line are not flagged). Each electrode set was read about four times (895 to 1,699 rows a line); GeoStrix reads each set once (222 to 325 a line). Three more east-west lines in the second IP table carry no electrode positions at all (2,142
  readings): left out. Every line but one passes within 50 m of a hole (the nearest 10 m).
- **CRS.** Everything is MGA94 zone 55 (EPSG:28355): the collars' and samples' Grid_ID (MGA55) and the IP's X_MGA55 / Y_MGA55. The magnetic survey's
  columns are labelled X_MGA56 / Y_MGA56, but they hold zone-55 numbers: read as zone 55 they lie west of Bowen (147.6 E, 20.0 S), over the IP lines and
  20 m from the nearest hole; read as zone 56 they would lie 600 km east, in the Coral Sea. They are given here as zone 55.

## Rebuild

`node scripts/samples/build-gsq-edinburgh-park.mjs "<cr058516 download>"` with the report's download from the GSQ Open Data Portal (the portal's `.zip`, or
the folder it unpacks to). The script prints its checks and writes them to `build-checks.txt`.
