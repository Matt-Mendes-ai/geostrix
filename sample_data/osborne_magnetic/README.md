# Osborne mine airborne magnetics (Mt Isa Inlier, Queensland): a sample with no drillholes

Real public data: the total-field magnetic anomaly of Geoscience Australia's airborne survey P1029 over the Osborne mine area, as
processed and published for the Fatiando a Terra documentation by Leonardo Uieda. The files are an ordinary CSV and a GeoTIFF:
import them under Geophysics > Point survey and Maps.

- **`osborne_magnetic.csv`**: 24,927 flight-line readings, one in 40 of each of the 307 flight lines of the survey's 990,987 readings around the
  mine. Columns: `flight_line`, `easting`, `northing` (m, WGS 84 / UTM zone 54 south, EPSG:32754), `height_m` (the flight's orthometric height, m: 276 to 467), `anomaly_nt` (total-field anomaly, nT: -2,693 to 5,392). The survey flew at about 80 m terrain clearance on lines
  200 m apart.
- **`lightning_creek_magnetic_grid.tif`**: the Lightning Creek anomaly gridded at 50 m (346 × 370 nodes, EPSG:32754, nT, -1,785.3 to
  3,798.1), a float32 GeoTIFF. The anomaly of a sill complex: the textbook dipolar high and low. Gridded by Uieda and Gomez from the
  same line data with gradient-boosted equivalent sources, at a 500 m height.

Things to try: Geophysics > Point survey (import `osborne_magnetic.csv`, pick the anomaly as the value; grid it yourself and
compare with the published grid), Maps (the grid, its derivatives and filters), reduction to the pole and the sill's depth.

## Credit (as the data owners ask)

> Contains data (c) Commonwealth of Australia (Geoscience Australia): Geophysical Acquisition & Processing Section 2019, MIM Data from
> Mt Isa Inlier, QLD (P1029), magnetic line data, AWAGS levelled, Geoscience Australia, Canberra.
> http://pid.geoscience.gov.au/dataset/ga/142419

> Processed and published by Leonardo Uieda, Fatiando a Terra Data: *Osborne Mine, Australia - Airborne total-field magnetic anomaly*,
> https://doi.org/10.5281/zenodo.5882209 (Creative Commons Attribution 4.0 International, CC BY 4.0); and *Lightning Creek Sill
> Complex, Australia - Airborne total-field magnetic anomaly grid*, Leonardo Uieda and Mariana Gomez,
> https://doi.org/10.5281/zenodo.7079711 (CC BY 4.0).

Licence: Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/) for both Zenodo records, which
state that the Geoscience Australia source is also CC BY. (Geoscience Australia's own catalogue entry on data.gov.au lists the
licence of P1029 as "Not specified"; the attribution above follows the Zenodo records.)

## What is real, and what was done to it

**Everything is real; nothing is synthesized, smoothed or altered.** The files were written by
`scripts/samples/build-osborne-magnetic.mjs` from the two Zenodo downloads (`osborne-magnetic.csv.xz`, 2.2 MB, and
`lightning-creek-magnetic-grid.nc`, 183 kB):

- the readings' longitude and latitude (WGS 84) were projected to UTM zone 54 south, to a tenth of a metre; every 40th reading of
  each flight line was kept, to keep the sample small (the source has about 7 m between readings along a line; here about 280 m). The flight
  line, height and anomaly are the file's, unchanged. Uieda's processing of the Geoscience Australia data (horizontal datum from
  GDA94 to WGS 84, height above the ground converted to flight height with an SRTM grid, cropping to the two anomalies, only the
  coordinates, the AWAGS levelled anomaly and the line number kept) is described on his record;
- the grid's 16-bit packed values were unpacked with the file's own scale (0.1) and offset (-1,785.3) and written as a float32
  GeoTIFF in the grid's own CRS; no value was changed.

Rebuild with:

```
node scripts/samples/build-osborne-magnetic.mjs "<folder with osborne-magnetic.csv.xz and lightning-creek-magnetic-grid.nc>"
```
