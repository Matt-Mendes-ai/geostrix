// TASKS.csv #4103 — a vein or dyke from a LINE traced over the relief (lib/traceFit.js), in the Vein / dyke pane: the fitted plane, or an order 2 / 3 surface, as ONE surface cut to the evidence
// plus a margin (a vein does not run through the whole model box). A line has no thickness: what is built is the vein's surface, not a body, and the result says so. React-free.
import { faultBox, faultPlaneMeshes, polynomialSurfaceMesh } from "./faultGather.js";
import { fitTraceSurface } from "../../lib/traceFit.js";
import { terrainGroundAt } from "../../lib/viewer/geomath.js";
import { colorForStructure } from "../../lib/layers.js";

export const VEIN_MARGIN_M = 150; // the surface reaches this far past the line, along it and down dip

// res: traceFit.tracedEvidence's result for the chosen line; addSurface(mesh) -> the new surface's id. -> { ok, why?, id, dip, dipDir, order, fit, source }
export function buildVeinFromLine({ res, line, order = 1, terrain = null, traces = [], addSurface, now = Date.now() }) {
  if (!res?.ok) return { ok: false, why: "no-fit" };
  const it = res.item, ground = terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null, box = faultBox({ traces, points: it.points });
  let mesh = null, dip = Math.round(res.fit.dip), dipDir = Math.round(res.fit.dipDir), fit, shape = "planar", used = 1;
  const surf = order > 1 ? fitTraceSurface(it.points, order, { vertices: res.fit.vertices }) : null;
  if (surf?.ok) {
    mesh = polynomialSurfaceMesh({ surface: surf, points: it.points, extent: "finite", marginM: VEIN_MARGIN_M, box, ground });
    const c = surf.centre, mid = surf.normalAt(c.x, c.y, c.z);
    dip = Math.round(mid.dip); dipDir = Math.round(mid.dipDir); fit = { rms: surf.rms, worst: surf.worst, points: surf.n }; shape = "curved"; used = order;
  } else {
    const spec = { points: it.points, orientations: it.orientations };
    const r = faultPlaneMeshes({ spec, extent: "finite", marginM: VEIN_MARGIN_M, box, ground, gapM: 1e6 }); // one sheet: a line's own points are one plane
    const sheet = r.ok ? r.sheets[0] : null;
    if (sheet) { mesh = { positions: sheet.positions, indices: sheet.indices }; fit = { rms: sheet.fit.typicalMissM, worst: sheet.fit.worstMissM, points: sheet.fit.points }; dip = Math.round(sheet.dip); dipDir = Math.round(sheet.dipDir); }
  }
  if (!mesh?.indices.length) return { ok: false, why: "empty" };
  const source = res.fit.usedMapDip ? (res.fit.mapSource === "map" ? "the line's attributes" : "the default dip") : "fitted to the line";
  const id = addSurface?.({
    name: `Vein: ${line.name}`, positions: mesh.positions, indices: mesh.indices, color: colorForStructure("VEIN"), opacity: 0.7, type: "vein",
    params: {
      tool: "vein/dyke from a traced line", target: line.name, generatedAt: now, intercepts: null, trueThicknessMeanM: null, trueThicknessMinM: null, trueThicknessMaxM: null,
      dip, dipDir, shape, attitudeSource: source, contactResidualRmsM: fit ? Math.round(fit.rms * 100) / 100 : null,
      tracedLine: { points: it.points.length, vertices: res.fit.vertices, heights: res.fit.source, order: used, wellConstrained: res.fit.wellConstrained, problems: res.fit.problems },
      inputs: { points: it.points.map((p) => [p.x, p.y, p.z, 0]), orientations: [] },
    },
  });
  return { ok: true, id, dip, dipDir, order: used, fit, source, shape };
}
