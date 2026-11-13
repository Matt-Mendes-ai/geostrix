# WA lead-silver-zinc — real drilling with assays and lithology (WAMEX report A91581, Western Australia)

99 reverse-circulation and diamond holes drilled in 2010 on a lead-silver-zinc deposit in flat-lying carbonate rocks in the east
Kimberley, Western Australia (15.45° S, 128.97° E, near the Northern Territory border), from one open-file company report (A91581)
in the State's WAMEX mineral drillhole database. Everything here is real company data as released by the State; **nothing is
synthesized**. The tables were only re-shaped into tidy CSVs with column names GeoStrix recognizes. Company and personnel names
from the source are not included.

What the data say about the deposit (counted from these files, not taken from a label): the lead is in limestone (LST, 60 % of the
assayed lead by grade × length), siltstone (SLTST, 29 %) and dolomite (DOLT, 5 %); galena is the mineral logged with it. Half of
the lead lies above 57 m below the collar and 90 % above 99 m. Of 5,970 lead assays, 554 are at 1 % Pb or more, in 86 of the 99
holes; 132 are at 5 % or more and the highest is 59.7 %. Silver runs with the lead (229 samples at 30 g/t or more); zinc is minor
(highest 15.8 %; 89 % of the samples are under 0.2 %). The holes are near vertical through nearly flat beds on a coastal plain at 20 to 21 m
elevation: a shallow, stratabound, carbonate-hosted deposit.

Regenerate from the database export with:

```
node scripts/samples/build-wa-lead-zinc.mjs "<path to the report's csv folder>"
```

(the review in `docs/ideas/wa-drillhole-database-review.md` streams a report's tables out of the State's export; its per-report
CSVs, with the company's own column names, are this script's input).

Coordinates: **GDA94 / MGA zone 52 (EPSG:28352)**, the company's `MGA_East` / `MGA_North` / `MGA_RL` (surveyed by differential GPS).
The collars carry an `epsg` column with that code, so a drop of the file asks no CRS question either.

## Files

| File | Rows | What was taken |
|---|---:|---|
| `collars.csv` | 99 | hole_id, x, y, z (19.9 to 21.5 m), length (40 to 160 m; 8,654 m in all), hole_type (89 RC, 10 DD; the source writes two of them DDH), epsg (28352) |
| `survey.csv` | 437 | hole_id, depth, azimuth on the company's grid (the source names it MGA94_52 on every row), dip (-90 to -83.9). All 99 holes. Five stations logged deeper than their hole's total depth (in two holes) are left out |
| `litho.csv` | 7,905 | the lithology log of all 99 holes: the primary code (`Lith1_Code`: SLTST 3,340, LST 2,624, OSC 669, OALV 438, OMTZN 339, DOLT 166, OLAT 144, OCL 128, OGRV 38, SS 15, BX 3, NR 1), the company's stratigraphic unit (`BH_Lith_Code` as `strat`: CI, Cz, DII, DI, Cl, UF, DIII, Clbk) and the colour code. No interval overlaps another and none runs past its hole. The source writes some units with a trailing space and one as both `Cz` and `CZ`; they are trimmed and joined. The codes are the company's and the source gives no key to them |
| `weath.csv` | 7,904 | the weathering state of the same intervals (FR 5,204, EW 1,120, MW 545, SW 524, HW 511) as its own table |
| `assays.csv` | 5,970 | results for all 99 holes, mostly 1 m samples: Pb, Zn, Fe and S in %, Ag, Cd and Sb in ppm. A negative value is the laboratory's below-detection code (-0.005 % Pb, -5 ppm Ag, -10 ppm Cd ...) and GeoStrix reads it as such: 4,486 of the silver results and 688 of the lead results are below detection. The database's no-data code (-5557) became blank. Left out: 214 rows with no result (nearly all typed NS, not sampled), the copies of Pb, Zn and S in ppm, and the laboratory's second-instrument repeats on 490 samples. 100 rows of one hole are typed NS in the source but carry results; they are kept. No row is flagged superseded |
| `sg.csv` | 424 | specific gravity by pycnometer on 424 of the assay samples, in 21 holes (2.70 to 3.81, median 2.88) |

Not included: the mineral, alteration and texture columns of the log (sparsely filled, and their columns do not line up in the
source), the dates, prospect names and tenement numbers, and the 109 gravimetric specific-gravity values.

## Licence and attribution

Derived from "Mineral exploration drillholes (open file)" (DMIRS-046), WAMEX company mineral drillhole database, © State of Western
Australia (Department of Energy, Mines, Industry Regulation and Safety) 2024, licensed under Creative Commons Attribution 4.0
International (https://creativecommons.org/licenses/by/4.0/). The database's own licence file says: "these data are provided under a
Creative Commons Attribution 4.0 International Licence". Changes: one report's drillhole tables re-shaped into these CSVs with
GeoStrix's column names, the stratigraphic unit's spellings joined, the database's no-data code removed and the rows listed above
left out; no value was altered. DEMIRS does not endorse GeoStrix. The source carries this disclaimer: the department and the State
cannot guarantee the accuracy, currency or completeness of the information; locations are as reported by the company.
