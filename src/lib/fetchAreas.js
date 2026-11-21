// TASKS.csv #3954 (Matt's first-time test: "geology should have the option to match terrain or sat image or even boundaries. DEM and sat image
// should have the option to match boundaries too") — the areas an online fetch can use, in one place. Each fetch had its own list (the terrain
// and satellite pickers two near-identical copies, Macrostrat only the project area or a drawn one, none a claim with a margin). Pure: the
// project's data in, the choices out; the lon / lat step takes the caller's point converter (a tied local grid goes through its tie).
//   fetchAreaChoices(state, { marginM, imagery }) -> [{ id, kind, label, box, outline? }] in the project CRS, only what the project has
//   fetchAreaOptions(choices, lonLatOf, collars) -> [{ id, kind, label, bboxLonLat, box, outline? }] (async: lonLatOf may be)
//   outlineMask(outline, box, w, h) -> Uint8Array, 1 inside the outline (a terrain or an image clipped to a boundary or claim)
// kind: project | collars | terrain | satellite | raster | samples | boundary | claim. outline: the boundary's closed loops, [[x, y], ...] each.
import { t as tr } from "./i18n.js";
import { fetchAreaBox, imageryAreaCollars, mergeSameBoxOptions } from "./dataExtent.js";
import { mainClusters } from "./dataClusters.js";
import { farFromCollars, farLabel } from "./landingCheck.js";
import { isAreaBoundary } from "./areaBoundary.js";
import { bytesToB64, b64ToBytes } from "./base64.js";

export const FETCH_AREA_MARGIN_M = 250; // around a boundary or claim, so its edge is not the image's edge
const finite = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.y);
function boxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return x1 >= x0 && y1 >= y0 ? [x0, y0, x1, y1] : null;
}
const grow = (b, m) => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
// a satellite image: one the Satellite fetch made (it keeps its scene), or one named as such
export const isSatelliteRaster = (r) => !!r?.scene || /^(Sentinel-2|NAIP)\b/.test(String(r?.name || ""));

// state: { collars, survey, surfaceSamples, terrain, rasters, boundaries, mapLayers }; imagery: the collars an image is seeded from (#2126)
export function fetchAreaChoices(state, { marginM = FETCH_AREA_MARGIN_M, imagery = false } = {}) {
  const { collars = [], survey = [], surfaceSamples = [], terrain = null, rasters = [], boundaries = [], mapLayers = [] } = state || {};
  const out = [];
  // the project area: the holes (and the samples near them) with the usual margin; with no holes, the map layers', then the samples'
  const pick = imagery ? imageryAreaCollars(collars, survey) : { collars, by: "all", total: (collars || []).filter(finite).length };
  const holes = fetchAreaBox(pick.collars, surfaceSamples);
  if (holes) {
    out.push({ id: "project", kind: "project", label: pick.by === "all" ? tr("Project area") : pick.by === "traced" ? tr("Around the traced holes ({n} of {total})", { n: pick.collars.length.toLocaleString(), total: pick.total.toLocaleString() }) : tr("Around the main group of collars ({n} of {total})", { n: pick.collars.length.toLocaleString(), total: pick.total.toLocaleString() }), box: holes });
    if (pick.by !== "all") { const all = fetchAreaBox(collars, surfaceSamples); if (all) out.push({ id: "all_collars", kind: "collars", label: tr("Every collar ({n})", { n: pick.total.toLocaleString() }), box: all }); }
  } else {
    const pts = [];
    for (const l of mapLayers || []) for (const f of l.features || []) for (const part of f.parts || [f.geometry || []]) for (const p of part || []) if (Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])) pts.push({ x: p[0], y: p[1] });
    const b = pts.length ? boxOf(pts) : null;
    if (b) out.push({ id: "project", kind: "project", label: tr("Project area"), box: grow(b, Math.max(200, 0.05 * Math.max(b[2] - b[0], b[3] - b[1]))) });
  }
  if (terrain?.bbox?.every(Number.isFinite)) out.push({ id: "terrain", kind: "terrain", label: tr("Same as the terrain"), box: terrain.bbox });
  const sats = (rasters || []).filter((r) => r?.bbox?.every(Number.isFinite) && isSatelliteRaster(r));
  for (const r of sats) out.push({ id: `raster_${r.id}`, kind: "satellite", label: sats.length === 1 ? tr("Same as the satellite image") : tr("Same as the satellite image: {name}", { name: r.name }), box: r.bbox });
  for (const r of rasters || []) if (r?.bbox?.every(Number.isFinite) && !isSatelliteRaster(r)) out.push({ id: `raster_${r.id}`, kind: "raster", label: tr("Raster: {name}", { name: r.name }), box: r.bbox });
  { // #1461 — the surface samples' area without far outliers
    const { keep } = mainClusters(surfaceSamples || []), pts = (surfaceSamples || []).filter((p, i) => keep[i] && finite(p));
    const b = pts.length ? boxOf(pts) : null;
    if (b) out.push({ id: "surface_samples", kind: "samples", label: tr("Around the surface samples"), box: grow(b, Math.max(500, 0.05 * Math.max(b[2] - b[0], b[3] - b[1]))) });
  }
  // a boundary or claim: its extent plus the margin, and its outline for clipping (#1466: an open line or contours are not an area)
  for (const b of boundaries || []) {
    if (!isAreaBoundary(b)) continue;
    const outline = (b.polylines || []).filter((l, i) => (l?.length || 0) >= 3 && b.closedFlags?.[i] !== false).map((l) => l.filter(finite).map((p) => [p.x, p.y]));
    const box = boxOf(outline.flat().map(([x, y]) => ({ x, y })));
    if (!box) continue;
    const claim = b.kind === "claim";
    // core: the extent itself, so the chooser's Margin box can grow it again (#3954, Matt: "a margin box to the area choice")
    out.push({ id: `boundary_${b.id}`, kind: claim ? "claim" : "boundary", label: claim ? tr("Claim: {name}", { name: b.name }) : tr("Boundary: {name}", { name: b.name }), box: grow(box, Math.max(0, Number(marginM) || 0)), core: box, outline });
  }
  return out;
}

