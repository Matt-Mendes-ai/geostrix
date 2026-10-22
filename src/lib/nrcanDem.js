// TASKS.csv #815 — Natural Resources Canada's elevation models as online terrain sources for Canadian projects (free, no
// account; Open Government Licence - Canada). Both are cloud-optimised GeoTIFFs on NRCan's own S3 bucket
// (canelevation-dem, ca-central-1), in Canada Atlas Lambert (EPSG:3979), read here by HTTP byte ranges through the main
// process like Copernicus (#814):
//   MRDEM-30: the Medium Resolution DEM, one 30 m model of all Canada, BARE EARTH (a terrain model, not a surface model:
//     forest canopy removed), built from the best source at each place - HRDEM lidar where flown, else other national
//     sources. One file for the whole country; only the window around the area is read.
//   HRDEM: the High Resolution DEM mosaic, 1 m lidar terrain where a lidar survey has been flown and no data elsewhere.
//     Its tiles are found with NRCan's STAC catalogue (datacube.services.geo.ca). Where it has no data, MRDEM-30 fills in
//     and the result says how much of the area is lidar. Measured (2026-10-22): no HRDEM at Orion (-130.26, 56.36) or
//     Perk-Rocky (-125.07, 51.81); MRDEM-30 has both.
// Each terrain node is the MEAN of the source pixels around it when a node spans more than ~1.5 pixels (the #799 rule:
// no aliasing), else a bilinear sample - as in copernicusDem.js. Nodes are on a lon/lat grid (finishTerrain reprojects).
import { openCog, stacSearch } from "./imageryFetch.js";
import { gridDims, finishTerrain } from "./terrainGrid.js";
import { pointTransform } from "./reproject.js";
import { t as tr } from "./i18n.js";

export const NRCAN_HOST = "https://canelevation-dem.s3.ca-central-1.amazonaws.com";
export const MRDEM_URL = `${NRCAN_HOST}/mrdem-30/mrdem-30-dtm.tif`;
export const NRCAN_STAC = "https://datacube.services.geo.ca/stac/api/search";
const NODATA_BELOW = -1000; // NRCan's no-data value is -32767

const opened = new Map();
function openDem(url, stats) {
  if (!opened.has(url)) {
    opened.set(url, openCog(url, stats).then(async (tiff) => {
      const base = await tiff.getImage();
      const count = await tiff.getImageCount();
      const [ox, oy] = base.getOrigin(), [rx, ry] = base.getResolution();
      const levels = [{ img: base, w: base.getWidth(), h: base.getHeight() }];
      for (let i = 1; i < count; i++) { const im = await tiff.getImage(i); levels.push({ img: im, w: im.getWidth(), h: im.getHeight() }); }
      return { ox, oy, rx, ry, levels };
    }).catch((e) => { opened.delete(url); throw e; }));
  }
  return opened.get(url);
}

// the coarsest level whose pixels are at most half the node spacing (or the full resolution): { level, scale }
export function pickLevel(levels, baseRes, nodeM) {
  let level = levels[0], scale = 1;
  for (const L of levels.slice(1)) { const s = levels[0].w / L.w; if (Math.abs(baseRes) * s <= nodeM / 2) { level = L; scale = s; } }
  return { level, scale };
}

// The lon/lat node grid as projected (EPSG:3979) coordinates: { xs, ys (Float64Array, row-major, row 0 north), dLon,
// dLat, nodeM (node spacing in metres at mid-latitude), box: [x0, y0, x1, y1] (all nodes + one node of margin) }
export function nodeGrid({ lonMin, latMin, lonMax, latMax }, gridW, gridH, T) {
  const dLon = (lonMax - lonMin) / Math.max(1, gridW - 1), dLat = (latMax - latMin) / Math.max(1, gridH - 1);
  const xs = new Float64Array(gridW * gridH), ys = new Float64Array(gridW * gridH);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let r = 0; r < gridH; r++) for (let c = 0; c < gridW; c++) {
    const [x, y] = T(lonMin + c * dLon, latMax - r * dLat);
    xs[r * gridW + c] = x; ys[r * gridW + c] = y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const latMid = ((latMin + latMax) / 2) * (Math.PI / 180);
  const nodeM = Math.max(1e-6, Math.min(dLon * 111320 * Math.cos(latMid), dLat * 110574));
  return { xs, ys, dLon, dLat, nodeM, box: [x0 - nodeM, y0 - nodeM, x1 + nodeM, y1 + nodeM] };
}

