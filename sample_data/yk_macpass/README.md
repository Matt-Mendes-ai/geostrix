# Macpass zinc-lead-silver — 559 real holes with surveys, assays and bulk density (Fireweed Metals Corp., Yukon)

**Drilling data courtesy of Fireweed Metals Corp., Macpass Project, Yukon (fireweedmetals.com). Used with permission; see Fireweed's data disclaimer.**

These three files are redistributed in the GeoStrix repository and installer with Fireweed Metals Corp.'s written permission (2026-11-14). Fireweed's data disclaimer accompanies the dataset; its text is not reproduced here. Only the three files named below were taken from
the dataset's folder: its interpretations, topography, georeferenced sections and PDFs are not included.

559 diamond (DDH 453, underground UDDH 80) and reverse-circulation (RC 26) holes drilled 1952-2023 on the Macpass project in the Selwyn Basin of
east Yukon (about 63.2° N, 130.4° W; a collar converted from UTM to longitude / latitude: BX23-001 is at 63.2117° N, 130.5562° W), 128,316 m in
all. Everything here is real company data as delivered; **nothing is synthesized**. The tables were only re-shaped into tidy CSVs with column
names GeoStrix recognizes (one hole's survey stations were sorted by depth: see below).

Regenerate from the dataset with:

```
node scripts/samples/build-yk-macpass.mjs "<path to FW_Dataset_20240227>"
```

Coordinates: **NAD83 / UTM zone 9N (EPSG:26909)** on every collar (the file's `Grid` column); easting 416,004 to 442,855, northing 7,000,079 to
7,017,670, elevation 1,114 to 1,893 m. The collars carry an `epsg` column with that code, so a drop of the file asks no CRS question. Survey
dips are negative down (the 9 up-holes in the underground series are positive; 43 more are horizontal), azimuths are on the UTM 9N grid north.

## What the data say about the deposit (counted from these files, not taken from a label)

This sample has no lithology, alteration or structure logs, so the host rock and the deposit style are not shown by it. What the assays show is a
zinc-lead-silver system dominated by zinc: of 32,546 sampled intervals (41,318 m) the grade × length sums are 82,670 % Zn·m against 27,561 % Pb·m
(Zn : Pb = 3.0) and 471,088 ppm Ag·m; 334 of the 432 sampled holes have a sample at 5 % Zn or more (5,515 intervals; the highest is 60 % Zn, 65.4 % Pb
and 1,000 ppm Ag), and in those intervals the median Pb / Zn is 0.14 and the median silver 20.5 ppm. Zn, Pb and Ag rise together (correlation of
the log grades: Zn-Pb 0.63, Zn-Ag 0.53, 31,379 intervals). The bulk density rises with the zinc: median 2.77 t/m³ where Zn is under 0.5 %
(18,971 intervals) and 3.52 where it is 10 % or more (2,256), the range of a massive-sulphide body in sediments; the highest density is 6.92. That
association (Zn > Pb, silver with them, density tracking sulphide) is the grade signature of a sediment-hosted massive-sulphide (SEDEX-type) zinc-lead-
silver system; only the grades, densities and the location are evidence here, the logs that would show the host rock are not in these files.

## Files

| File | Rows | What was taken |
|---|---:|---|
| `collars.csv` | 559 | hole_id, x, y, z, length (3.96 to 1,042.72 m), hole_type (DDH 453, UDDH 80, RC 26), year (1952 to 2023: 1950s 39, 1960s 26, 1970s 142, 1980s 106, 1990s 47, 2010s 78, 2020s 121), property (TOM 273, JASON 155, NIDD 114, MAC 9, MC 6, NS 1, MP 1), prospect (Tom West 143, Boundary 82, Tom East 58, Exploration 52, Jason Main 50 and others), news_release (the date of the news release that reported the hole), epsg (26909). No duplicate hole id. The file's own collar dip and azimuth are left out: they are the first survey station |
| `survey.csv` | 26,464 | hole_id, depth, azimuth, dip, for all 559 holes (822 stations in the longest). 16 holes have one station only (at 0 m: a straight hole). One hole, TS22-009, lists a station at 335 m before one at 333 m: the stations are sorted by depth, nothing else was changed. 25 holes' first station differs from the collar's own dip / azimuth by more than 0.01° (up to 16.3° in azimuth and 3.1° in dip); 108 holes' last station is more than 1 m short of the hole's length (110 at 1 m or more); none is deeper |
| `assays.csv` | 32,546 | hole_id, from, to, Ag_ppm, Pb_pct, Zn_pct for 432 holes (127 collars have no samples), 41,318 m of sampling. **Ag in ppm; Pb and Zn in %**, as the source writes them. No interval overlaps another in its hole, none is a duplicate, none runs past its hole, and 960 gaps lie between consecutive samples. A blank is the source's blank (Ag 1,113, Pb 87, Zn 82; 37 intervals are blank in all three) and stays blank: no value was invented and no row dropped. No superseded or version column exists in the source tables |
| `sg.csv` | 32,498 | the bulk density (`BD_tonnes_m3`, t/m³: 1.61 to 6.92, mean 3.01) of the same intervals as the **Specific gravity** layer (the density field), with the source's `Method` (MEAS 25,464 measured, REG 6,489 regressed, LAB-SPG04 545 laboratory pycnometer), its `Comment` (e.g. "Some results not recorded in historical log", 105 rows; "Sample lost", 3) and the `LowRecovery_<=85pct` flag (Y 2,885 in this file; the source has 2,886) kept as fields. 48 intervals have no density and no method (one of them is flagged low recovery, which is the one the source has beyond this file) and so have no row here. Six densities are above 6 t/m³ (6.015 to 6.918): GeoStrix's Data QC flags them as outside its plausible 1-6 range, and they are kept as the source has them (the source gives no reason either way) |

Not included: everything else in the dataset's folder.

## Licence and attribution

Drilling data courtesy of Fireweed Metals Corp., Macpass Project, Yukon (fireweedmetals.com). Used with permission; see Fireweed's data disclaimer.
The three files are redistributed with Fireweed's written permission (2026-11-14); they are not under an open licence,
so the permission covers these files as shipped in GeoStrix and does not extend to other uses. Fireweed's data disclaimer accompanies the dataset; see it for the terms the data are given under. Use the sample to learn GeoStrix, not as a record of the project.
Changes: re-shaped into these CSVs with GeoStrix's column names, one hole's survey stations sorted by depth; no value was altered.
