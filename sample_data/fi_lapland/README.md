# Central Lapland — real bedrock map and whole-rock geochemistry, no drillholes (Geological Survey of Finland)

A 100 km by 70 km window of the Central Lapland greenstone belt in northern Finland (about 67.5° to 68.2° N, 24.6° to 27° E):
the Geological Survey of Finland's 1:1 000 000 bedrock units and faults, and its 121 whole-rock samples of the window with their
full chemical analyses. It is a regional sample with no drillholes: a geological map to read rock chemistry against. Everything
here is real published data; **nothing is synthesized**. Names of samplers in the source are not included.

What the data show (counted from these files): 52 of the 121 samples are volcanic rocks, 30 sedimentary, 20 schists and gneisses
and 18 plutonic; 44 are felsic, 37 mafic, 20 ultramafic and 19 intermediate by GTK's own classing. SiO2 runs from 34 to 95 %, MgO
to 44.9 % in the ultramafic volcanic rocks, Cr to 4,950 ppm and Ni to 1,710 ppm. 62 samples are from the 2,300 to 2,500 million
year old (Sariolan and Lapponian) rocks and 18 from the Archean basement. The map has 168 unit polygons of 35 rock names, most of
them Paleoproterozoic volcanic and sedimentary rocks of a continental rift, and 135 faults, 55 of them thrusts. It is a sample of a
mapped region and its rocks, not of a mineral deposit.

Rebuild with:

```
node scripts/samples/build-fi-lapland.mjs "<folder with rock_geochem.geojson, bedrock_units_1m.geojson, faults_1m.geojson>"
```

(the three files are GTK's public map service's answers for the window: layers `kalliogeokemia`, `kalliopera_1m_kivilajiseurueet`
and `kalliopera_1m_siirrosrakenteet` of `Rajapinnat/GTK_Bedrock_WFS` on gtkdata.gtk.fi, in EPSG:3067.)

Coordinates: Finland's national grid, **ETRS-TM35FIN (EPSG:3067)**. GeoStrix has no definition under that code, so the sample is
opened as **ETRS89 / UTM zone 35N (EPSG:25835)**, which is the same projection with the same numbers (TM35FIN is UTM zone 35N
carried across the whole country). The window: E 400,000 to 500,000, N 7,490,000 to 7,560,000. The samples have no elevation.

## Files

| File | Rows | What was taken |
|---|---:|---|
| `bedrock_units.zip` | 168 polygons | a zipped shapefile of the 1:1 000 000 lithological units that touch the window, whole (not clipped): `ROCK_NAME`, `ROCK_CLASS`, `ASSOC` (the rock association and its age), `ERA`, `PERIOD`, `GROUP`, `FORMATION`, `SUITE`, `LITHODEME`, `COMPLEX`, `SETTING` (tectonic setting) |
| `faults.zip` | 135 lines | the 1:1 000 000 faults that touch the window: `FAULT_TYPE` (unspecified minor fault 65, thrust fault 40, thrust fault zone 15 ...), `NAME`, `BASIS` (72 are interpreted from the magnetic map) |
| `rocks.csv` | 121 | the whole-rock samples: sample_id (GTK's laboratory number), x, y, rock type, rock group, composition, age group, sample type (89 outcrop, 29 block field, 3 boulder), then SiO2, TiO2, Al2O3, FeO (total iron), MnO, MgO, CaO, Na2O, K2O and P2O5 in % and 42 more columns: 14 trace elements by XRF, 22 by ICP-MS, As, Bi and Se by GFAAS in ppm, and Au, Pd and Te by GFAAS in ppb |

**Below detection.** The source keeps a flag beside every value; where it says "less than", the value is the detection limit and is
written here as `<value` (1185 cells; 109 of the 121 gold results). GeoStrix reads that notation as below detection.

**Changes made to the sources.** The map layers were converted from the service's GeoJSON to shapefiles with shorter column names;
their geometry and text are unchanged. From the rock table one value per element was taken, from the methods that measure the
whole rock; the ICP-AES columns, an aqua regia (partial) leach of the same samples, are left out, as are carbon, CO2 and
fluorine, the petrographic description columns and the sampler's name. Four rows that GTK flags as duplicates are left out. No value was altered.

Not used: GTK's 1:200 000 bedrock map of the same window (1,312 polygons, 4.6 MB: too heavy for a sample), and GTK's drill-core
logs and analyses, which are sold under GTK's Basic Licence and may not be redistributed.

## Licence and attribution

GTK Open License, CC Attribution 4.0: includes material from GTK *Rock geochemical data of Finland* and *Bedrock of Finland
1:1 000 000*, © Geological Survey of Finland, accessed through GTK's map service (gtkdata.gtk.fi) on 12 November 2026. GTK's
download service lists both products as free under its Open licence, and GTK's licence page says its open products are licensed
under "Creative Commons Attribution 4.0 International" (https://www.gtk.fi/en/open-licence/,
https://creativecommons.org/licenses/by/4.0/). Changes: cut to one window and re-shaped as described above. GTK does not endorse
GeoStrix. GTK's own caution about the rock data applies: "The data is not suitable for making conclusions on the basis of a single
sample point."
