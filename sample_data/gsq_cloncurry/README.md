# Little Sandy Creek (Cloncurry) — five holes with downhole EM, ground EM and IP (Queensland)

A copper-gold-cobalt target on EPM 16251 about 150 km south of Cloncurry, in the Eastern Succession of the Mount Isa Inlier (north-west Queensland),
tested by Chinova Resources in 2016-2017: soil and rock-chip sampling and mapping, fixed-loop and in-loop ground EM, a dipole-dipole IP line with its 2D
inversion, five RC and diamond holes, and downhole EM in three of them. Everything here is real company data from one open-file report; nothing is
synthesized.

Source: Geological Survey of Queensland open-file report cr103990 (company report by Chinova Resources Pty Ltd, 2017), (c) State of Queensland, CC BY 4.0
(creativecommons.org/licenses/by/4.0). Converted and trimmed for GeoStrix: the drill and geochemistry tables renamed to GeoStrix's columns (one column per
element, the lab method dropped from the name) and the samplers' names and despatch numbers left out, the true-north survey azimuths turned to grid, the QC
rows marked, the over-range ICP copper replaced by its ore-grade assay, the IP inversion's model given as points, the two MapInfo layers renamed (their file
names carried a person's name), the raw downhole EM files, the inversion's .mod files (no mesh came with them) and the PDF reports left out.

## What it contains

| | |
|---|---|
| Holes | 5 (3 RC, 2 RC with a diamond tail) from 3 collar positions, 66 gyro survey stations, MGA94 zone 54 (EPSG:28354) |
| Logs | lithology (60 intervals; one has no rock code, so the layer shows 59), magnetic susceptibility (747 KT-10 readings), density (34), oriented structure (28 alpha / beta) |
| Assays | 525 intervals (RC chips and half core), 36 elements (ICP41, gold by AA26), 16 QC rows marked |
| Surface geochemistry | 28 rock chips (51 elements), 468 soils (36 elements) |
| Geophysics | downhole EM in 3 holes (SMARTem `.tem`, U / V / axial, with the loops' `.tx`, kept for reference: GeoStrix reads no `.tx`); ground EM: 7 fixed-loop lines (Maxwell `.tem`, the loop's 34 corners in each file, read with it; the same loop as `fixedloop_LSC_FLEM_1.tx`) and 3 in-loop lines; IP: 1 dipole-dipole line (Zonge TQIPdb `.esf`, 422 readings) and the contractor's 2D inversion as 2,901 model points (x, y, z, chargeability, resistivity) |
| Mapping | `lsc_mapping_2017` (55 geology polygons) and `lsc_structure_mapping` (143 structural points), MapInfo TAB |
| Terrain, grids | none |
| Size | 4.9 MB, 41 files, with this README and `build-checks.txt` |

## What the data are

- **Geology, from the logs (not the report's label).** Psammite (PSM, 25 intervals), pegmatite (PEG, 9), schist, amphibolite, pelite and quartz veins, as
  the company coded them; the logged minerals are pyrite and chalcopyrite. Copper reaches 4.32 % over one interval (twelve intervals at 1,000 ppm or more),
  gold 3.78 ppm, cobalt 776 ppm, with iron up to 12 %: an IOCG-style copper-gold-cobalt system in metasediments, in narrow intervals.
- **Survey azimuths were true north** (gyro, AZIMUTHGRIDNAME TrueNorth_CLN): `survey.csv`'s `azimuth_grid` is grid north (the grid convergence here is
  -0.15 degrees); `azimuth_true` is the value logged.
- **QC.** 16 assay rows are QC samples (lab duplicates or standards inserted with a depth): `sample_type` = QC, the rest Sample (`sample_kind` RC or HC,
  half core). Three density rows weigh the lab's reference masses (1,000 and 2,000 g), not core: left out of `sg.csv`. One ICP copper sat at its 10,000 ppm
  ceiling: its ore-grade assay (4.32 %) is used. No interval overlaps in the lithology, susceptibility, assays or density.
- **Three holes share one collar** (a pad): two RC holes and a diamond tail.
- **Geophysics over the holes.** The fixed-loop EM lines pass 12 to 59 m from holes; the in-loop line 7564400 45 m from one; the IP line's model points
  come within 58 m of the pad. Downhole EM was read in three of the five holes.
- **CRS.** Collars, samples and EM in MGA94 zone 54 (EPSG:28354; the tables' MGA_Z54 columns and the EM files' GPS_ZONE:54). The MapInfo layers say UTM
  zone 54 south on MapInfo datum 116 (GDA94), that is MGA94 zone 54. GeoStrix does not read that projection line: it places them in the project's
  coordinate system and says so ("no CRS in file — assumed EPSG:28354"), which is right once the collars have set it. GeoStrix finds no structure-type column in
  the structural points (their columns are Lith, Code, DipDir, Dip and Desc): they come in as "Other", with their dip and dip direction.

## Rebuild

`node scripts/samples/build-gsq-cloncurry.mjs "<cr103990 download>"` with the report's download from the GSQ Open Data Portal (the portal's `.zip`, or the
folder it unpacks to). The script prints its checks and writes them to `build-checks.txt`.
