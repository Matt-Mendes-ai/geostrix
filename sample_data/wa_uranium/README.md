# WA palaeochannel uranium — real exploration data (WAMEX report A87304, Western Australia)

430 aircore and diamond holes drilled in 2009-2010 on a sediment-hosted uranium prospect in a buried palaeochannel, about 240 km
east-north-east of Kalgoorlie, Western Australia (30.0° S, 123.8° E), from one open-file company report (A87304) in the State's WAMEX
mineral drillhole database. Everything here is real company data as released by the State; **nothing is synthesized**. The tables
were only re-shaped into tidy CSVs with column names GeoStrix recognizes, so "Sample: WA palaeochannel uranium" imports them without
questions. Company and personnel names from the source are not included.

What the data say about the deposit (counted from these files, not taken from a report): the uranium sits 37-52 m below surface in
the lower part of the channel fill (the company's units E3, E2, E1) and the top of the basement (Dcb); of the assayed uranium, 38 %
is in lignite (LIG), 17 % in lignitic and carbonaceous clays (LIC, CBC), and most of the rest in the claystone and sandstone around
them. Calcrete is logged in nine intervals and carries none of it. Until 2026-11-09 this sample was labelled "calcrete uranium" on
the edge of the Canning Basin: both were wrong (TASKS.csv #2324), and the logs, not the label, are the evidence.

Regenerate from the database export with:

```
node scripts/samples/build-wa-uranium.mjs "<path to the WA drillhole review's projects\uranium\csv folder>"
```

(the review in `docs/ideas/wa-drillhole-database-review.md` streams the report's tables out of the State's bcp-format export; its
per-report CSVs, with the company's own column names, are this script's input).

Coordinates: **GDA94 / MGA zone 51 (EPSG:28351)**, the company's `MGA_East` / `MGA_North` / `MGA_RL`. The collars carry an `epsg`
column with that code, so a drop of the file asks no CRS question either.

What makes it different from the other samples: a deposit style and a drilling style none of them has (shallow vertical aircore
through a flat-lying, lignite-bearing channel fill, uranium grade read from gamma logs as well as assays), a company lithology / regolith code set to try the
code thesaurus on, and a real multi-element table whose lab reported each element under several method columns.

## Files

| File | Rows | What was taken |
|---|---:|---|
| `collars.csv` | 430 | hole_id, x, y, z (the company's RL, 318-347 m), length (33-93 m), hole_type (412 AC, 18 DDH), epsg (28351) |
| `survey.csv` | 430 | one collar station per hole: depth 0, grid azimuth, dip. Every hole was drilled vertically (dip -90) |
| `litho.csv` | 8,783 | the CURRENT lithology log of 429 holes: the primary code (`Lith1_Code`: 21 codes, SST / SAN / CLS / CLY / CBC / LIG ...), the company's stratigraphic unit (`Lith1_Strat` as `strat`: QA, I, H, G2, G1, F2, F1, E3 ... Dcb / DWS, the palaeochannel sequence down to basement; written as logged, so `Dcb` / `DCB` and `DWS` / `Dws` both occur; 155 intervals have none), the oxidation state (`Lith1_Oxidation`) and the geologist's comment. The source table keeps every re-log: its 13,624 rows flagged `Superseded = TRUE` overlap the current intervals in 407 holes and are left out (the first build of this sample, shipped in v0.1.106, included them by mistake). Five overlapping pairs in four holes remain: they are in the current log itself |
| `alt.csv` | 2,003 | first alteration code (CAL, CAR, GOE, HEM, LIM, PYR, SER, SIL) and its intensity (W / M / S) |
| `weath.csv` | 8,645 | the oxidation state of the same current lithology intervals (`Lith1_Oxidation`: OX 4,389, HR 2,077, TR 776, RD 766, LR 635, NR 2), as its own table so the sample fills the Weathering layer (TASKS.csv #2342); the 138 intervals with no oxidation code are left out |
| `assays.csv` | 9,862 | multi-element results for 424 holes: U, Th, V, Cu, Pb, Zn, Ni, Co, As, Ce, La, Nd, Pr, Sm, Ba and S in ppm; Fe, Ca, K and Al in %. The lab reported each element under several method columns (the database suffixes them `_100`, `_101` ...) and each sample was analysed by one method set, so the columns are joined into one value per element, fullest column first; S is joined as ppm (one method reported it in %, 53 core samples, converted). U is present for 9,733 samples (1,637 above 100 ppm, 215 above 1,000 ppm). "X" and "N/L" (not analysed) became blank; 83 negative values are the lab's below-detection codes and GeoStrix reads them as such. The 14 rows the database marks Superseded are left out |
| `gamma.csv` | 43,923 | downhole gamma for 423 holes: raw counts per second and eU3O8 (ppm, cased probe), loaded as two numeric layers, 'Gamma eU3O8 (ppm)' and 'Gamma raw (cps)' (TASKS.csv #2342), every 10th reading (0.5 m) of the 439,780 logged at 5 cm. The database's no-data codes (eU3O8 of -1 and -1,830,000,000; a raw count of 10,700,000 cps) are dropped. Loaded as the numeric custom layer "Gamma eU3O8 (ppm)": drawn along the holes in the 3D View, a log in Downhole Logs and a numeric source for the modelling tools |

Not included: the report's pXRF readings, hyperspectral indices and drilling-detail tables (left out to keep the sample small; the
review's export has them), and 9 of every 10 gamma readings (regenerate without the `i % 10` filter in the build script to keep them all).

## Licence and attribution

Derived from "Mineral exploration drillholes (open file)", WAMEX company mineral drillhole database, © State of Western Australia
(Department of Energy, Mines, Industry Regulation and Safety) 2024, licensed under Creative Commons Attribution 4.0 International
(https://creativecommons.org/licenses/by/4.0/). Changes: one report's drillhole tables re-shaped into these CSVs with GeoStrix's
column names, the lab's method columns joined into one value per element, the gamma log thinned to every 10th reading and the
database's no-data codes removed; no value was altered beyond the one unit conversion noted above. DEMIRS does not endorse GeoStrix.
The source carries this disclaimer: the department and the State cannot guarantee the accuracy, currency or completeness of the
information; locations are as reported by the company.
