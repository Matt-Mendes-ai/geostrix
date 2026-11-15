// TASKS.csv #3252 phase 3 / #3515 — terrain tile heights from the COG elevation models (Copernicus GLO-30, NRCan MRDEM-30 and HRDEM lidar), read
// by window as the fetch reads them (copernicusDem.js readCopernicusGrid, nrcanDem.js readInto), for lodTerrain.js. Those readers fill a regular
// lon / lat node grid; a tile's nodes are regular in the PROJECT CRS, so the tile is read as a lon / lat grid over its box (about twice as many
// nodes a side, so the source's pixel is not lost) and each of the tile's 67 x 67 nodes is sampled from it bilinearly. A node the source has no
// value for (NaN: open water, no cell) reads the saved terrain. Loaded with import() only for such a terrain.
import { DEM_READ, DEM_CELLS } from "./lodTerrain.js";
import { terrainMeshElevation } from "./terrainDrape.js";

const GRID = 2 * DEM_READ; // the lon / lat grid read for one tile, a side

// the lon / lat of the 67 x 67 nodes of a tile (each one past the tile's edge), and their box. toLL: (x, y) -> [lon, lat]
export function tileNodesLonLat(box, toLL) {
  const dx = (box[2] - box[0]) / DEM_CELLS, dy = (box[3] - box[1]) / DEM_CELLS, ll = new Float64Array(DEM_READ * DEM_READ * 2);
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (let j = 0; j < DEM_READ; j++) for (let i = 0; i < DEM_READ; i++) {
    const p = toLL(box[0] + (i - 1) * dx, box[3] - (j - 1) * dy), k = (j * DEM_READ + i) * 2;
    ll[k] = p[0]; ll[k + 1] = p[1];
    if (p[0] < lonMin) lonMin = p[0]; if (p[0] > lonMax) lonMax = p[0]; if (p[1] < latMin) latMin = p[1]; if (p[1] > latMax) latMax = p[1];
  }
  return { ll, bbox: { lonMin, latMin, lonMax, latMax } };
}
// bilinear samples of a lon / lat grid (row 0 north, gw x gh over bbox, NaN where unknown) at each node; fallback(n) for a NaN
export function sampleLonLatGrid(grid, gw, gh, bbox, ll, fallback) {
  const out = new Float32Array(DEM_READ * DEM_READ);
  const sx = (gw - 1) / (bbox.lonMax - bbox.lonMin || 1), sy = (gh - 1) / (bbox.latMax - bbox.latMin || 1);
  for (let n = 0; n < out.length; n++) {
    const fx = Math.min(gw - 1.0001, Math.max(0, (ll[n * 2] - bbox.lonMin) * sx)), fy = Math.min(gh - 1.0001, Math.max(0, (bbox.latMax - ll[n * 2 + 1]) * sy));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0, k = y0 * gw + x0;
    const z = (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + gw] * (1 - u) + grid[k + gw + 1] * u) * v;
    out[n] = Number.isFinite(z) ? z : fallback(n);
  }
  return out;
}

// readers: (lonLatBox, gw, gh) -> Float32Array gw x gh (row 0 north, NaN where none)
export async function copernicusReader() {
  const { readCopernicusGrid } = await import("../copernicusDem.js");
  return async (bbox, gw, gh) => (await readCopernicusGrid(bbox, gw, gh)).elevations;
}
export async function nrcanReader(terrain) {
  const [m, { pointTransform }] = await Promise.all([import("../nrcanDem.js"), import("../reproject.js")]);
  const T = pointTransform(4326, 3979), hr = /HRDEM/.test(String(terrain.source?.service || ""));
  let tiles = null; // the lidar tiles over the whole terrain, searched once
  return async (bbox, gw, gh) => {
    const g = m.nodeGrid(bbox, gw, gh, T), out = new Float32Array(gw * gh).fill(NaN);
    if (hr) {
      if (!tiles) tiles = await m.hrdemTiles(terrain.lonLatBbox || [bbox.lonMin, bbox.latMin, bbox.lonMax, bbox.latMax]).catch(() => []);
      for (const url of tiles) { try { await m.readInto(out, url, g); } catch { /* a lidar tile that will not read: MRDEM below */ } }
    }
    await m.readInto(out, m.MRDEM_URL, g);
    return out;
  };
}

// the tile's 67 x 67 heights through a lon / lat reader. terrain: the saved one (the fallback); epsg: the project's
export async function tileHeightsViaLonLat(terrain, box, epsg, reader) {
  const { pointTransform } = await import("../reproject.js");
  const toLL = pointTransform(epsg, 4326);
  if (!toLL) throw new Error("no transform");
  const { ll, bbox } = tileNodesLonLat(box, toLL), dx = (box[2] - box[0]) / DEM_CELLS, dy = (box[3] - box[1]) / DEM_CELLS;
  const grid = await reader(bbox, GRID, GRID);
  return sampleLonLatGrid(grid, GRID, GRID, bbox, ll, (n) => terrainMeshElevation(terrain, box[0] + ((n % DEM_READ) - 1) * dx, box[3] - (Math.floor(n / DEM_READ) - 1) * dy));
}
