// TASKS.csv #4006 — the Faults pane's evidence, placed in the world: oriented fault picks and logged fault intervals on the hole traces
// (their desurveyed paths), outcrop faults and mapped / drawn lines at the terrain, section fault strings as drawn; then the pure items
// (lib/faultEvidence.js). Also the extent of a built fault: the ellipse around its evidence, or the side of another fault the evidence is on.
// Loaded with the Faults pane.
import { findOnTraceWorld, traceOfHole } from "../../lib/viewer/modelHelpers.js";
import { terrainGroundAt } from "../../lib/viewer/geomath.js";
import { faultLikeName } from "../../lib/layers.js";
import { evidenceItems, faultEllipse, inEllipse } from "../../lib/faultEvidence.js";
import { mappedFaultFeatures, drawnFaultLines } from "../../lib/faultInventory.js";
import { buildMeshQuery, closestPointOnMesh } from "../../lib/meshQuery.js";
import { orientedFault } from "../../lib/explicitTrim.js";

// a depth on a hole, in world coordinates; null off the hole (no clamping to its ends)
function onHole(traces, holeId, md) {
  const t = traceOfHole(traces, holeId);
  const pts = t?.pts;
  if (!pts?.length || !Number.isFinite(md) || md < pts[0].md - 0.5 || md > pts[pts.length - 1].md + 0.5) return null;
  const w = findOnTraceWorld(t, md);
  return w && w.every(Number.isFinite) ? w : null;
}

// -> the evidence items (world coordinates)
export function gatherFaultEvidence({ traces = [], layers = {}, surfaceStructures = [], mapLayers = [], sections = [], terrain = null, userDip = {} } = {}) {
  const ground = (x, y) => (terrain ? terrainGroundAt(terrain, x, y) : NaN);
  const picks = [];
  for (const s of layers.structure || []) {
    if (!Number.isFinite(s.dip) || !Number.isFinite(s.azimuth) || !faultLikeName(`${s.value} ${s.structure_id || ""}`)) continue;
    const w = onHole(traces, s.hole_id, s.depth);
    if (w) picks.push({ x: w[0], y: w[1], z: w[2], dip: s.dip, azimuth: s.azimuth, type: String(s.value), id: s.structure_id || "", hole_id: s.hole_id, depth: s.depth });
  }
  const intervals = [];
  for (const [key, rows] of Object.entries(layers || {})) {
    if (key === "structure" || !Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || r.from == null || r.to == null) continue;
      const a = onHole(traces, r.hole_id, r.from), b = onHole(traces, r.hole_id, r.to);
      if (a && b) intervals.push({ code: r.value, x0: a[0], y0: a[1], z0: a[2], x1: b[0], y1: b[1], z1: b[2], hole_id: r.hole_id, from: r.from, to: r.to });
    }
  }
  const outcrop = [];
  for (const set of surfaceStructures || []) for (const r of set.rows || []) if (r.cls === "fault") outcrop.push({ x: r.x, y: r.y, z: Number.isFinite(r.z) ? r.z : ground(r.x, r.y), dip: r.dip, dipDir: r.dipDir });
  const strings = [];
  for (const s of sections || []) for (const c of s.contacts || []) if (c.kind === "fault") strings.push({ id: c.id, unit: c.unit, points: c.points || [], section: s.id });
  return evidenceItems({ picks, intervals, outcrop, mapped: mappedFaultFeatures(mapLayers), drawn: drawnFaultLines(mapLayers), strings, ground, userDip });
}

// the part of a fault surface to keep, as a test on a WORLD point: "finite" -> inside the ellipse around the evidence plus `marginM`;
// "until" -> on the side of another fault (world positions / indices) where the evidence's centre is. null: through the model box.
// the deepest point a fault with no hole evidence should reach, for the model box only (never sent to the solver): the down-dip end of its
// ellipse (at least half its length along strike). From map traces alone the box would hold only the ground's relief, and the fault would
// stop a few hundred metres down. -> world {x,y,z} or null
export function downDipReach(points, plane, marginM = 0) {
  const e = faultEllipse(points, plane, marginM);
  if (!e) return null;
  const at = (s) => ({ x: e.c.x + s * e.v[0] * e.b, y: e.c.y + s * e.v[1] * e.b, z: e.c.z + s * e.v[2] * e.b });
  const a = at(1), b = at(-1);
  return a.z <= b.z ? a : b;
}

export function keepInsideWorld({ extent, points, plane, marginM = 200, other = null }) {
  if (extent === "finite") {
    const e = faultEllipse(points, plane, marginM);
    return e ? (p) => inEllipse(e, p) : null;
  }
  if (extent === "until" && other?.positions?.length && other?.indices?.length && plane?.centroid) {
    const o = orientedFault({ positions: other.positions, indices: other.indices });
    const q = buildMeshQuery(o.positions, o.indices);
    const side = (p) => {
      const near = closestPointOnMesh(q, p);
      if (!near) return 0;
      const t = near.triangle * 3, P = o.positions, I = o.indices, a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      return Math.sign((p.x - near.point.x) * n[0] + (p.y - near.point.y) * n[1] + (p.z - near.point.z) * n[2]);
    };
    const own = side(plane.centroid);
    return own ? (p) => side(p) !== -own : null; // on the fault itself (0) counts as kept
  }
  return null;
}
