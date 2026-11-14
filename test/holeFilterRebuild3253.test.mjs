// TASKS.csv #3253 (Galore review, a follow-up of #2930) — the checked holes were applied only when the checks changed: a rebuild afterwards (the
// drillhole build on a Desurvey switch, Refresh view or an import; the assay markers on an element chip; the hole labels on their mode) drew
// the unchecked holes again while the list still said '16 of 70 checked'. The hole pass is one function, run on a check change AND at the end
// of each of those rebuilds.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const d = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");

test("the hole pass is a function reading the checks through the ref, still run when the checks change", () => {
  assert.match(v, /const applyHoleVisibility = useCallback\(\(\) => \{\r?\n\s+const groups = layerGroupsRef\.current, visibleHoles = visibleHolesRef\.current;/);
  assert.match(v, /useEffect\(\(\) => \{ applyHoleVisibility\(\); \}, \[visibleHoles, applyHoleVisibility\]\);/);
  const body = v.slice(v.indexOf("const applyHoleVisibility = useCallback"), v.indexOf("const applyHoleVisibilityRef"));
  assert.match(body, /applyCategoryVisibility\(\); \/\/ #2930/, "the category filters on top, as before");
});

test("each rebuild ends with it: the drillhole build, the assay markers, the hole labels", () => {
  assert.match(d, /\(applyHoleVisibilityRef\?\.current \|\| applyCategoryVisibility\)\(\);/);
  assert.match(v, /buildDrillholeScene\(\{ applyCategoryVisibility, applyHoleVisibilityRef \/\* #3253 \*\//);
  assert.match(v, /setAssayLod\(g, assayKeptRef\.current, g\.userData\.lodOn\); \/\/ #3144 — new elements too\r?\n\s+applyHoleVisibilityRef\.current\?\.\(\);/);
  assert.match(v, /syncHoleLabels\(layerGroupsRef\.current\?\.hole_labels, holeLabelAnchorsRef\.current, holeLabelMode, makeTextSprite\); applyHoleVisibilityRef\.current\?\.\(\);/);
});
