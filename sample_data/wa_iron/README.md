# WA bedded iron — real drilling with downhole logs and magnetics (WAMEX report A119232, Western Australia)

147 reverse-circulation and diamond holes drilled in 2018 on one block, 1.2 km by 0.8 km, of a flat-lying bedded iron deposit under
cover in the east Pilbara, Western Australia (22.45° S, 119.88° E), with their strand logs, XRF assays and downhole density, gamma
and magnetic-susceptibility logs, and the national magnetic grid over the same ground. The holes are from one open-file company
report (A119232) in the State's WAMEX mineral drillhole database; that report holds 6,390 holes and this sample is **one block of
it**, every hole collared inside the block that has a surveyed elevation. Everything here is real data as released; **nothing is
synthesized**. Company and personnel names from the source are not included.

What the data say about the deposit (counted from these files, not taken from a label): the iron sits in enriched strands of a
bedded iron formation (the company's strand codes TNAM, SONAM, ONAM and HNAM: 54 to 59 % Fe, 5 to 8 % SiO2 on a length-weighted
mean), under 34 to 56 m of barren cover (alluvium ALU and clay CLA, 20 to 25 % Fe and 40 to 50 % SiO2). The unenriched banded
iron below (BNAM) averages 29 % Fe and 52 % SiO2. Of the 4,157 two-metre samples, 799 are at 55 % Fe or more, in 133 holes. Every
hole is vertical and none is deeper than 70 m.

Rebuild with:

```
node scripts/samples/build-wa-iron.mjs "<the report's tables as CSV>" "<the magnetic clip as a GeoTIFF>"
```

(the review in `docs/ideas/wa-drillhole-database-review.md` streams a report's tables out of the State's export; the clip is a
`GetCoverage` request to Geoscience Australia's grid service for longitude 119.84 to 119.93, latitude -22.49 to -22.405).

Coordinates: **GDA94 / MGA zone 50 (EPSG:28350)**, as the company reported them; elevations are the company's surveyed RL (AHD).
The collars carry an `epsg` column with that code. The block is near the east edge of zone 50, so eastings run to 797,500.

## Files

| File | Rows | What was taken |
|---|---:|---|
| `collars.csv` | 147 | hole_id, x, y, z (433.7 to 438.5 m), length (32.8 to 70 m; 8,945 m in all), hole_type (140 RC, 7 DD), epsg. One hole in the block with no elevation in the source is left out |
| `survey.csv` | 1,083 | hole_id, depth, azimuth, dip, for all 147 holes. Every hole is vertical (dip -90 to -88.3). The source azimuths are from **true north**; each was turned to grid north by adding the grid bearing of true north at its collar (1.10°), because GeoStrix's survey table is in grid north |
| `litho.csv` | 4,243 | the company's logged strand, one code per interval, for 141 holes: ALU 1,383, CLA 843, BNAM 391, TNAM 373, DIW 357, SONAM 293, ONAM 202, HNAM 179, SNAM 113 and eight rarer codes. All rows are the current log (the source's `PRIORITY` is 1 on every row); no interval overlaps another. The codes are the company's and the source gives no key to them |
| `assays.csv` | 4,157 | XRF results in per cent for 134 holes, every sample 2 m: Fe, SiO2, Al2O3, P, S, Mn, CaO, MgO, K2O, Na2O, TiO2 and LOI. The oxides are as the laboratory reports them. LOI is the total loss on ignition (the source's `LOITOTAL_XRF_pct`). Left out: 8 rows with no results (6 marked not sampled and 2 empty, one of them the first of a duplicate pair), 13 trace-element columns, selenium, the loss at the 1,000 °C step and the sample weight |
| `logs.csv` | 12,036 | downhole density, natural gamma and magnetic susceptibility for 139 holes: **every 5th reading** (0.5 m) of the 60,169 logged at 0.1 m. The database's no-data code (-999) is blank. **The source states no units**: density reads as g/cm³ by its range (median 2.3); gamma and susceptibility are as logged. Five density readings are under 1 or over 5 and are left as they are |
| `tmi_80m.tif` | 91 × 86 nodes | total magnetic intensity (nT, the national grid's anomaly values) on an 80 m grid, 3 km around the block: -1,497 to 890 nT |

**Changes made to the sources.** The drillhole tables were cut to the block and re-shaped into these CSVs with column names GeoStrix
recognizes; the survey azimuths were turned from true to grid north as said above; the log was thinned and its no-data code
removed. No other value was altered. The magnetic grid was **resampled**: the national grid is in longitude and latitude (3
arc-seconds, about 80 m), and it was interpolated (bilinear) onto an 80 m grid in MGA zone 50 so that it sits in the project's
coordinates. Its values are therefore interpolated between the published nodes, not the published nodes themselves.

## Licence and attribution

**Drillholes.** Derived from "Mineral exploration drillholes (open file)" (DMIRS-046), WAMEX company mineral drillhole database,
© State of Western Australia (Department of Energy, Mines, Industry Regulation and Safety) 2024, licensed under Creative Commons
Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/). The database's own licence file says: "these data are
provided under a Creative Commons Attribution 4.0 International Licence". DEMIRS does not endorse GeoStrix. The source carries this
disclaimer: the department and the State cannot guarantee the accuracy, currency or completeness of the information; locations are
as reported by the company.

**Magnetics.** Derived from the Total Magnetic Intensity (TMI) Grid of Australia 2019, seventh edition, 80 m cell size, Geoscience
Australia, https://doi.org/10.26186/5e9cf3f2c0f1d, © Commonwealth of Australia (Geoscience Australia), licensed under Creative
Commons Attribution 4.0 International (the product's catalogue record: "Creative Commons Attribution 4.0 International Licence").
Geoscience Australia does not endorse GeoStrix.
