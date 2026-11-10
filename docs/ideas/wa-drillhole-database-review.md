# The Western Australian open-file drillhole database: what it teaches GeoStrix

Review of 2026-11-08 on master 18a3ab50 (the worktree build, dist over app://). Everything was read by streaming the zips in
`Sample Data\Australia`; nothing was extracted whole, nothing ran from the zips, and all outputs live under
`C:\GeoStrixData\wa-drillholes\` (scripts in `scripts\`, the streamed SQLite profile in `profile\`, the harvest in `harvest\`,
the test projects in `projects\`).

**Erratum, 2026-11-09.** This review calls the uranium test area (report A87304) "calcrete uranium, Canning Basin edge" throughout
(sections 4, 5, 6 and 7). Both are wrong: the area's own logs show a sediment-hosted deposit in a lignite-bearing palaeochannel (38 % of
the assayed uranium is in lignite, none in calcrete), about 240 km east-north-east of Kalgoorlie at 30.0° S, 123.8° E. The label came
from an area classification, not from the data. The bundled sample was renamed "WA palaeochannel uranium" (TASKS #2324) and its
lithology cut to the current log (TASKS #2323, see section 6). The text below is left as written, as the record of the day; the deposit
styles of the other five areas were assigned the same way and should be read as labels, not findings, until each is checked against its logs.

## 1. Source and licence

The 15 zips are the "Mineral exploration drillholes (open file)" export of the WAMEX company mineral drillhole database,
published by the Geological Survey of Western Australia inside the Department of Energy, Mines, Industry Regulation and Safety
(DEMIRS; the metadata still carries the older DMIRS name). The GDB zip's `DOCUMENTS\Licence_CCBY4.pdf` says:

> © State of Western Australia (Department of Energy, Mines, Industry Regulation and Safety) 2024. With the exception of the
> Western Australia's Coat of Arms of State and other logos, and where otherwise noted, these data are provided under a
> Creative Commons Attribution 4.0 International Licence. http://creativecommons.org/licenses/by/4.0/legalcode

The metadata PDF (unique ID FE72285D-3B04-46EA-8DA9-3A6630169B0A, metadata date 2023-06-20) describes it: reports under the
Mining Act 1978 become open file after a confidentiality period of usually five years; digital reporting was compulsory only from
January 2007, so the data is comprehensive from 2007 on; the minimum per report is a collar file validated against the tenement;
locations are "as reported by the company"; coordinates were transformed from GDA94 to GDA2020 with the
`GDA94_GDA2020_conformal_and_distortion.gsb` grid via FME. The data dictionary covers only the GIS collar layer
(COLLARID, LATITUDE/LONGITUDE in GDA2020, HOLETYPE, MAXDEPTH, HOLEID, TARGET_COM, OPERATOR, PROJECT, ANUMBER, PEROID_FRO/TO).

**What CC BY 4.0 asks of GeoStrix.** Attribution (creator, copyright notice, licence name and link, and a note of any changes),
a link to the licence, and no suggestion that DEMIRS endorses GeoStrix. No share-alike, so derived files can stay MIT; the
attribution travels with the derived data, not with the app's code. The disclaimer in the same PDF ("cannot guarantee the accuracy,
currency or completeness") is worth repeating next to any bundled sample.

Attribution text proposed for every derived file and for the sample project's README:

> Derived from "Mineral exploration drillholes (open file)", WAMEX company mineral drillhole database, © State of Western
> Australia (Department of Energy, Mines, Industry Regulation and Safety) 2024, licensed under Creative Commons Attribution 4.0
> International (https://creativecommons.org/licenses/by/4.0/). Changes: [counts of column names / a subset of one report's
> drillhole tables, re-shaped into CSV; no values altered]. DEMIRS does not endorse GeoStrix or this derived work.

Company names appear throughout the source (CLBODY, Tenement_holder, Company columns, the Datasets' project names, lab names).
This review keeps them out of every derived file and names the test areas by commodity and region only.

## 2. Database profile

### 2.1 Shape of the export

| Zip | Entries | Uncompressed | Notes |
|---|---|---|---|
| CollarInformation | Collar, CollarCoordinate, CollarElevation, CollarAttr | 0.64 + 0.27 + 0.84 + 2.37 GB | CollarAttr is Deflate64 |
| Survey | DHSurvey, DHSurveyAttr | 1.42 + 6.53 GB | Attr Deflate64 |
| Geology | DHGeology, DHGeologyAttr | 3.61 + 27.9 GB | both Deflate64 |
| Geochemistry | DHGeochemistry, DHGeochemistryAttr, Extract_AttributeColumnCounts | 6.81 + 83.9 + 0.04 GB | both big ones Deflate64 |
| Geophysics | DHGeophysics, DHGeophysicsAttr | 1.22 + 16.8 GB | Attr Deflate64 |
| Event | DHEvent, DHEventAttr | 0.20 + 3.97 GB | Attr Deflate64 |
| TheRest | 13 tables + their Attr tables | 0.6 + 9.9 GB | Deflate |
| FileInformation | MRTFile, MRTDetail, MRTHeader, MRTHeaderValue | 0.01 + 0.57 + 0.76 + 0.65 GB | the file and column catalogue |
| DHAssayFlat / Summary | gsd_dhAssayFlat; gsd_dhAssayFlatSummary | 27.8 GB; 0.96 GB | harmonized wide assays with X/Y/Z per interval; per-collar summary with TectonicRegion |
| SurfaceSampleInformation, ssAssayflat | SurfaceSample, SurfaceSampleAttr, Coordinate; gsd_ssAssayFlat | 2.1 + 25.6 + 0.96; 4.0 GB | surface samples, not drillholes: not profiled |
| Miscellaneous | cfg_* lookups, AnumberNotes, CLBODY | 2.4 MB | the DMIRS harmonization tables |
| MINERAL_DRILLHOLES_OpenFile_GDA2020_GDB | file geodatabase + PDFs | 121 MB | licence, metadata, data dictionary |

Total about 251 GB uncompressed. Format: SQL Server `bcp -N` (Unicode native): no delimiters, every character column is UTF-16LE
with a 2-byte length (8-byte for `max`), nullable fixed types carry a 1-byte length (0xFF = null), BIT always carries that byte,
DATETIME is days since 1900 + 1/300 s ticks. The readers in `scripts\wabcp.py` / `fastbcp.py` are schema-driven from the
`CreateTables.SQL` beside each table (which are UTF-16 files too) and read Deflate64 entries through 7-Zip's `-so` stream. Throughput
of the compiled parser: about 13 MB/s on wide rows, 3 to 6 MB/s on the entity-attribute-value tables with the harvest switched on,
so one pass of the 84 GB DHGeochemistryAttr is several hours; every table was passed exactly once.

### 2.2 Row counts

| Table | Rows | Collars |
|---|---|---|
| Collar | 3,458,850 | 20,938 A-numbers, 22,350 (A-number, dataset) pairs, 2,653 companies |
| CollarCoordinate | 3,457,792 | one per collar; 1,058 collars have none |
| CollarElevation | 2,387,541 | 1,071,309 collars have none |
| DHSurvey | 12,083,958 | 2,412,239 (70 %) |
| DHGeology | 65,436,612 | 2,534,557 |
| DHGeochemistry | 89,478,036 | 2,858,107 |
| DHGeophysics | 45,284,579 | 57,503 |
| DHAlteration | 2,894,358 | 229,456 |
| DHVeining / DHStructure / DHMineralogy | 2,239,898 / 2,300,136 / 2,275,949 | 169,748 / 68,919 / 90,589 |
| DHRecovery / DHGeotech / DHSpecGrav | 3,467,630 / 2,081,872 / 1,414,664 | 79,264 / 14,949 / 9,248 |
| DHWeathering / DHRegolith / DHDrillDetail | 1,701,604 / 467,625 / 2,193,167 | 105,994 / 43,812 / 316,332 |
| DHHyperspectral / DHPXrfReadings / DHWater | 690,255 / 119,178 / 153,320 | 11,141 / 1,953 / 20,658 |
| MRTFile | 137,748 files from 35,109 A-numbers | SL 23,763 collar files, DS 16,529 survey, DL 43,408 downhole log, DG 24,490 downhole geochem, SG 29,558 surface geochem |
| MRTDetail | 3,918,528 column records | the catalogue of every submitted column |
| Attr tables (EAV rows) | CollarAttr 39.7 M; DHSurveyAttr ~68 M; DHEventAttr 68.6 M; DHAlterationAttr 20.0 M; DHGeologyAttr and DHGeochemistryAttr: see the harvest | |

1,786,588 collars have survey, geology and assays; 229,794 have none of the three (collar-only submissions).

### 2.3 How the tables link

`Collar.Id` is the key everywhere (`CollarId` in DHSurvey, DHGeology, DHGeochemistry, DHGeophysics, DHEvent and the TheRest
tables; `CollarID` in CollarElevation; `CollarId` in CollarCoordinate). Each core row holds only what DMIRS harmonized
(FromDepth / ToDepth, Depth / Dip / Azimuth, SampleId) plus `MRTFileId`; everything else the company submitted is in the matching
`*Attr` table as (`<parent>Id`, `AttributeColumn`, `AttributeValue`, `MRTDetailId`). `MRTDetailId` points at the column record of
the submitted file (`MRTDetail`: ColumnName as `Name#..#units#..#`, ColumnOrder, Units, and for assay columns the lab method,
laboratory, lower/upper limit, DMIRS's Analyte and unit reading, min/max in ppm and the counts of no-data / bad-data values);
`MRTDetail.MRTFileId` points at `MRTFile` (A-number, file type SL/DS/DL/DG/SG, original file name, load date), and `MRTHeader`
holds the report's H-record header (tenement, project, map sheets, datum H0501, projection H0503, zone H0531, drill code H0400,
assay company/code H0800/H0801, data file names H0301-H0315). `Collar.HoleId` = A-number + dataset + CompanyHoleId; the
company's own id is `CompanyHoleId`. DHGeochemistryAttr additionally carries DMIRS's flags per value (Flag_LT, Flag_GT, Flag_PCT,
Flag_KnownNoDataValue, Flag_KnownMetaDataValue, Flag_BadDataValue, Flag_ValidLessThanDetectionLevel) and `PPMValue`.
Rows of one collar are contiguous in the core files (they were bulk-loaded per file), which the streaming profile relies on.

### 2.4 Coordinates

- `Collar.Longitude/Latitude`: never null, GDA2020. `IsTransformed` = 1 on 1,543,615 collars.
- `CollarCoordinate` keeps the company's grid coordinates with the datum, projection and zone as the company typed them
  (`Datum`: GDA94 2,153,408; AGD84 654,497; "AGD 84" 367,577; "GDA 94" 204,974; WGS84 40,598; AGD66 11,926; GDA_94 8,479;
  AGD_84 6,160; GDA2020 5,927; "AGD 66" 1,502; AGD_66 1,055; AGd84 756; "Agd 84" 661; WGS_84 108; gda94 84; GDA20 56; agd66 24.
  `Projection`: UTM 761,722; AMG 754,731; MGA 598,350; "Map Grid of Australia (MGA)" 486,898; "Universal Transverse Mercator (UTM)"
  381,684; "UTM MGA" 270,011; MGA94 51,674; null 31,170; "Unprojected" 3,641; "Non-projected" 1,890; "amg_east" 493 and more.
  `Zone`: 51 (2,033,610), 50 (1,249,979), 52 (115,537), null (31,170), 48 (27,409: the 27,409 collars that fall outside the WA
  box are zone 48 entries, a datum/zone mistake), 49 (87). `Units` is always null). Eastings under 100,000 (local grids) 67 rows;
  over 900,000 2,138 rows; 31,170 rows have no easting and carry lon/lat in CollarCoordinate instead.
- `CollarElevation` is NOT the company RL: all 2,387,541 rows are "Drillhole collar location intersected with GA 1 Second SRTM2 DEM",
  EGM96, metres (0 to 978 m; 386 collars at exactly 0). The company RL is in CollarAttr (RL, NAT_RL, Orig_RL, Local_RL, MGA_RL ...).
- The grid name a company uses is a free-text attribute column (GRIDNAME, NAT_Grid_ID, Orig_Grid_ID, MGA_Grid_ID, Grid, Datum,
  Zone, COORDSYS, LL_Grid_ID ...) with spellings such as MGA94_51, MGA94_Z50, MGA94-51, MGA51_94, MGA_51S, GDA94_51S, AMG84_51,
  AMG_51, AMG51, 51-AGD, LL_WGS84, LL_GDA94, LL_AGD84, and local grids (MINE, PAN, TRI_MINE, ATTILA, MMC, ENEABBA, SOL, MULG ...):
  `harvest\datafiles\wa-grid-names.json`.
- `cfg_Datum` / `cfg_Grid` / `cfg_DatumLookup` / `cfg_GridLookup` are DMIRS's own name-pattern tables (GDA94 → UTM_MGA_94,
  AGD84 → UTM_AMG_84, AGD66 → a custom AMG66 grid, GDA2020 → UTM_MGA_20; patterns like "GDA94,GDA_94,GDA-94,GDA 94"). One
  `cfg_GridLookup` row (id 6) holds the literal word "Patterns": a header row that leaked into the data.

