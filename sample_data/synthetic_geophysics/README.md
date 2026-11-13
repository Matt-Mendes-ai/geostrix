# Synthetic geophysics test data

Two files for practising the Geophysics module's point-survey and GeoTIFF imports. **Both are entirely
simulated: they are not real geophysical data and were not measured anywhere.** They were made for
GeoStrix and may be shared with it under its MIT licence.

They used to sit in `harry_property/`. That sample comes from BC's public assessment reports, which
GeoStrix may not redistribute, so it is no longer in the repository or the installer: GeoStrix downloads
it from BC's servers the first time you open it. These two files are GeoStrix's own work, so they stay
here.

- `geophys_mag_survey.csv`: a simulated ground magnetic survey. 3,528 points on north-south lines 100 m
  apart, a station every 25 m. Columns `x,y,z,value,label`: `value` is the total magnetic field in nT,
  and `label` is `TMI_nT`. A gentle regional gradient (about 53,000–54,000 nT) carries five magnetic
  lows, placed at five of the Harry property's drill collars. `z` is near the collars' average
  elevation (about 1,150 m) with small jitter, as for a ground survey.
- `geophys_resistivity.tif`: a matching simulated apparent-resistivity grid (220 × 200 cells, ohm-m),
  with resistivity lows at the same five centres. It carries ModelPixelScale / ModelTiepoint tags only,
  with no CRS keys, so it is read in the project's EPSG.

Both cover 462,200–464,560 E and 6,176,700–6,180,350 N in EPSG:3156 (NAD83(CSRS) / UTM zone 9N), the
Harry property's footprint. To see them with drillholes, open the Harry sample (File > Open Sample
Project; it downloads the first time), then import either file in Geophysics and press View in 3D.
They also import into any empty project in EPSG:3156.
