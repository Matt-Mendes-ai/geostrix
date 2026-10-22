# Perk-Rocky — real surface-mapping data (ARIS assessment report 42317)

The mapping layers in this folder come from **BC Assessment Report 42317** (Perk-Rocky property, central British
Columbia; 2024 geological mapping), a public report filed with the BC Geological Survey's ARIS database. They are the
report's **own MapInfo files, copied unchanged** — GeoStrix reads MapInfo TAB natively. There are **no drillholes**:
this sample is for modelling from the map (3D Modelling › *Model from map*).

The terrain is **not** from the report: it is the Copernicus DEM GLO-30 over the mapped area (see below).

Regenerate with:

```
node scripts/samples/build-perk-rocky.mjs "<path to the 42317Z folder>"
```

Coordinates: **NAD83 / UTM zone 10N (EPSG:26910)**, as stored in the files.

## Files

| File (each `.TAB` + `.MAP` + `.ID` + `.DAT`) | What it is | Loaded as |
|---|---|---|
| `PR-Litho_interpV3` | Interpreted lithology map: 77 polygons, `Litho_code` / `Lithology` (andesite volcanics, sandstone, schist, maroon andesite, dacite, rhyolite, volcaniclastic and hydrothermal breccias, diorites, hornfels) | Map layer coloured by `Litho_code` |
| `PR-Str_interp` | Interpreted structures: 47 lines, `Structure_Type` (two thrust faults, quartz / CuOx / skarn veins, a microdiorite lineament) | Map layer coloured by `Structure_Type` |
| `PR_Master_StLines_Sept03_2024` | Mapped structure lines with `Dip` / `Dip_Direction` (faults, contacts, veins): 67 lines | Map layer (hidden at start) |
| `PR_Master_StrPoint_Oct17_2024` | Outcrop structure measurements: 147 points, `Structure` / `Dip` / `Dip_Direction` (104 bedding, 27 vein, 7 fault …) | Outcrop measurements |
| `PR_Master_LithOut_Oct17_2024` | Mapped outcrops: 710 polygons with lithology, texture, grain size, comments | Map layer (hidden at start) |
| `PR-Alt_interpV2` | Interpreted alteration map: 55 polygons, `Alt_code` / `Alteration` | Map layer (hidden at start) |
| `terrain_copernicus_glo30.tif` | Ground elevation over the mapped area + 300 m, 320 × 246 nodes, ~30 m (Float32 GeoTIFF, EPSG:26910) | Terrain |

**Dip directions.** The files do not say whether `Dip_Direction` is measured from grid, true or magnetic north. GeoStrix
takes it as **grid north** (an assumption). At this site, grid convergence is about 1.6° and the magnetic declination
about 16°, so if the field readings were magnetic and uncorrected they would be turned by ~16°: re-import the points
with the right north reference (Maps › Map layers › structure measurements) if that matters.

**What is not used.** The report's alteration and outcrop layers are loaded for viewing; *Model from map* uses the
lithology map, the structure lines (for faults) and the bedding measurements.

## Sources and attribution

- Mapping: BC Geological Survey, ARIS assessment report 42317 digital data. The Survey provides ARIS digital data "as
  is", in the format and entirety submitted by industry, and is not responsible for its completeness, quality, accuracy
  or reliability.
- Terrain: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018
  provided under COPERNICUS by the European Union and ESA; all rights reserved. Read from the Copernicus DEM GLO-30
  on AWS Open Data and resampled to the 30 m grid above.
