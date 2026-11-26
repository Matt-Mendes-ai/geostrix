// TASKS.csv #3721 — Google's GEM-15 (15 m, near-global) as an online terrain source. Matt (2026-11-16): "bring it to GeoStrix?" — "sure".
//
// GEM-15 (Google Research, Climate and Sustainability; CC-BY-4.0, "This dataset is produced by Google"; Batchu et al. 2026, EarthArXiv doi:10.31223/X55N75): satellite-derived
// elevation at 15 m in local UTM zones, one cloud-optimised GeoTIFF per 1° x 1° cell and band, float32, NaN where there is no value, heights above EGM96. Bands read here: dtm
// (bare earth, the default) and dsm (the surface). Public, no account: https://storage.googleapis.com/climate-and-sustainability/gem-15, with a static STAC catalogue
// (collection -> 10° x 10° group catalogues -> one item per cell). Coverage 60°S to 84°N without Russia, China, Mongolia, Greenland and Antarctica; water (+ 9 m), snow / ice, salt
// pans, low-texture cells and cells more than 50 m from GLO-30 are masked (NaN): those nodes are filled from Copernicus GLO-30 here, and the result says how many.
//
// Read as copernicusDem.js / nrcanDem.js read theirs: HTTP byte ranges through the main process (imageryFetch.js openCog -> electron/main.js remote-sensing-fetch; that host is
// allowed for this bucket's path only). Cells are found from the STAC (the group catalogue lists a group's cells by their ids; an item gives the COG's href and EPSG) and the
// index is kept for the session.
import { remoteSensingFetch, isCancelledError } from "./desktop.js"; // isCancelledError: TASKS.csv #3963
import { gridDims, finishTerrain } from "./terrainGrid.js";
import { nodeGrid, readInto } from "./nrcanDem.js";
import { readCopernicusGrid } from "./copernicusDem.js";
import { fillWithDelta, seamJump } from "./gapFill.js"; // TASKS.csv #3871
import { smoothSteps as smoothGemSteps } from "./stepSmooth.js"; // TASKS.csv #3950 — optional; this module is itself loaded on demand
import { pointTransform } from "./reproject.js";
import { t as tr } from "./i18n.js";

export const GEM_BASE = "https://storage.googleapis.com/climate-and-sustainability/gem-15";
export const GEM_STAC = `${GEM_BASE}/stac/gem-15`;
export const GEM_CREDIT = "Elevation: Google GEM-15 (CC BY 4.0). This dataset is produced by Google.";

// the 10° x 10° group a cell is in, and the cell's own id: ids name the south-west corner ('wm121s60' = lon -121, lat 60; 'wm51sm1' = lon -51, lat -1; 'w10s0')
const sgn = (v) => (v < 0 ? "m" : "p");
export const gemGroupId = (lat, lon) => `${sgn(Math.floor(lat / 10) * 10)}${Math.abs(Math.floor(lat / 10) * 10)}_${sgn(Math.floor(lon / 10) * 10)}${Math.abs(Math.floor(lon / 10) * 10)}`;
export const gemCellId = (lat, lon) => { const la = Math.floor(lat), lo = Math.floor(lon); return `w${lo < 0 ? "m" : ""}${Math.abs(lo)}s${la < 0 ? "m" : ""}${Math.abs(la)}`; };
export function gemCellsFor(lonMin, latMin, lonMax, latMax) {
  const out = [];
  for (let la = Math.floor(latMin); la <= Math.floor(latMax - 1e-12); la++) for (let lo = Math.floor(lonMin); lo <= Math.floor(lonMax - 1e-12); lo++) out.push({ lat: la, lon: lo, id: gemCellId(la, lo), group: gemGroupId(la, lo) });
  return out;
}

// JSON through the main process, kept per URL for the session; null for a missing file (404 / 403)
const jsonCache = new Map();
function getJson(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(url, remoteSensingFetch({ url }).then((r) => {
      if (r?.status === 404 || r?.status === 403) return null;
      if (!r?.ok) throw new Error(r?.message || `HTTP ${r?.status}`);
      return JSON.parse(new TextDecoder().decode(r.data));
    }).catch((e) => { jsonCache.delete(url); throw e; }));
  }
  return jsonCache.get(url);
}

