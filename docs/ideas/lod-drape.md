# Imagery and terrain with level of detail (TASKS.csv #3252): design note

Written 2026-11-14. This is a plan, not a description of shipped behaviour. No code for it has been written yet. The row asks for this note
first, and its open questions (section 7) are Matt's to answer. The 3D side of it touches the 3D View, which side 5 owns: its wiring needs
Main's OK.

## 1. The problem, and what #3251 already did

Matt (#3251): "a large SRTM or imagery area comes in low resolution, a small one high." Today a drape is one picture, and a terrain is one
grid, over the whole area fetched:

- **Imagery.** At most 4,096 px a side (one GPU texture), and NAIP up to 2 x 2 such pictures (`naipFetch.js` `naipTiles`, #3251). A 20 km
  area therefore gets about 5 m pixels (2 x 2 at 4,096 px) when NAIP has 0.3-0.6 m.
- **Terrain.** At most 2,049 nodes a side (`srtmFetch.js`, #3251's 'Full'): a 20 km area gets 10 m nodes even where the source has 1 m
  (NRCan HRDEM, `nrcanDem.js`; USGS 3DEP).

#3251 made this honest: each picker says the pixel size before the fetch, offers 'Full resolution: centre N km', and refuses a fetch over a
quarter of this computer's memory (`fetchMemory.js`). It cannot give fine detail everywhere, because holding it all is impossible:

| 20 x 20 km at | pixels or nodes | memory, held whole |
|---|---|---|
| 0.6 m imagery (NAIP) | 33,333² = 1.1 billion px | 4.4 GB RGBA, 5.9 GB with mipmaps |
| 0.3 m imagery (NAIP 2023, some states) | 66,667² = 4.4 billion px | 17.8 GB |
| 1 m terrain (HRDEM / 3DEP) | 20,001² = 400 million nodes | 1.6 GB as float32, and 800 million triangles |

## 2. The idea: tiles near the camera fine, far ones coarse

This is what web globes and Cesium do. The area is cut into a quadtree of tiles, and each tile has a fixed number of pixels (imagery) or
nodes (terrain). A tile is split into its four children while one of its pixels would cover more than about 1.5 screen pixels at its
distance from the camera. A tile out of view is not drawn, and its children are never fetched. What is held at once is set by the screen,
not by the area:

- A 1,920 x 1,080 view needs about 2 million texels on screen. With 256 px tiles, the coarser parents kept while children load, and a
  margin, that is about 150-300 tiles: 40-80 MB of textures, whatever the area.
- Terrain tiles of 65 x 65 nodes: 300 tiles is 1.3 million vertices, about the cost of today's 1,025-node terrain.

## 3. Proposed design

### 3.1 The tiles are laid out in the project's CRS

The root tile is the drape's area, squared up, and level k has 2^k x 2^k tiles. Tiles are not laid out in Web Mercator, because:

- They stay square in metres, and match how the 3D View, sections and the Maps plan place everything.
- No tile straddles a UTM zone edge in a way the scene has to bend.
- One reprojection per tile (the `paintWindow` / `reprojectImageRGBA` path we already have) puts any source on them.

Each tile is 256 x 256 px of imagery and 65 x 65 terrain nodes, with a skirt. A skirt is a strip hanging down from the tile edge that hides
the cracks between neighbours at different levels; Cesium does the same. The deepest level is the one whose pixel reaches the source's own
size, so NAIP stops at 0.3-0.6 m, Sentinel-2 at 10 m, and AWS Terrain Tiles at their zoom 15.

### 3.2 Sources: a tile reader each

The reader for each source is cut from the fetchers we already have. A reader is a worker job that takes
`(box in the project CRS, px) -> RGBA` for imagery, or `-> Float32 grid` for terrain:

- **COGs (Cloud-Optimized GeoTIFFs: NAIP, Sentinel-2, HRDEM, Copernicus DEM, 3DEP).** geotiff.js reads only the window, from the overview
  nearest the tile's pixel size (`openCog`, already through the main process with the Planetary Computer's anonymous token). These are the
  cheapest reads, and the right source for fine detail.
- **AWS Terrain Tiles (Terrarium PNGs, Web Mercator z/x/y).** The tile reader fetches the 1-4 Web Mercator tiles under a project tile, at the
  zoom matching its node spacing, and resamples them (`resampleElevationMosaic`).
- **WMS layers** (`webLayers.js`) can be tiled the same way, with one GetMap per tile. This is optional, and later.

### 3.3 Choosing and holding tiles

- **Each frame, from the camera:**
  - frustum-cull the tiles;
  - work out each tile's screen-space error (its pixel size in metres over the size of a screen pixel at the tile's nearest distance);
  - draw the deepest loaded tile at or above the wanted level;
  - queue the fetch of the wanted ones, nearest first.

  The same kind of per-frame choice runs today for long logs (`modules/viewer/logLod.js`, #2802).
- **In flight:** at most 6 requests, with stale ones cancelled when the camera moves on.
- **GPU budget:** a least-recently-used set of tiles under a budget. The default proposed is 192 MB of textures, less on an integrated GPU.
  The budget also stays within #3251's `fetchBudgetMB` for main memory.
- **The base picture stays.** Today's whole-area drape and terrain are level 0, fetched and saved as now. They are drawn wherever no finer
  tile is loaded yet, and offline.

### 3.4 Saving, offline use, export

- **Project file:**
  - No tiles are saved.
  - The raster or terrain record gains `lod: { source, item ids / date, root box, max level }`.
  - The base picture or grid is saved as now, so a project opens offline exactly as it does today.
- **Offline:**
  - Tiles are kept on disk in IndexedDB (`tileCache.js`, which already does this for the basemap with a size readout and a Clear button).
  - The key is source / CRS / root box / level / x / y, under a cap. The default proposed is 2 GB.
  - In the field, the cached tiles show, and the base picture shows elsewhere.
  - 'Download this area for offline use' (as `BasemapView` has) would fetch the levels down to a chosen pixel size before leaving signal.
- **Layout and KMZ export:**
  - A chosen pixel size (for example 1 m for a 1:5,000 sheet).
  - The tile reader fetches that level for the export's extent only.
  - The memory check is #3251's, and the export says the pixel size it used.
- **The Maps plan (2D)** uses the same tiles, chosen by its metres per pixel. This is the simplest first step (section 5).

### 3.5 Display only: the analysis stays on the saved grid

The fine terrain tiles are for the eye. Collar-to-ground checks, sections, inversions, mine design, draping by numbers and the misfit
sentences keep reading the project's terrain grid, as now. Otherwise a result would depend on where the camera was. This raises two points:

- **A collar can look off the ground.** A collar drawn on 1 m tiles can sit a few metres off the ground those tools use.
- **Draped map layers.** #3380 made a draped map layer follow the terrain's own nodes exactly. Over LOD terrain, a drape needs the
  tiles' heights at the same level, or it is drawn on the base grid and lifted a little.

Both are in the questions below.

## 4. What it costs, and the risks

- **Code:** new `lib/lodTiles.js` (the quadtree, the error rule, the cache: pure, testable in Node), a worker with the tile readers, and a
  `syncLodDrape` beside `syncRasterDrapes` in `lib/viewer/sceneBuilders.js`. ViewerModule only needs a small hook: the camera each frame,
  and the group to draw in. That is side 5's file.
- **Risks:**
  - Cracks between terrain tiles (skirts).
  - Draped map layers and Identify (picking) over LOD terrain.
  - GPU memory on integrated graphics.
  - Token expiry and rate limits on the Planetary Computer (tiles fetched over a session, not once).
  - The many small requests on a slow field link (the cache and the base picture cover it).

## 5. Proposed phases

1. **The Maps plan, imagery only (2D).** Tiles of the drawn imagery chosen by zoom, from the COG sources. This proves the readers, the cache
   and the offline behaviour without touching the 3D View.
2. **3D imagery over the existing terrain.** `syncLodDrape`, plus the camera hook in ViewerModule, coordinated with side 5.
3. **3D terrain tiles** with skirts, display only (section 3.5).
4. **Export at a chosen pixel size** (Layout and KMZ), and 'Download for offline use'.

Each phase can ship on its own, and each is measured live before it is called done: the memory held, the frame time, and the pixel size
reached near the camera.

## 6. What it does not do

It does not make the analysis use finer ground than the saved grid (3.5). It does not tile file imports (a GeoTIFF the user opens is read
whole as now, up to 4,096 px). It does not save tiles in the project.

## 7. Questions for Matt

1. **Offline:** keep the fine tiles fetched while you look around on disk (IndexedDB, capped at 2 GB, with a Clear button), so a field
   laptop shows them without signal?
2. **Analysis ground:** should collar checks, sections and mine design stay on the saved terrain grid while the view shows finer tiles
   (proposed)? Or should the saved grid itself be fetched finer around the collars?
3. **Project file:** save the base picture plus a description of the source (proposed), and never the tiles?
4. **Export:** Layout and KMZ at a pixel size you choose at export time (fetched then)?
5. **Order:** start with the Maps plan imagery (phase 1), or go straight to the 3D View?
