// TASKS.csv #1083 — the geometry and attributes behind the Shapefile / GeoPackage / DXF exports of collars, the
// survey trace and every drillhole layer, moved out of ViewerModule.jsx (was buildVectorFeatures there) so a Node test
// can check them. World coordinates throughout:
//   collars -> points; survey -> the desurveyed trace as one polyline per hole (a station table has no geometry);
//   interval layers (litho / alt / vein / geotech ...) -> 2-vertex polylines from their from / to depths;
//   point layers (mnlgy / magsusc) -> a point at the interval's mid depth; structure planes -> a point at their depth;
//   point3d layers (geophys_pts) -> their own x / y / z.
// traces: [{ hole_id, pts: [{ md }], wx, wy, wz }] (the viewer's tracesRef: world arrays beside the depth list).
import { LAYER_META } from "../layers.js";
import { findOnTraceWorld } from "./modelHelpers.js";
import { structureGisAttributes } from "../structureAttrs.js"; // TASKS.csv #1067
import { trueNorthBearingInGridDeg } from "../inversion.js"; // TASKS.csv #577

// a row's own fields, without the app's internal "_" bookkeeping
export function stripInternalFields(r) { return Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_"))); }

const COLLAR_CORE_KEYS = new Set(["hole_id", "x", "y", "z", "azimuth", "dip", "length"]);

export function buildVectorFeatures(kind, key, { collars = [], traces = [], layers = {}, epsg = null } = {}) {
  if (kind === "collars") {
    return {
      features: collars.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y)).map((c) => ({
        geometry: [[c.x, c.y, c.z ?? 0]],
        // TASKS.csv #190/#191 — c.dip is stored positive-below-horizontal (commitImportData's flipDip); written out
        // negative-down, like every user-facing file in the app, so a re-import through the default "neg_down"
        // convention does not flip it a second time.
        // TASKS.csv #577 — stored azimuths are GRID bearings (project CRS); the field name says so, with the true-north
        // bearing beside it (grid = true + convergence), so QGIS / a re-import can't take one for the other
        attributes: { hole_id: c.hole_id, azim_grid: c.azimuth ?? null, azim_true: Number.isFinite(c.azimuth) && epsg ? (() => { const cv = trueNorthBearingInGridDeg(c.x, c.y, epsg); return Number.isFinite(cv) ? +((((c.azimuth - cv) % 360) + 360) % 360).toFixed(2) : null; })() : null, dip: Number.isFinite(c.dip) ? -c.dip : null, length: c.length ?? null,
          ...Object.fromEntries(Object.entries(c).filter(([k, v]) => !k.startsWith("_") && !COLLAR_CORE_KEYS.has(k) && v !== undefined)) }, // #1034 — custom collar fields (year, target, status ...)
      })),
      geomType: "point",
    };
  }
  if (kind === "survey") {
    return {
      features: traces.filter((t) => t.pts.length > 1).map((t) => ({
        geometry: t.pts.map((p, i) => [t.wx[i], t.wy[i], t.wz[i]]),
        attributes: { hole_id: t.hole_id },
      })),
      geomType: "polyline",
    };
  }
  const meta = LAYER_META[key];
  const rows = layers[key] || [];
  if (!meta) return { features: [], geomType: "point" };
  if (meta.kind === "point3d") {
    return {
      features: rows.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y)).map((r) => ({ geometry: [[r.x, r.y, r.z ?? 0]], attributes: stripInternalFields(r) })),
      geomType: "point",
    };
  }
  const traceByHole = Object.fromEntries(traces.map((t) => [t.hole_id, t]));
  if (meta.kind === "interval") {
    const features = [];
    rows.forEach((r) => {
      const t = traceByHole[r.hole_id]; if (!t) return;
      const p1 = findOnTraceWorld(t, r.from), p2 = findOnTraceWorld(t, r.to);
      if (!p1 || !p2) return;
      features.push({ geometry: [p1, p2], attributes: stripInternalFields(r) });
    });
    return { features, geomType: "polyline" };
  }
  if (meta.kind === "point" || meta.kind === "plane") {
    const features = [];
    rows.forEach((r) => {
      const t = traceByHole[r.hole_id]; if (!t) return;
      const md = meta.kind === "plane" ? r.depth : (r.from + r.to) / 2;
      const p = findOnTraceWorld(t, md);
      if (!p) return;
      // #1067 — a structure plane: type, dip, dipdir_grid / dipdir_true, strike_rhr (was a bare "azimuth")
      features.push({ geometry: [p], attributes: key === "structure" ? structureGisAttributes(r, epsg ? trueNorthBearingInGridDeg(p[0], p[1], epsg) : null) : stripInternalFields(r) });
    });
    return { features, geomType: "point" };
  }
  return { features: [], geomType: "point" };
}