// the cells that exist in the box, each { id, lat, lon, epsg, hrefs: { dtm, dsm }, shape, transform }, from the STAC: a group catalogue lists its cells' ids (a cell that is not listed has no
// data: sea, or outside GEM-15's coverage), an item says where its COGs are
export async function gemCellsInBox(box) {
  const cells = gemCellsFor(box.lonMin, box.latMin, box.lonMax, box.latMax), groups = [...new Set(cells.map((c) => c.group))];
  const listed = new Map(await Promise.all(groups.map(async (g) => {
    const cat = await getJson(`${GEM_STAC}/${g}/catalog.json`);
    return [g, new Set((cat?.links || []).filter((l) => l.rel === "item").map((l) => l.title))];
  })));
  const present = cells.filter((c) => listed.get(c.group)?.has(c.id));
  const items = await Promise.all(present.map((c) => getJson(`${GEM_STAC}/${c.group}/${c.id}/${c.id}.json`)));
  const out = [];
  present.forEach((c, i) => {
    const it = items[i], a = it?.assets;
    if (!a?.dtm?.href && !a?.dsm?.href) return;
    out.push({ ...c, epsg: Number(a.dtm?.["proj:epsg"] ?? a.dsm?.["proj:epsg"] ?? it.properties?.["proj:epsg"]), hrefs: { dtm: a.dtm?.href || null, dsm: a.dsm?.href || null } });
  });
  return { cells: out, asked: cells.length };
}

// Elevations of the lon/lat node grid from GEM-15 alone (row 0 north, NaN where there is no value or no cell). band: "dtm" | "dsm".
export async function readGemGrid(box, gridW, gridH, { band = "dtm", onProgress, stats, signal } = {}) { // signal: #3963
  const out = new Float32Array(gridW * gridH).fill(NaN);
  const { cells, asked } = await gemCellsInBox(box);
  let done = 0, read = 0;
  const failed = [];
  for (const c of cells) {
    const href = c.hrefs[band] || c.hrefs.dtm || c.hrefs.dsm;
    try {
      const g = nodeGrid(box, gridW, gridH, pointTransform(4326, c.epsg));
      const r = await readInto(out, href, g, stats, { samples: [0], signal }); // the first band: dtm is one band, dsm's first is the surface
      if (r.filled) read++;
    } catch (e) { if (isCancelledError(e)) throw e; failed.push(`${c.id}: ${e.message}`); }
    onProgress?.(++done, cells.length);
  }
  return { elevations: out, asked, cells: cells.length, read, failed };
}

