# Perk-Rocky: the terrain only (the mapping downloads from BC)

The Perk-Rocky sample is the 2024 geological mapping of **BC Assessment Report 42317** (Perk-Rocky property, central
British Columbia). It has no drillholes and is meant for modelling from the map (3D Modelling › *Model from map*).

BC's copyright terms do not let GeoStrix redistribute assessment-report data. So the report's MapInfo layers are not
in this repository or the installer. The first time you open the sample (File › Open Sample Project › Perk-Rocky),
GeoStrix says where the data come from and how big the download is. With your go-ahead, it downloads report 42317's
data package from the Province's public server (apps.nrs.gov.bc.ca, about 17 MB) and keeps the six mapping layers
unchanged in its own data folder.

This folder keeps only what GeoStrix may share:

- `terrain_copernicus_glo30.tif`: ground elevation over the mapped area plus 300 m. 320 × 246 nodes at about 30 m,
  a Float32 GeoTIFF in NAD83 / UTM zone 10N (EPSG:26910). It is **not** from the report: it was read from the
  Copernicus DEM GLO-30 and resampled. The installer ships it, and the downloaded layers are drawn on it.

A developer can also rebuild the mapping layers into this folder from a downloaded package (git ignores them):

```
node scripts/samples/build-perk-rocky.mjs "<path to the 42317Z folder>"
```

## What the download holds

The six layers, each `.TAB` + `.MAP` + `.ID` + `.DAT`, in EPSG:26910 as stored:

- `PR-Litho_interpV3`: the interpreted lithology map (77 polygons).
- `PR-Str_interp`: interpreted structures (47 lines).
- `PR_Master_StLines_Sept03_2024`: mapped structure lines with dip and dip direction.
- `PR_Master_StrPoint_Oct17_2024`: 147 outcrop structure measurements.
- `PR_Master_LithOut_Oct17_2024`: mapped outcrops.
- `PR-Alt_interpV2`: the interpreted alteration map.

**Dip directions.** The files do not say whether `Dip_Direction` is measured from grid, true or magnetic north.
GeoStrix takes it as **grid north** (an assumption). At this site, grid convergence is about 1.6° and the magnetic
declination about 16°.

## Sources and attribution

- Mapping: BC Geological Survey, ARIS assessment report 42317 digital data. The Survey provides ARIS digital data "as
  is", in the format and entirety submitted by industry, and is not responsible for its completeness, quality,
  accuracy or reliability.
- Terrain: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018
  provided under COPERNICUS by the European Union and ESA; all rights reserved. Read from the Copernicus DEM GLO-30
  on AWS Open Data and resampled to the 30 m grid above.
