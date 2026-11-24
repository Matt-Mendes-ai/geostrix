// TASKS.csv #4053 (AI app access batch 4) — the Faults pane's sheeted-planes build (#4013) as a function, so the pane's Build button and an AI app's build_fault run the SAME
// code: each fault of the pane (its evidence items and the spec read from them) becomes flat parallel sheets through the model box / a finite ellipse / up to another fault,
// each sheet a surface of its own with what it was built from and its fit. Moved out of FaultBuilder.jsx unchanged (planeOf and the body of buildPlanes); nothing is solved
// (no sidecar), so it answers at once. React-free.
import { t as tr } from "../../lib/i18n.js";
import { faultBox, downDipReach, faultPlaneMeshes } from "./faultGather.js";
import { normalOf } from "../../lib/sheetedPlanes.js";
import { terrainGroundAt } from "../../lib/viewer/geomath.js";
import { colorForStructure } from "../../lib/layers.js";

const rad = (d) => (d * Math.PI) / 180;

// the plane of a fault for its extent, through the points' centre: the mean of its measured orientations when it has any (points from a
// map trace lie along the ground, and a plane fitted through them follows the topography, not the fault), else the plane fitted through them
// the pane's own scale for a fit: its Check counts the points a built fault misses by more than this many metres (the default of 'Check: points missed by more than'); an AI app's build_fault says a sheet fits badly on the same scale
export const FAULT_CHECK_M = 10;

export function planeOf(spec) {
  const os = spec.orientations || [];
  if (!os.length && spec.plane && !spec.plane.flat) return spec.plane;
  const pts = spec.points, n = pts.length || 1;
  const c = pts.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 });
  const m = os.reduce((a, q) => [a[0] + Math.sin(rad(q.dip)) * Math.sin(rad(q.azimuth)), a[1] + Math.sin(rad(q.dip)) * Math.cos(rad(q.azimuth)), a[2] + Math.cos(rad(q.dip))], [0, 0, 0]);
  const l = Math.hypot(m[0], m[1], m[2]) || 1; // upward normals, so they add without cancelling
  return { centroid: c, normal: [m[0] / l, m[1] / l, m[2] / l] };
}

// faults: [{ i, name, items, spec }] (the pane's own); dips: fault index -> { dip, dipDir } (a fault with no orientation); other: { positions, indices, name } | null (extent "until")
// addSurface(mesh) -> the new surface's id. msgs: the pane's verdict lines (pushed to). -> { made: [{ id, name, fault, sheet, sheets, dip, dipDir, fit, folded }] }
export function buildFaultPlanes({ faults, extent, marginM, gapM, other = null, dips = {}, terrain = null, traces = [], addSurface, msgs = [] }) {
  const made = [];
  if (extent === "until" && !other) return { made };
  const ok = faults.filter((f) => f.spec?.ok), ground = terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null;
  const extra = ok.filter((f) => !f.items.some((it) => it.holes)).map((f) => downDipReach(f.spec.points, planeOf(f.spec), extent === "finite" ? marginM : 0)).filter(Boolean);
  const box = faultBox({ traces, points: ok.flatMap((f) => f.spec.points), extra });
  for (const f of faults) {
    if (!f.spec) continue;
    if (!f.spec.ok) { msgs.push(f.spec.why === "no-orientation" ? tr("{name}: points on one line; give a dip.", { name: f.name }) : tr("{name}: no evidence placed.", { name: f.name })); continue; }
    const d = dips[f.i], given = f.spec.said.some((x) => x.key === "user-dip") && Number.isFinite(d?.dip) && Number.isFinite(d?.dipDir) ? normalOf(d.dip, d.dipDir) : null;
    const res = faultPlaneMeshes({ spec: f.spec, extent, marginM, other: other ? { positions: other.vertices || other.positions, indices: other.indices } : null, box, ground, gapM, normal: given });
    if (!res.ok || !res.sheets.length) { msgs.push(tr("{name}: nothing inside its extent.", { name: f.name })); continue; }
    const kinds = {}; for (const it of f.items) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
    const n = res.sheets.length;
    res.sheets.forEach((s, k) => {
      const name = n > 1 ? `Fault: ${f.name} · sheet ${k + 1}` : `Fault: ${f.name}`; // project data: English
      const id = addSurface?.({
        name, positions: s.positions, indices: s.indices, color: colorForStructure("FLT"), opacity: 0.7, type: "fault",
        params: {
          tool: "Faults pane: sheeted planes", contactFit: s.fit, inputs: s.inputs,
          faultEvidence: { kinds, items: f.items.map((it) => it.name).slice(0, 30), extent, ...(extent === "finite" ? { marginM } : {}), ...(other ? { endsAt: other.name } : {}), guess: f.spec.guess, shape: "planes", sheet: k + 1, sheets: n, dip: Math.round(s.dip), dipDir: Math.round(s.dipDir), ...(s.fold.folded ? { folded: true } : {}) },
        },
      });
      made.push({ id, name, fault: f.name, sheet: k + 1, sheets: n, dip: Math.round(s.dip), dipDir: Math.round(s.dipDir), fit: s.fit || null, folded: !!s.fold.folded, guess: !!f.spec.guess });
      if (s.fold.folded) msgs.push(tr("{name} reads as folded: try One curved surface.", { name }));
    });
    if (res.unassigned) msgs.push(res.unassigned === 1 ? tr("{name}: 1 point on no sheet, left out.", { name: f.name }) : tr("{name}: {n} points on no sheet, left out.", { name: f.name, n: res.unassigned }));
  }
  return { made };
}
