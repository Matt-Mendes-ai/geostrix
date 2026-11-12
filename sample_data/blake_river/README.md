# Blake River gravity (Abitibi, Quebec): a sample with no drillholes

Real public data from the Geological Survey of Canada: the gravity compilation **"Blake River, QC — 100 m"** (readings acquired
between 1974 and 2008; Geological Survey of Canada Open File 5981), as downloaded from Natural Resources Canada's geophysical data
repository in November 2026. The Blake River Group is a volcanic belt of the Abitibi greenstone belt, around Rouyn-Noranda.

Open it from the empty 3D View ("Sample: Blake River gravity") or File > Open Sample Project. It loads:

- **`bouguer_100m.grd`**: the published Bouguer anomaly grid, 767 × 424 nodes at 100 m, NAD83 / UTM zone 17N (EPSG:26917), in mGal,
  -65.6 to -31.7. **As delivered, byte for byte** (a Geosoft grid; GeoStrix reads it under Maps > GeoTIFF / GXF). It becomes a
  value raster that GeoStrix knows is gravity.
- **`stations.csv`**: the 7,810 gravity stations behind the grid, as a gravity survey (the Bouguer anomaly as the value, the
  station's elevation as its height). Columns: `STATION`, `YEAR`, `EASTING`, `NORTHING` (m, NAD83 / UTM zone 17N), `ELEVATION` (m),
  `OBSERVED_GRAVITY`, `FREEAIR`, `BOUGUER` (mGal).

Things to try: Maps (stretch, contours, the first vertical derivative and the other filters of the grid); Geophysics > Point survey
(grid the stations yourself and compare with the published grid; import `stations.csv` again to bring in the free-air anomaly or the
observed gravity instead); the 3D View (the grid is drawn at the stations' median elevation).

## What is real, and what was done to it

**Everything here is real; nothing is synthesized, resampled or altered.**

- The grid is the downloaded file, unchanged.
- The stations file was written by `scripts/samples/build-blake-river.mjs` from the download's `BlakeRiverGravity.csv`:
  - the positions, delivered as longitude / latitude (the file's header says WGS 84), were projected to NAD83 / UTM zone 17N, the
    grid's own CRS, and written to the centimetre (the two datums are taken as equal, as the grid's own metadata does);
  - 8 of the file's 22 columns were kept. Left out: the survey project code, date and time, depth fields, the accuracy estimates
    (`CAV`, `EAV`, `DAV`, `GAV`, `TAV`, `FAV`, `BAV`), the terrain correction and the status flag;
  - the export's eight header lines were left out, and the station number and year lost their ".00";
  - every measured value is the file's own text.
- Three stations share a position with another station; they are kept as delivered.
- The original files state no units. mGal and metres are the survey's convention, and the numbers bear it out (observed gravity near
  980,800 mGal).
- Where a station lies, the published grid and the station's Bouguer value agree to 0.05 mGal (standard deviation; worst 0.54).
- The original was acquired over many surveys (1974 to 2008) and compiled by the Geological Survey of Canada; this sample says
  nothing about any mineral deposit.

## Source and licence

Contains information licensed under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).

Source: Natural Resources Canada, Geological Survey of Canada, "CAGDB - Compilation - Blake River, QC -- 100 m"
(Open Government Portal record 558187bf-e32e-5be3-9447-112e9598abd6, published by Natural Resources Canada under that licence).
The downloaded files themselves carry no licence statement; the licence is the one stated on the portal record.

This sample is not endorsed by, or affiliated with, the Government of Canada. The data is provided as is, with no warranty.