// Same result shape as copernicusDem.fetchCopernicusTerrain / nrcanDem.fetchNrcanTerrain. band: "dtm" | "dsm".
export async function fetchGemTerrain({ lonMin, latMin, lonMax, latMax, targetEpsg, onProgress, gridMax = 200, source = "gem15", gapFill = "delta", smoothSteps = false, signal }) { // signal: TASKS.csv #3963; smoothSteps: #3950, off by default // gapFill "plain": GLO-30 as it is (the fill before #3871), for measuring
  if (!(lonMax > lonMin) || !(latMax > latMin)) throw new Error(tr("Invalid area — check the coordinates."));
  const band = source === "gem15dsm" ? "dsm" : "dtm";
  const box = { lonMin, latMin, lonMax, latMax };
  const { gridW, gridH } = gridDims(lonMin, latMin, lonMax, latMax, gridMax);
  let r;
  try { r = await readGemGrid(box, gridW, gridH, { band, signal, onProgress: (d, t) => onProgress?.(d, t + 1) }); } catch (e) { if (isCancelledError(e)) throw e; throw new Error(tr("Couldn't read Google's GEM-15 elevation model ({v}). Check your internet connection.", { v: e.message })); }
  if (!r.cells) throw new Error(tr("Choose Copernicus GLO-30 or the AWS Terrain Tiles: GEM-15 has no data in this area (it covers 60°S to 84°N, without Russia, China, Mongolia, Greenland, Antarctica, water, snow and ice)."));
  if (!r.read && r.failed.length) throw new Error(tr("Couldn't read Google's GEM-15 elevation model ({v}). Check your internet connection.", { v: r.failed[0] }));
  const out = r.elevations, total = out.length;
  const own = out.reduce((n, v) => n + (Number.isNaN(v) ? 0 : 1), 0);
  const latMid0 = ((latMin + latMax) / 2) * (Math.PI / 180), nodeM0 = Math.max(((lonMax - lonMin) * 111320 * Math.cos(latMid0)) / Math.max(1, gridW - 1), ((latMax - latMin) * 110574) / Math.max(1, gridH - 1));
  // TASKS.csv #3950 — chosen: GEM-15's own straight steps on flat ground feathered, on its own nodes, before the gaps are filled (the fill's seam is #3871's)
  let stepSmooth = null;
  if (smoothSteps && own) { const sm = smoothGemSteps(out, gridW, gridH, { nodeM: nodeM0 }); out.set(sm.out); stepSmooth = { changed: sm.changed, maxM: +sm.maxM.toFixed(2), medianM: +sm.medianM.toFixed(2), steps: sm.steps }; }
  // the nodes GEM-15 masks (water, snow and ice, low texture, cells far from GLO-30) and the cells it does not have: from Copernicus GLO-30, counted
  let filled = 0, copFailed = null, seam = null;
  if (own < total) {
    try {
      const cop = await readCopernicusGrid(box, gridW, gridH, { signal });
      // TASKS.csv #3871 — not GLO-30 as it is (a surface model above EGM2008, metres to tens of metres off the bare earth above EGM96: every gap outline was a cliff in the terrain and its hillshade):
      // GLO-30 plus the (GEM-15 - GLO-30) difference interpolated in from the nodes GEM-15 has, so the fill meets GEM-15 at the edge. The seam's jump before and after is kept.
      const own0 = new Uint8Array(total); for (let i = 0; i < total; i++) own0[i] = Number.isNaN(out[i]) ? 0 : 1;
      const plain = Float32Array.from(out); for (let i = 0; i < total; i++) if (Number.isNaN(plain[i]) && Number.isFinite(cop.elevations[i])) plain[i] = cop.elevations[i];
      const r2 = gapFill === "plain" ? { out: plain, filled: plain.reduce((n, v, i) => n + (own0[i] || Number.isNaN(v) ? 0 : 1), 0), nValid: 0 } : fillWithDelta(out, cop.elevations, gridW, gridH); filled = r2.filled;
      seam = { before: seamJump(plain, own0, gridW, gridH), after: seamJump(r2.out, own0, gridW, gridH), offsetM: r2.delta || null, deltaFilled: r2.nValid > 0 };
      out.set(r2.out);
    } catch (e) { if (isCancelledError(e)) throw e; copFailed = e.message; } // #3963
  }
  onProgress?.(r.cells + 1, r.cells + 1);
  if (!own && !filled) throw new Error(tr("Choose Copernicus GLO-30 or the AWS Terrain Tiles: GEM-15 has no data in this area (it covers 60°S to 84°N, without Russia, China, Mongolia, Greenland, Antarctica, water, snow and ice)."));
  const fin = await finishTerrain(out, box, gridW, gridH, targetEpsg);
  const latMid = ((latMin + latMax) / 2) * (Math.PI / 180);
  const nodeM = Math.max(((lonMax - lonMin) * 111320 * Math.cos(latMid)) / Math.max(1, gridW - 1), ((latMax - latMin) * 110574) / Math.max(1, gridH - 1));
  const name = band === "dtm" ? "Terrain (Google GEM-15 bare earth" : "Terrain (Google GEM-15 surface";
  return {
    name: `${name}${filled ? " + GLO-30 gaps" : ""}, ≈ ${Math.round(nodeM)} m grid)`,
    bbox: fin.bbox, gridW: fin.gridW, gridH: fin.gridH, elevations: fin.elevations,
    reprojectedTo: fin.reprojectedTo, reprojectNote: fin.reprojectNote, tileCount: r.read,
    source: {
      service: band === "dtm" ? "Google GEM-15 (15 m bare-earth terrain model)" : "Google GEM-15 (15 m surface model)", zoom: null, sourcePixelM: 15, nodeM, bareEarth: band === "dtm", fetched: new Date().toISOString().slice(0, 10),
      gapFilledNodes: filled, gapNodes: total - own, totalNodes: total, ...(stepSmooth ? { stepSmooth } : {}), gapFilledFrom: filled ? (seam?.deltaFilled ? "Copernicus GLO-30 plus the interpolated GEM-15 - GLO-30 difference" : "Copernicus GLO-30") : null, ...(seam ? { gapSeam: seam } : {}), ...(copFailed ? { gapFillFailed: copFailed } : {}),
    },
    noDataMask: fin.noDataMask, noDataNote: fin.noDataNote,
    failedTiles: r.failed.length,
  };
}
