# Geological Survey of Canada geophysics: how GeoStrix handles it, and what to bundle

Review session, 2026-11-12. Matt's brief: "harvest the Geological Survey of Canada geophysics sample set for GeoStrix": find out how
well GeoStrix handles real public Canadian geophysics, fix what it cannot read or shows wrongly, and decide whether some of it should
become a bundled sample.

**Short answer.** Every Geosoft grid in the set reads exactly. The station files did not: the ordinary table reader lost their header,
and their longitude / latitude went into a UTM project as metres. Four reader faults are fixed on a branch with tests (not merged).
Forty-three more findings are listed for the backlog, four of them High. Nothing is bundled; the proposal is Blake River gravity (a
Bouguer grid and its 7,810 stations, about 1.3 MB), once the licence is confirmed on the download page, because **no file in the set
states a licence**.

How it was done: the 15 zips were unpacked with 7-Zip into `C:\GeoStrixData\gsc-geophysics\raw` (outside OneDrive, one folder per
zip, the stylesheet left out); every file was read with GeoStrix's own code in Node and checked against an independent decoder; two
reviewers then used the five areas in the real app (a frozen build of master 49be5f6c, v0.1.111 + 33 commits, in its own worktree,
isolated profiles, no network: 0 external requests attempted). The data was treated as untrusted throughout. Scripts, reference grids
and the reviewers' evidence are under `C:\GeoStrixData\gsc-geophysics\` (`scripts`, `out`, `app\revA`, `app\revB`).

## 1. Inventory

Source folder (read-only): `Sample Data\Geological Survey of Canada`, 15 zips, 8.9 MB. Each zip holds the data file, an `.xml`
metadata file and (for grids and pictures) a Geosoft `.gi` side file.

| # | Area | File | Method | Grid as delivered | CRS (from the .xml) | Extent (E, N; m) | Acquired | Values (min to max) |
|---|---|---|---|---|---|---|---|---|
| 1 | Athabasca Basin, SK | `Athabasca_URA.GRD` | Radiometric, equivalent uranium | 1230 × 858 nodes at **400 m** (title: 100 m) | WGS 84 / UTM 13N, EPSG:32613 | 194,165 to 685,765; 6,234,765 to 6,577,565 | 2003-09-02 to 2008-10-24 | -3.36 to 417.5; median 0.53; 53.5 % no data |
| 2 | Bathurst camp, NB | `bathurst_megatem_all_cond.GRD` | MEGATEM apparent conductance | 844 × 664 at **100 m** (title: 50 m) | NAD83 / UTM 19N, EPSG:26919 | 678,625 to 762,925; 5,215,575 to 5,281,875 | not stated | 0.0001 to 5,591; median 40 |
| 3 | Bathurst camp, NB | `bathurst_megatem_all_tau_x7_20.GRD` | MEGATEM x-coil decay constant (tau) | same grid | EPSG:26919 | same | not stated | 46 to 1,133; 44.8 % of cells exactly 46 |
| 4 | Bathurst camp, NB | `bathurst_megatem_all_mag_res.GRD` | Residual total magnetic field | same grid | EPSG:26919 | same | not stated | -1,333 to 5,734; median -120 |
| 5 | Blake River, QC | `BR_bou_2009_geosoft.GRD` | Bouguer gravity anomaly | 767 × 424 at 100 m | NAD83 / UTM 17N, EPSG:26917 | 609,300 to 685,900; 5,332,300 to 5,374,600 | 1974-01-01 to 2008-07-05 | -65.6 to -31.7 |
| 6 | Blake River, QC | `BR_bou_2009_vg_geosoft.GRD` | First vertical derivative of 5 | same grid | EPSG:26917 | same | same | -7.15 to 8.48 |
| 7 | Blake River, QC | `BlakeRiverGravity.csv` | 7,810 gravity stations | points | header: `Projection:"WGS 84"`, `Unit:dega` (longitude / latitude) | lon -79.548 to -78.274, lat 48.063 to 48.513 | same | Bouguer -70.93 to -29.67 |
| 8 | Blake River, QC | `BlakeRiverGravity.gdb` | the same stations, Geosoft database | closed format | | | | |
| 9, 11 | Flin Flon - Snow Lake, MB | `FlinFlon_SnowLake_25m_mag_vd1.TIF`, `..._mag_res.TIF` (+ `.tfw`, `.prj`) | Magnetic first vertical derivative; residual total field | 793 × 432 px at **375 m** (title: 25 m): 24-bit RGB **pictures** of a colour map, no values | NAD83 / UTM 14N, EPSG:26914 (GeoKeys and .prj) | see section 2 | 1979-01-01 to 2007-09-03 | colours only; 25.2 % white surround |
| 10, 12 | Flin Flon - Snow Lake, MB | the same two as `.ECW` (+ `.tfw`, `.prj`) | | closed wavelet format | | | | |
| 13 | Matagami, QC | `Matagami, QC - 100m - Bouguer Anomalies - Anomalies de Bouguer.GRD` | Bouguer gravity anomaly | 533 × 205 at 100 m | NAD83 / UTM 18N, EPSG:26918 | 269,600 to 322,800; 5,502,800 to 5,523,200 | 2006-11-01 to 2008-03-26 | -70.3 to -35.1 |
| 14 | Matagami, QC | `... Vertical Derivative - Dérivée 1ère verticale.GRD` | First vertical derivative of 13 | same grid | EPSG:26918 | same | same | -8.88 to 7.28 |
| 15 | Matagami, QC | `Matagami_DAP.csv` | 2,165 gravity stations | points | header: `Projection:NAD83`, `Unit:dega` | lon -78.179 to -77.481, lat 49.646 to 49.819 | same | Bouguer -69.95 to -34.96 |

