// TASKS.csv #814 — Copernicus GLO-30 as an online terrain source, and the cross-check that tells a real peak from an
// artifact in the AWS Terrain Tiles. Matt chose "C": offer Copernicus, and have the AWS source WARN about suspect cones
// (never change them). At Orion the AWS tiles hold a ~300 m cone that GLO-30 does not have.
//
// Copernicus DEM GLO-30 (ESA / Airbus, free and open): a global 1 arc-second model (~30 m; longitude spacing widens
// north of 50°), one cloud-optimised GeoTIFF per 1° x 1° cell on AWS Open Data (copernicus-dem-30m, no account), read
// here by HTTP byte ranges through the main process (imageryFetch.js openCog -> electron/main.js remote-sensing-fetch,
// host allow-listed). It is a SURFACE model (X-band radar, 2011-2015): in forest it reads some metres above the ground.
// Cells over open ocean do not exist (404) and stay no data.
import { openCog } from "./imageryFetch.js";
import { gridDims, finishTerrain } from "./terrainGrid.js";
import { t as tr } from "./i18n.js";

const HOST = "https://copernicus-dem-30m.s3.amazonaws.com";

// the 1° cell whose south-west corner is (latFloor, lonFloor)
export function copTileName(latFloor, lonFloor) {
  const ns = latFloor >= 0 ? "N" : "S", ew = lonFloor >= 0 ? "E" : "W";
  return `Copernicus_DSM_COG_10_${ns}${String(Math.abs(latFloor)).padStart(2, "0")}_00_${ew}${String(Math.abs(lonFloor)).padStart(3, "0")}_00_DEM`;
}
export function copTilesFor(lonMin, latMin, lonMax, latMax) {
  const out = [];
  for (let la = Math.floor(latMin); la <= Math.floor(latMax - 1e-12); la++) for (let lo = Math.floor(lonMin); lo <= Math.floor(lonMax - 1e-12); lo++) out.push({ lat: la, lon: lo, name: copTileName(la, lo) });
  return out;
}

// one cell's image (null where GLO-30 has no cell: open ocean), opened once per session
const opened = new Map();
function openCell(name, stats) {
  if (!opened.has(name)) {
    opened.set(name, openCog(`${HOST}/${name}/${name}.tif`, stats).then(async (tiff) => {
      const base = await tiff.getImage();
      const count = await tiff.getImageCount();
      const [ox, oy] = base.getOrigin(), [rx, ry] = base.getResolution();
      const levels = [{ img: base, w: base.getWidth(), h: base.getHeight() }];
      for (let i = 1; i < count; i++) { const im = await tiff.getImage(i); levels.push({ img: im, w: im.getWidth(), h: im.getHeight() }); }
      return { ox, oy, rx, ry, levels };
    }).catch((e) => { if (/404|403|NoSuchKey/i.test(String(e?.message))) return null; opened.delete(name); throw e; }));
  }
  return opened.get(name);
}