// a project-CRS box to lon / lat through its four corners (a margin-expanded UTM box is not a lon / lat box), or null
export async function boxToLonLat(box, lonLatOf) {
  const ll = await Promise.all([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => lonLatOf(x, y)));
  if (ll.some((q) => !q || !Number.isFinite(q.lon) || !Number.isFinite(q.lat))) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const q of ll) { if (q.lon < a) a = q.lon; if (q.lon > c) c = q.lon; if (q.lat < b) b = q.lat; if (q.lat > d) d = q.lat; }
  return [a, b, c, d];
}

// the choices in lon / lat for the pickers (BasemapView's list, AreaChooser): a far layer says so (#2590), one line per distinct box (#3477)
export async function fetchAreaOptions(choices, lonLatOf, collars = []) {
  const opts = await Promise.all((choices || []).map(async (c) => {
    const bboxLonLat = await boxToLonLat(c.box, lonLatOf), coreLonLat = c.core ? await boxToLonLat(c.core, lonLatOf) : null;
    return bboxLonLat ? { ...c, label: c.kind === "project" || c.kind === "collars" ? c.label : farLabel(c.label, farFromCollars(c.box, collars)), bboxLonLat, ...(coreLonLat ? { coreLonLat } : {}) } : null;
  }));
  return mergeSameBoxOptions(opts.filter(Boolean), (n) => tr("+{n} with the same box", { n }));
}

// the option a confirmed box came from (the map picker hands back a box): the same box to 1e-7 degree, or null for a drawn one
export const optionForBox = (options, bboxLonLat) => (options || []).find((o) => o.bboxLonLat && bboxLonLat && o.bboxLonLat.every((v, i) => Math.abs(v - bboxLonLat[i]) < 1e-7)) || null;