What the metadata does **not** say, in any of the 15 files:

- **Licence: none.** No licence, copyright, use-constraint or terms statement appears in any `.xml`, nor in the stylesheet zipped
  with them (searched as text for licence / license / copyright / Open Government / constraint / Crown / conditions: 0 matches). GSC
  data is normally under the Open Government Licence - Canada, but that statement lives on the download site, not in the files, and
  this review made no network calls. **The licence must be confirmed on the download page before anything is bundled.**
- **Units: none.** Neither the grids' headers nor the metadata give a unit. The usual ones (ppm eU, nT, mGal, and for the derivative
  mGal per kilometre: see section 3) have to be typed by the user. The Bathurst files have no description, date or theme at all.
- **Cell size: none in the metadata**, and three titles overstate the resolution of what was delivered: the grid headers say 400 m
  for "Athabasca - 100m", 100 m for "Bathurst - 50m", and 375 m pixels for "Flin Flon - 25m". These downloads were resampled when
  they were requested; the native grids would have to be asked for at full resolution.
- The Blake River and Matagami files cite Open Files 5981 and 5580; Flin Flon cites Open File 7103.
- The Flin Flon metadata carries a staff member's name (creator and contact fields). It is not repeated here or in any row.

## 2. Read results, file by file (GeoStrix's own code, before any change)