// Sample a projected raster window into `out` (only where out is still NaN). win: { data, w, h, ox, oy (window origin =
// top-left corner of pixel [0, 0]), rx, ry (ry < 0, north-up) }. Returns the number of nodes filled.
export function sampleWindow(out, win, g) {
  const { data, w, h, rx, ry } = win;
  const fx = (x) => (x - win.ox) / rx - 0.5, fy = (y) => (y - win.oy) / ry - 0.5; // pixel-centre coordinates
  const half = g.nodeM / 2, pxPerNode = g.nodeM / Math.abs(rx);
  let S = null, C = null;
  const W = w + 1;
  if (pxPerNode > 1.5) { // summed-area tables of the values and of the valid count
    S = new Float64Array(W * (h + 1)); C = new Uint32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let rs = 0, rc = 0;
      for (let x = 0; x < w; x++) { const v = data[y * w + x]; if (Number.isFinite(v) && v > NODATA_BELOW) { rs += v; rc++; } S[(y + 1) * W + x + 1] = S[y * W + x + 1] + rs; C[(y + 1) * W + x + 1] = C[y * W + x + 1] + rc; }
    }
  }
  let filled = 0;
  for (let i = 0; i < out.length; i++) {
    if (!Number.isNaN(out[i])) continue;
    const X = g.xs[i], Y = g.ys[i];
    let v = NaN;
    if (S) {
      const xa = Math.max(0, Math.ceil(fx(X - half))), xb = Math.min(w - 1, Math.floor(fx(X + half)));
      const ya = Math.max(0, Math.ceil(fy(Y + half))), yb = Math.min(h - 1, Math.floor(fy(Y - half)));
      if (xb >= xa && yb >= ya) {
        const i1 = (yb + 1) * W + xb + 1, i2 = ya * W + xb + 1, i3 = (yb + 1) * W + xa, i4 = ya * W + xa;
        const n = C[i1] - C[i2] - C[i3] + C[i4];
        // at least half the box must hold data, so a node at the edge of a lidar survey is not one stray pixel
        if (n >= 0.5 * (xb - xa + 1) * (yb - ya + 1)) v = (S[i1] - S[i2] - S[i3] + S[i4]) / n;
      }
    } else {
      const x = fx(X), y = fy(Y);
      if (x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1) {
        const xi = Math.min(w - 2, Math.floor(x)), yi = Math.min(h - 2, Math.floor(y)), tx = x - xi, ty = y - yi, k = yi * w + xi;
        const q = [data[k], data[k + 1], data[k + w], data[k + w + 1]];
        if (q.every((z) => Number.isFinite(z) && z > NODATA_BELOW)) { const top = q[0] + (q[1] - q[0]) * tx, bot = q[2] + (q[3] - q[2]) * tx; v = top + (bot - top) * ty; }
      }
    }
    if (Number.isFinite(v)) { out[i] = v; filled++; }
  }
  return filled;
}

// Read the window of one DEM that covers the node grid, at the level that suits it, and sample it into out.
async function readInto(out, url, g, stats) {
  const dem = await openDem(url, stats);
  const { level, scale } = pickLevel(dem.levels, dem.rx, g.nodeM);
  const rx = dem.rx * scale, ry = dem.ry * scale;
  const [bx0, by0, bx1, by1] = g.box;
  const c0 = Math.max(0, Math.floor((bx0 - dem.ox) / rx) - 1), c1 = Math.min(level.w, Math.ceil((bx1 - dem.ox) / rx) + 1);
  const r0 = Math.max(0, Math.floor((by1 - dem.oy) / ry) - 1), r1 = Math.min(level.h, Math.ceil((by0 - dem.oy) / ry) + 1);
  if (c1 <= c0 || r1 <= r0) return { filled: 0, pixelM: Math.abs(rx) };
  const [data] = await level.img.readRasters({ window: [c0, r0, c1, r1] });
  const filled = sampleWindow(out, { data, w: c1 - c0, h: r1 - r0, ox: dem.ox + c0 * rx, oy: dem.oy + r0 * ry, rx, ry }, g);
  return { filled, pixelM: Math.abs(rx) };
}

