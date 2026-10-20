# Woodjam — real exploration data (ARIS assessment report 41597)

All data in this folder come from **BC Assessment Report 41597** (Woodjam property, central British Columbia), a
public report filed with the BC Geological Survey's ARIS database. **Nothing here is synthesized.** The drillhole
tables were only copied into tidy CSVs with column names GeoStrix recognises, so "Load sample project → Woodjam"
imports them without questions; the IP files and the ZTEM model are the report's own files.

Regenerate from the report's digital appendices with:

```
node scripts/samples/build-woodjam.mjs "<path to the 41597Z folder>"
```

Coordinates: **NAD83 / UTM zone 10N (EPSG:26910)** — the drillhole database's grid. The IP GPS file is WGS 84 /
UTM zone 10 and is reprojected by GeoStrix when the lines are placed.

## Files

| File | From (report appendix) | What was taken |
|---|---|---|
| `collars.csv` | F — DHDB, *Diamond Drilling_Headers.csv* | 19 holes (2023 diamond drilling): DGPS easting / northing / elevation, planned azimuth and dip, final depth |
| `survey.csv` | F — *Downhole Survey.csv* | Gyro survey stations (depth, azimuth, dip) |
| `litho.csv` | F — *Lithology Log.csv* | Logged unit code (Lith1_GF_Code) and the geologist's description |
| `alt.csv` | F — *Alteration Log.csv* | Dominant (first) alteration code |
| `vein.csv` | F — *Vein Log.csv* | First vein composition per logged vein interval |
| `mnlgy.csv` | F — *Mineralisation Log.csv* | Every logged sulphide (Min1–Min4) with its percent |
| `geotech.csv` | F — *Geotechnical Data.csv* | RQD % |
| `magsusc.csv` | F — *Magnetic Susceptibility.csv* | Average of the three readings (SI × 10⁻³) |
| `sg.csv` | F — *Specific Gravity.csv* | Measured bulk density |
| `structure.csv` | F — *Downhole Structure Event Log.csv* | Structure type with alpha / beta (oriented core); GeoStrix orients them using the hole's survey, with beta measured clockwise from the **bottom-of-hole** line looking down-hole (the Reflex convention). The report does not state the line, so this is an assumption; using the top-of-hole line instead moves the poles by 58° on average |
| `assays.csv` | F — *Samples.csv* | 3,791 samples, ALS four-acid ICP-MS (Al, Ca, Fe, K, Mg, Na, S, Ti in %; the rest ppm) and Au (g/t = ppm). Cu above the 10,000 ppm upper limit uses the Cu-OG62 ore-grade result (33 samples). The source's derived "_plot_" columns and lab status / certificate columns are left out |
| `ip/*.dat`, `ip/2357GPS_All.txt` | E — IP Survey 2023, *DataFiles* | Six pole-dipole TDIP lines (109N, 112N, 115N, 118N, 6200E, 6400E; Scott Geophysics) and the GPS station list used to place them |
| `ztem_inversion_2023.omf` | C — ZTEM Survey Data, *2023 ZTEM Inversion / 20230814 / Woodjam_ZTEM_mesh.omf* | The 2023 3D ZTEM inversion as delivered: two iterations (m_03_01, m_05_03); the sample shows **m_05_03, the final model**. The file names no unit; its values (1.8 × 10⁻⁴ to 0.196) can only be conductivity in S/m (as resistivity they would mean 0.0002 Ω·m rock), so GeoStrix labels it "Conductivity (S/m)" — inferred from the values |

**Below-detection gold.** The source database has no "<" values: 638 of the 3,791 Au results (17 %) are exactly
0.0005 g/t, half the ALS 0.001 g/t lower limit. These are almost certainly below-detection results that the company's
database stored as half the limit, but the file does not say so, and `assays.csv` keeps the values as delivered. GeoStrix
stores a "<0.001" result at half the limit too, so grades and statistics come out the same; what is missing is only the
"<" flag, so these rows count as measured results: below-detection rules (the qualifier, "a < sample never starts an
intercept", QA/QC below-detection counts) do not apply to them.

Not included: the quick log, structure *interval* log and the ZTEM `.mod` / `.csv` / `.geoh5` exports (the OMF holds the
same model).
