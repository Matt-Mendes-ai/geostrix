// TASKS.csv #1856 / #1823 (review #1646, Kodiak) — where a flat raster or map layer is placed when there is no terrain. With no collars
// every raster landed at 0 m (about 1,500 m under Kodiak's ground, 800 m below its IP model) and a map layer at the median rock-chip
// elevation, a property-wide figure that put the polygons 160-320 m inside the IP block. Now: the median collar elevation; else the top
// of the block models under the layer (the highest ground cell there, so the map lies on the model, not inside it); else the median
// surface-sample elevation; else 0. The source is returned so the import notice can name it.
import { modelAirValue } from "./surfacePlan.js";
import { t as tr } from "./i18n.js";
import { median } from "./arrayStats.js";

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
export function rasterDrapeElevation({ collars = [], voxelModels = [], surfaceSamples = [], bbox = null, rasters = [], fileName = null } = {}) {
  const base = defaultDrapeElevation({ collars, voxelModels, surfaceSamples, bbox });
  const depth = depthFromName(fileName);
  let out;
  if (depth != null && base.source !== "none") out = { z: base.z - depth, source: "depth", depth, groundZ: base.z, groundSource: base.source };
  else if (base.source === "collars") {
    const under = (collars || []).filter((c) => Number.isFinite(c.z) && inBox(c, bbox));
    const zs = (under.length ? under : collars.filter((c) => Number.isFinite(c.z))).map((c) => c.z);
    const top = Math.max(...zs);
    out = { z: top + ABOVE_COLLARS_M, source: "collars", above: ABOVE_COLLARS_M, topCollarZ: top };
  } else out = { ...base };
  // stacked above a raster already at that level
  const levels = (rasters || []).map((r) => r.elevation).filter(Number.isFinite);
  let stacked = 0;
  for (let guard = 0; guard < 50; guard++) {
    const near = levels.filter((e) => Math.abs(e - out.z) < 2);
    if (!near.length) break;
    out.z = Math.max(out.z, ...near) + STACK_STEP_M; stacked++;
  }
  if (stacked) out.stacked = stacked;
  return out;
}

// What the import notice says about it
export function drapeElevationNote(d) {
  const z = Math.round(d.z).toLocaleString();
  const stacked = d.stacked ? " " + tr("It sits {m} m above the raster(s) imported before, so they do not overlap.", { m: d.stacked * STACK_STEP_M }) : ""; // #1505
  if (d.source === "depth") return tr("Placed flat at {z} m: {depth} m below the ground level ({ground} m), as the file name's depth says; change Elev. on its card.", { z, depth: d.depth, ground: Math.round(d.groundZ).toLocaleString() }) + stacked;
  if (d.source === "collars" && d.above) return tr("Placed flat at {z} m, {m} m above the highest collar under it, so no hole top is hidden; change Elev. on its card.", { z, m: d.above }) + stacked;
  if (d.source === "collars") return tr("Placed flat at {z} m, the median collar elevation; change Elev. on its card.", { z });
  if (d.source === "model") return tr("Placed flat at {z} m, the top of the block model \"{model}\" there; change Elev. on its card.", { z, model: d.model });
  if (d.source === "samples") return tr("Placed flat at {z} m, the median surface-sample elevation; change Elev. on its card.", { z });
  return tr("Placed flat at 0 m: nothing in the project gives a ground level yet; change Elev. on its card.");
}
