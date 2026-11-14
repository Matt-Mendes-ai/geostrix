# Maps rows that need a decision (TASKS.csv #3456, #3457, #3464, #3470, #3472, #3088, #3187, #3300, #3228, #3095, #3189, #3049, #2826, #2809)

Written 2026-11-14 by side 1. Each row below was looked at in code and left undone because it has more than one reasonable answer. For each:
what it asks, the options with their cost, and which I would pick. Nothing here is built. The pick is a recommendation for Matt, not a decision.

## Collars chip (Maps plan)

### #3456: 'Shape by' a collar field

The chip colours holes by a field or an assay statistic. Shape would add a second variable (hole type, purpose) so 32 geotechnical, 12
exploration and 5 condemnation holes differ by more than a hue.

- **A. Five fixed shapes** (circle, square, triangle, diamond, cross) by the five commonest values of one chosen field, the rest circles.
  Cost: a shape drawer beside `drawDots` (it draws one path per colour; per shape and colour is up to 5 x 16 paths) and a legend column. About
  a day, including the Layout snapshot (the canvas is captured, so it follows).
- **B. Shape only by hole type** (the collar field the import already knows: DD / RC / AC). Smaller, but it is the one field a geologist already
  reads as shape.
- **Pick: A**, limited to fields with at most 5 values (a field with more says why it is not offered, as #3340 does for colours).

### #3457: 'Size by' a per-hole value

- **A. Radius by value** for the per-hole assay statistics (the chip's 'Highest Cu'): radius from 2 to 9 px on the same quintile classes as the
  colours, so the legend stays one table. Cost: small (the dot radius is already a per-group number in `drawDots`).
- **B. A continuous area-proportional circle** like the GT circles (#2755): honest to the value, but five classes already exist and a continuous
  size over 6,000 holes overdraws.
- **Pick: A**, with the sizes in the legend rows.

## Raster tools

### #3470: clip a raster or grid (and select the holes) to a polygon

`zonalStats` (#2002) reads the cells inside a boundary; a clip would make them a layer.

- **A. 'Clip to boundary' on a raster card** makes a NEW raster (the cells outside the polygon no-data, the box cropped to the polygon's), so
  the original stays. Values kept, so contours and filters work on the clip. Cost: a small pure function over the kept grid plus the raster
  record builder the filters use (`rasterFromGridAsync`). About half a day.
- **B. A display-only mask** (the plan and the 3D drape draw only inside the polygon, the data unchanged): cheaper for the picture, but a mask in
  the 3D View is side 5's code and nothing downstream (statistics, export) would see it.
- **Holes inside a polygon**: 3D View's 'Select by location' (#124) already does this for collars; the row only needs the clip.
- **Pick: A.**

### #3189: use percentileSelect for the colour stretches

`rasterColour.js` calls `makeStretch` four times on a kept grid (0.1-0.25 s each at 500 x 500 under load). `percentileSelect.js` is a lazy module and
`makeStretch` is synchronous in the startup bundle (#3159 put it there on purpose).

- **A. Run the stretches in the grid worker** (as the picture already is, #3033): the card asks for the colours and gets them back. The card's
  colour bar would appear a moment late.
- **B. Move percentileSelect into the startup bundle**: about 1 kB, and `makeStretch` becomes O(n). The startup budget has room (1,917 of 2,000 kB), and
  idw.js says why it kept the sort ('the same order and percentiles'), which the selection version already reproduces to the bit (its test).
- **Pick: B** (the smallest change; measure the bundle after).

### #3049: cache the plan's static layers while dragging

Pan frames on the WA iron project's size (6,390 collars, five rasters, 1,040 contour lines) took 65-470 ms before #2988's culling.

- **A. An offscreen bitmap of the rasters, hillshade, map layers and boundaries** at the view's zoom; while dragging it is translated, redrawn on
  release. Needs a live frame-time measurement on that project first (it may already be fast enough after #2988).
- **B. Do nothing until measured.**
- **Pick: B first**: measure with the 6,390-collar synthetic project (scripts/drive-electron.mjs, a drag of 200 mouse moves). If a pan frame is
  under 33 ms, close the row; otherwise A.

### #3228: Snapshot to Layout at print resolution

The plan's drawing is one effect tied to the on-screen canvas.

- **A. Pull the drawing into `drawPlan(ctx, view, size, scale)`** and call it twice (screen and a 300 dpi offscreen canvas at the Layout frame's
  size). A refactor of the largest function in `MapsPlanView.jsx`; the dots, labels and line widths need a scale argument.
- **B. A fixed 2 x draw** (twice the pixels, same code via `ctx.scale`): cheap, but not 300 dpi at an A3 frame.
- **Pick: A**, as its own row with a live check; B as a first step.

## Imagery and terrain

### #3300: read NAIP's real pixel size from the catalogue

The picker plans NAIP at 0.6 m; Colorado's 2023 flights are 0.3 m. #3252 phase 1 already stores the finest gsd of the images a fetch used
(`raster.lod.nativeM`), so after a fetch the number is right. Before the fetch the picker would need one STAC search once the area settles
(a network call from a dialog that is otherwise offline until 'Fetch').

- **A. One search after the area settles** (500 ms), cached by area; the pixel line then says '0.3 m (NAIP 2023)'.
- **B. Leave the 0.6 m plan and say 'some states 0.3 m'** (done in #3251).
- **Pick: B** unless Matt works in states with 0.3 m imagery.

### #3095: a terrain per drilled patch

When the project's samples and collars span more than 1,025 point spacings (a 6,000-hole iron field), one grid is coarser than the points.

- **A. Group the points into patches** (single-linkage at 20 spacings), one TIN each, offered as a list ('Patch 1: 412 points, 38 km²').
  The store holds one terrain, so patches would need to become several terrains (a bigger change) or the user picks one.
- **B. A drawn area** (the picker the SRTM fetch uses) limits the points: one terrain, finer. No store change.
- **Pick: B.**

## Project and import

### #3088: Project KMZ legend: unit for built-in numeric layers, reuse a picture raster's legend

Custom numeric layers and assays already give their unit to the legend. The built-in numeric layers (SG, mag susc, RQD) have no unit anywhere in the
data, and their labels already say '%' where it applies. Nothing to write unless the layer record gains a unit.

- **A. A unit field on a built-in numeric layer** set at import ('Values are…' as the raster card has). Larger: every importer.
- **B. Leave it**: the legend shows the layer's name.
- **Pick: B.** The raster legend image reuse (attached colour bar) is a separate half: do it when asked.

### #3187: bearings stored as attribute columns through a tie

A shapefile / GeoPackage / KML written through a local-grid tie turns positions and the rows' own azimuth fields, not attribute columns that happen
to be bearings.

- **A. Turn columns whose names say bearing** (azimuth, dip direction, strike, trend, bearing): a naming guess, and it changes numbers a user wrote.
- **B. A note in the export**: 'attribute columns that hold bearings (…) were not turned; they stay on the local grid's north'.
- **Pick: B**, listing the likely columns by name. It never changes data.

### #2826: Maps > A layer 'Local mine grid' as the layer's From

`store.jsx` `reprojectObjectTo` (Main's file) moves objects through `mineToProject` and turns bearings by -rotationDeg. The picker gets the mine-grid
choice (it exists for 'A file', #2812).

- **A. As the row says**: one more branch in the store function, one more option in the picker, bearings turned. Touches `store.jsx`.
- **Pick: A, by Main or with Main's OK** (a store.jsx hunk; I would send it as I did #3110's).

### #2809: show grid RLs in hole info and section labels

3D View and Section code (side 5's). The RL shown is the elevation plus the #2691 datum offset where a mine grid is set. Needs the offset exposed
as `mineGrid.rlOffset` where those labels are built.

- **Pick: hand to side 5** with this sentence; no decision for Matt beyond 'yes, show them'.

## From my own follow-ups

### #3464: JS heap grew ~450 MB over two project reprojections

Needs a profile, not a design: reproject twice on the WA iron project (6,390 collars, rasters, terrain), force a GC (`--expose-gc`, as #3110's
measurement did) and compare heaps. Likely holders: the undo history keeps whole snapshots of every moved collection (UNDO_KEYS) and
`capUndoTables` (#2894) caps table counts, not bytes. I would measure first and then cap the snapshots by size.

### #3472: a free Western Australian geology / tenement service

A search, not a build: Geoscience Australia's service is already listed; WA's DMIRS (GeoVIEW) services are open under CC BY 4.0 but I have not
checked a GetCapabilities from this machine. Needs a yes from Matt to check them (a network call), then a preset.
