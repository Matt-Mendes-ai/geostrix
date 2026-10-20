// TASKS.csv #784 — fetch the multiband imagery for a spectral index (#783) inside GeoStrix: search a public STAC
// catalogue for scenes over an area, then read ONLY that area's window of each band from the cloud-optimised GeoTIFFs
// (HTTP byte ranges through the main process, electron/main.js remote-sensing-fetch), stack the bands on one grid in
// the scene's own CRS and hand the importer an in-memory multiband GeoTIFF — the #783 path then does the index, the
// stretch, the kept values and the reprojection into the project CRS exactly as for a file the user downloaded.
//
// Sources, no account needed (checked 2026-10-20):
//   * Sentinel-2 L2A surface reflectance — Element 84 Earth Search (AWS Open Data, Copernicus free, full and open
//     access). Reflectance = DN x scale (+ offset only where the data still carry ESA's baseline-04.00 shift - see
//     s2Offset), and the scene classification band masks cloud, cloud shadow, snow, water and no-data.
//   * ASTER L1T (2000-2006, when its SWIR still worked) — Microsoft Planetary Computer, read with the anonymous token
//     its own token service issues. Thermal bands 10-14 at 90 m as at-sensor RADIANCE (DN -> W/m2/sr/um with ASTER's
//     fixed unit conversion coefficients), not emissivity: no atmospheric or temperature correction.
import { BaseClient, BaseResponse, fromCustomClient, writeArrayBuffer } from "geotiff";
import { remoteSensingFetch } from "./desktop.js";
import { reprojectXY, reprojectGrid, getProj4DefSync } from "./reproject.js";
import { pointInRings } from "./mapLayers.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

const EARTH_SEARCH = "https://earth-search.aws.element84.com/v1/search";
const PC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const PC_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/astersa/aster";

// Sentinel-2 band roles (spectralIndices.js SENSORS.sentinel2) -> Earth Search asset keys
const S2_ASSETS = { B2: "blue", B3: "green", B4: "red", B8: "nir", B11: "swir16", B12: "swir22" };
// ASTER TIR unit conversion coefficients (W m-2 sr-1 um-1 per DN), fixed for bands 10-14 (ASTER user handbook)
const ASTER_TIR_UCC = [0.006822, 0.00678, 0.00659, 0.005693, 0.005225];
// Sentinel-2 scene classification: classes masked out (no data, saturated, cloud shadow, water, cloud, cirrus, snow)
const SCL_MASK = { 0: "no data", 1: "saturated", 3: "cloud shadow", 6: "water", 8: "cloud", 9: "cloud", 10: "cirrus", 11: "snow" };

export const IMAGERY_SOURCES = {
  sentinel2: { label: "Sentinel-2 surface reflectance (10-20 m, 2017 onward)", sensor: "sentinel2", nativeM: 10 },
  aster_tir: { label: "ASTER thermal radiance (90 m, 2000-2006)", sensor: "aster_tir", nativeM: 90 },
};

