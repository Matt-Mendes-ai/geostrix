// TASKS.csv #2005 — the browser side of the Macrostrat layer (lib/macrostrat.js holds the pure parts): the tiles over the area, two at a
// time through the main process, stitched, resampled to longitude / latitude and warped into the project CRS (as a WMS map, #418).
import { macrostratFetch } from "./desktop.js";
import { getProj4DefSync } from "./reproject.js";
import { reprojectImageRGBA } from "./reprojectMore.js"; // TASKS.csv #3590
import { wmsImageSize, wmsPixelMetres } from "./webLayers.js";
import { MACROSTRAT_MVT_URL, MACROSTRAT_API, MACROSTRAT_CREDIT, planMacrostratTiles, macrostratZoomSteps, firstZoomWithUnits, macrostratScaleNote /* #3974 */, parseMacrostratUnits, parseMacrostratSources, macrostratLegend, macrostratUnitFeatures, macrostratLayersInArea, drawUnitsRGBA, unitImageLongPx } from "./macrostrat.js"; // MVT / legend: #2011; unit features: #2012
import { parseLithologies } from "./macrostratColours.js";
import { readVectorTile } from "./mvt.js"; // TASKS.csv #2011
import { buildLayer } from "./mapLayerBuild.js"; // TASKS.csv #2012
import { t as tr } from "./i18n.js";