// outline: closed loops in the project CRS; box: the grid's [x0, y0, x1, y1]; w x h pixels (or, nodes: true, nodes on the box's edges as a
// terrain's are), row 0 north. Even-odd, so a hole in a claim stays out. -> Uint8Array (1 inside)
export function outlineMask(outline, box, w, h, { nodes = false } = {}) {
  const m = new Uint8Array(w * h);
  const [x0, y0, x1, y1] = box, sx = (x1 - x0) / (nodes ? Math.max(1, w - 1) : w), sy = (y1 - y0) / (nodes ? Math.max(1, h - 1) : h), half = nodes ? 0 : 0.5;
  const edges = [];
  for (const ring of outline || []) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; edges.push([a[0], a[1], b[0], b[1]]); }
  const xs = [];
  for (let j = 0; j < h; j++) {
    const y = y1 - (j + half) * sy;
    xs.length = 0;
    for (const [ax, ay, bx, by] of edges) if ((ay <= y) !== (by <= y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    xs.sort((a, b) => a - b);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      const a = Math.max(0, Math.ceil((xs[n] - x0) / sx - half)), b = Math.min(w - 1, Math.ceil((xs[n + 1] - x0) / sx - half) - 1);
      for (let i = a; i <= b; i++) m[j * w + i] = 1;
    }
  }
  return m;
}

// a terrain clipped to an outline: the nodes outside it join its no-data mask (a bit per node, as demFill.js keeps it), so the mesh leaves
// them out and every sampler reads them as not covered. -> the terrain with its new mask (base64), or the terrain itself when nothing is outside
export function clipTerrainToOutline(terrain, outline) {
  const { gridW, gridH, bbox } = terrain || {};
  if (!gridW || !gridH || !bbox || !outline?.length) return terrain;
  const inside = outlineMask(outline, bbox, gridW, gridH, { nodes: true });
  const old = terrain.noDataMask ? (typeof terrain.noDataMask === "string" ? b64ToBytes(terrain.noDataMask) : terrain.noDataMask) : null;
  const bits = new Uint8Array(Math.ceil((gridW * gridH) / 8));
  if (old) bits.set(old.subarray(0, bits.length));
  let out = 0;
  for (let i = 0; i < inside.length; i++) if (!inside[i]) { bits[i >> 3] |= 1 << (i & 7); out++; }
  return out ? { ...terrain, noDataMask: bytesToB64(bits), clippedNodes: out } : terrain;
}
// an image's RGBA clipped to an outline: the pixels outside it transparent (in place). -> how many were cleared
export function clipRgbaToOutline(rgba, outline, box, w, h) {
  const inside = outlineMask(outline, box, w, h);
  let out = 0;
  for (let i = 0; i < inside.length; i++) if (!inside[i]) { rgba[i * 4 + 3] = 0; out++; }
  return out;
}

// a lon / lat box grown by m metres on every side (the Margin box: degrees at the box's middle latitude, as areaSizeText measures)
export function growLonLat([lonMin, latMin, lonMax, latMax], m) {
  const d = Math.max(0, Number(m) || 0), dLat = d / 110574, dLon = d / (111320 * Math.cos((((latMin + latMax) / 2) * Math.PI) / 180));
  return [lonMin - dLon, latMin - dLat, lonMax + dLon, latMax + dLat];
}
// an option's box with this margin: a boundary or claim grows from its own extent; any other area is as it is
export const optionBox = (o, marginM) => (o?.coreLonLat ? growLonLat(o.coreLonLat, marginM) : o?.bboxLonLat || null);

// the choice a fetch used last on this computer (a preference, as the satellite level is), per fetch: macrostrat | terrain | satellite | spectral | web
const KEY = (fetch) => `geostrix.fetchArea.${fetch}`;
export function rememberedFetchArea(storage, fetch) { try { return storage?.getItem(KEY(fetch)) || null; } catch { return null; } }
export function rememberFetchArea(storage, fetch, id) { try { if (id) storage?.setItem(KEY(fetch), id); } catch { /* private window: session only */ } }
// the margin a fetch used last (metres, 0 allowed), else FETCH_AREA_MARGIN_M
const MKEY = (fetch) => `geostrix.fetchAreaMargin.${fetch}`;
export function rememberedFetchMargin(storage, fetch) { try { const v = Number(storage?.getItem(MKEY(fetch))); return storage?.getItem(MKEY(fetch)) != null && Number.isFinite(v) && v >= 0 ? v : FETCH_AREA_MARGIN_M; } catch { return FETCH_AREA_MARGIN_M; } }
export function rememberFetchMargin(storage, fetch, m) { try { if (Number.isFinite(m) && m >= 0) storage?.setItem(MKEY(fetch), String(m)); } catch { /* private window: session only */ } }
// the option to start on: the one used last when the project still has it, else the first
export const startingOption = (options, rememberedId) => (options || []).find((o) => o.id === rememberedId) || (options || [])[0] || null;