| File | Reader | Result | What was checked |
|---|---|---|---|
| The nine `.GRD` grids | `src/lib/grdFormats.js` in Node, then Maps > GeoTIFF / GXF | **Pass** | Rows and columns, cell size, first node and node extent equal the header and the `.xml` extent for all nine. Every value and every no-data cell equals an independent decode (Python `struct` + `zlib`): 0 differences in 3,605,534 cells. No-data is the float dummy -1e32, read as NaN. All nine are Geosoft compressed float32 (element size 1028; block table type 2, zlib streams in blocks of 13 to 30 rows), unrotated, `ZBASE` 0, `ZMULT` 1. Decode time 8 to 140 ms. |
| The same grids | placement of the picture | **Fail, fixed** | The drape was given the node extent as its pixel-area extent (84,300 × 66,300 m for 844 × 664 cells of 100 m): the picture was one cell short each way and its edges sat half a cell inside. The kept values were always right. |
| The same grids | CRS | **Fail (row)** | A `.grd` carries no CRS and GeoStrix does not read the `.xml` beside it, which states `wellknown_epsg`. The notice says the grid is "assumed to already be in the project's EPSG"; an empty project stays without a CRS. |
| The same grids | values kept | **Fail (row, High)** | Over 512 nodes a side the values are kept block-averaged (2 × 2 or 3 × 3). Identify, the legend, "Linear min-max" and contours then read the averages: the eU peak of 417.5 reads 67.68. |
| Flin Flon `.TIF` (2) | geotiff.js + `rasterAreaBbox`, then Maps | **Pass**, placement **fail, fixed** | 793 × 432 px, 3 bands of 8 bits, PackBits, read as a picture (the card says "Picture only: colours, no values"; the white surround is made transparent and said so). EPSG:26914 read from the GeoKeys. Placement: the file ties raster point (0.5, 0.5); the library takes every tie point as raster (0, 0), so the picture sat 187.5 m east and 187.5 m south of where GDAL / QGIS put it. |
| Flin Flon `.tfw`, `.prj` | `parseWorldFile` | **Pass, with notes** | The world file parses (a UTF-8 byte-order mark is no obstacle). It is unusual: the fourth number is +375 and the last two are the south-west corner. GeoStrix uses a world file only when the TIFF has no georeferencing of its own, so it is set aside here, without saying so; the `.prj` is not accepted by the file dialog and, if selected, is reported as a bad raster (row). |
| Flin Flon `.ECW` (2) | none | **Cannot read, as expected; message fails** | Every route answers with a sentence that does not fit: the raster input says it "is not a TIFF, .gxf or .grd file (its first bytes are not a TIFF header)", the Maps plan sends the user to "Boundaries, Terrain or Web layers", two places say nothing. None says ECW is a closed format or points to the GeoTIFF copy (row). |
| `BlakeRiverGravity.gdb` | none | **Cannot read, as expected; message partly fails** | Dropped on the Geophysics panel or the 3D View: the right sentence ("a Geosoft database ... export its channels to CSV or XYZ"). Through the Point survey buttons it is read as a text table (263 rows of one column, or 1,192 rows of binary noise that Import accepts); the Maps routes give the raster sentence (row). |
| Station `.csv` (2) | `src/lib/tabular.js` (Point survey > Import CSV) | **Fail, fixed** | Eight "/" lines, a 22-name header, then rows of 23 fields (each ends with a comma). The header was passed over and the first station became the column names: "7,809 row(s), 23 column(s)", one station lost. |
| The same, renamed `.xyz` | `src/lib/geosoft.js` `parseXYZ` | **Fail, fixed** | The last "/" line (`Local:"WGS 84",0,0,0,0,0,0,0`) was taken as the header: eight columns, seven named 0, and Import accepted 7,810 junk points. |
| Station `.csv` | CRS and units | **Fail (rows, High)** | The header's `Projection` and `Unit:dega` are not read. With the Source CRS left alone, 7,810 stations go into the UTM project as metres (a 1.3 m pillar), with no warning. With the Source CRS given they land to the millimetre. The values are labelled mGal from the column names, a correct guess. |
| Stations against the published grid | reference, outside the app | **Agree** | Published Bouguer grid sampled at every station: Blake River mean -0.0001, sd 0.052 mGal (worst 0.54); Matagami sd 0.065 (worst 0.50). |
| Gridding the stations in the app | IDW; equivalent sources | **IDW pass; equivalent sources fail (rows)** | IDW at 100 m reproduces the published pattern (correlation 0.9992, sd 0.31 mGal at Blake River; 0.9978, 0.45 at Matagami) and says how it blanks. Equivalent sources fail on 7,810 stations with a raw Python error, and on 2,165 give a grid up to 10.6 mGal off the published one while reporting a 0.003 mGal fit. |

