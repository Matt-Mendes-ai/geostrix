// TASKS.csv #2996 (review #2876, WA iron) — a pit made on a 1 km block of a 21 km field could not be found in the view: about 25 px wide, 'Fit'
// and 'Zoom to fit all' framed all 6,390 collars though 228 were checked, and the pit, design and dump rows had no zoom-to. Now: a zoom-to
// on those rows, the first pit of a model framed once, and Fit / Zoom to fit all on the shown holes when a filter hides some.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("#2996 Fit and Zoom to fit all frame the shown holes when some are hidden", () => {
  const v = read("modules/ViewerModule.jsx");
  assert.ok(v.includes("const shownTraces = () => { const v = visibleHolesRef.current, t = tracesRef.current || [], s = t.filter((x) => v?.[x.hole_id] !== false).map((x) => x.pts); return s.length && s.length < t.length ? s : null; };"));
  assert.ok(v.includes("(shownTraces() || lastTracesRef.current || []).forEach("), "Zoom to fit all");
  assert.ok(v.includes("const zoomToHoles = () => { const s = shownTraces(); if (s) fitView(s); else autoFitInitial(lastTracesRef.current, lastHoleTraceCountRef.current); };"), "Fit");
});

test("#2996 a zoom-to on the pit, design and dump rows; the first pit of a model put in view once", () => {
  const v = read("modules/ViewerModule.jsx");
  assert.ok(v.includes("const zoomToSurface = (id) => zoomToObject(implicitMeshesRef.current[id]);"));
  for (const pane of ["<PitShellPane", "<PitDesignPane", "<DumpPane"]) { const i = v.indexOf(pane); assert.ok(i > 0 && v.slice(i, i + 400).includes("onZoomTo={zoomToSurface}"), pane); }
  for (const f of ["components/PitShellPane.jsx", "components/PitDesignPane.jsx", "modules/viewer/DumpRunList.jsx"]) assert.ok(read(f).includes("onZoomTo(s.id)"), f);
  assert.ok(read("components/DumpPane.jsx").includes("onZoomTo={onZoomTo}"));
  const p = read("components/PitShellPane.jsx");
  assert.ok(p.includes("const firstOfModel = !pits.some((p) => p.params?.blockModel === model.name);"));
  assert.ok(p.includes("if (pitId && firstOfModel && onZoomTo) setTimeout(() => onZoomTo(pitId), 600);"));
});
