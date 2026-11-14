// TASKS.csv #2801 (split from #2633) — an imported solid was added with no word on whether it is one: meshValidate's checks (open and
// non-manifold edges, edges facing both ways, self-crossing triangles, and #2633's bow-tie vertices, zero-area triangles, unused and repeated
// vertices) were said only in Unit volumes. After an import, each part's checks in one line; repeated vertices come with 'weld them'. Loaded
// on demand (ViewerModule's import), never at startup.
import { validateSolid } from "./meshValidate.js";
import { t as tr } from "./i18n.js";

// a part's problems as short phrases (empty when it is a clean closed solid); v: validateSolid's result
export function solidProblems(v) {
  if (!v) return [];
  const out = [];
  if (v.openEdges) out.push(tr("open: {n} edge(s) on the border (a surface, not a closed solid)", { n: v.openEdges.toLocaleString() }));
  if (v.nonManifoldEdges) out.push(tr("{n} edge(s) shared by more than two triangles", { n: v.nonManifoldEdges.toLocaleString() }));
  if (v.windingConflicts) out.push(tr("{n} edge(s) whose triangles face opposite ways", { n: v.windingConflicts.toLocaleString() }));
  if (v.selfIntersectingPairs) out.push(tr("{n} pair(s) of triangles crossing each other", { n: v.selfIntersectingPairs.toLocaleString() }));
  if (v.nonManifoldVertices) out.push(tr("{n} vertex(es) where two parts touch at a point (bow-ties)", { n: v.nonManifoldVertices.toLocaleString() }));
  if (v.degenerateTriangles) out.push(tr("{n} triangle(s) with no area", { n: v.degenerateTriangles.toLocaleString() }));
  if (v.isolatedVertices) out.push(tr("{n} vertex(es) no triangle uses", { n: v.isolatedVertices.toLocaleString() }));
  if (v.coincidentVertices) out.push(tr("{n} vertex(es) repeated at the same place (weld them in the program that made the file)", { n: v.coincidentVertices.toLocaleString() }));
  return out;
}

// parts: [{ positions, indices }], nameOf(k) -> the part's name; maxTriangles: larger parts are named as not checked (the check runs here)
export function solidCheckNote(parts, nameOf = () => "", { maxTriangles = 300000 } = {}) {
  const lines = [], skipped = [];
  let clean = 0;
  (parts || []).forEach((p, k) => {
    const nT = ((p?.indices?.length || 0) / 3) | 0;
    if (!nT) return;
    if (nT > maxTriangles) { skipped.push(nameOf(k)); return; }
    const probs = solidProblems(validateSolid(p.positions, p.indices));
    if (probs.length) lines.push(tr("{name}: {list}.", { name: nameOf(k), list: probs.join("; ") }));
    else clean++;
  });
  if (!lines.length && !skipped.length) return clean ? tr("Checked as solids: {n} closed, without bow-ties, zero-area triangles or repeated vertices.", { n: clean }) : "";
  return [
    lines.length ? tr("Checked as solids: {lines} Volumes and the inside test can be off where a solid is open or broken.", { lines: lines.join(" ") }) : "",
    clean ? tr("{n} part(s) are clean closed solids.", { n: clean }) : "",
    skipped.length ? tr("Not checked (over {max} triangles): {names}.", { max: maxTriangles.toLocaleString(), names: skipped.join(", ") }) : "",
  ].filter(Boolean).join(" ");
}
