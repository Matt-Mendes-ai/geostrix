// TASKS.csv #1500 — the passes over every built member at a project open (legend colours, category filter, hidden holes) skip the
// layers they have nothing to change on: no override / filter / hidden hole now, and none applied at their last run
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("legend colours: only the layers with an override or a one-colour style now, or repainted last time", () => {
  assert.match(s, /const needs = !!layerStyles\[key\]\?\.color \|\| Object\.values\(legendOverride\[key\] \|\| \{\}\)\.some\(\(o\) => o\?\.color\), was = paintedKeysRef\.current\.has\(key\);/);
  assert.match(s, /syncLayerBatches\(keys\); \/\/ TASKS\.csv #312 — repaint the batches/);
  assert.match(s, /\}, \[effectiveColor, syncLayerBatches, layerStyles, legendOverride\]\);/);
});

test("category filter: only the layers filtered now or last time", () => {
  assert.match(s, /const keys = CATEGORY_LAYER_KEYS\.filter\(\(key\) => \{ const on = categoryFilter\[key\]\?\.size > 0, was = filteredKeysRef\.current\.has\(key\);/);
  assert.ok(s.indexOf("const filteredKeysRef = useRef(new Set());") < s.indexOf("const applyCategoryVisibility = useCallback("));
});

test("hidden holes: the pass runs when a hole is hidden now or was at the last pass", () => {
  assert.match(s, /const anyHidden = Object\.values\(visibleHoles\)\.some\(\(v\) => v === false\);\n {4}if \(!anyHidden && !holesHiddenRef\.current\) return;\n {4}holesHiddenRef\.current = anyHidden;/);
});

test("the surface-sample grouping options are not recomputed on every render of the 3D View", () => {
  const c = readFileSync(new URL("../src/components/SurfaceAnomalyControls.jsx", import.meta.url), "utf8");
  assert.ok(c.includes('const gOpts = useMemo(() => (showsGroups ? groupOptions(surfaceSamples, mapLayers) : []), [showsGroups, surfaceSamples, mapLayers]);'));
  assert.ok(!c.includes("const gOpts = groupOptions("));
});