// ---- geotiff.js client over the main-process fetch, with its own block cache ----
// geotiff.js's BlockedSource awaits setTimeout before every fetch, and Chromium throttles timers in a background window
// to about one a minute: measured, the scene-classification band took 125-163 s to open while the window was hidden,
// against ~1 s visible - a user switching to another program mid-fetch would wait minutes. So no BlockedSource: this
// client caches 64 KB-aligned blocks itself (neighbouring missing blocks fetched as one range, a block being fetched
// shared), with no timers at all.
const BLOCK = 65536;
class RsResponse extends BaseResponse {
  constructor(status, data, contentRange) { super(); this._status = status; this.data = data; this.contentRange = contentRange; }
  get status() { return this._status; }
  getHeader(name) { return /content-range/i.test(name) ? this.contentRange || undefined : undefined; }
  async getData() { return this.data.buffer.slice(this.data.byteOffset, this.data.byteOffset + this.data.byteLength); }
}
class RsClient extends BaseClient {
  constructor(url, stats) { super(url); this.stats = stats; this.blocks = new Map(); this.inflight = new Map(); this.size = null; }
  async fetchRange(a, b) {
    const r = await remoteSensingFetch({ url: this.url, range: [a, b] });
    if (!r.ok) throw new Error(r.message || tr("HTTP {status} reading {v}", { status: r.status, v: this.url.split("?")[0] }));
    if (this.stats) { this.stats.requests++; this.stats.bytes += r.data?.byteLength || 0; }
    const total = /\/(\d+)\s*$/.exec(r.contentRange || "");
    if (total) this.size = Number(total[1]);
    return r.data;
  }
  async request({ headers = {} } = {}) {
    const m = /bytes=(\d+)-(\d+)/.exec(headers.Range || headers.range || "");
    if (!m) { const d = await this.fetchRange(0, 64 * 1024 * 1024 - 1); return new RsResponse(200, d, ""); }
    let a = Number(m[1]), b = Number(m[2]);
    if (this.size != null) b = Math.min(b, this.size - 1);
    const first = Math.floor(a / BLOCK), last = Math.floor(b / BLOCK);
    // missing blocks, grouped into runs fetched as one range each
    const runs = [];
    for (let k = first; k <= last; k++) {
      if (this.blocks.has(k) || this.inflight.has(k)) continue;
      if (runs.length && runs[runs.length - 1][1] === k - 1) runs[runs.length - 1][1] = k; else runs.push([k, k]);
    }
    runs.forEach(([k0, k1]) => {
      const p = this.fetchRange(k0 * BLOCK, (k1 + 1) * BLOCK - 1).then((d) => {
        for (let k = k0; k <= k1; k++) { const off = (k - k0) * BLOCK; if (off < d.byteLength) this.blocks.set(k, d.subarray(off, Math.min(off + BLOCK, d.byteLength))); this.inflight.delete(k); }
      }, (e) => { for (let k = k0; k <= k1; k++) this.inflight.delete(k); throw e; });
      for (let k = k0; k <= k1; k++) this.inflight.set(k, p);
    });
    await Promise.all([...new Set(Array.from({ length: last - first + 1 }, (_, i) => this.inflight.get(first + i)).filter(Boolean))]);
    if (this.size != null) b = Math.min(b, this.size - 1);
    const out = new Uint8Array(Math.max(0, b - a + 1));
    for (let k = first; k <= last; k++) {
      const blk = this.blocks.get(k);
      if (!blk) break; // past the end of the file
      const s0 = Math.max(a, k * BLOCK), s1 = Math.min(b, k * BLOCK + blk.byteLength - 1);
      if (s1 >= s0) out.set(blk.subarray(s0 - k * BLOCK, s1 - k * BLOCK + 1), s0 - a);
    }
    return new RsResponse(206, out, `bytes ${a}-${b}/${this.size ?? "*"}`);
  }
}
const openCog = (href, stats) => fromCustomClient(new RsClient(href, stats)); // no blockSize: no BlockedSource (see above)

async function stacSearch(url, body) {
  const r = await remoteSensingFetch({ url, json: body });
  if (!r.ok) throw new Error(tr("The catalogue search failed ({v}).", { v: r.message || tr("HTTP {status}", { status: r.status }) }));
  return JSON.parse(new TextDecoder().decode(r.data));
}

const band0 = (a) => a?.["raster:bands"]?.[0] || {};