// HRDEM mosaic tiles (1 m terrain) over the box, from NRCan's STAC catalogue: [dtm COG url]
async function hrdemTiles(bbox) {
  const d = await stacSearch(NRCAN_STAC, { collections: ["hrdem-mosaic-1m"], bbox, limit: 100 });
  return (d.features || []).map((f) => f.assets?.dtm?.href).filter((u) => typeof u === "string" && u.startsWith(`${NRCAN_HOST}/`));
}

// Same result shape as srtmFetch.fetchSRTMTerrain / copernicusDem.fetchCopernicusTerrain. source: "mrdem" | "hrdem".
export async function fetchNrcanTerrain({ lonMin, latMin, lonMax, latMax, targetEpsg, onProgress, gridMax = 200, source = "mrdem" }) {
  if (!(lonMax > lonMin) || !(latMax > latMin)) throw new Error(tr("Invalid area — check the coordinates."));
  if (lonMin < -142 || lonMax > -52 || latMin < 41 || latMax > 84) throw new Error(tr("NRCan's elevation models cover Canada only: this area is outside it. Choose Copernicus GLO-30 or the AWS Terrain Tiles."));
  const T = pointTransform(4326, 3979);
  const { gridW, gridH } = gridDims(lonMin, latMin, lonMax, latMax, gridMax);
  const g = nodeGrid({ lonMin, latMin, lonMax, latMax }, gridW, gridH, T);
  const out = new Float32Array(gridW * gridH).fill(NaN);
  let lidar = 0, lidarPixelM = null, steps = source === "hrdem" ? 3 : 1, done = 0;
  const step = () => onProgress?.(++done, steps);
  if (source === "hrdem") {
    let tiles = [];
    try { tiles = await hrdemTiles([lonMin, latMin, lonMax, latMax]); } catch (e) { throw new Error(tr("Couldn't search NRCan's catalogue for HRDEM lidar ({v}). Check your internet connection.", { v: e.message })); }
    steps = tiles.length + 2;
    step();
    for (const url of tiles) {
      try { const r = await readInto(out, url, g); lidar += r.filled; lidarPixelM = r.pixelM; } catch (e) { throw new Error(tr("Couldn't read NRCan's HRDEM lidar model ({v}). Check your internet connection.", { v: e.message })); }
      step();
    }
  }
  let mr;
  try { mr = await readInto(out, MRDEM_URL, g); } catch (e) { throw new Error(tr("Couldn't read NRCan's MRDEM-30 elevation model ({v}). Check your internet connection.", { v: e.message })); }
  step();
  const valid = out.reduce((n, v) => n + (Number.isNaN(v) ? 0 : 1), 0);
  if (!valid) throw new Error(tr("NRCan's elevation models have no data in this area."));
  const fin = await finishTerrain(out, { lonMin, latMin, lonMax, latMax }, gridW, gridH, targetEpsg);
  const lidarPct = source === "hrdem" ? (100 * lidar) / (gridW * gridH) : null;
  const service = source === "hrdem"
    ? (lidar ? `NRCan HRDEM lidar terrain (1 m) on ${lidarPct.toFixed(0)}% of the area, MRDEM-30 elsewhere` : "NRCan MRDEM-30 terrain (30 m, bare earth): no HRDEM lidar in this area")
    : "NRCan MRDEM-30 terrain (30 m, bare earth)";
  return {
    name: source === "hrdem" && lidar ? `Terrain (NRCan HRDEM lidar + MRDEM-30, ~${Math.round(g.nodeM)} m grid)` : `Terrain (NRCan MRDEM-30, ~${Math.round(g.nodeM)} m grid)`,
    bbox: fin.bbox, gridW: fin.gridW, gridH: fin.gridH, elevations: fin.elevations,
    reprojectedTo: fin.reprojectedTo, reprojectNote: fin.reprojectNote, tileCount: 1,
    source: { service, zoom: null, sourcePixelM: lidar ? lidarPixelM : mr.pixelM, nodeM: g.nodeM, bareEarth: true, lidarPct, fetched: new Date().toISOString().slice(0, 10) },
    noDataMask: fin.noDataMask, noDataNote: fin.noDataNote,
    failedTiles: 0,
  };
}
