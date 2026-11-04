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

// What the import notice says about it
export function drapeElevationNote(d) {
  const z = Math.round(d.z).toLocaleString();
  if (d.source === "collars") return tr("Placed flat at {z} m, the median collar elevation; change Elev. on its card.", { z });
  if (d.source === "model") return tr("Placed flat at {z} m, the top of the block model \"{model}\" there; change Elev. on its card.", { z, model: d.model });
  if (d.source === "samples") return tr("Placed flat at {z} m, the median surface-sample elevation; change Elev. on its card.", { z });
  return tr("Placed flat at 0 m: nothing in the project gives a ground level yet; change Elev. on its card.");
}
