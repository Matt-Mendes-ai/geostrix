# Mount Raymond — real bedrock mapping, no drillholes (Geological Survey of Canada, northern Yukon)

A 1:50 000 bedrock geological map of NTS sheet 116-I/8 (Mount Raymond), on the western limb of the Richardson anticlinorium in the
southern Richardson Mountains, northern Yukon (66.25° to 66.5° N, 136° to 136.5° W). It is a mapping project with no drillholes:
map-unit polygons, contacts, faults, fold axes and 119 structural measurements taken at outcrop or estimated from the air, on a
terrain with about 800 m of relief. Everything here is real published data; **nothing is synthesized**.

What the map shows (read from these files, not from a summary): 15 map units of a Paleozoic sedimentary succession (shale, siltstone,
sandstone, limestone and chert; Cambrian to Carboniferous), cut by north-trending thrust and reverse faults and folded into
anticlines and synclines. Of the 119 planar measurements, 114 are bedding; 7 are overturned beds. It is a sample of a mapped area,
not of a mineral deposit.

Rebuild with:

```
node scripts/samples/build-mount-raymond.mjs "<the package's Data/SHP/Geology folder>" "<cdem_dem_116I.tif>"
```

Coordinates: **NAD83 / UTM zone 8N (EPSG:26908)**, the map's own grid. Terrain heights are metres above the CGVD28 vertical datum.

## Files

| File | Features | What was taken |
|---|---:|---|
| `map_units.shp` (+ .shx .dbf .prj .cpg) | 31 polygons | the map units: `MAP_UNIT` (15 units), `LABEL`, `PARENTS` (the group or formation), `MAX_AGE`, `MIN_AGE`, `LITH_LIST`, `DESCRIPTIO`, `GENESIS` |
| `contacts.shp` | 71 lines | `SUBFEATURE` (depositional 35, faulted 33, depositional-conformable 3), `CONFIDENCE` (defined / approximate / inferred), `REMARKS` |
| `faults.shp` | 20 lines | `SUBFEATURE` (thrust 7, reverse 7, motion undefined 6), `CONFIDENCE`, `NAME`, `PROPERTIES`, `MOVEMENT`, `HWALL_DIR` (the hanging-wall side), `REMARKS` |
| `folds.shp` | 29 lines | `SUBFEATURE` (syncline 13, anticline 11, monoclinal bends 5), `ATTITUDE`, `CONFIDENCE`, `NAME`, `REMARKS`, `ARROW_DIR` |
| `bedding.csv` | 119 rows | the map's planar measurements (its `Planar` point layer): station, measurement id, easting, northing, type (bedding 114, fracture 2, cleavage 2, fault plane 1), dip direction, strike, dip, attitude (upright / overturned / horizontal / vertical), the younging evidence, the method (103 measured at the station, 16 estimated remotely) and the geologist's remark |
| `terrain_cdem_90m.tif` | 267 × 328 nodes | elevations from the Canadian Digital Elevation Model, tile 116I, at a 90 m grid in the map's CRS (349 to 1,163 m) |

**Changes made to the source.** The four shapefiles' geometry (`.shp`, `.shx`), projection (`.prj`) and code page (`.cpg`) files are
copies, byte for byte, renamed. Their attribute tables (`.dbf`) were rewritten with the descriptive columns listed above; the symbol
codes, cartographic rule numbers, map and reference identifiers and the authority column were left out, and each text column is as
wide as its longest value. The planar measurements were written to a CSV with their point coordinates. The terrain was sampled
(bilinear) from the 0.75 arc-second CDEM at a 90 m grid. No coordinate, attribute value or measurement was altered.

**North reference of the measurements.** The map's data model gives the dip direction as an azimuth and names no north. GeoStrix
reads them as true north, as a published geological map plots them, and turns them to grid north when the sample is loaded (0.9° to
1.4° added across the sheet). If you know the survey recorded them otherwise, re-import `bedding.csv` in Surface Geology and choose.

Not included from the package: the linear measurements (23), the stations and their lithology descriptions, the fossil localities,
the two wells, the cartographic layers (topographic base, annotation, borders), the map PDF and the fonts and styles.

## Licence and attribution

**The map.** Geological Survey of Canada, Canadian Geoscience Map 71, second edition (2022): *Bedrock geology, Mount Raymond, Yukon,
NTS 116-I/8*, scale 1:50 000, https://doi.org/10.4095/329963. The publication's record in Natural Resources Canada's Open Science
and Technology Repository gives its licence as the Open Government Licence – Canada
(https://open.canada.ca/en/open-government-licence-canada). This is the second edition; it replaces the first (2020,
https://doi.org/10.4095/290066), which is not used.

**The terrain.** Canadian Digital Elevation Model, tile 116I, Natural Resources Canada, Open Government Licence – Canada.

Contains information licensed under the Open Government Licence – Canada. The licence allows anyone to "copy, modify, publish,
translate, adapt, distribute or otherwise use the Information in any medium, mode or format for any lawful purpose". The Government
of Canada does not endorse GeoStrix, and nothing here has official status. The information is provided "as is": the Geological Survey
of Canada and Natural Resources Canada make no representation or warranty about it.