### 2.5 Data quality worth knowing

- **Holes with no survey**: 1,046,611 of 3,458,850 (30 %). Of the surveyed collars, 1,980,757 (82 %) have a single station
  (collar orientation only); 58,056 collars have duplicate survey depths, 28,229 have depths out of order, 6,006 have a survey
  station deeper than MaxDepth + 1 m.
- **Dip sign**: 10,847,309 survey rows with dip < 0, 498,989 with dip > 0 (107,323 collars are mostly positive-dip, 3,583 mix both
  signs); 722,916 rows have no dip, 777,903 no azimuth; 10,670 azimuths outside 0-360; none with |dip| > 90.
- **MaxDepth**: null 63,583; zero 6,886; negative 5,424; over 2,000 m 199.
- **Elevation**: 1,071,309 collars without the DEM elevation; 386 at exactly 0; the company RL is only in the attribute table.
- **Duplicate hole ids**: 1,670,230 collars (48 %) share their CompanyHoleId with a hole in another A-number (re-submitted holes and
  generic ids such as "1", "2", "44"); 21,893 (A-number, CompanyHoleId) pairs are duplicated within one report. In the 30 x 30 km
  composite test area, 54,150 collars from 155 reports carry only 51,253 distinct ids.
- **Intervals** (from < previous to, in file order, within a collar): geology 1,100,749 overlaps (1.7 %), geochem 2,793,103
  (3.1 %), alteration 90,616, geophysics 1,147,134; reversed (to < from): none anywhere (DMIRS fixes them on load); zero-length
  intervals: geology 10,724,201 (16 %, point observations stored as intervals), geochem 125,810; ToDepth null: geology 1,105,132,
  geophysics 13,182,114 (29 %, point readings), structure 1,344,009 (58 %); negative From: geology 1,310, geochem 2,009, structure
  5,992.
- **Null sentinels** (see the harvest): -999 and -9999 in collar attributes (PCDEPTH, TEN, ELINE, water table, Dmax_* summary
  columns), -1 for "no assay" in Max Au columns, -99999 in X_east / X_north; -999.25 in the downhole geophysics logs.
## 3. Knowledge harvest (the "training")

