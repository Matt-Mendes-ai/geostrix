# Rouyn-Noranda — real geology, structural measurements and historical drillhole traces (SIGEOM, Quebec)

A 7 km block of the Rouyn-Noranda mining camp in the Abitibi, Quebec (48.22° to 48.28° N, 78.95° to 79.05° W), from the
province's geoscience database, SIGEOM: the regional geology, 299 structural measurements taken at outcrop, and 280 diamond
drillholes drilled between 1937 and 2018, on a terrain from the Canadian Digital Elevation Model. Everything here is real data as
published; **nothing is synthesized**.

**What the drillholes are, and are not.** SIGEOM records where a hole was collared, its azimuth and dip at the start and at the
end, and its depth. It keeps no downhole assay table, and its map service gives no log intervals. So these 280 holes are traces:
84,883 m of drilling to show where a camp has been tested and how deep (6 to 1,713 m), with no lithology and no grades. A sample
with logged and assayed holes is one of the Western Australian ones. SIGEOM gives no collar elevation either: the `z` here is the
terrain's elevation at the collar.

What the data show (counted from these files): 316 geology polygons of 44 units, mostly Archean volcanic rocks (andesite, basalt,
rhyolite and their breccias) cut by diorite, gabbro and felsic intrusions. Of the 299 measurements, 103 are bedding, 64 cleavage,
42 schistosity and 31 mineral foliation; the rest are dykes, shears, veins, faults and joints. The block lies inside the ground of
the **Blake River gravity sample** and uses the same coordinate system, so the two can be loaded into one project.

Rebuild with:

```
node scripts/samples/build-qc-rouyn-noranda.mjs "<folder with the service's GeoJSON answers>" "<cdem_dem_032D.tif>"
```

Coordinates: **NAD83 / UTM zone 17N (EPSG:26917)**, projected from the longitude and latitude the service returns. Terrain heights
are metres above the CGVD28 vertical datum.

## Files

| File | Rows | What was taken |
|---|---:|---|
| `geology.zip` | 316 polygons | a zipped shapefile of SIGEOM's regional geology: `UNIT` (the unit's description, in French as published), `CODE` (SIGEOM's lithology code), `STRAT` (the stratigraphic unit), `AGE`. A unit is often many separate pieces, some tens of kilometres away: the pieces within 1 km of the block are kept, each whole |
| `structures.csv` | 299 | outcrop measurements: station, easting, northing, type, strike, dip, SIGEOM's own type label, and the source table. SIGEOM records a plane as strike and dip by the **right-hand rule** (the dip is to the right of the strike direction), measured from **true north**; GeoStrix turns them to grid north when the sample is loaded (1.5° here). 31 readings whose dip SIGEOM marks undetermined (99) are left out |
| `collars.csv` | 280 | hole_id (`FD-` and SIGEOM's record number), x, y, z (from the terrain), length, hole_type (DD), year, location_precision, company_hole (the hole's original number), epsg |
| `survey.csv` | 560 | two stations per hole, the collar and the end, from SIGEOM's start and end azimuth and dip (dips -5 to -90). The azimuths were turned from true to grid north (1.46° to 1.53° subtracted) |
| `terrain_cdem_30m.tif` | 322 × 297 nodes | elevations from the Canadian Digital Elevation Model, tile 032D, at a 30 m grid 1 km around the block (269 to 373 m) |

**Which holes.** SIGEOM lists 1,116 diamond drillholes in the block and rates the location of each. 789 are rated undetermined
and 47 low; only the 280 rated **medium or high** are kept.

**Changes made to the sources.** Coordinates were projected to UTM zone 17N; the geology was converted to a shapefile with four
columns and cut to the pieces near the block; structure types were given English names beside SIGEOM's labels; the survey azimuths
were turned to grid north; the collar elevations and the terrain were sampled (bilinear) from the 0.75 arc-second CDEM. No
measurement was altered.

Not included: SIGEOM's rock and sediment sample points of the block. The service gives their locations and rock types but not
their analyses; the analyses are in a province-wide geochemistry file of 958 MB, too heavy to cut a sample from.

## Licence and attribution

**SIGEOM.** Ministère des Ressources naturelles et des Forêts, Gouvernement du Québec: *Sondages* and the SIGEOM geology and
structure layers, accessed through the province's map service on 12 November 2026. Données Québec lists the SIGEOM datasets under
the licence "Attribution (CC-BY 4.0)" (https://www.donneesquebec.ca/licence/#cc-by, https://creativecommons.org/licenses/by/4.0/).
SIGEOM notes that the coordinates it distributes are indicative. The Gouvernement du Québec does not endorse GeoStrix.

**The terrain.** Canadian Digital Elevation Model, tile 032D, Natural Resources Canada. Contains information licensed under the
Open Government Licence – Canada (https://open.canada.ca/en/open-government-licence-canada). The Government of Canada does not
endorse GeoStrix.
