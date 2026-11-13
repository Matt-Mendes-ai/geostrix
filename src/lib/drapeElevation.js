// TASKS.csv #1856 / #1823 (review #1646, Kodiak) — where a flat raster or map layer is placed when there is no terrain. With no collars
// every raster landed at 0 m (about 1,500 m under Kodiak's ground, 800 m below its IP model) and a map layer at the median rock-chip
// elevation, a property-wide figure that put the polygons 160-320 m inside the IP block. Now: the median collar elevation; else the top
// of the block models under the layer (the highest ground cell there, so the map lies on the model, not inside it); else the median
// surface-sample elevation; else 0. The source is returned so the import notice can name it.
import { modelAirValue } from "./surfacePlan.js";
import { t as tr } from "./i18n.js";
import { median, arrMax /* #3031 */ } from "./arrayStats.js";
import { collarsLookUnderground } from "./pitShell.js"; // TASKS.csv #2269
import { farFromCollars, farNote, boxesOverlap } from "./landingCheck.js"; // TASKS.csv #2590 / #2125

const medianOf = (zs) => { const z = zs.filter(Number.isFinite); return z.length ? median(z) : null; }; // #1114 — the shared median
const meets = (c, b) => !b || (c.x + (c.dx || 0) / 2 >= b[0] && c.x - (c.dx || 0) / 2 <= b[2] && c.y + (c.dy || 0) / 2 >= b[1] && c.y - (c.dy || 0) / 2 <= b[3]);

// The top face of the highest ground (valued, not air) cell of the models, within bbox [xmin, ymin, xmax, ymax] when given, or null
export function modelsTopElevation(voxelModels, bbox = null) {
  let top = -Infinity, name = null;
  for (const m of voxelModels || []) {
    const air = modelAirValue(m);
    for (const c of m.cells || []) {
      if (!Number.isFinite(c.value) || c.value === air || !meets(c, bbox)) continue;
      const t = c.z + (c.dz || 0) / 2;
      if (t > top) { top = t; name = m.name; }
    }
  }
  return Number.isFinite(top) ? { z: top, name } : null;
}

// -> { z, source: "collars" | "model" | "samples" | "none", model? }
export function defaultDrapeElevation({ collars = [], voxelModels = [], surfaceSamples = [], bbox = null } = {}) {
  const c = medianOf((collars || []).map((r) => r.z));
  if (c != null) return { z: c, source: "collars" };
  const m = modelsTopElevation(voxelModels, bbox);
  if (m) return { z: m.z, source: "model", model: m.name };
  const s = medianOf((surfaceSamples || []).map((r) => r.z));
  if (s != null) return { z: s, source: "samples" };
  return { z: 0, source: "none" };
}

// TASKS.csv #2269 (review #2174, WA lode gold) — where a map DRAWN with no terrain lies. The clicks fell on the scene's origin plane
// (205 m RL there, half-way down holes drilled from underground) and the layer took that. The highest collar on a project drilled from
// underground (the nearest the surface the data knows), else the map-layer rule above. -> { z, source }
export function planElevation({ collars = [], survey = [], voxelModels = [], surfaceSamples = [], bbox = null } = {}) {
  const zs = (collars || []).map((c) => c?.z).filter(Number.isFinite);
  if (zs.length > 1 && collarsLookUnderground(collars, survey).underground) return { z: arrMax(zs), source: "highest-collar" }; // arrMax: #3031 (every collar)
  return defaultDrapeElevation({ collars, voxelModels, surfaceSamples, bbox });
}
export function planElevationText(d) {
  const z = Math.round(d.z).toLocaleString();
  if (d.source === "highest-collar") return tr("No terrain: drawn flat at {z} m RL, the highest collar (the collars look underground). Change Elev. on the layer's card, or load a terrain to drape it.", { z });
  if (d.source === "collars") return tr("No terrain: drawn flat at {z} m RL, the median collar elevation. Change Elev. on the layer's card, or load a terrain to drape it.", { z });
  if (d.source === "model") return tr("No terrain: drawn flat at {z} m RL, the top of the block model. Change Elev. on the layer's card, or load a terrain to drape it.", { z });
  if (d.source === "samples") return tr("No terrain: drawn flat at {z} m RL, the median surface-sample elevation. Change Elev. on the layer's card, or load a terrain to drape it.", { z });
  return tr("No terrain: drawn flat at {z} m RL. Change Elev. on the layer's card, or load a terrain to drape it.", { z });
}