Everything below was counted over the whole database: the file catalogue (every column of the 137,748 submitted files), the
collar attribute table (39.7 M rows), the survey attribute table (67 M rows, every 2nd), the event table (68.6 M rows, every 2nd),
and the geology / geochemistry attribute tables (sampled every 32nd / 64th row during the extraction passes). Counts are
"submitted files that use this name" unless stated. The proposed data files are in `harvest\datafiles\` (each under 200 kB, each
with the CC BY attribution block, no company or person names), and the raw harvest JSONs beside them.

### 3.1 Column names, against GeoStrix's guesser

GeoStrix's matcher (`src/lib/layers.js` `guessColumn`: exact alias, then substring, 2-letter aliases whole-word only; the whole
catalogue is in `harvest\geostrix-guessers.md`) was replayed in Python (`scripts\guess_sim.py`) over every column name of every
collar (SL), survey (DS), downhole-log (DL) and assay (DG) file. Hits and misses, in column-uses across files:

| Field | Hit | Miss | The misses that matter |
|---|---|---|---|
| Collar hole id | 22,883 | 373 | siteid 201, site_id 82, collar_id 73 |
| Collar x | 22,763 | 8,953 | mga_e 3,579, amg_e 1,876, local_e 717, amge 497, mgae 359, gride 277, gda_e 167, xcoordinate 165, mga_x 153, "amg e" 135, mga94_e 76, gda94_e 75, utm_x 49, e_gda94 35, e_amg 30 |
| Collar y | 22,616 | 9,070 | mga_n 3,570, amg_n 1,925, local_n 716, amgn 485, mgan 363, gridn 276, gda_n 167, ycoordinate 165, mga_y 153 (year and year_drilled are correctly not hit) |
| Collar z | 15,112 | 11,751 | nat_rl 2,441, orig_rl 2,181, local_rl 1,885, mga_rl 1,110, amg_rl 950, origrl 242, mgarl 207, localrl 193, utmrl 168, rlutm 164, mga_z 131, rl_m 64, ahd 57, "rl ahd" 42 |
| Collar azimuth | 11,570 | 121 | grid_az 45, mag_az 45, azm 17 |
| Collar dip | 12,912 | 226 | inc 161, plunge 43 |
| Collar length | 19,626 | 1,970 | td 1,970 |
| Survey depth | 14,833 | 0 | |
| Survey azimuth / dip | 21,510 / 16,209 | 83 / 114 | mag_az, grid_az; inc 99 |
| Interval from | 41,160 (DL) + 23,948 (DG) | 19 + 29 | startdepth, start |
| Interval to | 28,920 (DL) + 19,350 (DG) | 11,863 + 4,711 | mto 10,487 + 3,677, depthto 1,245 + 882, dto 87 + 102, todepth, enddepth |
| Lon / lat (collar fallback) | | | ll_long 857, lllongitude 156, long_gda 65, lllatitude 156, lat_gda 65 |

Three things stand out. (1) "mto" is the single most common unmatched name in the database (14,164 files) while its sibling
"mfrom" matches, because the 2-letter alias "to" is whole-word only and "mto" is not in the list; the assay path's TO_COL regex
knows mto but the interval schema does not. (2) The Australian grid prefixes (mga_, amg_, gda_, nat_, orig_, local_) in front of
e / n / rl are missed about 9,000 times each for x and y and 11,751 times for z: a collar file with MGA_E / MGA_N / NAT_RL opens
the mapping dialog with x, y and z empty. (3) Substring traps that WOULD be mapped wrongly: for x "ref_east" 520, "amg-east" 410,
"originaleast" 343, "planned_east" 103 (and the same for north); for length "precollar_depth" 2,552, "boco_depth" 1,597,
"tofr_depth" 1,482, "water_depth" 542 (any of these wins when the real column is "td"); for azimuth "nominal_azimuth" 280,
"azimuth_flag" 88; for dip "nominal_dip" 324, "collar_inclination" 162, "hole_dipping_depth" 35; for hole id "hole_type" 6,158,
"total hole depth" 5,063, "hole_status" 2,927, "parent_hole_id" 1,793 (the hole-id veto regex does not cover type, status or
parent). Full lists: `harvest\column_guess_report.json`; proposed aliases: `wa-column-aliases.json`.

Downhole-log columns (DL files, 34,965 distinct names): the lithology code is lith1_code 3,435 / lithology 3,870 / lith1 2,818 /
rock1 2,028 / lith_plot 2,116 and the common second code lith2_code 3,317; weathering 5,096, oxidation 2,237, regolith 3,217,
colour 6,657, grainsize 4,252, texture 3,857, hardness 2,630 are the most used non-lithology log columns (none has a GeoStrix
layer: weathering and oxidation go to Custom); alteration files are alt1_code 2,135 / alt1_int 2,740 / alt1_style 2,091 with
alt2 to alt5 (GeoStrix's alteration aliases catch alt1_code only); veins vein1_pct 2,417 / vein1_style 2,094; minerals min1 1,915.

### 3.2 Analyte names and units

The file catalogue flags 791,472 assay columns (46,696 distinct raw names) and DMIRS's Extract.AttributeColumnCounts and
cfg_AnalyteMatchingTable record how DMIRS matched them (1_Exact, 1_Word first, nonNumeric-DATE, Noise-*, No Match). Raw name
patterns after the element token, in file-column uses: bare element 325,396; `_ppm` 37,422; `_pct` 5,387; `_ppb` 3,241;
method-coded `El_METHOD_ppm` (Au_FA003_ppb, Cu_LA101_ppm, Ni_MEICP61_ppm, Li_4AMS_ppm, Au_ME_MS61_ppm) tens of thousands;
numbered repeats Au1, Au2, "Au 1", Au_1, Au-Rp1 (re-assays); Au(S) / Au(R) / Au(AR) (screen fire, repeat, aqua regia); Au_100
(a 100 g charge); _BEST and _BESTEL; AUPPB / AUPPM / PTPPB (unit glued to the symbol: 336 / 226 / 147 files); Au_ppm_BEST;
oxides Al203 (a zero for the O, 525 files), SiO2Pcnt, Al2O3_pc; Fe_%, Fe%, Fe_pc. Variants per analyte: Au 3,578, Cu 885, As
840, Ni 785, Fe 730, Zn 728, Co 611, Ag 568, LOI 368, Ti 404, Zr 353, Pt and Pd about 325 each, U 314, Li 206.

Declared unit strings in file headers: ppm 457,319; % 100,744; blank 78,988; na 60,931; pct 35,513; ppb 29,454; unknown 7,175;
g 3,699 (weights); kg; mg/l; unity; percent 1,010; g/t 293; wt_% 146; ppt 124; wt% 112; pc 39; "% adb". GeoStrix's inferUnit
reads ppb / ppm / gpt / g/t / pct / %, so "percent", "pc", "wt_pct" in a header and the glued forms AUPPB / AUPPM are missed
(isElementColumn needs a delimiter after the symbol); LOI1000, LOI371, LOI650 (loss on ignition at a temperature: 625 / 236 /
154 files) are not elements and need their own rule; Al203 is never recognized as Al2O3.

Where DMIRS's reference disagrees with GeoStrix today: DMIRS matches the first word of the name against an analyte list and
reads the unit from the declared header unit or the name's ppm / ppb / pct tokens; GeoStrix matches the first delimiter-separated
token too, but its unit default for an unqualified major element (Al, Ca, Fe, K, Mg, Na, S, Ti, Si as %) differs from the data:
in WAMEX a bare "Fe" is declared ppm in 355 files and % in 752, and bare "S" is mostly ppm; the rule "a % guess becomes ppm when
the maximum exceeds 100" saves most cases but not low-grade Fe reported in ppm. Lower detection limits recorded per column:
Au 0.01 ppm (11,118 columns), 1 ppb (8,430), 0.001 ppm (3,023), 0.005 (1,394); Cu, Ni, Zn 1 ppm; As 5 / 0.5 / 1; Ag 0.05 / 0.5 /
0.01; Li 0.1 / 0.2 / 1; U 0.01 / 0.1 / 0.05 ppm. Lab method codes seen most: 4A/MS, ME-MS61, XRF, ME-ICP61, XRF202, 4A/OE, LA101,
AR102, ME-MS61R/L, ICP302, AR25/MS, ICP102, AR101, MEST43, MA4031, ME-MS81, ICP40Q, AT/OES, PXRF, FB1/XRF, ME-MS41.
Non-assay columns in assay files that DMIRS could not match, which GeoStrix must not take as grades: Recvd Wt., Superseded,
Has_Duplicate, DataSet, Priority, Project_Code, Interval_Length, Resplit, Repeat, FieldPrep, Mode, Fraction, Water, LabID,
DispatchID, SPWT, WT_DRY, WT_SPLIT, Pass75um, Pass2mm, TOTWT, Moisture, Contamination, OVERSIZE, SANDC, SLIMES, Wet_Dry.
Proposed file: `wa-analyte-aliases.json`.

### 3.3 Below-detection and missing-value notation

From the full pass over DHGeochemistryAttr (1,344,970,590 rows; shapes sampled every 64th row and scaled): of about
756 M values in element-named columns, 19.5 M (2.6 %) are written "<x", 94 k ">x", and 47 M (6.3 %) are negative numbers.
The negatives split into negative detection limits (-0.01 12.0 M, -5 4.3 M, -10 4.1 M, -0.05 3.0 M, -0.001 2.9 M, -0.5 2.3 M,
-2, -0.1, -0.005, -0.02, -20, -100, -0.2, -50, -5000 ...) and sentinels (-1 4.1 M, -999 2.3 M, -99 0.8 M, -9 0.25 M, -9999 0.18 M,
-666 1.6 M, -33330000 0.39 M, -77 0.2 M, -99999). Text in numeric columns: NULL 83 M, "-" 19.7 M, "X" 11.7 M, NA 5.3 M, N/A 3.5 M,
"< LOD" 4.1 M and "<LOD" 2.1 M (pXRF exports), ND 0.8 M, NONE, BDL 0.17 M, NS, UN, "<" alone 0.14 M, ">detect". The "<x"
spellings include "<   9.99" with inner spaces, "<.001" without the leading zero, and "<-9" (a negative inside the qualifier).
Against GeoStrix: parseAssayValue reads "<x" and ">x" (parseFloat tolerates the spaces) and readAssayCell treats a negative
between -99 and 0 as below detection and anything at or below -99 as missing. So -0.01 / -5 / -10 / -50 become half the limit
(right), -1 and -9 become 0.5 and 4.5 "below detection" values (wrong: they are no-assay codes in the columns where they occur,
4.3 M rows), -77 / -99 are missing (right), -666 and -5000 are missing (right by luck, they are at or under -99), while
"< LOD" / "<LOD" / BDL / ND / X / "-" fall out as not assayed with no below-detection flag. DMIRS's own flags (Flag_LT,
Flag_KnownNoDataValue, Flag_BadDataValue, Flag_ValidLessThanDetectionLevel) sit on every row of the export and resolve all of
this for a user of the DMIRS files. Proposed file: `wa-null-notation.json`.
Already seen in the collar and survey attributes: -999 (PCDEPTH 2,777 rows, TEN and ELINE 3,058, water table, the Dmax_* summary
columns), -1 ("no assay" in Max Au ppb / Max Au ppm 3,126 / 3,081), -99999 (X_east / X_north 560), 999 (Projectcode), and
-999.25 throughout the wireline columns filed under survey (GRO 3164 30,758 sampled rows, DENSITY 16,639, GAMMA 15,513,
Density_gcc, Gamma_API, MAGSUSC, INDD / INDS, CALI, SP, AZIM / INCL, RLLS / RLLD, Resistivity_SG).

### 3.4 Lithology, alteration, weathering and regolith codes

The geology attribute pass (497,086,913 rows, 19,522 distinct column names, sampled every 32nd row) and the full passes over
the alteration, veining, mineralogy, weathering and regolith tables give the code vocabularies in `wa-lithology-codes.json`
and `wa-logging-codes.json`. The lithology code sits in Lithology (224 k sampled rows), Lith1_Code (188 k), Lith1 (115 k),
Rock1 (90 k), ROCK1, LITH1, LithCode, LITH, rock, Lith_1, Lith, LITHOLOGY ... The most used codes, scaled to the whole table:
SA 1.04 M, MB 0.98 M, NULL 0.51 M, "-" 0.43 M, MD 0.41 M, Q 0.39 M, S 0.37 M, M 0.36 M, SMP 0.35 M, CY 0.33 M, CL 0.32 M, U 0.30 M,
SS 0.29 M, LS 0.27 M, CS 0.25 M, CLY 0.22 M, RSP, SST, SC, SIF, SSL, BIF 0.17 M, NR 0.17 M, FZ, XMS, SSH, TLC, SAP, SD, MG, SH, TLS,
LSU, FG, UM, FV, OCY, V, SSA, DMHE. These are company codes: SA is saprolite in one report and sandstone in another, MB mafic or
metabasalt, Q quartz vein or quartzite, so a thesaurus must be per report (or per code system) rather than global; the file's
thesaurus seed pairs each code with the free-text description logged beside it across the 160 reports of the test areas and
shows that spread (and that the "description" column is often a comment: "EOH", "re-logged sept 2014").
Weathering / oxidation (Weathering 197 k sampled rows, Oxidation 81 k, Weath, WEATHERING, oxidation, OX, Oxid ...): FR 71 k, SW
28.6 k, HW 27.8 k, MW 26.8 k, F 25.7 k, OX 22.3 k, CW 19.2 k, H, E, S, M, SOX, W, TW, WW, EW, W3 / W2 / W1 (a numbered scale), TR,
MOX, POX, PW, WOX, OXD, FRESH, SX. Regolith (Regolith 105 k, REGOLITH, Reg, Reg_Code): FR, R, RSU, RSL, BR, RSR, RBR, LS, FRESH,
LSAP, TPD, US, SR, USAP, SAPRK, CU, RSP, SP, RSAP, SL, RCY, SAP, RBD, RLCU, LCU, SU, RLCP, RLCL, SPRK (the Anglo / Yilgarn
regolith scheme: TPD transported, LSAP / USAP lower / upper saprolite, SAPRK saprock, FR fresh, COV cover, SPRK10/20 saprock
with 10 / 20 % fresh). Alteration codes (Alt1_Code 1,251 files): CH / CHL / CL chlorite, SI / SIL silica, CB / cb carbonate, HE /
HEM / HM hematite, GO goethite, RGO, RKA, SK, BI biotite, with intensity in Alt1_Int (M 132 k, W 108 k, S 79 k, m / w / s lower
case, H, I, T, m- / s- / w-, MD, ST, WK, TR) and style in Alt1_Style. Vein composition (Vein1_Comp): qt 104 k, QZ, qc, QT, VQ, QC-,
qz, VCQ, Q, qtz, QZ-, QTZ, VQZ, Vqz (quartz in fourteen spellings), cb, Vqb; vein style VN, ms, SE, MS, IR, NI, EX, DVN, BI.
Minerals (Min1_Code): py / PY / Py / pyr 171 k pyrite, KA, CH, CY, QZ, CLY, FE, GO, BI, po, AM. SG method: DH_LV06, DHTool_LV08,
WATER, MEAS, LV10, WAX, LV09, WRAP, POT, CALLIPER, wet/dry; SG sample type CORE, HQ_CORE, HC, WCORE, RC-CHIP, QUARTER_NQ2.
Case: the same code appears upper, lower and mixed case within one column (py / PY / Py), so matching must fold case.

### 3.5 Survey conventions

Dip: negative = down in 10,847,309 survey rows against 498,989 positive (107,323 collars are mostly positive-dip: a per-collar
or per-file convention, not noise; 3,583 collars mix both). The method or instrument column (Survey Instrument 1.18 M rows,
DHSurvey_Method 850 k, SurveyType 528 k, Survey_Method 368 k, DHSurvey_Instrument 360 k, Instrument_Code 305 k) holds GYRO
952,745; GPHYS 282,752; DEVIFLEX 145,658; TGA 121,225; NR 120,515; DEVI 110,814; COLL 101,494; BW09; G; INTERP 91,602; REFLEX
89,704; EMS; GN; GYRO_ABIM; DEMS; GS; COLLAR; SS; UNKNOWN; EST; NMSG; GM_GYRO; "GYROMAX: INTERNAL SENSING (IS) TWIN GYRO";
PLANNED; PLAN; INS; PROP; ASS; "DOWNHOLE SURVEYS, DEVISOFT INSTRUMENT"; SINGLESHOT; NOMINAL; EASTMAN; CLINO; WIRE; COMPASS;
ESTIMATED (classed gyro / magnetic / collar-planned-assumed / wireline in `wa-survey-conventions.json`). The north reference
lives in AZIMUTHTYPE (622 k rows: GRID 251,156, TRUE 140,401, TRUENORTH 87,871, MAGNETIC 37,603, "TRUE NORTH", MAG, LOCAL,
MAGNETIC_2010) and AZIMUTHGRIDNAME (433 k: MGA94_51, MGA, MGA94_52, LOCALGRID, NOVAMINEGRID, MGA94_Z50, JAGUAR MINE GRID,
GDA94_Z50). GeoStrix's detectAzimuthRef reads AZIMUTHTYPE exactly but not AZIMUTHGRIDNAME (a grid name implies grid north; a
mine-grid name implies a local grid), and the azimuth columns themselves carry the reference in their names (Azimuth_MAG 1,591
files, Azimuth_TRUE 1,026, MAG_Azimuth, NAT_Azimuth, MGA_Azimuth, AMG_Azimuth, Local_Azimuth, Orig_Azimuth: a file often has two
or three of them side by side).

### 3.6 Hole types

DMIRS's 14 codes (cfg_LookupHoleType) and the spellings they absorb are in `wa-hole-types.json`. In the collar attribute columns
(Hole_Type 323,565 rows, Drill_code 247,786, Drill Code 126,548, Hole_type, HoleType, HOLETYPE, hole_type, DRILL_TYPE, DrillType,
DrillholeType, TYPE, Method, Rig_Type, Drill_Method) the values are RC 479,762; RAB 337,627; AC 259,107; VAC 65,667; AU 40,742;
RB 34,153; DRILLHOLE 32,783; AIRCORE 26,580; DD 24,439; UNKNOWN 13,810; PHRAB 12,598; D 12,031; DDH 11,976; NR 10,106; AUGER
8,859; GCRC 8,001; BH 6,467; RCAC 5,714; AUG 5,232; FACE 5,125; GCBH 4,302; "?" 3,986; RCGC 3,786; BLH 3,357; RCRD 3,187;
INTERFACE 3,161; DIAMOND 3,089; UGDDH 2,134; RAB-H 2,072; ACORE 2,040; RCD 2,018; UGD 1,940; "AIR CORE" 1,429; NQ2; DD_UG; rig
names such as "VERSADRILL 300"; PERC; RCFH; SLRC; UGDD; "AIRCORE NQ"; RC/DDH; RC/DD; RCN; AC85; DDU; RC_DD; "UG - CHIP"; REVC;
"ANGLED RAB"; VRAB; PERCUSSION. The DMIRS patterns resolve the common ones; GCRC, RCGC, GCBH, BLH, RCRD, RCFH, SLRC, D100,
RAB-H, UGDDH and the rig names are not covered.

### 3.7 The proposed data files and where each plugs in

All nine are in `C:\GeoStrixData\wa-drillholes\proposed\datafiles\` (copies of `harvest\datafiles\`), JSON, each with an `_about`
block carrying the attribution text of section 1, the counting method and the date. None is committed; they are proposals for
`src/data/` (or `src/lib/data/`) once Matt has looked at them. No company, person or tenement name is in any of them.

| File | Size | Content | Would be read by |
|---|---|---|---|
| wa-column-aliases.json | 22 kB | per GeoStrix field (hole id, x, y, z, azimuth, dip, length, from, to, sample id, lon, lat): the unmatched names with their file counts, the substring traps to veto, and the names the matcher got right | `src/lib/layers.js` TARGET_SCHEMAS alias lists and the hole-id / notAValue veto regexes; `src/lib/importHelpers.js` FROM_COL / TO_COL / SAMPLE_COL; `src/lib/longAssays.js` |
| wa-hole-types.json | 15 kB | DMIRS's 14 hole-type codes with their spelling patterns (cfg_LookupHoleType) plus the 300 most used spellings in the collar attributes with counts, and the column names that carry them | a hole-type field on the collars schema (today only an extra attribute) and the colour-by / filter in 3D View, Targeting and Mine Design |
| wa-grid-names.json | 32 kB | grid / datum / zone spellings (MGA94_51, AMG84_50, GDA94_Z51, LL_WGS84 ...) with counts and the EPSG each resolves to; local-grid names (MINE, PAN, TRI_MINE ...) flagged `local: true`; the column names that hold them | `src/lib/crsFromColumns.js` (today NAD83 / NAD27 / WGS84 names only) and `src/lib/projectCrs.js` so the CRS question is pre-answered; `src/lib/reproject.js` guessEpsgFromPrjWkt for AGD66 / AGD84 AMG .prj files; a "local mine grid" default when the name is a local one |
| wa-analyte-aliases.json | 177 kB | per analyte: raw column spellings (Au_ppm, AUPPB, Au_FA003_ppb, Au1, Au(S) ...), declared units and their counts, lab methods, lower detection limits, the oxide list with the misspellings (Al203), the LOI family, and the non-assay columns seen in assay files (Recvd Wt., Pass75um, Moisture ...) | `src/lib/geochem.js` isElementColumn / oxideOfHeader / inferUnit (glued units, "percent" / "pc" / "wt_pct", oxides beyond the rock-forming set, LOI as not-an-element) and the per-element default-unit table |
| wa-survey-conventions.json | 21 kB | dip sign statistics, the method / instrument vocabulary classed gyro / magnetic / collar-assumed / wireline, AZIMUTHTYPE values, AZIMUTHGRIDNAME values, and the azimuth column names that carry a reference (Azimuth_MAG, Azimuth_TRUE, MGA_Azimuth ...) | `src/lib/azimuthRef.js` detectAzimuthRef (grid-name columns and the column name itself) and the survey schema (a method column, a dip-sign check per file) |
| wa-logging-codes.json | 120 kB | weathering / oxidation / regolith / alteration / alteration-intensity / vein composition / vein style / mineral / SG-method code frequencies, case-folded with the raw spellings | the thesaurus of TASKS #2004; `src/lib/layers.js` ROLE_PATTERNS and the alteration / vein / mineral aliases; a weathering-regolith layer kind |
| wa-lithology-codes.json | 182 kB | the 2,000 most used lithology codes with counts, the column names that hold them, and a code-to-description seed (code, the descriptions logged beside it, how many reports use it that way) grouped into rock families | the thesaurus of TASKS #2004 (per-report code systems, case-folded); the lithology colour legend defaults |
| wa-downhole-log-channels.json | 25 kB | the downhole geophysics channel names (gamma, density, susceptibility, caliper, resistivity, conductivity, eU3O8, deviation ...) with counts, units and the -999.25 / -999 sentinels they use | a downhole-log import target (today none) and `src/lib/downholeLogs.js`; the LAS reader's COMMON_NULLS for the CSV path |
| wa-null-notation.json | 10 kB | every below-detection, over-range, not-assayed and sentinel spelling with its count and the meaning DMIRS assigns (Flag_LT, Flag_KnownNoDataValue, Flag_BadDataValue) | `src/lib/geochem.js` readAssayCell / parseAssayValue / NO_DATA_SENTINEL_MAX, `src/lib/layers.js` num(), and the Data QC notices |

How they were counted: file-column uses from MRTDetail (every submitted column of 137,748 files); attribute values from one pass over
each `*Attr` table (full for collar, event, alteration, veining, mineralogy, weathering, regolith, SG, recovery, geotech, water,
hyperspectral, pXRF, drill details; every 2nd row for survey; every 32nd for geology; every 64th for geochemistry, scaled). Scripts:
`scripts\harvest_analytes.py`, `guess_sim.py`, `make_datafiles.py`, `make_lithcodes.py`.
## 4. Test projects

Six areas were cut from the database (collar ids from the SQLite profile, then one streamed pass over each core and attribute table,
`scripts\core_extract.py` / `attr_fast.py`) and re-shaped into the CSVs GeoStrix's wizard takes (`scripts\build_project.py`): one CSV
per submitted file, the companies' own column names and value strings untouched ("<0.01", "-1", "NULL", "X" stay as they are), the
hole id / from / to columns restored under the names the company used (HOLEID, GEOLFROM / GEOLTO, mFrom / mTo, Depth From / Depth To,
SAMPFROM / SAMPTO). The composite area stacks 155 reports, so it uses DMIRS's harmonized names instead (HoleId, FromDepth, ToDepth,
MRTFileId; assays pivoted on the harmonized analyte and unit, lithology on the 60 most used column names).
All CSVs: `C:\GeoStrixData\wa-drillholes\projects\<area>\csv\`; the imported projects (autosaves) beside them as `<area>.geostrix.json`;
the wizard logs as `import_log.json`; screenshots in `scripts\electron\shots\`.

| Area | Report / box | Style | Holes | Files (rows) | Size |
|---|---|---|---|---|---|
| gold_small | A76120 | Archean lode gold, Yilgarn (an underground / surface diamond program) | 250 (248 DD) | collars 2, survey 2 (2,669 stations), geology 4 (16,683), recovery (2,725), structure (366, alpha / beta), drill details, assays 2 (11,144) | 2.0 MB |
| nickel | A123101 | komatiite nickel, Yilgarn | 1,218 (1,199 DD) | collars, survey (7,636), geology (31,145), alteration (3,588), veining (1,604), mineralogy (3,752), structure (874), SG (1,906), drill details, events, assays 2 (280,368 each x 136 columns) | 222 MB |
| iron | A119232 | channel iron / BIF iron ore, Hamersley | 6,390 (6,149 RC) | collars 2, survey (106,738), geology 2 (150,456 + 817), recovery (3,408), downhole logs (2,584,475 readings: density, gamma, susceptibility), assays (147,891 x 38) | 182 MB |
| uranium | A87304 | calcrete uranium, Canning Basin edge | 430 (412 AC) | collars, survey, geology (22,407), alteration (2,003), drill details, gamma log (439,780) + hyperspectral + calibration, assays 3 (9,876 x 165; QC 988; pXRF 569) | 20 MB |
| lithium | A119127 | LCT pegmatite lithium, Yilgarn | 2,248 (39 DD / 822 RC / 1,387 AC) | collars (mine grid), survey (5,395), geology (19,850), assays (21,974 x 43 oxides) | 6.7 MB |
| large | 155 reports in 121.55-121.95 E / 31.15-31.45 S | the Kambalda - St Ives goldfield: komatiite nickel and Archean gold, 1960s to 2020s | 54,150 (13,378 DD, 11,043 RC, 27,054 RAB / AC); 51,253 distinct hole ids | collars, survey (607,783), geology (1,346,442 x 64), alteration (57,101), veining (56,504), structure (18,955), events (21,331), logs (146,829), 12 more tables, assays (3,101,578 x 85) | 543 MB |

### 4.1 Results

Guesses were accepted exactly as the wizard made them (the brief: "accepting its guesses"); a file whose dialog had no enabled Import button was cancelled and counted as refused. Times are from the drop to the dialog (t_open) and the longest main-thread stall measured with a 10 ms timer in the page; "peak working set" is the sum over all Electron processes of the profile, sampled every 3 s. Build: master 18a3ab50, dist over app://, a fresh profile per area.

Timing caveat: the rebuild of the other areas (one Python process, an external sort) ran during the gold and lithium imports.

#### gold_small (A-number 76120: 250 DD holes, Archean lode gold, Yilgarn; 13 files, 2.0 MB) — port 9491, profile p9491
Dialogs opened 270-335 ms after each drop; every commit under a second; worst main-thread stall 583 ms (assays_2 drop), 525 ms on the
3D View tab after loading; page errors 0; JS heap 66 MB; peak working set of all Electron processes 870 MB; autosave 885 kB.
| File | Guessed as | Mapping | Result |
|---|---|---|---|
| collars_1.csv (8 holes, MGA94_51) | Collars | HOLEID / EAST / NORTH / RL / DEPTH; HoleType, GRIDNAME, PreCollar_Depth, PROSPECT as extra text | CRS question answered with the area's lat/lon, first candidate GDA2020 / MGA zone 51 taken (the file says MGA94_51: 28351; the app's first choice is GDA2020, 7851: a 1.5 m offset) |
| collars_2.csv (242 holes, LOCAL MINE GRID: EAST 31,950-32,315, NORTH 807,798-808,239) | Collars | HOLEID / EAST / NORTH / RL / DEPTH; DrillHoleType unmapped | "X/Y are on a local mine grid" left off; the 242 holes were placed as MGA 51 coordinates 400 km from the 8 georeferenced holes, with no warning. Hole type (DD / RC/DD) kept only as an extra field |
| survey_1.csv (2,488 stations, SURVTYPE GYRO, AMG_AZIMUTH) | Survey | HOLEID / DEPTH / AMG_AZIMUTH / DIP; Grid north | right; SURVTYPE not read |
| survey_2.csv (181, Azimuth_UTM, dip, AMG grid) | Survey | Azimuth_UTM / DIP | right |
| drilldetail.csv (19 rows: dsHoleType, dsHoleDiameter ...) | Veins | value = dsHoleType | wrong layer: drilling details are not veins |
| geology_1.csv (853 rows: Weathering, Lithology1, Colour1, Lithology2, Alt1_Mineral, Alt1_Intensity, Min1_Type ...) | Mineralization | value = Alt1_Mineral | wrong: the lithology log went in as a mineralization layer with the alteration mineral as the value; Lithology1 and Weathering unused |
| geology_2.csv (1,132 rows: hyperspectral P_TSA_A_Mineral1 / Weight1 ..., SAMPFROM / SAMPTO) | Custom layer | from / to guessed, no value | Import button disabled (no value guess); cancelled |
| geology_3.csv (3,140 rows: gtRQD_pc) | Geotech (RQD %) | gtRQD_pc | right; notice: 2 values outside 0-110 (866-1000) |
| geology_4.csv (11,558 rows: Lithology1, Lithology2, Lithology2_pc, Colour1, Min1_Type, Min1_Amount, Alt1_Mineral, Alt1_Intensity, TextureP_1) | Mineralization | value = Alt1_Mineral | wrong: the main lithology log of the project is not a lithology layer |
| recovery.csv (2,725 rows: gtRecovery_pc) | Recovery % | gtRecovery_pc | right |
| structure.csv (366 rows: Struc_Alpha, Struc_Beta, Linear_StrucType, Planar_StrucType, Infill_Min1 ...) | Structure planes | depth GEOLFROM, type Linear_StrucType, alpha / beta, bottom-of-hole | right (Planar_StrucType would be the better type column) |
| assays_1.csv (722 rows: Au, AuRp1, AuRp2, SAMPLEID, LABCODE, SAMPFROM / SAMPTO) | Veins (in a clean project, re-checked on a scratch profile: value = SAMPLETYPE); in the run it came up as Custom layer because the veins layer already held the drilldetail rows for the same holes (guardGuess) | from / to, value SAMPLETYPE | not recognized as assays: SAMPFROM / SAMPTO are not in the assay path's FROM_COL / TO_COL regex, so one element column is not enough even with "assays" in the file name; in the run the Import button was disabled (Custom with no value) and the file was cancelled |
| assays_2.csv (10,422 rows: Au1, SAMPLETYPE, SAMPFROM / SAMPTO) | Veins | value = SAMPLETYPE (the "type" alias), re-checked on a scratch profile | wrong: 10,422 gold assays imported as a vein layer whose value is the sample type; assays stayed at 0 |
Tabs after loading: 3D View (Fit) stall 525 ms; Geochem, Geophysics, Targeting, Layout open in under 4 s with no errors.

#### lithium (A-number 119127: 2,248 holes, 39 DD / 822 RC / 1,387 AC, LCT pegmatite lithium, Yilgarn; 4 files, 2.6 MB + 6.1 MB assays) - port 9492
Dialogs 285-571 ms after the drop, the assay dialog 3.8 s (6.1 MB, 21,974 rows x 43 oxide columns); worst stall 1,208 ms on the
19,850-row lithology commit, 1,190 ms on the 3D View tab; page errors 0; heap 53 MB; peak working set 945 MB; autosave 7.8 MB.
| File | Guessed as | Mapping | Result |
|---|---|---|---|
| collars.csv (Hole_id, MGA_Z, GBMG_East, GBMG_North, GBMG_RL, Drill_Comp, Tenement: a local mine grid with MGA elevation) | Custom layer | Hole ID only | not recognized as a collar file: the collar test needs "easting" / "northing" or an exact x / y / east / north column, and GBMG_East is none of those, although the Collars mapper would take it by the "east" substring. Import disabled, cancelled: the project had no collars |
| survey.csv (Hole_id, Surveyed_Depth, Dip, Azimuth_True, Surv_Type) | Survey | Hole_id / Surveyed_Depth / Azimuth_True / Dip; Grid north | right columns, wrong north: the column says true north and the radio stayed on grid north; Surv_Type not read. 5,395 stations kept with the notice "No collars are loaded ... they are kept, and appear once collars with those hole ids are imported" (good) |
| geology.csv (Depth From / Depth To, GEOL_Rock1, GEOL_Rock2, GEOL_Rock2_pct, MIN_Colour1/2, MIN_Structure, GEOL_Weathering) | Lithology | GEOL_Rock1 | right; notice: 264 rows past the end of their hole (kept, listed in Data QC) |
| assays.csv (Hole_id, From, To, Sample_ID, Sample_type, 38 oxides As2O3 ... V2O5, total_pct) | Geochem assay dialog | 14 elements recognized: MgO, MnO, Na2O, P2O5, CaO, Fe2O3, K2O, SiO2, TiO2, Al2O3, BaO, SrO, ZrO2, Cr2O3 (Fe and Si shown as ppm, the rest %) | Li2O, Ta2O5, Nb2O5, Rb2O, Cs2O, SnO2, As2O3, NiO, PbO, Sb2O3, ZnO, CoO, ThO2, CuO, U3O8, La2O3, Bi2O3, WO3, HfO2, CeO2, Y2O3, V2O5, SO3 and total_pct were not offered: the oxide table (oxideOfHeader) stops at the rock-forming oxides, so a lithium-tantalum project loses its two commodities. 21,974 samples imported with the 14 |
Tabs: Geochem 404 ms stall, Targeting 933 ms, Layout 114 ms, no errors (with no collars nothing is drawn).

#### uranium (A-number 87304: 430 holes, 412 AC / 18 DD, calcrete uranium, Canning Basin edge; 11 files, 28 MB) - port 9494
Dialogs 286-1,584 ms; the 13.7 MB gamma log took over 8 s to its dialog (worst stall 2,588 ms) and the 165-column assay file 6.5 s
(stall 1,646 ms); page errors 0; heap 28 MB; peak working set 840 MB; autosave 680 kB (almost nothing could be imported).
| File | Guessed as | Mapping | Result |
|---|---|---|---|
| collars.csv (Hole_ID, MGA_East, MGA_North, Hole_Type, Max_Depth, Orig_Survey_Method, NAT_Grid_ID, Precollar_Depth, Lease_ID, Prospect, Hole_Status, dates, MGA_RL) | Veins | Hole_ID; value = Hole_Type | not a collar file to the detector (MGA_East is not "easting"); the "type" alias made it veins; Import disabled (no from / to); cancelled: no collars in the project |
| survey.csv (Hole_ID, Depth, Dip, AMG_Grid_ID, AMG_Azimuth) | Survey | Depth / AMG_Azimuth / Dip, grid north | right (AMG_Grid_ID not read) |
| alteration.csv (Hole_ID, mFrom, mTo, Alt1_Code, Alt1_Int, Alt1_Style, Alt2_*) | Alteration | From = mFrom, value Alt1_Code, intensity Alt1_Int, To EMPTY | mTo is not an alias of To while mFrom matches From by substring; Import disabled; cancelled |
| drilldetail.csv (Hole_ID, mFrom, mTo, Hole_Type, Hole_Diameter, Rig ...) | Veins | value Hole_Type, To empty | wrong layer and refused (mTo) |
| geology.csv (22,407 rows: Hole_ID, From, To, Lith1_Strat, Lith1_Code, Lith1_Oxidation, colours, grain size, Lith2_*, Comments) | Lithology | Lith1_Code, description Comments | right; the notice "22,404 past the end of their hole" is an artefact of having no collars (every row is "past the end" of a hole of unknown length) |
| geophysics_1.csv (10,742 rows: hyperspectral TSA_S Mineral1 / Weight1, w2200, hqd2200 ... with mid_x / mid_y / mid_z) | Mineralization | TSA_S Mineral1 | acceptable (a spectral mineral); 33 numeric spectral columns left as extra fields |
| geophysics_2.csv (439,780 rows: Hole_ID, mFrom, mTo, Priority, Raw_cps, eU3O8_cased_ppm: the gamma log) | Lithology (re-checked on a scratch profile) | From = mFrom, To empty, value empty | a 440 k-reading downhole gamma / eU3O8 log is offered as a lithology layer with no value column and refused: no alias knows cps, eU3O8 or a log channel, and mTo is unmatched; the dialog opened after about 9 s |
| geophysics_3.csv (424 rows: gamma calibration per hole: Hole_Diameter, Water Level, Sample_Type, corrections, Dead_Time ...) | Veins | value Sample_Type; From / To blank | wrong layer; 424 rows "with a blank or non-numeric from/to" imported as veins |
| assays_1.csv (9,876 rows x 165: Hole_ID, mFrom, mTo, SampleID, Sample_Type, Ag, Ag_100 ... U ...; the duplicated element columns are the company's two methods) | Assays (wide, 66 elements recognized, units assumed) | From = mFrom, To EMPTY; Ag -> Ag_100, Ba -> Ba_102, Co -> Co_102, Fe -> Fe_101 (the column with more numbers wins) | Import refused for the missing To (mTo); 9,876 multi-element samples lost; "X" (= not analysed) cells would have read as not assayed |
| assays_2.csv (988 rows: QC file with Orig_SampleID, QC_Category, no element columns) | Custom layer | From = mFrom, To empty | refused, right outcome for a QC table |
| assays_3.csv (569 rows x 43: Mo_ppm, Zr_ppm, Sr_ppm, U_ppm, Rb_ppm, Th_ppm ... pXRF) | Assays (wide, 17 elements) | To EMPTY | refused (mTo) |
Tabs: all under 200 ms stall, no errors (nothing drawn: no collars).

#### iron (A-number 119232: 6,390 holes, 6,149 RC / 143 DD, channel iron / BIF iron ore, Hamersley; 8 files, 182 MB of which 121 MB downhole logs) - port 9496
The heavy one. Dialogs: collars 370 ms, survey 5.8 s (4.4 MB, 106,738 stations), geology_1 16.0 s (13.7 MB), geophysics 56 s (121 MB, 2,584,475
log readings), assays 15 s on an otherwise idle app (26 MB, 147,891 x 38; during the run, after the log import, it did not appear within the 26 s
the harness allowed). Main-thread stalls: 10.3 s on the 6,292-collar commit, 8.4 s on the survey commit, 8.4 s after the 817-row lithology (the
re-layout with 2.6 M... no, before the logs: the redraw of 6,283 traced holes), 21.6 s on the log commit, 23.5 s on the 3,408-row recovery commit
after the logs were in (every layer commit re-processes the 2.58 M-row SG layer), 2.8-3.4 s on each 3D View fit afterwards, 2.0 s Targeting, 1.2 s
Layout. Page errors 0. JS heap 896 MB; peak working set of the Electron processes 3,233 MB; autosave 64 MB. On the 8 GB target machine this project
is at the limit: the log import alone would need a streaming / binned path.
| File | Guessed as | Mapping | Result |
|---|---|---|---|
| collars_1.csv (6,292 holes: Hole_ID, Easting, Northing, Elevation, Dip, Azimuth_TRUE, Projectcode, DrillholeType, ENDDATE) | Collars | Easting / Northing / Elevation / Dip / Azimuth_TRUE (grid north radio) | 6,283 imported, CRS first candidate GDA2020 / MGA zone 50 taken. 9 holes with a blank Elevation (RHDMET_0145 ...) were dropped without a notice the harness caught (they reappear later as "3 hole id(s) with no collar"); the true-north azimuth column was read as grid north |
| collars_2.csv (98 holes: Hole_id, GDA94_E, GDA94_N, Elevation, Drill Code, Dip, Azimuth_mag, BoreholeType, HoleStatus) | Veins | Hole_id, value BoreholeType | not detected as collars (GDA94_E / GDA94_N); Import disabled; cancelled |
| survey.csv (106,738 stations: Hole_ID, Surveyed Depth, Dip, Azimuth_TRUE, Projectcode, Survey_Type, Priority) | Survey | Surveyed Depth / Azimuth_TRUE / Dip, grid north | right columns, true north not read; 8.4 s stall on commit |
| geology_1.csv (150,456 rows x 52: Met_*_pct mineral percentages, Logged_Strand, Pyrite_Found, Wet_Dry ...) | Lithology | from / to, no value | no lithology code in this file (it is a mineralogy-percentage log); Import disabled; cancelled. Dialog 16 s |
| geology_2.csv (817 rows: Rock1 ...) | Lithology | Rock1 | right |
| geophysics.csv (2,584,475 readings: Hole_id, Depth From = Depth To (point readings), DEPTHSTEP, RUN, Density_Best, Gamma_Best, Suscep_Best) | Specific gravity (numeric) | value = Density_Best | 2,578,635 readings imported as an SG interval layer: Gamma_Best and Suscep_Best lost, zero-length intervals, and the notice "101,078 with a value outside the plausible 1-6 (-999 to 0.99)": the -999 / -999.25 no-data values were kept as densities. 56 s to the dialog, 21.6 s stall on commit, heap 194 MB -> 896 MB |
| recovery.csv (3,408 rows: Cavity, Coreloss, Metres_Drilled, Cmnts_Core_Recovery, Lithology) | Recovery % | value = Cmnts_Core_Recovery (a comments column) | wrong column by the "recovery" substring; 5 rows survived as numbers. The veto regex knows "comment" but not "cmnts"; the file has no percent-recovery column at all (Coreloss / Metres_Drilled would need a formula) |
| assays.csv (147,891 samples x 38: Al2O3_XRF_pct, As_XRF_pct ... Fe_XRF_pct, LOI1000_XRF_pct, LOITOTAL_XRF_pct ...) | Assays (wide, 25 elements, all %) | right columns; LOI1000 / LOITOTAL not recognized (checked on a scratch profile) | the dialog did not appear within 26 s during the run (3.2 GB working set at that point), so nothing was imported in the run; 15 s and importable on a fresh profile |
Tabs after loading (2.6 M SG rows, 6,283 holes, 107 k stations): 3D View fit 2.8 s stall, Geochem 1.1 s, Geophysics 0.4 s, Targeting 2.0 s, Layout 1.2 s, no errors.

#### nickel (A-number 123101: 1,218 holes, 1,199 DD, komatiite nickel, Yilgarn; 12 files, 222 MB of which 220 MB are two 136-column assay files) - port 9498
Dialogs 317-665 ms for the logs; the two 110 MB assay files took 32 s and 53 s to their dialog (280,368 rows x 136 columns each, "NULL" in
most cells); stalls 2.4 s on the 1,218-collar commit, 3.9 s lithology (31,145 rows), 2.9 s mineralogy, 2.3 s structure, 8.1 s and 16.0 s on
the assay files; page errors 0; heap 1,094 MB; peak working set 3,560 MB; autosave 30 MB.
| File | Guessed as | Mapping | Result |
|---|---|---|---|
| collars.csv (Hole_id, Easting_MGA, Northing_MGA, Elevation, Dip, Azimuth_MAG, Drill Code, Max_Depth, Prospect, Grid ...) | Collars | Easting_MGA / Northing_MGA (by the "easting" substring) / Elevation / Dip / Azimuth_MAG; grid north | 1,218 imported; CRS first candidate GDA2020 / MGA 51 taken (the Grid column says MGA94_51); the magnetic azimuth column was read as grid north |
| survey.csv (7,636: Surveyed Depth, Dip, Azimuth_MAG, Survey_Type ...) | Survey | right columns; grid north | magnetic azimuths taken as grid: every hole trace turns by the local declination (about 1 degree here, up to 10 in the Kimberley) |
| alteration.csv (Depth From / Depth To, Alt1_Code, Alt1_Int, Alt1_Style, Alt2_*) | Alteration | Alt1_Code, Alt1_Int | right |
| drilldetail.csv (Drill Code, Hole_Diameter, Rig, Drill_Start, Drill_End) | Lithology | from / to, no value | refused (right: not an interval log of a geological kind); "Rig" is a company-ish field anyway |
| event.csv (Hole_id, Depth From, To, Event_Code: BOCO, TOFR, WT ...) | Lithology | from / to, no value | refused; the regolith / weathering boundary events (base of complete oxidation, top of fresh rock, water table) have no home in GeoStrix |
| geology.csv (31,145: Lithology, Rock2, Texture, Grainsize, Comments) | Lithology | Lithology, description Comments | right |
| mineralogy.csv (3,752: Mineralisation, Min1_pct ...) | Mineralization | Mineralisation | right ("Mineralisation" matched by the "mineral" substring) |
| specgrav.csv (1,906: Weight_Wet, Weight_Dry, Weight_UnitCode, Reading, Measured_Date) | Custom layer | from / to, no value | the SG is in "Reading" (the lab's wet / dry weights beside it): no alias; refused. The mag-sus schema knows "reading" but SG does not |
| structure.csv (874: Structure, CoreAngleAlpha, CoreAngleBeta ...) | Structure planes | type Structure, alpha / beta | right |
| veining.csv (1,604: Veins, Vein1_Width, Vein1_Int, Vein1_Texture, Vein2_Code, Vein2_Int ...) | Custom layer | from / to, no value | "Veins" (plural) and "Vein2_Code" match no vein alias (vein1_comp / vein_type1 / vein1_type / type ...); refused |
| assays_1.csv (280,368 x 136: Ag ... Zr plus FANUM, FAS, Ind, p75um, WtButton, WtCharge, WtRecvd, LabCode, Batch_No; "NULL" where not analysed) | Assays (wide, 59 elements, units assumed) | Al / Ca / Fe / K / Mg / Na / S / Ti as %, the rest ppm | 280,368 samples imported after a 32 s parse and an 8 s commit; "NULL" read as not assayed (right); "Ars" (arsenic by another lab) and "Ind" not recognized; p75um / FANUM / WtRecvd correctly not taken as grades |
| assays_2.csv (the same table from the company's second file) | Assays (59 elements) | | the dialog appeared after 53 s and the harness's accept did not take within its budget (stall 16 s while the first 280 k samples were already in memory); left as not imported |
Tabs with 280 k samples loaded: Geochem 6.4 s to settle (stall 445 ms), Targeting stall 758 ms, 3D View fit 389 ms; no errors.

#### large (155 reports, 121.55-121.95 E / 31.15-31.45 S: 54,150 collar rows, 51,253 distinct hole ids; 18 files, 543 MB, DMIRS's harmonized column names) - port 9499
Launched 10:11; 17 of the 18 files went through the wizard in 15 minutes; the 380 MB assays.csv (3,101,578 rows x 85 columns) was dropped at
10:28 and no dialog had appeared when the app's page vanished at 13:14 (DevTools socket closed, every electron.exe gone, no Windows Error
Reporting record, no Crashpad dump in the profile): the renderer parsed for 2 h 45 min and died. Peak working set of the Electron processes
6,518 MB (memwatch, 3,020 samples) on a 15.7 GB machine with 1 GB free at times; page errors 0 up to the crash; the last autosave (10:22,
55 MB) holds collars, survey and the geotech-as-structure layer.
| File | Guessed as | Mapping | Result |
|---|---|---|---|
| collars.csv (6.4 MB, 54,150 rows: HoleId, Anumber, Longitude_GDA2020, Latitude_GDA2020, Easting, Northing, Datum, Projection, Zone, Elevation, HoleType, MaxDepth, Dataset) | Collars | HoleId / Easting / Northing / Elevation / MaxDepth; azimuth and dip none | dialog in 0.5 s; CRS question answered GDA2020 / MGA 51 (first candidate; the Datum / Projection / Zone columns say GDA94 MGA 51 for most rows); commit stalled the main thread 56.8 s; 34,623 collars kept of 51,253 distinct ids: the 16,630 holes whose Elevation cell is blank were dropped with no notice (the harness read an empty notices list), and the 2,897 repeated hole ids collapsed silently |
| survey.csv (18.7 MB, 607,783 stations: HoleId, Depth, Dip, Azimuth, MRTFileId) | Survey | right columns; grid north | dialog after 12.7 s; commit stall 149.3 s (2.5 minutes with the window frozen); 605,640 stations kept (the 2,143 with no collar dropped or deduplicated, no notice) |
| alteration.csv (6.0 MB, 57,101: FromDepth, ToDepth, alt1_code, alt1_int, alt1_style ...) | Alteration | FromDepth, To none, alt1_code, alt1_int | refused: "ToDepth" is not an alias of To while FromDepth matches From; Import disabled. Dialog 11.1 s |
| drilldetail.csv (0.9 MB, 10,466: sample_type, hole_diameter, rig ...) | Veins | FromDepth, To none, value sample_type | refused (To); the "type" alias again |
| event.csv (2.8 MB, 21,331: structure, comments, intensity, alpha ...) | Structural zones | FromDepth, To none, structure / comments / intensity / alpha | refused (To); the guess itself is right for these rows |
| geology.csv (131 MB, 1,346,442 x 64) | Lithology (the dialog found afterwards said "1346442 rows detected") | | the dialog did not appear within the harness's 131 s budget (stall 57.7 s while parsing); the leftover dialog was cancelled. Not imported |
| geophysics.csv (12.9 MB, 146,829 readings) | no dialog within 35 s | | nothing recorded (stall 8.4 s); the dialog probably opened after the budget and was taken by the next drop's leftover check. Not imported |
| geotech.csv (173 kB, 3,754: structure, dip_pl, ...) | Structure planes | HoleId, depth FromDepth, type structure, dip dip_pl | imported 3,754 planes; the commit stalled 116.7 s (two minutes for 3,754 rows: whatever is recomputed per layer commit scales with the 605 k survey stations / 34 k holes, not with the layer) |
| hyperspectral.csv (523 kB) | Assays (wide, 5 "elements" recognized: mgoh, kaolinity, cryst ...) | | dialog after the budget (stall 12.3 s), cancelled; spectral indices taken for elements |
| pxrfreadings.csv (331 kB, 23 elements) | pXRF (wide) | Hole ID none | dialog after the budget (stall 15.7 s), cancelled; the pXRF detector is right; hole id not guessed from "HoleId" here because the dialog was the assay one (to check) |
| recovery.csv (233 kB, 4,250: rqd_pct, core_recovery_pct ...) | Geotech (numeric) | rqd_pct | refused (To) |
| regolith.csv (1 kB, 32: regolithcode) | Lithology | regolithcode | refused (To) |
| specgrav.csv (84 kB, 1,078: sg) | Specific gravity | sg | refused (To); guess right |
| structure.csv (2.1 MB, 18,955: depth, structure type columns ...) | Custom layer | FromDepth, depth, value none | refused |
| veining.csv (5.6 MB, 56,504: vein1 comp ...) | Veins | vein1 comp | refused (To); guess right |
| water.csv (54 kB, 1,026: water table, geotech_rqd_pct_d ...) | Geotech (numeric) | geotech_rqd_pct_d | refused (To); wrong guess (a water-table table) |
| weathering.csv (388 kB, 6,298: weathering codes) | Custom layer | no value | refused |
| assays.csv (380 MB, 3,101,578 x 85: HoleId, FromDepth, ToDepth, SampleId, Au_ppm, Ni_pct ...) | | | no dialog in 2 h 45 min; app gone at 13:14 (renderer death); peak working set 6.5 GB |
Every dialog on this project took 5-17 s to open even for files under 100 kB (regolith.csv 1 kB: 12 s), against 0.3-0.6 s on the small
projects: with 605 k survey stations loaded the main thread is busy for seconds after every drop. Tabs were not reached (the run ended in the
assays step).

### 4.2 Failures logged from the live imports

Priority per the brief: crashes, data loss and wrong numbers High; wrong or missing guesses Medium; polish Low. Section 7 turns these and the harvest findings into TASKS rows.
Each item: what happened (file in projects\<area>\csv, step), the code it points at, the priority per the brief.

E1. Medium (wrong guess, data lands in the wrong layer). The main lithology logs of the gold project (geology_1.csv 853 rows, geology_4.csv 11,558 rows:
    Lithology1, Lithology2, Colour1, Min1_Type, Alt1_Mineral, Alt1_Intensity ...) are guessed as Mineralization with Alt1_Mineral as the value:
    guessTarget's "mineral" fallback (substring in Alt1_Mineral / Min1_Type) fires before the lithology rule, which only knows litho / unit / lith
    tokens and not "Lithology1". Repro: drop projects\gold_small\csv\geology_4.csv on the 3D view. Expected: Lithology, value Lithology1.
E2. Medium. The gold assay files (assays_1.csv: Au, AuRp1, AuRp2 + SAMPFROM / SAMPTO / SAMPLEID / SAMPLETYPE; assays_2.csv: Au1 + SAMPLETYPE) are not
    recognized as assays and go to Veins with value = SAMPLETYPE (the "type" alias): looksLikeAssay needs 4 element columns, or 1 plus FROM_COL / TO_COL,
    whose regexes lack sampfrom / sampto (the interval schema has them). 10,422 gold assays were imported as a vein layer. Repro: drop assays_2.csv.
E3. Medium (refusal of whole files). "mTo" is not an alias of To (mFrom matches From by substring): in the uranium project alteration.csv, drilldetail.csv,
    the 440 k-row gamma log, the 165-column multi-element assays (9,876 samples) and the pXRF assays all opened with To empty and the Import button
    disabled. The same name is in 14,164 WAMEX files. One-line fix in layers.js intervalFields and in the assay dialog's to aliases (mto, depthto, dto,
    todepth, enddepth).
E4. Medium. A collar file whose coordinates are MGA_East / MGA_North (uranium) or GBMG_East / GBMG_North (lithium: a mine grid) is not detected as collars
    (guessTarget needs "easting" / "northing" or an exact x / y / east / north) and lands in Veins (uranium: Hole_Type as the "type" value) or Custom
    (lithium), both with Import disabled. The Collars mapper itself would accept them by the "east" substring. Both projects ended with zero collars; the
    app then kept every survey and interval import with a clear "appear once collars with those hole ids are imported" notice (good behaviour).
E5. Medium. A local mine grid is not noticed: gold collars_2.csv (EAST 31,950-32,315, NORTH 807,798-808,239) imported as MGA zone 51 coordinates, 400 km
    from the 8 georeferenced holes of collars_1.csv, with "X/Y are on a local mine grid" left unticked and no warning. A magnitude test (eastings under
    100,000 in a projected CRS) or the grid-name column (GRIDNAME = MGA94_51 in collars_1 only) would catch it.
E6. Medium. The CRS question's first candidate is GDA2020 / MGA zone 51 while the collar file states MGA94_51 (GRIDNAME column) and the survey file
    AMG_AZIMUTH / AMG grid: the grid-name columns are not read when ranking candidates (1.5 m offset for GDA94 vs GDA2020; 200 m for AGD84).
E7. Medium. Survey north reference: lithium survey.csv has Azimuth_True and the dialog stayed on "Grid north"; gold / uranium have AMG_AZIMUTH /
    AMG_Azimuth / Azimuth_UTM (grid, right by default). The reference in the column name is not read; SURVTYPE / Surv_Type (GYRO) is not read.
E8. Medium. Oxide assays: of the 38 oxides in the lithium file only 14 (MgO, MnO, Na2O, P2O5, CaO, Fe2O3, K2O, SiO2, TiO2, Al2O3, BaO, SrO, ZrO2, Cr2O3)
    are recognized; Li2O, Ta2O5, Nb2O5, Rb2O, Cs2O, SnO2, As2O3, NiO, PbO, Sb2O3, ZnO, CoO, ThO2, CuO, U3O8, La2O3, Bi2O3, WO3, HfO2, CeO2, Y2O3, V2O5,
    SO3 are dropped: oxideOfHeader lists the rock-forming oxides only, so an LCT pegmatite project loses Li2O and Ta2O5. Also Fe2O3 and SiO2 came up as
    "ppm" in the dialog (the max-over-100 rule on an oxide column: to check).
E9. Medium. Downhole geophysical logs (uranium geophysics_2.csv: Hole_ID, mFrom, mTo, Priority, Raw_cps, eU3O8_cased_ppm; 439,780 rows) are offered as a
    lithology layer with no value; there is no alias for gamma / cps / eU3O8 / density / caliper / susceptibility log channels and no "downhole log"
    target in the wizard (the Geophysics tab has a Downhole logs panel but the drop on the 3D view never reaches it). The dialog for the 13.7 MB file
    took about 9 s to open.
E10. Medium. Tables that are not intervals (drilling details: dsHoleType / Hole_Type / Hole_Diameter / Rig; the gamma calibration table with Water Level and
    Dead_Time) are guessed as Veins through the "type" alias, with blank from / to accepted ("424 with a blank or non-numeric from/to ... imported as they
    are"). A table whose only match is "type" should be a Custom layer or attributes, not veins.
E11. Low. With no collars loaded, the lithology notice says "22,404 past the end of their hole": every row is past the end of a hole of unknown length;
     the check should be skipped (or worded) when the hole has no collar yet.
E12. Low. Hyperspectral TSA tables (P_TSA_A_Mineral1 / Weight1 ..., or TSA_S Mineral1 with mid_x / mid_y / mid_z) come up as Custom with no value
     (gold) or Mineralization (uranium); a "spectral mineral" alias (tsa, mineral1 with weight) would make them consistent.
E13. Low. The duplicated element columns in the uranium assay file (Ag and Ag_100 ... the company's two methods, DMIRS-suffixed) are resolved by
     "the column with more numeric values wins": right here, but the dialog gives no hint which method was taken.
Good behaviour seen: every dialog opened in under 0.6 s for files under 1 MB; commits of 10-20 k rows under 1 s; no page error in three areas;
survey and interval files imported before their collars are kept and attached later; the Geotech plausibility notice (RQD 866-1000) and the
"past the end of hole" Data QC hook; peak Electron working set 840-945 MB with 22 k lithology + 22 k assay rows.

**Composite area (155 reports, 54,150 collar rows, DMIRS's harmonized column names; port 9499)**

E14. High (silent data loss). collars.csv: 51,253 distinct hole ids, 34,623 collars kept: every collar whose Elevation cell is blank (16,630 holes) was
     dropped without a notice (the iron project lost 9 the same way). A collar with x / y and no z should be kept at z = 0 (or the DEM / mean) with a
     count in the notice; the harness's notices list was empty after the commit.
E15. High (refusal of whole files). "ToDepth" is not an alias of To while "FromDepth" matches From by substring, so 13 of the 16 harmonized interval
     tables (alteration 57,101 rows, veining 56,504, events 21,331, drilling 10,466, weathering, recovery, SG, regolith, water ...) opened with To empty
     and Import disabled. FromDepth / ToDepth is the pair DMIRS itself publishes (and the pair gsd_dhAssayFlat uses); "mTo" (E3) and "ToDepth" are the two
     most common To spellings in the State. Same one-line fix as E3 (layers.js intervalFields; importHelpers.js TO_COL; longAssays.js).
E16. High (performance, window frozen). Commits scale badly with the station count: 54,150 collars stalled the main thread 56.8 s, 607,783 survey stations
     149.3 s, and a 3,754-row structure-planes layer 116.7 s after them (3,754 rows; 2.4 s for 874 rows on the nickel project with 7,636 stations). Every
     later dialog, even for a 1 kB file, took 5-17 s to open. Whatever is rebuilt on each commit (desurvey of every hole, the trace geometry, the
     attribute index) runs for all 34,623 holes each time instead of for the touched holes, and runs on the main thread.
E17. High (crash). The 380 MB assays.csv (3,101,578 rows x 85 columns) never produced a dialog: the renderer parsed for 2 h 45 min at up to 6.5 GB
     working set and then the page vanished (DevTools socket closed, every electron.exe gone, no WER record, no Crashpad dump). The 131 MB geology file
     (1,346,442 rows) did open a dialog but only after the 131 s budget (57.7 s stall). The wizard reads the whole file into memory on the main thread
     and keeps several copies (text, rows, previews); files above about 100 MB need a streaming / worker parser with a row cap or an aggregation
     prompt ("3.1 M samples: import composites?").
E18. Medium (wrong guesses on the harmonized names). geotech.csv (structure, dip_pl columns) was taken for Structure planes and imported as such;
     water.csv (water table) for Geotech numeric via geotech_rqd_pct_d; hyperspectral indices (mgoh, kaolinity, cryst ...) for 5 "elements" of a wide
     assay file; drilldetail for Veins by sample_type. The pXRF detector was right (23 elements, "Import pXRF" dialog).
E19. Low. 2,897 repeated hole ids across reports (the same CompanyHoleId in two A-numbers) collapsed silently; the status bar and the notice should say
     "N rows shared a hole id; the first was kept" (48 % of the State's collars share their CompanyHoleId with another report).
E20. High (performance). Reopening the saved projects (scripts\electron\reopen_time.mjs, three runs each on a fresh profile): the 250-hole and
     430-hole projects show their status bar in 0.9-1.0 s and are interactive 0.3 s later; nickel (1,218 holes, 560 k x 136 assays, 30 MB) in 1.7 s
     plus 1.4 s of main-thread work after the status bar; iron (6,283 holes, 2.6 M log readings, 64 MB) in 6.3-9.1 s plus 2.9 s; the composite
     (34,623 holes, 608 k stations, 55 MB with no assays) shows "Holes: 34,623" after 9.5-13.5 s and then blocks the main thread for another
     27-29 s before a trivial eval returns, with 400-440 ms gaps afterwards and a 3.9-4.8 GB working set. The 3 s target holds up to about
     2,000 holes; above that the open cost follows the JSON size and whatever is rebuilt for every hole on load (the same per-hole work as E16).

## 5. Performance against the targets (startup 3 s, an 8 GB machine)

Machine: Windows 11, 15.7 GB RAM, the worktree build (dist over app://) on a fresh profile each time. The empty-app figure is the
repo's own `scripts/measure-startup.mjs` (first paint of the ribbon); the project figures are `scripts\electron\reopen_time.mjs`:
Electron spawned with the project path, time to the DevTools page (cdp), time until the ribbon is up and the status bar shows
"Holes: N" (holes; for uranium and lithium, whose collar files were refused at import, the moment the survey store is populated instead), then a trivial eval round trip (eval: the main thread is free when this is a few ms), the JS heap after two
seconds, the worst main-thread gap in the next three seconds, and the working set of all Electron processes. Three runs each, the
first run on each profile is the cold one; the table shows the median run and the cold one in brackets where they differ.

Empty app (`node scripts/measure-startup.mjs 5`, a fresh profile): cold first run 1,358 ms; warm 1,037 / 917 / 918 / 851 ms,
median 918 ms. Within the 3 s target with room to spare on this machine.

| Project (contents, autosave size) | Runs loaded | Time to DevTools page | Time to ready (ribbon + status bar count, or the survey store for the two collar-less projects) | Eval round trip once ready | JS heap after 2 s | Worst main-thread gap in 3 s | Electron working set |
|---|---|---|---|---|---|---|---|
| gold_small (250 holes, 0.9 MB) | 3 of 3 (250 holes) | 429 ms (505 ms cold) | 0.9 s | 291 ms | 61 MB (68 MB cold) | 12 ms | 744 MB (767 MB cold) |
| uranium (0 collars (refused at import), 430 stations, 22 k geology, 0.7 MB) | 3 of 3 (430 stations) | 638 ms (655 ms cold) | 1.1 s | 51 ms (54 ms cold) | 19 MB | 12 ms | 630 MB |
| sample_check (the proposed sample, 430 holes, 0.5 MB) | 3 of 3 (430 holes) | 445 ms (493 ms cold) | 1.0 s | 302 ms (345 ms cold) | 57 MB (61 MB cold) | 13 ms | 757 MB (764 MB cold) |
| lithium (0 collars (refused), 5,395 stations, 20 k geology, 22 k x 14 assays, 7.8 MB) | 3 of 3 (5,395 stations) | 625 ms | 1.7 s (1.6 s cold) | 5 ms (13 ms cold) | 53 MB | 13 ms (12 ms cold) | 710 MB (715 MB cold) |
| nickel (1,218 holes, 560 k x 136 assays, 30 MB) | 3 of 3 (1,218 holes) | 471 ms (529 ms cold) | 1.7 s (1.9 s cold) | 1,363 ms (1,558 ms cold) | 186 MB (190 MB cold) | 24 ms | 1,189 MB (1,190 MB cold) |
| large (34,623 holes, 608 k stations, 55 MB) | 3 of 3 (34,623 holes) | 684 ms (479 ms cold) | 12.6 s (9.5 s cold) | 28,799 ms | 929 MB (941 MB cold) | 418 ms | 4,676 MB (3,872 MB cold) |
| iron (6,283 holes, 2.6 M log readings, 64 MB) | 3 of 3 (6,283 holes) | 670 ms (643 ms cold) | 6.5 s (9.1 s cold) | 2,844 ms (2,812 ms cold) | 721 MB | 54 ms | 2,108 MB (2,109 MB cold) |

Import side (section 4 has the per-file numbers):

| Project | Rows that mattered | Time to the dialog | Longest main-thread stall | Peak working set | JS heap after |
|---|---|---|---|---|---|
| gold_small (250 holes) | 16,683 geology, 11,144 assays | 0.27-0.34 s | 0.6 s | 870 MB | 66 MB |
| lithium (2,248) | 19,850 geology, 21,974 x 43 assays | 0.3-0.6 s; assays 3.8 s | 1.2 s | 945 MB | 53 MB |
| uranium (430) | 22,407 geology, 439,780 gamma readings (refused) | 0.3-1.6 s; gamma log 8-9 s | 2.6 s | 840 MB | 28 MB |
| nickel (1,218) | 31,145 geology, 2 x 280,368 x 136 assays | 0.3-0.7 s; assays 32 s and 53 s | 16 s (second assay file) | 3,560 MB | 1,094 MB |
| iron (6,390) | 106,738 stations, 2,584,475 log readings, 147,891 x 38 assays | collars 0.4 s, survey 5.8 s, geology 16 s, logs 56 s, assays 15 s | 23.5 s (a 3,408-row commit after the logs) | 3,233 MB | 896 MB |
| large (54,150) | 607,783 stations, 1,346,442 geology (refused), 3,101,578 x 85 assays (crash) | collars 0.5 s, survey 12.7 s, 1 kB files 5-17 s, geology over 131 s, assays never | 149 s (survey commit); 117 s (3,754-row layer) | 6,518 MB | not reached |

What the numbers say against the targets:

- **Startup.** The empty app opens in 0.9 s. The 250-hole and 430-hole projects show their status bar in 0.9-1.0 s and answer a
  trivial eval 0.3 s later, so they are interactive in about 1.3 s; nickel (1,218 holes, 560 k x 136 assays) shows "Holes: 1,218"
  at 1.7 s and is interactive at about 3.1 s. Those are within or at the 3 s target. iron (6,283 holes, 2.6 M log readings) takes
  6.3-9.1 s to the status bar and 2.9 s more before the main thread answers; the composite shows "Holes: 34,623" at 9.5-13.5 s and
  then blocks the main thread for another 27-29 s, with 400-440 ms gaps afterwards (the 3D View's frame budget is 16 ms). The
  target holds up to about 2,000 holes; above that the open cost follows the JSON size and the per-hole work done on load (E20, T25).
- **Memory on an 8 GB machine.** gold, lithium and uranium stay under 1 GB of working set during import and open at 0.5-0.8 GB.
  nickel (560 k assay rows x 136 columns) and iron (2.6 M log readings) reach 3.2-3.6 GB during import, which on an 8 GB laptop
  with a browser open is the swap line, and reopen at 1.2 GB and 2.1 GB; the composite reached 6.5 GB and died during import and
  reopens at 3.9-4.8 GB with no assays loaded at all. The autosaves are 30 MB (nickel), 64 MB (iron) and 55 MB (composite, with only
  collars, survey and one small layer): the file format stores the wide assay table, the log readings and every survey station as
  row-per-object JSON, so both the file size and the reopen cost follow the row count.
- **Where the time goes.** (1) The CSV parse runs on the main thread and holds the whole text and the parsed rows at once: 110 MB
  takes 32-53 s to a dialog, 131 MB over two minutes, 380 MB never. (2) Each commit rebuilds something for every hole in the
  project rather than for the holes touched: 54,150 collars 57 s, 607,783 stations 149 s, and then 117 s for a 3,754-row layer
  that would take 2 s in a small project; on the iron project every commit after the 2.6 M-row log stalled 8-23 s. (3) The 3D View
  fit after a heavy import stalls 2.8-3.4 s (iron). None of this is a page error: the app never threw, it only froze.
- **The 8 GB target machine would see:** the iron and nickel projects import, slowly, with the window frozen for up to half a minute at
  a time; the composite area (a 30 x 30 km goldfield, what a regional explorer would load) is not importable today, and even its
  collars-and-survey autosave takes 40 s to become usable. T16, T22, T23 and T25 in section 7 are the rows that matter for the
  "light enough for cheap computers" pillar.

## 6. Proposed sample project

`C:\GeoStrixData\wa-drillholes\proposed\sample_data\wa_uranium\` (2.1 MB) with its README and the build script
`proposed\scripts\samples\build-wa-uranium.mjs` (to live in scripts/samples/, run against projects\uranium\csv). 430 aircore and
diamond holes of a calcrete uranium prospect: collars (MGA94 zone 51 with an epsg column so no CRS question is asked), one-station
surveys, 22,407 lithology intervals with oxidation state and comments, 2,003 alteration intervals, 9,876 multi-element assays (U, Th,
V, Cu, Pb, Zn, Ni, Co, As, Ce, La, Nd, Pr, Sm, Ba ppm; Fe, Ca, K, Al, S %), and a 43,978-reading downhole gamma / eU3O8 log (every 10th
of 439,780). Checked through the wizard on a fresh profile: collars, survey, alteration, lithology and assays import without a question
(the CRS question appeared before the epsg column was added); the gamma log cannot be dropped (it is guessed as structure planes with no
value) and has to be added as a custom layer with eU3O8_ppm picked by hand, which is finding E9 again and the reason the sample is worth
bundling: it is the only sample with a downhole log and a uranium / calcrete deposit style. The licence allows it (CC BY 4.0 with the
attribution in the README; no company or personnel names are in the files; the README carries the State's disclaimer).

Bundled on 2026-11-08 as `sample_data/wa_uranium/` (TASKS #2168, the T20 row below): the build script moved to `scripts/samples/`,
the lab's method columns are now joined into one value per element (U present for 9,733 of 9,862 samples instead of 5,060; S joined as
ppm; the 14 Superseded rows dropped), the gamma log's no-data codes (-1 and -1,830,000,000 eU3O8; a 10,700,000 cps count) are removed
(43,923 readings), and the gamma log loads as the numeric custom layer "Gamma eU3O8 (ppm)" through `src/lib/sampleWaUranium.js`
rather than by hand. The sample is the fifth card on the empty 3D View and the fifth entry of File > Open Sample Project.

Correction, 2026-11-09 (TASKS #2323): the geology table keeps every re-log with a `Superseded` flag, and 13,624 of its 22,407 rows are
superseded versions that overlap the current log in 407 holes. The first build of the sample (shipped in v0.1.106) included them all; the
sample's lithology is now the 8,783 current intervals, with the company's stratigraphic unit carried as a `strat` column. The 22,407 figure
elsewhere in this report is the raw table's row count, which is right; any conclusion drawn from it about logged metres is 2.5 times too high.

## 7. Proposed TASKS rows (module, feature, priority, notes) — paste-ready, pending Matt's approval

Each row's notes name the evidence (file under C:\GeoStrixData\wa-drillholes) and the code to touch. Priorities follow the brief: wrong numbers
or data loss High, wrong or missing guesses Medium, polish Low. Rows T1-T3, T21-T23 and T25 come from the live imports and reopen timings and would have changed the
outcome of five of the six test projects.

| # | module | feature | priority | notes |
|---|---|---|---|---|
| T1 | Import | "mto" / "todepth" / "depthto" / "dto" / "enddepth" as aliases of To (interval schema, assay dialog, FROM_COL / TO_COL) | High | mTo is the most common unmatched column name in WAMEX (14,164 files) while mFrom matches by substring, and "ToDepth" (DMIRS's own harmonized name, paired with FromDepth) refused 13 of the 16 interval tables of the composite project (alteration 57,101 rows, veining 56,504, events 21,331 ...); in the uranium test every file with mFrom / mTo (alteration, drill details, the 440 k-row gamma log, 9,876 multi-element assays, pXRF assays) opened with To empty and Import disabled. layers.js intervalFields `to`; importHelpers.js TO_COL; longAssays.js to aliases. Evidence: projects\uranium\import_log.json, projects\large\import_log.json, harvest\column_guess_report.json |
| T2 | Import | Recognize SAMPFROM / SAMPTO (and sampfrom/sampto, samp_from, interval_from) in the assay detector, and never route a file with element columns to Veins through the "type" alias | High | gold_small assays_1 / assays_2 (Au, AuRp1, Au1 with SAMPFROM / SAMPTO / SAMPLETYPE) were not assays to looksLikeAssay (one element column + unmatched from/to) and were imported as a Veins layer whose value is the sample type: 10,422 gold assays in the wrong place with no warning. importHelpers.js FROM_COL / TO_COL / looksLikeAssay; guessTarget's "type -> vein" fallback should require a vein-ish column or file name |
| T3 | Import | Collar detection: accept the Australian grid prefixes (mga_e / mga_n, amg_e / amg_n, gda94_e / gda94_n, nat_east / nat_north, local_e / local_n, <grid>_east / <grid>_north, mga_rl / nat_rl / orig_rl / local_rl, "td") in guessTarget and in the collars schema | High | three of six test collar files were not recognized as collars (MGA_East / MGA_North, GDA94_E / GDA94_N, GBMG_East / GBMG_North) and went to Veins / Custom with Import disabled, leaving the project without collars; in the database these names miss x / y about 9,000 times each and z 11,751 times. guessTarget needs "easting" / "northing" although the mapper would take "east". harvest\datafiles\wa-column-aliases.json has the list with counts |
| T4 | Import | Substring guards: a comments / cmnts / nominal / planned / ref / precollar / boco / tofr / water column must not win a numeric field | Medium | iron recovery.csv mapped Recovery % to "Cmnts_Core_Recovery" (a comment column: 5 numeric rows); length takes precollar_depth (2,552 files) / boco_depth / tofr_depth / water_depth over "td"; azimuth takes nominal_azimuth; dip takes nominal_dip; hole id takes hole_type / hole_status / parent_hole_id. Extend the notAValue veto (cmnts, nominal, planned, ref_, orig, precollar, boco, tofr, water) and the hole-id veto (type, status, parent, purpose, path, diameter) |
| T5 | Import | Lithology before Mineralization when a Lithology1 / Lith1_Code / Rock1 column is present; "Lithology1", "Lith1", "Rock1", "GEOL_Rock1", "LithCode", "Maj Lithcode" as lithology aliases | Medium | gold_small geology_1 / geology_4 (the project's lithology logs, 12,411 rows) were guessed as Mineralization with Alt1_Mineral as the value because the "mineral" fallback runs before the lithology test and "Lithology1" is not a lithology alias. Also Alteration: alt1_int / alt1_style / alt2_code / altn1; Veins: "Veins", Vein2_Code, Vein1_Width; SG: "Reading" beside Weight_Wet / Weight_Dry; minerals: Min1_Code (nickel) |
| T6 | Import | Read the north reference from the azimuth column name (Azimuth_MAG / Azimuth_TRUE / Azimuth_UTM / MGA_Azimuth / AMG_Azimuth / Azimuth_mag) and from AZIMUTHGRIDNAME, and the survey method column (GYRO / REFLEX / DEVIFLEX / EMS / COLL / PLANNED ...) | Medium | lithium (Azimuth_True), nickel (Azimuth_MAG collar and survey) and iron (Azimuth_TRUE) all imported with the Grid north radio; detectAzimuthRef only reads an AZIMUTHTYPE-style column (622 k rows in the database) and not AZIMUTHGRIDNAME (433 k) or the column name itself. Data: wa-survey-conventions.json. Offer "this file has both Azimuth_MAG and Azimuth_TRUE: which one?" |
| T7 | Import | Read grid / datum names from the file (GRIDNAME, NAT_Grid_ID, MGA_Grid_ID, Grid, Datum, Zone, COORDSYS, LL_Grid_ID: MGA94_51, AMG84_51, MGA94_Z50, GDA94_51S, LL_WGS84 ...) to pre-select the CRS, and local-grid names (MINE, PAN, TRI_MINE, ATTILA, MMC ...) to tick "local mine grid" | Medium | every test project asked the CRS question although the collar file said MGA94_51 / MGA94_50 (the composite file has Datum / Projection / Zone columns); the first candidate offered is GDA2020 while the files are GDA94 or AGD84 (1.5 m / 200 m). epsgFromColumns knows only NAD83 / NAD27 / WGS84 UTM names. Data: wa-grid-names.json (name -> EPSG). Also accept AGD66 / AGD84 AMG names in .prj |
| T8 | Import | Local mine grid detection: eastings under 100,000 or a grid-name column with a non-UTM name tick "X/Y are on a local mine grid" (or warn) | Medium | gold_small collars_2 (242 holes, EAST 31,950-32,315 / NORTH 807,798-808,239) imported as MGA 51 metres, 400 km from the 8 georeferenced holes, no warning; lithium collars (GBMG grid, 10,050 / 11,119). 67 WAMEX collar rows have eastings under 100,000 and 39,089 attribute rows say "MINE" |
| T9 | Geochem | Oxide table: add Li2O, Ta2O5, Nb2O5, Rb2O, Cs2O, SnO2, As2O3, NiO, PbO, Sb2O3, ZnO, CoO, ThO2, CuO, U3O8, La2O3, Bi2O3, WO3, HfO2, CeO2, Y2O3, V2O5, SO3, Al203 (zero typo); LOI, LOI1000 / LOI371 / LOI650 / LOITOTAL as loss-on-ignition, not elements | Medium | lithium assays.csv: of 38 oxides 14 were recognized and Li2O / Ta2O5 (the commodities) dropped; iron LOI1000_XRF_pct / LOITOTAL not offered. geochem.js oxideOfHeader / isElementColumn. Also AUPPB / AUPPM / PTPPB (unit glued to the symbol, 336 / 226 / 147 files), "percent" / "pc" / "wt_pct" units, Au1 / Au2 / Au-Rp1 repeats ranked below the plain column. Data: wa-analyte-aliases.json |
| T10 | Geochem | Below-detection and no-data notation: "< LOD" / "<LOD" / BDL / ND / "<" alone as below detection; -1 and -9 (and -666, -5000, -33330000) as no-data codes rather than halved values when the column's detection limit is known; "NULL", "X", "N/L", "-", NA, N/A, NS as not assayed with a count in the notice | Medium | 24 M "<x" values, 47 M negatives (12 M of them -0.01 ... which halve correctly; 4.1 M "-1" and 0.25 M "-9" become 0.5 / 4.5 below-detection values), 83 M NULL, 11.7 M X, 6 M "< LOD" / "<LOD" in WAMEX assay cells. geochem.js readAssayCell / NO_DATA_SENTINEL_MAX. Data: wa-null-notation.json |
| T11 | Import | Null sentinels outside assays: -999, -9999, -999.25, -99999 as missing in collar RL / depth / dip, survey and interval numerics (num() today blanks only text) | Medium | iron geophysics.csv: 101,078 readings of -999 / -999.25 imported as densities ("outside the plausible 1-6"); PCDEPTH -999 (2,777 collar rows), water table -999, X_east -99999 in the database; the LAS reader already knows COMMON_NULLS. layers.js num() and the Data QC plausibility notice |
| T12 | Geophysics | A downhole-log import target: gamma (cps / API), density (g/cc), susceptibility (SI), caliper, conductivity / resistivity, eU3O8, with point depths and several channels per file; and 2.5 M-reading logs binned or streamed rather than stored as SG intervals | High (performance and wrong layer) | iron geophysics.csv (2,584,475 readings: Density_Best, Gamma_Best, Suscep_Best) was guessed as a Specific gravity interval layer: one channel kept, 56 s to the dialog, 21.6 s stall, heap 896 MB and 3.2 GB working set, and every later layer commit stalled 8-23 s; uranium gamma (Raw_cps, eU3O8_cased_ppm) was offered as Lithology with no value and refused. 57,503 WAMEX collars carry 45 M log readings. Data: wa-downhole-log-channels.json |
| T13 | Import | Hole type column (Hole_Type, Drill_code, Drill Code, HoleType, DRILL_TYPE, DrillType, DrillholeType, Rig_Type, Drill_Method) read into a first-class collar field with DMIRS's spelling table | Medium | no guesser today; the values drive filters, colouring and the Mine Design / Targeting assumptions (RC vs DD vs AC). Spellings: RC 480 k rows, RAB 338 k, AC 259 k, VAC, AU, RB, DRILLHOLE, AIRCORE, DD, DDH, PHRAB, D, NR, AUGER, GCRC, RCAC, "AIR CORE", RC/DD, RCD ... Data: wa-hole-types.json (cfg_LookupHoleType patterns) |
| T14 | Import | Weathering / oxidation / regolith as a layer kind (codes FR / SW / MW / HW / CW / OX / TPD / USAP / LSAP / SAPRK / COV ...), and regolith boundary events (BOCO, TOFR, TOSA, WT, BOA) as hole-level depths | Medium | weathering 5,096 files, oxidation 2,237, regolith 3,217, events 68 M rows in the database; the file-name rule sends "weathering" to Custom and the nickel event.csv (Event_Code) was refused. Data: wa-logging-codes.json, wa-lithology-codes.json; feeds TASKS #2004 |
| T15 | Import | Lithology code thesaurus (TASKS #2004): per-report code systems, case-folded, with the WAMEX code frequencies and the code-to-description seed | Medium | SA / MB / Q / MD / S / M / SMP / CY / CL / U / SS / LS / CS / CLY / RSP / SST / BIF ... each mean different rocks in different reports; the seed shows the spread. ROLE_PATTERNS in layers.js already misses NCR / FDyk / BMM (review #2046). Data: wa-lithology-codes.json |
| T16 | Import | Large-file import path: parse CSVs over 20 MB off the main thread or in chunks, show progress, and keep the window responsive | High (performance) | 110 MB assay file: 32 s to the dialog, 8 s stall on commit, 16 s on the second; 121 MB log file 56 s + 21.6 s; 26 MB assays 15 s; 13.7 MB geology 16 s; 6,292-collar commit 10.3 s stall, 106,738-station survey 8.4 s; peak working sets 3.2-3.6 GB on the iron and nickel projects (8 GB target). Composite area: 54,150 collars 56.8 s stall, 607,783 stations 149 s, 131 MB geology about 2.5 min to its dialog, 380 MB assays never (T23) |
| T17 | Import | Dialog honesty: when a file is refused because a required field is empty, say which column names were tried; when rows are dropped (9 iron collars with a blank Elevation) say so in the notice | Low | collars_1.csv 6,292 rows -> 6,283 collars with no message the harness could catch; drill-detail, event and calibration tables keep landing in Veins / Lithology with Import disabled and no hint |
| T18 | Import | Lon / lat fallback: ll_long / lllongitude / long_gda / lat_gda / lllatitude | Low | 857 + 156 + 65 files; projectCrs.js LON_NAMES / LAT_NAMES exact list |
| T19 | Data QC | "past the end of their hole" should not fire for holes that have no collar yet (22,404 of 22,407 lithology rows flagged in the uranium run) and should name the hole length source | Low | useImportPipeline notice |
| T20 | Samples | Bundle the WA calcrete-uranium sample (430 AC holes, gamma log, multi-element assays; 2.1 MB; CC BY 4.0 attribution in its README) and its build script | Low | proposed\sample_data\wa_uranium and proposed\scripts\samples\build-wa-uranium.mjs; needs T12 for the gamma log to import by drop |
| T21 | Import | Collars with x / y and a blank elevation must not be dropped silently: keep them at z = 0 (or the DEM / project mean) and count them in the notice | High | composite collars.csv: 51,253 distinct hole ids, 34,623 collars kept, the 16,630 with a blank Elevation gone with an empty notices list; iron collars_1.csv lost 9 the same way. useImportPipeline collar commit / layers.js collars schema. Evidence: projects\large\import_log.json, results-large.md |
| T22 | Import | Commit cost must scale with the layer committed, not with the project: 54,150 collars stalled 56.8 s, 607,783 survey stations 149 s, and a 3,754-row structure layer 116.7 s after them; dialogs for 1 kB files took 5-17 s to open with 605 k stations loaded | High (performance) | desurvey / trace rebuild / attribute index per commit over all 34,623 holes on the main thread; rebuild only the touched holes, or in a worker with progress. Evidence: results-large.md, results-iron.md (23.5 s recovery commit after the 2.6 M-row log) |
| T23 | Import | A 380 MB CSV (3.1 M rows x 85) must not take the app down: cap or stream the parse, show progress, and offer composites / a row cap above about 100 MB | High (crash) | composite assays.csv: no dialog after 2 h 45 min, working set 6.5 GB, page gone, every electron.exe exited, no WER record; the 131 MB geology file (1.35 M rows) opened a dialog only after about 2.5 min. Related: T16 |
| T24 | Import | Dialog honesty for repeated hole ids: "N rows shared a hole id with an earlier row; the first was kept" | Low | 2,897 repeated ids in the composite collars collapsed silently; 48 % of the State's collars share their CompanyHoleId with another report |
| T25 | Core | Project open time must stay near the 3 s target past 2,000 holes: load and desurvey lazily or in a worker, and store the wide assay table and log readings in a compact form rather than row-per-object JSON | High (performance) | reopen timings (profile\reopen\*.log): nickel 1.7 s + 1.4 s busy, iron 6.3-9.1 s + 2.9 s busy at 2.1 GB, composite 9.5-13.5 s + 27-29 s busy at 3.9-4.8 GB (E20); the empty app opens in 0.9 s |

## 8. Disk use and what can be deleted

`C:\GeoStrixData\wa-drillholes\` is 6.0 GB (the brief's ceiling was 10 GB; it peaked at 9.8 GB before the pivoted long files were
deleted). C: never went below 77 GB free. Nothing was written inside OneDrive; nothing in the zips was moved, renamed or extracted
whole, and nothing from them was run.

| Folder | Size | Keep? |
|---|---|---|
| profile\ (SQLite: collar, files, summary, survey, rest, geophys, event, geology, geochem, anum) | 3.2 GB | optional: the per-collar / per-A-number profile that lets another area be cut without a new pass over the core tables (a new area still needs the Attr passes); delete if the space matters |
| projects\large (543 MB of CSV, 55 MB autosave, 92 MB of *.ids.json, 380 MB of remnants) | 1.09 GB | keep csv\ and the autosave; the *.ids.json and *.core.csv can go |
| projects\iron | 704 MB | keep csv\ (182 MB) and the autosave (64 MB); the rest are extraction remnants |
| projects\nickel | 289 MB | keep csv\ (222 MB) and the autosave (30 MB) |
| projects\uranium, lithium, gold_small, sample_check | 189 MB | keep (the small projects and the sample check) |
| projects\*.harvest.json, areas_*.json | 150 MB | the raw harvests the data files were made from; keep until the data files are accepted |
| electron-profiles\ (p9489-p9499, r9481-r9487, p9341) | 399 MB | delete: throwaway Chromium profiles and caches |
| scripts\ (27 MB, mostly the Electron harness's screenshots) | 27 MB | keep the scripts; the shots can go once the report is read |
| harvest\, proposed\, schema\, the drafts | 12 MB | keep |

Deletable now with no loss to the review: `electron-profiles\` (399 MB), every `projects\*\*.ids.json`, `*.core.csv`, `*.long.csv`
and `*.sorted.csv` (about 1.2 GB), `harvest\test\`. That leaves about 4.5 GB, or 1.3 GB without the SQLite profile. The test projects
to keep are the six `projects\<area>\csv\` folders (975 MB) and the autosaves (160 MB). Nothing was deleted by this review beyond
its own intermediate files; the brief leaves the rest to Matt.
