# Silvertip — real exploration data (ARIS assessment report 42807)

All data in this folder come from **BC Assessment Report 42807** (Silvertip property, northern British Columbia near the Yukon
border; 2024 drilling and surface sampling), a public report filed with the BC Geological Survey's ARIS database. The property
and the operator (Coeur) are named in the report's lab certificates. **Nothing here is synthesized.** The tables were only copied
into tidy CSVs with column names GeoStrix recognises, so "Sample: Silvertip" imports them without questions.

Regenerate from the report's digital appendices with:

```
node scripts/samples/build-silvertip.mjs "<path to the 42807Z folder>"
```

Coordinates: **NAD83 / UTM zone 9N (EPSG:26909)** — the export's own `NAD83_9N_*` columns.

ARIS terms: the BC Geological Survey provides ARIS digital data "as-is", in the format and entirety submitted by industry, and
is not responsible for its completeness, quality, accuracy or reliability. The same applies to these copies.

## Files

The drill tables come from Appendix H (an acQuire export: *SVT_2024_DRILLHOLE_COLLAR.csv*, *SVT_2024_DRILLHOLE_SURVEYS.csv*,
*GEOLOGY LOGS/SVT_2024_GEO_\*.txt*, *SVT_2024_SAMPLES_DRILLING_ASSAYS.csv*).

| File | Rows | What was taken |
|---|---:|---|
| `collars.csv` | 9 | Surveyed easting / northing / elevation (`NAD83_9N_SUR_X/Y/Z`) and end-of-hole depth (348–1,323 m), from three drill pads (CCF24-PAD18, CCF24-PAD42, SSZ24-PAD34) |
| `survey.csv` | 1,847 | The `TRUSURVEY` stations (depth, azimuth, dip). The azimuths are **grid azimuths**: the export names their grid (`AZIMUTHGRIDNAME` = NAD83_9N). CCF24-PAD42-002 (stopped at 348 m and redrilled as CCF24-PAD42-002A) has no true survey, only its planned orientation (azimuth 295°, dip −45°), which is kept so the hole is drawn at its planned angle; it is not a measured survey |
| `litho.csv` | 238 | Rock code (`LIT_ROCK_CODE`) with the geologist's comments |
| `alt.csv` | 245 | First alteration mineral (`ALT_RX_MIN1_TYPE`); 9 rows with none logged are left out |
| `breccia.csv` | 130 | Breccia class (`BX_CLASS`) |
| `vein.csv` | 243 | First vein type of each vein interval (`VEI_1_TYPE`) |
| `mnlgy.csv` | 694 | Every logged sulphide (`SUL_MIN_1` … `SUL_MIN_n`) with its percent, one row per sulphide |
| `struct_zones.csv` | 194 | Structure intervals: type (`STIN_TYPE`: fault, vein zone, foliation…), intensity and description |
| `geotech.csv` | 2,250 | RQD % (`RQQ_PCT_D`, which is `REC_RQD_M` over the run length) |
| `recovery.csv` | 2,250 | Core recovery % (`REC_PCT_D`) |
| `magsusc.csv` | 6,264 | Point readings (the export logs them with `GEOLFROM` = `GEOLTO`), as logged. **The export does not state the unit** and its instrument column is blank |
| `structure.csv` | 549 | Oriented-core points: the logged feature (`STPT_FEATURE`: bedding, veinlet, vein, fracture…) with alpha / beta. 483 have both angles and are oriented by GeoStrix from the hole's survey; 66 have alpha only and stay unoriented. 2 points with no angle are left out |
| `assays.csv` | 1,339 | Half-core samples. One value per element: the database's "best element" column (`<El>_<unit>_BESTEL`), so the lab method can differ between elements; Ag, Au and most trace elements in ppm, majors and **Pb, Zn and Cu in %**. Elements only: the oxide, carbon and silver-equivalent columns are left out. Values as delivered: a negative number is the lab's below-detection code, and GeoStrix reads it as below detection on loading |
| `rocks.csv` | 168 | Appendix G, *SVT_2024_SAMPLES_SURFACE_ROCKS_UPDATED.csv*: the located rock samples (grab and rock chips; 5 of them about 45 km south of the drilling). The older *SURFACE_ROCKS.txt* in Appendix H lists 331 rows, but the updated file corrects 124 of the shared samples and has no location for the other 163, so the updated file is used |
| `soils.csv` | 282 | Appendix H, *SVT_2024_SAMPLES_SURFACE_SOILS.txt* |
| `streams.csv` | 156 | Appendix E, *SVT_2024_SAMPLES_SURFACE_STREAMS.csv* (stream sediments) |

Surface samples carry their coordinates (`NAD83_9N_BEST_X/Y/Z`) and the same element columns as the assays.

Not included: the UV-fluorescence log (53 intervals, no obvious layer for it), the lab certificates (Appendix I), and the data
the report lists as too large for ARIS download (ASTER, magnetic / radiometric survey, MobileMT, the mapping report).
