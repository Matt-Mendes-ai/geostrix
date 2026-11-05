// TASKS.csv #1973 — Targeting / 3D View / Surface mapping texts match the app: voxel ranges live in Targeting > Voxel ranges,
// Slice series covers the drilling (block models only when asked or with no holes), the style button is labelled .qml, and the
// map and structure importers name every format they read
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#1973 no stale text", () => {
  const ph = read("components/PlannedHoleParts.jsx"), vm = read("modules/ViewerModule.jsx"), sm = read("components/SurfaceMappingPanel.jsx");
  assert.doesNotMatch(ph, /range above \(in \\"Geophysical voxel ranges\\"\)/);
  assert.match(ph, /range in Targeting > Voxel ranges/);
  assert.doesNotMatch(vm, /Cuts the visible voxel model\(s\)\/drilling/);
  assert.match(vm, /Also cover the visible block models\\" is ticked, or when there are no drillholes/);
  assert.doesNotMatch(sm, /Style button/);
  assert.match(sm, /MapInfo TAB \(with its \.map\/\.id\/\.dat\) or MIF \(with its \.mid\), GPX, GeoJSON or KML \/ KMZ/);
  assert.match(sm, /from a CSV or a MapInfo point table \(TAB or MIF\)/);
  for (const p of ["maps", "surface", "targeting"]) assert.doesNotMatch(read(`help/pages/${p}.js`), /Style button|range above \(in/);
});
