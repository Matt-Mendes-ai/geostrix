// TASKS.csv #3092 / #3093 (from side 3's #3066) — the figure overlay's legend did not list the outcrop structures until the overlay was
// toggled (surfaceStructures missing from overlayLegendGroups' dependencies), and a project with outcrop structures only (no collars,
// samples or map layers) had no overlay at all.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("#3092 — the overlay legend is recomputed when the outcrop structures change", () => {
  const i = v.indexOf("const overlayLegendGroups = useMemo(");
  assert.ok(i > 0);
  const end = v.indexOf("]);", v.indexOf("}, [", i));
  const deps = v.slice(v.indexOf("}, [", i), end);
  assert.ok(v.slice(i, end).includes("outcropLegendGroup({ surfaceStructures })"), "the memo reads them");
  assert.match(deps, /\bsurfaceStructures\b/);
});

test("#3093 — the figure overlay mounts for an outcrop-only project", () => {
  assert.match(v, /\{\(!!collars\.length \|\| !!surfaceSamples\.length \|\| !!\(mapLayers \|\| \[\]\)\.length \|\| !!\(surfaceStructures \|\| \[\]\)\.length\) && \(/);
});
