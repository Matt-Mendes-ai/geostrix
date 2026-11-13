// TASKS.csv #2801 (split from #2633) — the defects meshValidate's meshDefects finds that the edge counts cannot see (#2633): bow-tie vertices,
// triangles with no area, vertices no triangle uses, vertices repeated at one place (to 1 mm: an unwelded mesh, whose seams read as open
// edges until the vertices are welded). One wording for Solid blocks from surfaces (where #2633 put it), Import solid and an expanded
// solid in Generated surfaces. d: meshDefects' (or validateSolid's) counts -> [translated phrase]
import { t as tr } from "../i18n.js";

export function defectList(d) {
  if (!d) return [];
  return [
    d.nonManifoldVertices && tr(d.nonManifoldVertices === 1 ? "{n} vertex where two parts touch at a point (a bow-tie)" : "{n} vertices where two parts touch at a point (bow-ties)", { n: d.nonManifoldVertices }),
    d.degenerateTriangles && tr("{n} triangle(s) with no area", { n: d.degenerateTriangles }),
    d.isolatedVertices && tr("{n} vertex(es) no triangle uses", { n: d.isolatedVertices }),
    d.coincidentVertices && tr("{n} vertex(es) repeated at the same place: weld them (to 1 mm) and the seams they open close", { n: d.coincidentVertices }),
  ].filter(Boolean);
}

// a sentence for a notice or a surface's card, or "" when the mesh has none of these defects
export function defectSentence(d) {
  const list = defectList(d);
  return list.length ? tr("Checked as a solid: {list}. Its volume and the inside test can be off there.", { list: list.join("; ") }) : "";
}

// the parts of an imported solid (each with the worker's meshDefects counts) as one set of counts
export function sumDefects(parts) {
  const out = { nonManifoldVertices: 0, degenerateTriangles: 0, isolatedVertices: 0, coincidentVertices: 0 };
  for (const p of parts || []) for (const k in out) out[k] += p?.defects?.[k] || 0;
  return out;
}
