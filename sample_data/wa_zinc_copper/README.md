# WA zinc-copper — real drilling with soils and stream sediments (WAMEX report A77713, Western Australia)

The 32 reverse-circulation holes of a 2007 drilling program on zinc-copper sulphide prospects in the east Pilbara, Western Australia
(21.2° to 21.35° S, 119.2° E), with their logs and assays, and the 157 soil and 46 stream-sediment samples taken the same year,
from one open-file company report (A77713) in the State's WAMEX mineral drillhole and surface geochemistry database. Everything
here is real company data as released by the State; **nothing is synthesized**. Company and personnel names from the source are
not included.

What the data say about the deposit (counted from these files, not taken from a label): the holes cut felsic volcanic rocks, chert,
siltstone and sandstone with sericite, chlorite and silica alteration, and the log estimates pyrite, sphalerite, chalcopyrite and
galena interval by interval. Zinc is the main metal: 212 of the 1,550 samples are at 1 % Zn or more, in 22 of the 30 assayed holes,
and 77 are at 5 % or more (highest 29.2 %); copper reaches 10.4 % and lead 2.96 %. 72 % of the zinc (grade × length) lies in two of
the company's rock codes, `ZZ` and `ZS`; half of it is above 124 m below the collar and 90 % above 218 m. Sulphides of zinc, copper
and lead in altered felsic volcanic rocks beside chert is the setting of a volcanic-hosted massive sulphide deposit. The holes are
in four prospects along 16 km; 24 of them, and 196 of the 212 samples at 1 % Zn or more, are in one (Kangaroo Caves).

Regenerate from the database export with:

```
node scripts/samples/build-wa-zinc-copper.mjs "<path to the report's csv folder>"
```

(the review in `docs/ideas/wa-drillhole-database-review.md` streams a report's tables out of the State's export; its per-report
CSVs, with the company's own column names, are this script's input).

Coordinates: **GDA94 / MGA zone 50 (EPSG:28350)**, as the company reported them for every hole and sample here; elevations are the
company's RL. The collars carry an `epsg` column with that code. The surface samples have no elevation in the source.

## Files

| File | Rows | What was taken |
|---|---:|---|
| `collars.csv` | 32 | hole_id, x, y, z (193 to 326 m), length (48 to 354 m; 5,696 m in all), hole_type (RC), prospect (Kangaroo Caves 24, Jamesons 5, Breakers 2, Nambucca 1), epsg. The report lists 81 collars; the 49 without a log (drilled 1991 to 2006, some on an older datum) are left out |
| `survey.csv` | 103 | hole_id, depth, azimuth, dip (-47 to -90; 3 holes are vertical). The source azimuths are **magnetic**, with the company's own correction to the grid in the next column (2.5°): the azimuth here is their sum, a grid azimuth |
| `litho.csv` | 534 | the primary rock code (`LITH1`, 29 codes: CS 65, ZS 65, FD 63, SLT 60, SA 52, FRC 46, ZZ 32, FR 32 ...) and the geologist's remark where there is one. No interval overlaps another. The codes are the company's and the source gives no key to them |
| `weath.csv` | 533 | the weathering state of the same intervals (fr, ww, mw, sw) |
| `alt.csv` | 234 | alteration: the first mineral (se 118, ch 62, si 52, fu 2) and its intensity (s / m / w) |
| `mnlgy.csv` | 1,965 | the log's visual sulphide estimates in per cent, one row per mineral present: pyrite (py) 1,111, sphalerite (sp) 450, chalcopyrite (cp) 284, galena (gn) 120 |
| `assays.csv` | 1,550 | results for 30 holes: Cu, Zn, Pb, Ag, As, Ba, Fe, S, Mn, Ni, Sb and Hg in ppm, Au in ppb. A negative value is the laboratory's below-detection code and GeoStrix reads it as such. Most samples are 1 m (953), 5 m (240) or 10 m (336) long |
| `soils.csv` | 157 | soil samples (the -2 mm fraction, 0.1 m deep): sample_id, x, y and 23 elements (Au in ppb, the rest in ppm) |
| `streams.csv` | 46 | stream-sediment samples (the -0.5 mm fraction) along the belt, the same 23 elements |

**Rows left out, and why.** The assay table's `QC_TYPE` column marks 268 rows as CHECK or REJECT (laboratory repeats and reject
re-splits of intervals that also have a routine sample): only ROUTINE rows are kept. 64 routine rows cover ground that a shorter
routine sample also covers (a 5 m or 10 m composite beside the 1 m samples taken later, or a second 1 m sample): the shorter is
kept, so no depth is counted twice. In the surface table 19 CHECK rows are left out, and the single rock chip. Gold is the first
determination (`Au1`); the repeat determinations are not included.

## Licence and attribution

Derived from the WAMEX company mineral drillhole and surface geochemistry database ("Mineral exploration drillholes (open file)",
DMIRS-046, and its surface-sample tables), © State of Western Australia (Department of Energy, Mines, Industry Regulation and
Safety) 2024, licensed under Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/). The
drillhole product's own licence file says: "these data are provided under a Creative Commons Attribution 4.0 International
Licence". The surface-sample tables come from the same download on the department's Data and Software Centre, whose licence
statement reads: "Unless otherwise noted, ... all copyright content of the Data is licensed under a Creative Commons Attribution
4.0 International licence." Changes: one program's tables re-shaped into these CSVs with GeoStrix's column names, the survey
azimuths corrected to the grid with the company's own correction, and the rows listed above left out; no other value was altered.
Based on Department of Mines, Petroleum and Exploration material (the department's present name). The department does not endorse
GeoStrix. The source carries this disclaimer: the department and the State cannot guarantee the accuracy, currency or
completeness of the information; locations are as reported by the company.
