// TASKS.csv #2005 — the browser side of the Macrostrat layer (lib/macrostrat.js holds the pure parts): the tiles over the area, two at a
// time through the main process, stitched, resampled to longitude / latitude and warped into the project CRS (as a WMS map, #418).
import { macrostratFetch } from "./desktop.js";
import { reprojectImageRGBA, getProj4DefSync } from "./reproject.js";
import { wmsImageSize, wmsPixelMetres } from "./webLayers.js";
import { MACROSTRAT_TILE_URL, MACROSTRAT_MVT_URL, MACROSTRAT_API, MACROSTRAT_CREDIT, planMacrostratTiles, mercatorToLonLat, parseMacrostratUnits, parseMacrostratSources, tilePixelMetres, outputLongPx, macrostratLegend, macrostratUnitFeatures, macrostratLayersInArea } from "./macrostrat.js"; // MVT / legend: #2011; unit features: #2012
import { parseLithologies, parseIntervals } from "./macrostratColours.js";
import { readVectorTile } from "./mvt.js"; // TASKS.csv #2011
import { buildLayer } from "./mapLayerBuild.js"; // TASKS.csv #2012
import { t as tr } from "./i18n.js";

const decodeTile = async (res) => {
  if (!res.ok || !res.bytes) throw new Error(res.message || tr("Request failed (HTTP {status}).", { status: res.status }));
  return createImageBitmap(new Blob([res.bytes], { type: "image/png" }));
};

export async function fetchMacrostratRaster({ bboxLonLat, projectEpsg, longPx = 1024, onProgress }) {
  const plan = planMacrostratTiles(bboxLonLat);
  if (!plan) throw new Error(tr("No Macrostrat tiles cover this area."));
  const fromDef = getProj4DefSync(4326), toDef = getProj4DefSync(projectEpsg);
  if (!fromDef || !toDef) throw new Error(tr("Can't reproject WGS84 into the project's EPSG:{projectEpsg} — unrecognized target CRS.", { projectEpsg }));
  const list = [];
  for (let y = plan.y0; y <= plan.y1; y++) for (let x = plan.x0; x <= plan.x1; x++) list.push({ x, y });
  const bitmaps = new Array(list.length).fill(null);
  const failed = [];
  let next = 0, done = 0;
  onProgress?.(0, list.length);
  const worker = async () => {
    while (next < list.length) {
      const k = next++, t = list[k];
      try { bitmaps[k] = await decodeTile(await macrostratFetch({ url: MACROSTRAT_TILE_URL(plan.z, t.x, t.y), binary: true })); } catch (e) { failed.push(e); }
      onProgress?.(++done, list.length);
    }
  };
  await Promise.all([worker(), worker()]);
  if (failed.length === list.length) throw failed[0];
  const tileSize = bitmaps.find(Boolean).width;
  const cols = plan.x1 - plan.x0 + 1, rows = plan.y1 - plan.y0 + 1;
  const mosaicW = cols * tileSize, mosaicH = rows * tileSize;
  const mc = document.createElement("canvas");
  mc.width = mosaicW; mc.height = mosaicH;
  const mctx = mc.getContext("2d");
  list.forEach((t, k) => { const b = bitmaps[k]; if (b) { mctx.drawImage(b, (t.x - plan.x0) * tileSize, (t.y - plan.y0) * tileSize, tileSize, tileSize); b.close?.(); } });
  const srcPixelM = tilePixelMetres(plan.z, (bboxLonLat[1] + bboxLonLat[3]) / 2, tileSize);
  const { width, height } = wmsImageSize(bboxLonLat, outputLongPx(wmsPixelMetres(bboxLonLat, 1), srcPixelM, longPx));
  const ll = mercatorToLonLat(mctx.getImageData(0, 0, mosaicW, mosaicH).data, { z: plan.z, x0: plan.x0, y0: plan.y0, tileSize, mosaicW, mosaicH }, bboxLonLat, width, height);
  const [lonMin, latMin, lonMax, latMax] = bboxLonLat;
  const rp = reprojectImageRGBA({ xmin: lonMin, ymin: latMin, xmax: lonMax, ymax: latMax, width, height, data: ll }, fromDef, toDef, width, height);
  const out = document.createElement("canvas");
  out.width = rp.width; out.height = rp.height;
  out.getContext("2d").putImageData(new ImageData(rp.data, rp.width, rp.height), 0, 0);
  return { bbox: rp.bbox, dataUrl: out.toDataURL("image/png"), width, height, zoom: plan.z, tiles: list.length, failedTiles: failed.length, pixelM: Math.max(srcPixelM, wmsPixelMetres(bboxLonLat, Math.max(width, height))) }; // the detail the tiles hold
}

// the map units at a point, finest map first, each with its original map's citation
export async function fetchMacrostratUnits(lat, lng) {
  const res = await macrostratFetch({ url: `${MACROSTRAT_API}/geologic_units/map?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}` });
  if (!res.ok) throw new Error(res.message || tr("Request failed (HTTP {status}).", { status: res.status }));
  const units = parseMacrostratUnits(JSON.parse(res.text));
  const ids = [...new Set(units.map((u) => u.sourceId).filter((v) => Number.isInteger(v)))];
  let sources = {};
  if (ids.length) {
    const s = await macrostratFetch({ url: `${MACROSTRAT_API}/defs/sources?source_id=${ids.join(",")}` });
    if (s.ok) sources = parseMacrostratSources(JSON.parse(s.text));
  }
  return units.map((u) => ({ ...u, source: sources[u.sourceId] || null }));
}