// The -0.1 reflectance offset ESA added with processing baseline 04.00 (DN - 1000). Earth Search lists offset -0.1 on
// every item, but where `earthsearch:boa_offset_applied` is true it has already folded the shift into the stored values,
// and items older than 04.00 never had it. MEASURED (Harry, 2026-07-20 baseline 05.12 vs 2021-07-31 pre-04.00, both
// flagged / listed the same): sunlit vegetation read red 0.023 and SWIR-1 0.128 without the offset - textbook forest -
// and the same in 2021; with it, red came out -0.077 and 80 % of an index's pixels were blank. So the offset is applied
// only to a 04.00+ item NOT marked as already harmonised.
export function s2Offset(properties, listedOffset) {
  const baseline = Number(String(properties?.["s2:processing_baseline"] ?? "").replace(/[^0-9.]/g, ""));
  if (!(baseline >= 4) || properties?.["earthsearch:boa_offset_applied"] !== false) return 0;
  return Number.isFinite(listedOffset) ? listedOffset : -0.1;
}

// Planetary Computer's blob store needs a short-lived read token, which its token service issues anonymously; kept until
// five minutes before it expires
let pcToken = null;
async function signPc(href) {
  if (!pcToken || Date.parse(pcToken.expiry) - Date.now() < 5 * 60 * 1000) {
    const r = await remoteSensingFetch({ url: PC_TOKEN });
    if (!r.ok) throw new Error(tr("Could not get a read token from the Planetary Computer ({v}).", { v: r.message || tr("HTTP {status}", { status: r.status }) }));
    const t = JSON.parse(new TextDecoder().decode(r.data));
    pcToken = { token: t.token, expiry: t["msft:expiry"] };
  }
  return `${href}${href.includes("?") ? "&" : "?"}${pcToken.token}`;
}

// Share (0-1) of the area a scene's footprint (GeoJSON Polygon / MultiPolygon in lon/lat) covers, on a 12 x 12 sample.
// Sentinel-2 comes as 110 km tiles, so an area on a tile edge is half empty in one item and whole in the next.
export function areaCoverage(geometry, bbox) {
  if (!geometry) return 1;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  if (!polys.length) return 1;
  let inside = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    const p = [bbox[0] + ((i + 0.5) / 12) * (bbox[2] - bbox[0]), bbox[1] + ((j + 0.5) / 12) * (bbox[3] - bbox[1])];
    if (polys.some((rings) => pointInRings(p, rings))) inside++;
  }
  return inside / 144;
}

// Scenes over bbox [lonMin, latMin, lonMax, latMax], the best covered first, then the fewest clouds. Sentinel-2: between `from` and `to`
// (ISO dates; summer avoids snow); ASTER: its whole 2000-2006 archive.
export async function searchScenes(source, bbox, { from, to, maxCloud = 20, limit = 12 } = {}) {
  if (source === "sentinel2") {
    const d = await stacSearch(EARTH_SEARCH, { collections: ["sentinel-2-l2a"], bbox, datetime: `${from}T00:00:00Z/${to}T23:59:59Z`, query: { "eo:cloud_cover": { lt: maxCloud } }, limit: 50, sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }] });
    return (d.features || []).map((f) => ({
      source, id: f.id, date: String(f.properties.datetime).slice(0, 10), cloud: f.properties["eo:cloud_cover"], epsg: f.properties["proj:epsg"], coverage: areaCoverage(f.geometry, bbox),
      bands: Object.fromEntries(Object.entries(S2_ASSETS).filter(([, k]) => f.assets[k]).map(([role, k]) => [role, { href: f.assets[k].href, scale: band0(f.assets[k]).scale ?? 0.0001, offset: s2Offset(f.properties, band0(f.assets[k]).offset) }])),
      baseline: f.properties["s2:processing_baseline"] || null,
      scl: f.assets.scl?.href || null,
    })).sort((a, b) => b.coverage - a.coverage || a.cloud - b.cloud).slice(0, limit);
  }
  if (source === "aster_tir") {
    const d = await stacSearch(PC_SEARCH, { collections: ["aster-l1t"], bbox, query: { "eo:cloud_cover": { lt: maxCloud } }, limit: 50 });
    return (d.features || []).filter((f) => f.assets.TIR).map((f) => ({ source, id: f.id, date: String(f.properties.datetime).slice(0, 10), cloud: f.properties["eo:cloud_cover"], epsg: f.properties["proj:epsg"], coverage: areaCoverage(f.geometry, bbox), tir: f.assets.TIR.href }))
      .sort((a, b) => b.coverage - a.coverage || a.cloud - b.cloud).slice(0, limit);
  }
  throw new Error(tr("Unknown imagery source {source}", { source }));
}