// TASKS.csv #1505 (review #1497, Lawyers) — where a NEW RASTER goes. Three grids all landed at the median collar elevation: they
// z-fought, and the opaque sheet cut through 141 of 446 holes whose collars were higher; a 'Depth-100m' MVI slice sat at
// surface level. Now: a depth read from the file name ('Depth-100m', 'depthslice-20m', '100m_depth') puts the slice that far
// below the ground level; a surface grid goes 5 m ABOVE the highest collar under it (no hole top hidden); and a raster that
// would land within 2 m of one already there is stacked 5 m above it. The map-layer / sample-grid rule (defaultDrapeElevation)
// is unchanged.
export const ABOVE_COLLARS_M = 5, STACK_STEP_M = 5;
export function depthFromName(name) {
  const s = String(name ?? "");
  const m = /depth[\s_-]*slice[\s_-]*(\d+(?:\.\d+)?)\s*m|depth[\s_-]*(\d+(?:\.\d+)?)\s*m|(\d+(?:\.\d+)?)\s*m[\s_-]*depth|slice[\s_-]*(\d+(?:\.\d+)?)\s*m/i.exec(s);
  if (!m) return null;
  const d = Number(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return Number.isFinite(d) && d > 0 ? d : null;
}
const inBox = (c, b) => !b || (Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= b[0] && c.x <= b[2] && c.y >= b[1] && c.y <= b[3]);
// TASKS.csv #2868 (review GSC geophysics) — with nothing else giving a ground level, the survey stations' median elevation (those under the
// raster when there are any): a published Bouguer grid went to 0 m beside its own stations' IDW grid at 270 m (#2239's rule for the IDW grid)
export function stationsElevation(stations, bbox = null) {
  const pts = (stations || []).filter((r) => Number.isFinite(r?.z) && Number.isFinite(r?.x) && Number.isFinite(r?.y));
  if (!pts.length) return null;
  const under = bbox ? pts.filter((r) => inBox(r, bbox)) : [];
  return { z: median((under.length ? under : pts).map((r) => r.z)), source: "stations", n: (under.length ? under : pts).length };
}
export function rasterDrapeElevation({ collars = [], voxelModels = [], surfaceSamples = [], bbox = null, rasters = [], fileName = null, stations = [] } = {}) {
  let base = defaultDrapeElevation({ collars, voxelModels, surfaceSamples, bbox });
  if (base.source === "none") base = stationsElevation(stations, bbox) || base; // #2868
  const depth = depthFromName(fileName);
  let out;
  if (depth != null && base.source !== "none") out = { z: base.z - depth, source: "depth", depth, groundZ: base.z, groundSource: base.source };
  else if (base.source === "collars") {
    const under = (collars || []).filter((c) => Number.isFinite(c.z) && inBox(c, bbox));
    const zs = (under.length ? under : collars.filter((c) => Number.isFinite(c.z))).map((c) => c.z);
    const top = arrMax(zs); // #3031
    out = { z: top + ABOVE_COLLARS_M, source: "collars", above: ABOVE_COLLARS_M, topCollarZ: top, ...(under.length ? {} : { noneUnder: true }) }; // noneUnder: #2125 — no collar under it
  } else out = { ...base };
  // stacked above a raster already at that level — TASKS.csv #2590: only one whose footprint overlaps this one (a picture 6,240 km away
  // pushed the next GeoTIFF 10 m up)
  const levels = (rasters || []).filter((r) => !bbox || !Array.isArray(r.bbox) || boxesOverlap(r.bbox, bbox)).map((r) => r.elevation).filter(Number.isFinite);
  let stacked = 0;
  for (let guard = 0; guard < 50; guard++) {
    const near = levels.filter((e) => Math.abs(e - out.z) < 2);
    if (!near.length) break;
    out.z = Math.max(out.z, ...near) + STACK_STEP_M; stacked++;
  }
  if (stacked) out.stacked = stacked;
  const far = farFromCollars(bbox, collars); // #2590 / #2125 — said in the note
  if (far) out.far = far;
  return out;
}

// What the import notice says about it
export function drapeElevationNote(d) {
  const z = Math.round(d.z).toLocaleString();
  const stacked = (d.stacked ? " " + tr("It sits {m} m above the raster(s) imported before, so they do not overlap.", { m: d.stacked * STACK_STEP_M }) : "") // #1505
    + (d.far ? " " + farNote(d.far) : ""); // #2590 / #2125
  if (d.source === "depth") return tr("Placed flat at {z} m: {depth} m below the ground level ({ground} m), as the file name's depth says; change Elev. on its card.", { z, depth: d.depth, ground: Math.round(d.groundZ).toLocaleString() }) + stacked;
  if (d.source === "collars" && d.above && d.noneUnder) return tr("Placed flat at {z} m, {m} m above the highest collar in the project (no collar is under it); change Elev. on its card.", { z, m: d.above }) + stacked; // #2125
  // TASKS.csv #2468 (review #2325) — 'so no hole top is hidden' is true from the side and the opposite from above, how a map is read: both said
  if (d.source === "collars" && d.above) return tr("Placed flat at {z} m, {m} m above the highest collar under it: from the side no hole top is hidden, but seen from above it covers the collars, boundaries and lines below it; lower Elev. or its opacity on its card to see them.", { z, m: d.above }) + stacked;
  if (d.source === "collars") return tr("Placed flat at {z} m, the median collar elevation; change Elev. on its card.", { z }) + stacked;
  if (d.source === "model") return tr("Placed flat at {z} m, the top of the block model \"{model}\" there; change Elev. on its card.", { z, model: d.model }) + stacked;
  if (d.source === "samples") return tr("Placed flat at {z} m, the median surface-sample elevation; change Elev. on its card.", { z }) + stacked;
  if (d.source === "stations") return tr("Placed flat at {z} m, the median elevation of the survey stations; change Elev. on its card.", { z }) + stacked; // #2868
  return tr("Placed flat at {z} m: nothing in the project gives a ground level yet; change Elev. on its card.", { z }) + stacked; // #2859 — its z (5 m, 10 m for the next ones) and why
}
