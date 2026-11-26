# Carbo Creek — three diamond holes under IP and ground EM (Queensland)

An IOCG-style copper-gold target under cover on EPM 18575, about 135 km north-east of Boulia in the Eastern Succession of the Mount Isa Inlier (north-west
Queensland), tested by Minotaur Operations in 2012-2014: seven dipole-dipole IP lines and in-loop ground EM, then three diamond holes. Everything here is real
company data from two open-file reports; nothing is synthesized.

Source: Geological Survey of Queensland open-file report cr107430 (company report by Minotaur Operations Pty Ltd, 2018) and open-file report cr078224 (company
report by Minotaur Operations Pty Ltd, 2013), (c) State of Queensland, CC BY 4.0 (creativecommons.org/licenses/by/4.0). Converted and trimmed for GeoStrix:
the drill tables renamed to GeoStrix's columns and the operators' names left out, the magnetic survey azimuths turned to grid (the magnetic ones kept), the
lab's two inline standards marked as QC, the IP lines and the ground EM files nearest the holes kept as delivered, the plot pictures, raw receiver files,
field sheets, the far EM lines and the PDF reports left out.

## What it contains

| | |
|---|---|
| Holes | 3 diamond holes (collars, 18 survey stations), MGA94 zone 54 (EPSG:28354) |
| Logs | lithology (100 intervals), weathering, mineralisation (4), structural zones (133 intervals, `struct_zones.csv`: no orientations logged), veins (24) |
| Assays | 109 core intervals, 61 elements (ICP / fire assay) and the lab's crushing check (`Pass2mm (%)`), 2 inline certified standards marked QC |
| Downhole readings | pXRF (725 readings, 17 elements with their errors; each at one depth, given as From = To), magnetic susceptibility (731), density (244, each at one depth: a Custom layer, not Specific gravity, which needs intervals) |
| Geophysics | IP: 7 dipole-dipole lines (Zonge TQIPdb `.dat` with `.utm.stn` station coordinates); ground EM: 4 in-loop TEM files (Maxwell `.tem`) |
| Mapping | the report area (`report_area_epm18575.zip`, a shapefile in GDA2020 longitude / latitude) |
| Terrain, grids | none |
| Size | 1.8 MB, 32 files, with this README and `build-checks.txt` |

## What the data are

- **Geology, from the logs (not the report's label).** Psammite, pegmatite, migmatite and granite / granodiorite basement under silt, clay and sand cover.
  Copper is in veins: chalcopyrite with red and specular hematite, actinolite and pyrrhotite (the vein log), pyrite and chalcopyrite (the mineralisation log).
  The best interval is 6,880 ppm Cu and the best gold 0.39 ppm; zinc and lead are low and iron under 5.1 %. An IOCG-style target tested with weak vein-hosted
  copper, not an ironstone-hosted orebody.
- **The survey azimuths were magnetic** (every station's Grid = Magnetic). `survey.csv`'s `azimuth_grid` is grid north (the IGRF declination at each hole for its
  survey date, about 6.2 degrees east, plus the grid convergence); `azimuth_magnetic` is the value logged.
- **QC.** Two rows of the assay table are certified standards with no depth: `sample_type` = Standard (the rest Sample). No below-detection code is negative:
  the lab wrote "<0.005"-style values, kept as they are.
- **Overlaps.** None in the lithology or assays; 5 structure intervals and 1 vein interval overlap the one before (two structures logged over the same
  metres), kept.
- **IP over the holes.** Holes 1 and 2 lie 4 and 22 m from line 7552400N, hole 3 48 m from line 7544100N: all three holes are under IP. Each line's
  `.utm.stn` gives its stations' MGA coordinates. cr078224 holds the same seven lines as H / D tables: the TQIPdb files are kept, not both.
- **Ground EM.** In-loop B-field TEM, 2012-2013: the four lines with a station within 3.5 km of a hole (the nearest 320 m from hole 3, 1 km from hole 2).
  Two farther lines and the Kite prospect's EM (15-20 km away, on local coordinates) are left out.
- **CRS.** Collars and EM in MGA94 zone 54 (EPSG:28354, the collars' CollarGrid MGA94_54 and the files' names); the IP stations' coordinates are MGA zone 54
  too; the report area is GDA2020 longitude / latitude.

## Rebuild

`node scripts/samples/build-gsq-carbo-creek.mjs "<cr107430 download>" "<cr078224 download>"` with the two reports' downloads from the GSQ Open Data Portal
(the portal's `.zip`, or the folder it unpacks to). The script prints its checks and writes them to `build-checks.txt`.