// TASKS.csv #2011 — the drape's legend: the map units in the vector tiles over the same area at the same zoom (the tiles the PNG drape
// was drawn from), 1-10 kB each, two at a time through the main process. -> { units, lines, sources, zoom, tiles, failedTiles, fetched }
async function fetchMacrostratTiles(bboxLonLat, onProgress) {
  const plan = planMacrostratTiles(bboxLonLat);
  if (!plan) throw new Error(tr("No Macrostrat tiles cover this area."));
  const list = [];
  for (let y = plan.y0; y <= plan.y1; y++) for (let x = plan.x0; x <= plan.x1; x++) list.push({ x, y });
  const tiles = [], failed = [];
  let next = 0, done = 0;
  onProgress?.(0, list.length);
  const worker = async () => {
    while (next < list.length) {
      const t = list[next++];
      try {
        const res = await macrostratFetch({ url: MACROSTRAT_MVT_URL(plan.z, t.x, t.y), binary: true });
        if (!res.ok || !res.bytes) throw new Error(res.message || tr("Request failed (HTTP {status}).", { status: res.status }));
        tiles.push({ z: plan.z, x: t.x, y: t.y, layers: readVectorTile(new Uint8Array(res.bytes)) });
      } catch (e) { failed.push(e); }
      onProgress?.(++done, list.length);
    }
  };
  await Promise.all([worker(), worker()]);
  if (failed.length === list.length) throw failed[0];
  return { plan, count: list.length, tiles, failed };
}
export async function fetchMacrostratLegend({ bboxLonLat, onProgress }) {
  const { plan, count, tiles, failed } = await fetchMacrostratTiles(bboxLonLat, onProgress);
  return { ...macrostratLegend(macrostratLayersInArea(tiles, bboxLonLat)), inArea: true /* #2315 */, zoom: plan.z, tiles: count, failedTiles: failed.length, fetched: new Date().toISOString().slice(0, 10) };
}

// TASKS.csv #2012 — the units as a geology map layer (polygons with a unit field, Macrostrat's colours), reprojected into the project
// CRS by buildLayer as an imported map is, so Surface Geology > Model it can carry them underground. -> { layer, polygons, units, ... }
export async function fetchMacrostratMapLayer({ bboxLonLat, projectEpsg, onProgress }) {
  if (!getProj4DefSync(4326) || !getProj4DefSync(projectEpsg)) throw new Error(tr("Can't reproject WGS84 into the project's EPSG:{projectEpsg} — unrecognized target CRS.", { projectEpsg }));
  const { plan, count, tiles, failed } = await fetchMacrostratTiles(bboxLonLat, onProgress);
  const { features, units, sources } = macrostratUnitFeatures(tiles, bboxLonLat);
  if (!features.length) throw new Error(tr("Macrostrat has no map unit polygons in this area."));
  const name = "Macrostrat geology (CC BY 4.0)";
  const built = buildLayer({ name, geomType: "polygon", epsg: 4326, features }, { sourceName: name, projectEpsg, qml: null, sourceOverride: null });
  if (!built?.features?.length) throw new Error(tr("Macrostrat has no map unit polygons in this area."));
  const counts = {};
  for (const f of built.features) counts[f.attributes.unit] = (counts[f.attributes.unit] || 0) + 1;
  const categories = units.filter((u) => counts[u.unit]).map((u) => ({ value: u.unit, label: u.unit, color: u.color || "#777777", outline: null, visible: true, count: counts[u.unit] }));
  const fetched = new Date().toISOString().slice(0, 10);
  return { layer: { ...built, name, styleField: "unit", categories, lineWidthM: 2, credit: MACROSTRAT_CREDIT, macrostrat: { zoom: plan.z, tiles: count, failedTiles: failed.length, fetched, areaLonLat: bboxLonLat, sources } },
    polygons: built.features.length, units: categories.length, zoom: plan.z, tiles: count, failedTiles: failed.length };
}

// TASKS.csv #2005 — the colour lists, fetched once per session when a button asks (lib/macrostratColours.js matches them)
let lithCache = null, intervalCache = null;
const getJson = async (url) => { const r = await macrostratFetch({ url }); if (!r.ok) throw new Error(r.message || tr("Request failed (HTTP {status}).", { status: r.status })); return JSON.parse(r.text); };
export async function fetchMacrostratLithologies() {
  if (!lithCache) lithCache = getJson(`${MACROSTRAT_API}/defs/lithologies?all`).then(parseLithologies).catch((e) => { lithCache = null; throw e; });
  return lithCache;
}
export async function fetchMacrostratIntervals() {
  if (!intervalCache) intervalCache = getJson(`${MACROSTRAT_API}/defs/intervals?timescale=international%20intervals`).then(parseIntervals).catch((e) => { intervalCache = null; throw e; });
  return intervalCache;
}