// The output grid: the area's box in the scene CRS at `cellM` metres or coarser, at most maxPx on its longest side
export function windowGrid(bbox, epsg, cellM, maxPx = 2000) {
  const corners = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]].map(([x, y]) => reprojectXY(x, y, 4326, epsg));
  if (corners.some((c) => !c)) throw new Error(tr("EPSG:{epsg} is not a CRS GeoStrix can project to.", { epsg }));
  const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const cell = Math.max(cellM, Math.max(box[2] - box[0], box[3] - box[1]) / maxPx);
  const width = Math.max(1, Math.round((box[2] - box[0]) / cell)), height = Math.max(1, Math.round((box[3] - box[1]) / cell));
  return { box: [box[0], box[3] - height * cell, box[0] + width * cell, box[3]], width, height, cell };
}

// Reads the scene over the area and returns { file (an in-memory multiband GeoTIFF), mapping (role -> band), note }.
// `roles` = the bands the index needs (Sentinel-2) - only those are downloaded.
export async function fetchSceneStack(scene, bboxLonLat, roles, { onProgress, maxPx = 2000, targetEpsg = null } = {}) {
  const src = IMAGERY_SOURCES[scene.source];
  const g = windowGrid(bboxLonLat, scene.epsg, src.nativeM, maxPx);
  const n = g.width * g.height;
  const stats = { requests: 0, bytes: 0, ms: 0 };
  const t0 = Date.now();
  const read = async (href, samples) => {
    const tiff = await openCog(href, stats);
    return tiff.readRasters({ bbox: g.box, width: g.width, height: g.height, resampleMethod: "nearest", ...(samples ? { samples } : {}), fillValue: 0 });
  };
  const bands = [], mapping = {};
  let note = "", masked = null;
  if (scene.source === "sentinel2") {
    const want = roles.filter((r) => scene.bands[r]);
    const missing = roles.filter((r) => !scene.bands[r]);
    if (missing.length) throw new Error(tr("This scene has no {missing} band.", { missing: missing.join(", ") }));
    let done = 0;
    const total = want.length + (scene.scl ? 1 : 0);
    for (const r of want) {
      const { href, scale, offset } = scene.bands[r];
      const [dn] = await read(href);
      const v = new Float32Array(n);
      for (let i = 0; i < n; i++) v[i] = dn[i] === 0 ? NaN : dn[i] * scale + offset; // DN 0 = no data
      bands.push(v); mapping[r] = bands.length;
      onProgress?.(++done, total);
    }
    if (scene.scl) {
      const [scl] = await read(scene.scl);
      masked = {};
      for (let i = 0; i < n; i++) {
        const why = SCL_MASK[scl[i]];
        if (!why) continue;
        masked[why] = (masked[why] || 0) + 1;
        for (const b of bands) b[i] = NaN;
      }
      onProgress?.(total, total);
      const parts = Object.entries(masked).filter(([, c]) => c).map(([k, c]) => `${k} ${((100 * c) / n).toFixed(1)}%`);
      note = parts.length ? tr(" Masked with the scene classification: {parts}.", { parts: parts.join(", ") }) : tr(" The scene classification found no cloud, shadow, snow or water over the area.");
    }
    note = tr(" Sentinel-2 L2A {id} ({date}, {v}% cloud over the whole tile), surface reflectance{v2}, read at {v3} m.{note}", { id: scene.id, date: scene.date, v: scene.cloud?.toFixed(1), v2: scene.baseline ? tr(" (processing baseline {baseline}{v})", { baseline: scene.baseline, v: Object.values(scene.bands)[0]?.offset ? tr(", baseline offset removed") : tr(", values already harmonised") }) : "", v3: Math.round(g.cell), note });
  } else if (scene.source === "aster_tir") {
    onProgress?.(0, 1);
    const tir = await read(await signPc(scene.tir), [0, 1, 2, 3, 4]);
    tir.forEach((dn, k) => {
      const v = new Float32Array(n);
      for (let i = 0; i < n; i++) v[i] = dn[i] <= 1 ? NaN : (dn[i] - 1) * ASTER_TIR_UCC[k]; // DN 0 = fill
      bands.push(v); mapping[`B${10 + k}`] = k + 1;
    });
    onProgress?.(1, 1);
    note = tr(" ASTER L1T {v} ({date}, {cloud}% cloud over the scene), thermal bands 10-14 as at-sensor radiance (no atmospheric or temperature correction: compare values within this scene, not between scenes), {v2} m.", { v: scene.id.split("_").slice(0, 3).join("_"), date: scene.date, cloud: scene.cloud, v2: Math.round(g.cell) });
  }
  // The importer keeps an index's VALUES only when it needs no reprojection (#326: a picture resample is not a value
  // re-grid), and the scenes come in WGS 84 / UTM while projects are often NAD83(CSRS) / UTM: so the stack is resampled
  // here onto a grid in the project CRS (nearest pixel: reflectances and mask edges stay exactly as delivered).
  let out = { width: g.width, height: g.height, bands, epsg: Number(scene.epsg), scaleX: g.cell, scaleY: g.cell, x0: g.box[0], y1: g.box[3] };
  const dst = Number(targetEpsg);
  if (dst && dst !== Number(scene.epsg) && getProj4DefSync(scene.epsg) && getProj4DefSync(dst)) {
    const h = g.cell / 2; // pixel-area stack -> its pixel-centre nodes
    const rp = reprojectGrid({ xmin: g.box[0] + h, ymin: g.box[1] + h, xmax: g.box[2] - h, ymax: g.box[3] - h, gridW: g.width, gridH: g.height, bands }, getProj4DefSync(scene.epsg), getProj4DefSync(dst), g.width, g.height, { nearest: true });
    const sx = (rp.bbox[2] - rp.bbox[0]) / Math.max(1, rp.gridW - 1), sy = (rp.bbox[3] - rp.bbox[1]) / Math.max(1, rp.gridH - 1);
    out = { width: rp.gridW, height: rp.gridH, bands: rp.bandsOut, epsg: dst, scaleX: sx, scaleY: sy, x0: rp.bbox[0] - sx / 2, y1: rp.bbox[3] + sy / 2 };
    note += tr(" Resampled (nearest pixel) from EPSG:{epsg} into the project's EPSG:{dst} so the values are kept.", { epsg: scene.epsg, dst });
  }
  // interleave into one Float32 multiband GeoTIFF (NaN = no data)
  const S = out.bands.length, m = out.width * out.height, data = new Float32Array(m * S);
  for (let i = 0; i < m; i++) for (let b = 0; b < S; b++) data[i * S + b] = out.bands[b][i];
  const buf = writeArrayBuffer(data, {
    width: out.width, height: out.height, SamplesPerPixel: S, PlanarConfiguration: 1, BitsPerSample: Array(S).fill(32), SampleFormat: Array(S).fill(3),
    ModelPixelScale: [out.scaleX, out.scaleY, 0], ModelTiepoint: [0, 0, 0, out.x0, out.y1, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: out.epsg,
  });
  const file = new File([buf], `${scene.id}.tif`, { type: "image/tiff" });
  stats.ms = Date.now() - t0;
  return { file, mapping, note, grid: g, masked, stats };
}