// A pixel window of a cell (any level) as { data, x0, y0, w, h, rx, ry (degrees per pixel at that level), ox, oy }.
async function readCellWindow(cell, lonMin, latMin, lonMax, latMax, wantDeg) {
  // the coarsest level whose pixels are still at most half the wanted spacing (or the full resolution)
  let lv = cell.levels[0], scale = 1;
  for (const L of cell.levels.slice(1)) { const s = cell.levels[0].w / L.w; if (Math.abs(cell.rx) * s <= wantDeg / 2) { lv = L; scale = s; } }
  const rx = cell.rx * scale, ry = cell.ry * scale; // ry < 0 (north-up)
  const x0 = Math.max(0, Math.floor((lonMin - cell.ox) / rx) - 1), x1 = Math.min(lv.w, Math.ceil((lonMax - cell.ox) / rx) + 1);
  const y0 = Math.max(0, Math.floor((latMax - cell.oy) / ry) - 1), y1 = Math.min(lv.h, Math.ceil((latMin - cell.oy) / ry) + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  const [data] = await lv.img.readRasters({ window: [x0, y0, x1, y1] });
  return { data, x0, y0, w: x1 - x0, h: y1 - y0, rx, ry, ox: cell.ox, oy: cell.oy };
}

// Elevations on a gridW x gridH lon/lat node grid over the box (row 0 north, NaN where there is no cell). A node is the
// MEAN of the pixels whose centres fall in its cell when the cell spans more than ~1.5 pixels (the #799 rule), else a
// bilinear sample.
export async function readCopernicusGrid({ lonMin, latMin, lonMax, latMax }, gridW, gridH, { onProgress, stats } = {}) {
  const out = new Float32Array(gridW * gridH).fill(NaN);
  const dLon = (lonMax - lonMin) / Math.max(1, gridW - 1), dLat = (latMax - latMin) / Math.max(1, gridH - 1);
  const tiles = copTilesFor(lonMin, latMin, lonMax, latMax);
  let done = 0, got = 0;
  const failed = [];
  for (const t of tiles) {
    try {
      const cell = await openCell(t.name, stats);
      if (cell) {
        const lo0 = Math.max(lonMin - dLon, t.lon), lo1 = Math.min(lonMax + dLon, t.lon + 1), la0 = Math.max(latMin - dLat, t.lat), la1 = Math.min(latMax + dLat, t.lat + 1);
        const win = await readCellWindow(cell, lo0, la0, lo1, la1, Math.min(dLon, dLat));
        if (win) { sampleInto(out, win, { lonMin, latMax, dLon, dLat, gridW, gridH }, t); got++; }
      }
    } catch (e) { failed.push(e.message); }
    onProgress?.(++done, tiles.length);
  }
  return { elevations: out, cells: tiles.length, got, failed };
}

function sampleInto(out, win, g, t) {
  const { data, w, h, rx, ry } = win;
  const fx = (lon) => (lon - win.ox) / rx - win.x0 - 0.5, fy = (lat) => (lat - win.oy) / ry - win.y0 - 0.5; // pixel-centre coordinates
  const pxPerNode = Math.min(g.dLon / Math.abs(rx), g.dLat / Math.abs(ry));
  let S = null, C = null;
  const W = w + 1;
  if (pxPerNode > 1.5) { // summed-area tables of the values and of the valid count
    S = new Float64Array(W * (h + 1)); C = new Uint32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let rs = 0, rc = 0;
      for (let x = 0; x < w; x++) { const v = data[y * w + x]; if (Number.isFinite(v) && v > -1000) { rs += v; rc++; } S[(y + 1) * W + x + 1] = S[y * W + x + 1] + rs; C[(y + 1) * W + x + 1] = C[y * W + x + 1] + rc; }
    }
  }
  for (let row = 0; row < g.gridH; row++) {
    const lat = g.latMax - row * g.dLat;
    if (lat < t.lat || lat >= t.lat + 1) continue; // this node belongs to another cell
    for (let col = 0; col < g.gridW; col++) {
      const lon = g.lonMin + col * g.dLon;
      if (lon < t.lon || lon >= t.lon + 1) continue;
      let v;
      if (S) {
        let xa = Math.ceil(fx(lon - g.dLon / 2)), xb = Math.floor(fx(lon + g.dLon / 2)), ya = Math.ceil(fy(lat + g.dLat / 2)), yb = Math.floor(fy(lat - g.dLat / 2));
        xa = Math.max(0, xa); ya = Math.max(0, ya); xb = Math.min(w - 1, xb); yb = Math.min(h - 1, yb);
        if (xb < xa || yb < ya) continue;
        const i1 = (yb + 1) * W + xb + 1, i2 = ya * W + xb + 1, i3 = (yb + 1) * W + xa, i4 = ya * W + xa;
        const n = C[i1] - C[i2] - C[i3] + C[i4];
        v = n ? (S[i1] - S[i2] - S[i3] + S[i4]) / n : NaN;
      } else {
        const x = Math.min(w - 1.001, Math.max(0, fx(lon))), y = Math.min(h - 1.001, Math.max(0, fy(lat)));
        const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, k = y0 * w + x0;
        const top = data[k] + (data[k + 1] - data[k]) * tx, bot = data[k + w] + (data[k + w + 1] - data[k + w]) * tx;
        v = top + (bot - top) * ty;
      }
      out[row * g.gridW + col] = Number.isFinite(v) && v > -1000 ? v : NaN;
    }
  }
}