## 3. Reader faults fixed

Branch `review/gsc-readers` (worktree outside the repository; **not merged, not pushed**), with `test/gscGeophysicsReaders.test.mjs`
(made-up rows in the survey's layout). `npm test`: 4,628 pass, 0 fail. No other session had changes in these files when the branch was cut.

1. **Geosoft / Surfer `.grd` and `.gxf`: the picture sat up to half a cell inside the grid** (`src/lib/raster.js`,
   `nodeGridAreaBbox`). Each pixel is now centred on its node. Live on the branch's own build: the Bathurst grid spans
   84,400 × 66,400 m, from 678,575 E.
2. **GeoTIFF: a tie point that is not at raster (0, 0) was placed as if it were** (`src/lib/raster.js`, `tiffBoundingBox`, used by
   rasters and DEMs). Half a pixel for Geosoft's map exports (187.5 m here); a file tied at its lower-left corner would have sat a
   whole image too low. Live: the Flin Flon picture now lies at 225,569.89 to 522,944.89 E, 5,980,482.99 to 6,142,482.99 N, where
   its own tags put it. The metadata's stated extent is another half pixel to the north-east; the file's tags were followed.
3. **Geosoft point export read as `.xyz`: the header** (`src/lib/geosoft.js` `parseXYZ`, and the streamed reader). A plain line of
   column names after "/" lines that only describe the file is the header; a trailing comma adds no column.
4. **The same file as `.csv`: the header and the first station** (`src/lib/tabular.js` `skipPreamble`). Rows one field wider than
   the header, that field empty, are the header's rows.

## 4. Findings from using the data (for the backlog)

Forty-six rows were sent to GeoStrix Main to log (Main is the only writer of TASKS.csv while its side sessions run): 43 findings
(4 High, 17 Medium, 22 Low), one row for the reader fixes of section 3, one for this review and one for the bundling decision. The
full text of each (verbatim symptom, file, expected result, recommendation) is in
`C:\GeoStrixData\gsc-geophysics\out\ROWS_FOR_MAIN.json`. The ones that matter:

**High**
- **Longitude / latitude stations go into a UTM project as metres, with no warning** (7,810 stations in a 1.3 m pillar). The file's
  own `Projection` / `Unit:dega` lines are not read, and nothing notices coordinates that can only be degrees.
- **On an empty project, importing longitude / latitude stations offers to make the project CRS geographic, and OK does it**
  (EPSG:4269), overriding the CRS just chosen.
- **A grid over 512 nodes a side shows block-averaged values as the grid's values**: the Athabasca eU peak of 417.5 reads 67.68 at
  its own node, no value above 167.3 exists anywhere in the app, and typed contours at 200 and 400 "cross nothing". (The reviewer
  rated this Medium; it is raised to High here because the file's peaks are lost to every number the app shows.)
- **"Grid with equivalent sources" fails on 7,810 stations with a raw Python error** (`ValueError: Window size ...`).
- Two of the four reader faults above were also High as found (the lost header and station; the placement of a GeoTIFF tied
  elsewhere than its corner).

**Medium, by theme**
- *An imported grid cannot say what it is.* Reduction to the pole runs on conductance (giving negative conductance), tau, eU and
  Bouguer gravity, with no refusal; the same filter is correctly refused on a grid GeoStrix made itself from a gravity survey.
  Typing the unit changes nothing. The filter list opens on the wrong choice for `..._mag_res` because "res" reads as resistivity.
- *Units fall off.* Filter products lose the unit typed on their parent; a tilt derivative never says degrees. The app's first
  vertical derivative is per metre; the published ones are per kilometre (the two correlate 0.93 to 0.94 with the same sign and a
  ratio near 780), and neither states it.
- *Contours follow a geochemistry rule.* Default levels are percentiles of the positive cells only: none at all for an
  all-negative Bouguer grid, and on the magnetics (91 % of cells at or below zero) only the top 2 %, though the tooltip says "the
  grid's 75th, 90th, 95th and 98th percentiles".
- *Gravity tools.* Gravity reductions take the Bouguer plate off a second time from a survey already labelled Bouguer (-65.53
  became -100.84). The equivalent-source grid, when it runs, is 0.5 to 0.7 mGal off the stations and up to 10.6 mGal off the
  published grid while reporting a 0.003 mGal fit. Stations can only be gridded by IDW or equivalent sources, though minimum
  curvature and a spline exist for geochemistry. With several measurements in a file, observed gravity, elevation and the terrain
  correction cannot be chosen as the value.
- *Getting files in.* The `.gdb` and `.ecw` messages (section 2). A drop on the Geophysics tab's large pane does nothing once data
  is loaded; a station CSV dropped on the 3D View or Maps is offered only as a drillhole table. A Geosoft `.grd` dropped on the
  Geophysics tab is refused though Maps and the 3D View read it.
- *Seeing it.* A regional station survey (15,620 points over 94 × 50 km) is a few faint specks at Fit in the 3D view. A grid made
  from stations has no colour legend until its ramp is touched.
- *Speed.* Every grid filter freezes the window 1.1 to 1.9 s on a 422 × 332 grid and 5 to 7 s on 945 × 501; a `.grd` import
  freezes it 0.8 to 1.9 s.
- *CRS of a Geosoft grid.* The `.xml` beside a `.grd` states its EPSG code and is not read.

**Low** (22): wording that still says the binary `.grd` is not supported; three rasters of one survey all shown as
"bathurst_megatem…"; no shaded relief for a value grid; no value under the cursor on the Maps plan and no way to reorder rasters
there; "Placed flat at 0 m" for rasters placed at 5 and 10 m; a Layout legend of a picture-only view is a grey box labelled "Item";
the Layout legend lands on the north arrow; small values rounded to 0 in the range boxes; a constant 0.77 mGal between the app's
gravity reductions and the survey's own columns (cause not established); and smaller slips.

**Do GeoStrix's own suggestions assume a deposit style?** No deposit style is assumed anywhere that was reached: the inversion pane
proposes no depth, density contrast or "target", the unit box stays empty until typed, and reduction to the pole asks for
inclination, declination and a date and takes them from IGRF locally. What the defaults do assume is a *kind of data*: geochemistry
(upper-tail contours) and magnetics (filter order, "nT" in hints, "below the sensor" in the spectrum text). Those are the rows above.

**What held up.** All nine grids import in 2 to 3 s with the right size and extent; no data is transparent on Maps, in the 3D view
and in Layout; Identify equals the value the app holds at all 22 places checked; the default 2-98 % stretch is not washed out by
the single 417.5 cell; the log stretch is offered with the decades counted; a five-decade conductance grid, an all-negative gravity
grid and long accented file names all work; stations land to the millimetre once the Source CRS is given; IDW takes its cell and
blanking from the measured station spacing; Layout gives a map, a legend with units, a scale bar and grid north on the first try.

**Not tested.** Anything behind a native Save dialog (exports were checked from the code that builds them); draping on terrain
(no terrain without the network); Euler deconvolution, worms, tilt-depth and inversions (the pane was opened, not run). The four
branch fixes were each checked on the real files, in Node and live on the branch's own build.

## 5. Bundling proposal (nothing is bundled; for Matt to approve)

**Proposed: Blake River gravity**, as a sample with no drillholes: the published Bouguer grid and the 7,810 stations behind it.

- **Why this one.** It is the only area where the survey's own points and the grid made from them are both in the set, so it shows
  the whole path a geologist follows: stations, gridding, comparison with the published grid, derivatives. It is delivered at its
  native 100 m, unlike Athabasca, Bathurst and Flin Flon, whose downloads are coarser than their titles. Gravity carries no
  deposit-style assumption. And it is the data on which this review found the most, so it is the best regression set.
- **Why not the others.** Bathurst (EM and magnetics, 3.2 MB) is the more striking picture, but an imported grid cannot yet state
  its method, so the sample would lead users straight into the reduction-to-the-pole fault. Athabasca at 400 m is a coarse copy and
  its peak is averaged away. Flin Flon is pictures. Matagami is the same story as Blake River with fewer stations (a fair
  second choice at 0.4 MB if size matters more).
- **What is real.** All of it: no value would be synthesized, resampled or altered. The build script would only reproject the
  station coordinates from longitude / latitude to NAD83 / UTM zone 17N, drop the eight "/" lines (one holds a server path), keep
  the columns a user needs, and say so in the README. The published vertical-derivative grid can be left out: the app computes it.
- **Size.** Bouguer grid 0.87 MB as delivered; stations about 0.45 MB with eight columns (1.2 MB with all 22): about 1.3 MB. The
  existing samples run from 1.2 MB to 13 MB.
- **Licence.** Not stated in the files (section 1). The README below assumes the Open Government Licence - Canada and must not ship
  until that is confirmed on the download page. That licence asks for an attribution statement and a link to the licence, and that
  no endorsement by the Government of Canada be implied.
- **How it fits the 3D View's sample list.** One more line under the five there now, in the same form:
  "Sample: Blake River gravity (7,810 stations, Bouguer grid, no holes)". Opening it would set the project CRS to EPSG:26917, load
  the grid as a raster with the unit mGal, and load the stations as a gravity survey (Bouguer and free air). It belongs with
  Perk-Rocky as a sample without drillholes, and the Geophysics help pages could point to it for gridding and filters, offline.
- **Before it is built.** Merge the four reader fixes, and fix the block-averaging row or the sample's first Identify will not
  equal the file (767 × 424 is over the 512-node limit). The rest can follow.

Draft README (`sample_data/blake_river/README.md`):

> # Blake River gravity (Abitibi, Quebec): a sample with no drillholes
>
> Real public data from the Geological Survey of Canada's geophysical data repository: the compilation "Blake River, QC - 100 m"
> (gravity, acquired between 1974 and 2008; Geological Survey of Canada Open File 5981).
>
> - `bouguer_100m.grd`: the published Bouguer anomaly grid, 767 × 424 nodes at 100 m, NAD83 / UTM zone 17N (EPSG:26917), in mGal.
>   As delivered (a Geosoft grid).
> - `stations.csv`: the 7,810 gravity stations behind it. Coordinates reprojected by GeoStrix from the file's longitude / latitude
>   to NAD83 / UTM zone 17N; columns kept: station, year, elevation (m), observed gravity, free-air and Bouguer anomalies (mGal).
>   The file's other columns (accuracy estimates, project codes, times) and its export header were left out. No value was changed.
>
> Everything here is real; nothing is synthesized. The units are not stated in the original files; mGal and metres are the survey's
> convention. The grid and the stations agree to 0.05 mGal (standard deviation) where a station lies.
>
> Contains information licensed under the Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada).
> Source: Natural Resources Canada, Geological Survey of Canada. This sample is not endorsed by, or affiliated with, the Government
> of Canada.

## 6. For Matt

- **Decide:** bundle Blake River gravity, yes or no; and confirm the licence shown on the page these were downloaded from.
- **If the full-resolution grids matter** (Athabasca 100 m, Bathurst 50 m, Flin Flon 25 m), they need to be requested again at
  native resolution; these copies are 400 m, 100 m and 375 m.
- The reader fixes sit on `review/gsc-readers` for Main to merge; the rows are with Main to log.