// TASKS.csv #3952 — the image is drawn from the unit polygons of the vector tiles (lib/macrostrat.js drawUnitsRGBA), sized to the area, then
// warped into the project CRS as before; the same tiles give its legend, so nothing is fetched twice. Macrostrat's PNG tiles (its relief-shaded
// map) are no longer read: they stop at zoom 12 and a small area came out a few dozen pixels across.
export async function fetchMacrostratRaster({ bboxLonLat, projectEpsg, onProgress }) {
  const fromDef = getProj4DefSync(4326), toDef = getProj4DefSync(projectEpsg);
  if (!fromDef || !toDef) throw new Error(tr("Can't reproject WGS84 into the project's EPSG:{projectEpsg} — unrecognized target CRS.", { projectEpsg }));
  const { plan, count, tiles, failed, scaleNote } = await fetchMacrostratTiles(bboxLonLat, onProgress); // scaleNote: #3974
  const { features, units } = macrostratUnitFeatures(tiles, bboxLonLat);
  if (!features.length) throw new Error(tr("Macrostrat has no map unit polygons in this area."));
  const colour = new Map(units.map((u) => [u.unit, u.color]));
  const { width, height } = wmsImageSize(bboxLonLat, unitImageLongPx(wmsPixelMetres(bboxLonLat, 1)));
  const ll = drawUnitsRGBA(features, (f) => colour.get(f.attributes.unit) || "#777777", bboxLonLat, width, height);
  const [lonMin, latMin, lonMax, latMax] = bboxLonLat;
  const rp = reprojectImageRGBA({ xmin: lonMin, ymin: latMin, xmax: lonMax, ymax: latMax, width, height, data: ll }, fromDef, toDef, width, height);
  const out = document.createElement("canvas");
  out.width = rp.width; out.height = rp.height;
  out.getContext("2d").putImageData(new ImageData(rp.data, rp.width, rp.height), 0, 0);
  const legend = { ...macrostratLegend(macrostratLayersInArea(tiles, bboxLonLat)), inArea: true, zoom: plan.z, tiles: count, failedTiles: failed.length, fetched: new Date().toISOString().slice(0, 10) };
  return { bbox: rp.bbox, dataUrl: out.toDataURL("image/png"), width, height, zoom: plan.z, tiles: count, failedTiles: failed.length, pixelM: wmsPixelMetres(bboxLonLat, Math.max(width, height)), legend, scaleNote };
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
async function fetchZoom(plan, onProgress) {
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
// TASKS.csv #3974 — the tiles of the deepest zoom that holds a map over the area (macrostratZoomSteps: where only a continental map exists the
// deep zooms are blank), so the drape, its legend, the map layer and the trend helper's polygons all read the same zoom. A zoom with units at
// once costs nothing more; after a step down, `scaleNote` says what map was found (one point query at the centre). Nothing even at the floor:
// an error that says so and where else to look. -> { plan, count, tiles, failed, requests, firstZoom, scaleNote }
async function fetchMacrostratTiles(bboxLonLat, onProgress) {
  const steps = macrostratZoomSteps(bboxLonLat);
  if (!steps.length) throw new Error(tr("No Macrostrat tiles cover this area."));
  const found = await firstZoomWithUnits(steps, (plan) => fetchZoom(plan, onProgress), bboxLonLat);
  if (found) return { ...found.got, requests: found.requests, firstZoom: steps[0].z, scaleNote: found.index > 0 ? await scaleNoteAt(bboxLonLat) : null };
  throw new Error(tr("Macrostrat has no map here, even at a continent's scale. Try Maps > Web layers, or a georeferenced survey map."));
}
// the map found after a step down, said in one line (the finest unit at the centre, its map's name and scale); null when it can't be read
async function scaleNoteAt([lonMin, latMin, lonMax, latMax]) {
  try {
    const lat = (latMin + latMax) / 2, lng = (lonMin + lonMax) / 2;
    const res = await macrostratFetch({ url: `${MACROSTRAT_API}/geologic_units/map?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}` });
    if (!res.ok) return null;
    const u = parseMacrostratUnits(JSON.parse(res.text))[0];
    if (!u) return null;
    let sourceName = "", sourceScale = "", sourceTitle = "";
    if (Number.isInteger(u.sourceId)) {
      const s = await macrostratFetch({ url: `${MACROSTRAT_API}/defs/sources?source_id=${u.sourceId}` });
      const d = s.ok ? JSON.parse(s.text)?.success?.data?.[0] : null;
      sourceName = String(d?.name || d?.ref_title || "").trim(); sourceScale = String(d?.scale || "").trim(); sourceTitle = String(d?.ref_title || "").trim();
    }
    return macrostratScaleNote([{ ...u, sourceName, sourceScale, sourceTitle }]);
  } catch { return null; }
}
export async function fetchMacrostratLegend({ bboxLonLat, onProgress }) {
  const { plan, count, tiles, failed, scaleNote } = await fetchMacrostratTiles(bboxLonLat, onProgress); // scaleNote: #3974
  return { ...macrostratLegend(macrostratLayersInArea(tiles, bboxLonLat)), inArea: true /* #2315 */, zoom: plan.z, tiles: count, failedTiles: failed.length, fetched: new Date().toISOString().slice(0, 10), scaleNote };
}

// TASKS.csv #3911 — the unit polygons alone, in longitude / latitude, from the same vector tiles (the trend helper's regional direction,
// lib/regionalGrain.js). -> { features, zoom, tiles, failedTiles }
export async function fetchMacrostratUnitPolygons({ bboxLonLat, onProgress }) {
  const { plan, count, tiles, failed, scaleNote } = await fetchMacrostratTiles(bboxLonLat, onProgress); // scaleNote: #3974
  return { features: macrostratUnitFeatures(tiles, bboxLonLat).features, zoom: plan.z, tiles: count, failedTiles: failed.length, scaleNote };
}

// TASKS.csv #2012 — the units as a geology map layer (polygons with a unit field, Macrostrat's colours), reprojected into the project
// CRS by buildLayer as an imported map is, so Surface Geology > Model it can carry them underground. -> { layer, polygons, units, ... }
export async function fetchMacrostratMapLayer({ bboxLonLat, projectEpsg, onProgress }) {
  if (!getProj4DefSync(4326) || !getProj4DefSync(projectEpsg)) throw new Error(tr("Can't reproject WGS84 into the project's EPSG:{projectEpsg} — unrecognized target CRS.", { projectEpsg }));
  const { plan, count, tiles, failed, scaleNote } = await fetchMacrostratTiles(bboxLonLat, onProgress); // scaleNote: #3974
  const { features, units, sources } = macrostratUnitFeatures(tiles, bboxLonLat);
  if (!features.length) throw new Error(tr("Macrostrat has no map unit polygons in this area."));
  const name = "Macrostrat geology (CC BY 4.0)";
  const built = buildLayer({ name, geomType: "polygon", epsg: 4326, features }, { sourceName: name, projectEpsg, qml: null, sourceOverride: null });
  if (!built?.features?.length) throw new Error(tr("Macrostrat has no map unit polygons in this area."));
  const counts = {};
  for (const f of built.features) counts[f.attributes.unit] = (counts[f.attributes.unit] || 0) + 1;
  // #2315 — entries with one name, lithology and age (from different source maps) share a unit name: one category each, not a repeat
  const seenUnit = new Set();
  const categories = units.filter((u) => counts[u.unit] && !seenUnit.has(u.unit) && seenUnit.add(u.unit)).map((u) => ({ value: u.unit, label: u.unit, color: u.color || "#777777", outline: null, visible: true, count: counts[u.unit] }));
  const fetched = new Date().toISOString().slice(0, 10);
  return { layer: { ...built, name, styleField: "unit", categories, lineWidthM: 2, credit: MACROSTRAT_CREDIT, macrostrat: { zoom: plan.z, tiles: count, failedTiles: failed.length, fetched, areaLonLat: bboxLonLat, sources, ...(scaleNote ? { scaleNote } : {}) } },
    polygons: built.features.length, units: categories.length, zoom: plan.z, tiles: count, failedTiles: failed.length, scaleNote };
}

// TASKS.csv #2005 — the colour lists, fetched once per session when a button asks (lib/macrostratColours.js matches them)
let lithCache = null;
const getJson = async (url) => { const r = await macrostratFetch({ url }); if (!r.ok) throw new Error(r.message || tr("Request failed (HTTP {status}).", { status: r.status })); return JSON.parse(r.text); };
export async function fetchMacrostratLithologies() {
  if (!lithCache) lithCache = getJson(`${MACROSTRAT_API}/defs/lithologies?all`).then(parseLithologies).catch((e) => { lithCache = null; throw e; });
  return lithCache;
}
// the time scale's colours are bundled since TASKS.csv #2690 (lib/macrostratColours.js bundledTimeScaleIntervals): no fetch here