// Same result shape as srtmFetch.fetchSRTMTerrain, so the import code treats both sources alike.
export async function fetchCopernicusTerrain({ lonMin, latMin, lonMax, latMax, targetEpsg, onProgress, gridMax = 200 }) {
  if (!(lonMax > lonMin) || !(latMax > latMin)) throw new Error(tr("Invalid area — check the coordinates."));
  const { gridW, gridH } = gridDims(lonMin, latMin, lonMax, latMax, gridMax);
  const r = await readCopernicusGrid({ lonMin, latMin, lonMax, latMax }, gridW, gridH, { onProgress });
  if (!r.got && r.failed.length) throw new Error(tr("Couldn't read the Copernicus GLO-30 elevation model ({v}). Check your internet connection.", { v: r.failed[0] }));
  if (!r.got) throw new Error(tr("Copernicus GLO-30 has no land cells in this area (open ocean)."));
  const out = await finishTerrain(r.elevations, { lonMin, latMin, lonMax, latMax }, gridW, gridH, targetEpsg);
  const latMid = ((latMin + latMax) / 2) * (Math.PI / 180);
  const nodeM = Math.max(((lonMax - lonMin) * 111320 * Math.cos(latMid)) / Math.max(1, gridW - 1), ((latMax - latMin) * 110574) / Math.max(1, gridH - 1));
  return {
    name: `Terrain (Copernicus GLO-30, ~${Math.round(nodeM)} m grid)`,
    bbox: out.bbox, gridW: out.gridW, gridH: out.gridH, elevations: out.elevations,
    reprojectedTo: out.reprojectedTo, reprojectNote: out.reprojectNote, tileCount: r.got,
    source: { service: "Copernicus DEM GLO-30 (ESA, surface model ~30 m)", zoom: null, sourcePixelM: 30, nodeM, fetched: new Date().toISOString().slice(0, 10) },
    noDataMask: out.noDataMask, noDataNote: out.noDataNote,
    failedTiles: r.failed.length,
  };
}

// TASKS.csv #814 — a cone the AWS tiles show is an ARTIFACT when GLO-30 at the same place shows less than 30 % of its rise
// and the two rises differ by more than 100 m. Measured: Orion's cones scored 0.07-0.24 (GLO-30 rise 18-57 m against
// 156-409 m); real isolated landforms 0.32 (Devils Tower, a 150 m wide tower GLO-30's 30 m cells smooth) to 0.99
// (Matterhorn), Shiprock 0.80, Mount Assiniboine 0.62.
export const isArtifactCone = (awsRiseM, copRiseM) => copRiseM < 0.3 * awsRiseM && awsRiseM - copRiseM > 100;

// GLO-30's own rise at (lon, lat): its highest pixel within ~2 pixels minus the median of a 48-point ring of radius
// max(R, 150 m) (GLO-30 cannot resolve a narrower ring). null where it has no cell.
export async function copernicusRise(lon, lat, radiusM) {
  const cell = await openCell(copTileName(Math.floor(lat), Math.floor(lon)));
  if (!cell) return null;
  const mx = Math.abs(cell.rx) * 111320 * Math.cos((lat * Math.PI) / 180), my = Math.abs(cell.ry) * 110570;
  const R = Math.max(radiusM, 150), n = Math.ceil(R / Math.min(mx, my)) + 2;
  const px = Math.floor((lon - cell.ox) / cell.rx), py = Math.floor((lat - cell.oy) / cell.ry), size = 2 * n + 1;
  const [d] = await cell.levels[0].img.readRasters({ window: [px - n, py - n, px + n + 1, py + n + 1], fillValue: NaN });
  const at = (dx, dy) => d[(n + dy) * size + n + dx];
  let top = -Infinity;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) top = Math.max(top, at(dx, dy));
  const ring = [];
  for (let s = 0; s < 48; s++) { const a = (2 * Math.PI * s) / 48; ring.push(at(Math.round((R / mx) * Math.cos(a)), Math.round((R / my) * Math.sin(a)))); }
  const ok = ring.filter(Number.isFinite).sort((p, q) => p - q);
  return ok.length > 24 && Number.isFinite(top) ? top - ok[ok.length >> 1] : null;
}
