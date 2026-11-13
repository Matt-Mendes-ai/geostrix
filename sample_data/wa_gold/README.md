# WA lode gold — real drilling with oriented structures, veins and alteration (WAMEX report A122506, Western Australia)

66 reverse-circulation and diamond holes drilled in 2018 and 2019 on one gold prospect about 110 km east-south-east of Kalgoorlie, Western
Australia (31.07° S, 122.56° E), with their lithology, alteration, veining and oriented-structure logs and their gold assays, from
one open-file company report (A122506) in the State's WAMEX mineral drillhole database. The report covers four prospects over
60 km; this sample is **the one prospect that carries nearly all the logging**, 0.5 km by 1.8 km. Everything here is real company
data as released by the State; **nothing is synthesized**. Company and personnel names from the source are not included.

What the data say about the deposit (counted from these files, not taken from a label): the holes are inclined 48° to 73°, drilled
to the east or to the west across the rocks, to 309 m. Of 14,664 gold assays, 668 are at 1 g/t or more, in 52 of the 62 assayed
holes; 154 are at 5 g/t or more and the highest is 262.6 g/t. 90 % of the gold (grade × length) is in three of the company's rock
codes (`HAQCS`, `HAQBC`, `HAQB`), rocks the log describes with amphibole, biotite, feldspar and quartz; 85 % is in intervals
whose first logged sulphide is pyrrhotite or pyrite, and 13 intervals record visible gold. Quartz veins (1,165 intervals) and
carbonate veins are logged through it, and the oriented core records foliation, fault zones, veins and shears. Half of the gold is
above 149 m down the hole and 90 % above 200 m. Gold with pyrrhotite and pyrite in veined, foliated and sheared rock is a lode
(shear-hosted) gold deposit.

Regenerate from the database export with:

```
node scripts/samples/build-wa-gold.mjs "<path to the report's csv folder>"
```

(the review in `docs/ideas/wa-drillhole-database-review.md` streams a report's tables out of the State's export; its per-report
CSVs, with the company's own column names, are this script's input).

Coordinates: **GDA94 / MGA zone 51 (EPSG:28351)**, surveyed collar positions and elevations as the company reported them. The
collars carry an `epsg` column with that code.

## Files

| File | Rows | What was taken |
|---|---:|---|
| `collars.csv` | 66 | hole_id, x, y, z (305.7 to 313.8 m), length (10 to 309.4 m; 13,180 m in all), hole_type (35 RC, 31 DD), epsg. The hole type and total depth are from the database's own collar table. Two inclined diamond holes of the prospect have no downhole survey in the source and are left out |
| `survey.csv` | 1,601 | hole_id, depth, azimuth on the national grid (the source's `NAT_Azimuth`, grid id MGA94_51 on every row), dip. Nine holes were surveyed twice; one run per hole is kept (see below) |
| `litho.csv` | 4,207 | the primary rock code (`Lith1_Code`, 32 codes: HAQCS 1,171, HAQBC 829, HACS 534, RSU 280, FFF 252, PF 188, HAQB 160 ...). One log per hole; no interval overlaps another. The codes are the company's and the source gives no key to them |
| `weath.csv` | 4,116 | the oxidation state of the same intervals (FR 3,101, OX 491, TR 172, JO 126, MOX 88, SO 72, PO 66) |
| `alt.csv` | 4,150 | the first code of the alteration log and its intensity (0 to 5): PO 1,841, PY 961, CLAY 616, HEM 158, DIO 121, BIO 107 ... The company logs sulphides in this table |
| `vein.csv` | 1,412 | veining: the first composition (QTZ 1,165, CB 173 ...), the style and the percentage of the interval |
| `structure.csv` | 3,354 | oriented-core structures in 31 diamond holes: depth, type (FOL 697, FZ 621, V 570, CONT 421, FRAC 405, BN 351 ...), alpha and beta. Beta is measured from the **bottom-of-hole** line (the source's reference line on every row), the convention GeoStrix reads |
| `assays.csv` | 14,664 | gold in ppm on every sample (two methods in the source, `FA50AAS` and `PAAU02`), and Ag, As, Bi, Cu, Mo, Pb, Sb, Te, W and Zn in ppm and S in % on 814 samples of 29 holes. "<0.005" is the laboratory's below-detection notation and GeoStrix reads it as such (6,738 of the gold results); ">5" is its over-limit notation (10 sulphur results) |

**Rows left out, and why.** 773 assay rows are flagged `Superseded` in the source and are left out. 144 samples appear twice (the
row of their multi-element analysis and the row of their gold): each pair is joined into one row. 6 cells hold a laboratory
status code instead of a number and are blank. In the survey table nine holes have two runs, one marked `Priority` 1 (a station
every 5 m) and one marked 0 (every 10 m); the source does not say which is preferred and they differ by about 1.5° in azimuth.
The Priority 1 run is kept for those holes, so no depth has two stations. Nine structure rows have no beta and are left out.

Not included: the report's other 36 holes, on other prospects (14 of them shallow aircore holes whose elevation is 0 in the
source), the remarks columns of every log (some hold names), the second and third codes of the lithology, alteration and vein
logs, the rest of the multi-element suite, and the report's 660 soil records. The soil records are one orientation traverse
analysed in three laboratory batches whose results share columns in different units (copper appears as 65 and as 1,840 at
neighbouring sites), so they are not a plain soil survey.

## Licence and attribution

Derived from "Mineral exploration drillholes (open file)" (DMIRS-046), WAMEX company mineral drillhole database, © State of Western
Australia (Department of Energy, Mines, Industry Regulation and Safety) 2024, licensed under Creative Commons Attribution 4.0
International (https://creativecommons.org/licenses/by/4.0/). The database's own licence file says: "these data are provided under a
Creative Commons Attribution 4.0 International Licence". Changes: one prospect's tables re-shaped into these CSVs with GeoStrix's
column names and the rows listed above left out or joined; no value was altered. DEMIRS does not endorse GeoStrix. The source
carries this disclaimer: the department and the State cannot guarantee the accuracy, currency or completeness of the information;
locations are as reported by the company.
