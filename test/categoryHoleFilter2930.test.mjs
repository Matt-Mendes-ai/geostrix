// TASKS.csv #2930 (WA iron review) — a legend category toggled while holes are unchecked showed every unchecked hole's log again: the category
// pass set .visible from the category alone. Each pass now honours the other's rule.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the category pass ANDs the hole rule (read through a ref, skipped when no hole is unchecked)", () => {
  assert.match(v, /const visibleHolesRef = useRef\(visibleHoles\); visibleHolesRef\.current = visibleHoles;/);
  assert.match(v, /const vh = visibleHolesRef\.current, anyOff = Object\.values\(vh\)\.some\(\(v\) => v === false\);/);
  assert.match(v, /child\.visible = shown != null && holeOn\(child\);/);
  assert.match(v, /child\.visible = !\(hidden && hidden\.has\(String\(child\.userData\?\.catValue\)\)\) && holeOn\(child\);/);
});

test("the hole pass re-applies the category filters after it, so its hole-only rule does not undo them", () => {
  assert.match(v, /syncLayerBatches\(\); \/\/ TASKS\.csv #312\n(\s+redeclutter\(groups\.hole_labels\); \/\/ #3098\n)?\s+applyCategoryVisibility\(\);[^\n]*\n\s+\}, \[syncLayerBatches, applyCategoryVisibility\]\);/); // #3253: the pass is applyHoleVisibility (visibleHoles read through its ref), run by an effect on visibleHoles and after each rebuild
});

test("the hole rule itself, as the category pass applies it", () => {
  const holeOnFor = (vh) => { const anyOff = Object.values(vh).some((x) => x === false); return (c) => { if (!anyOff) return true; const id = c.userData?.holeId ?? (c.userData?.tip || "").split("\n")[0]; return !(id && vh[id] === false); }; };
  const on = holeOnFor({ B: false });
  assert.equal(on({ userData: { holeId: "A" } }), true);
  assert.equal(on({ userData: { holeId: "B" } }), false);
  assert.equal(on({ userData: { tip: "B\nLithology: X" } }), false);
  assert.equal(holeOnFor({})({ userData: { holeId: "B" } }), true);
});
