import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");
test("#1224 a new legend is built from the view, by the same builder the sync uses", () => {
  const s = read("src/modules/LayoutModule.jsx");
  assert.match(s, /const \{ items \} = legendFromView\(viewerUiState \|\| \{\}\);/);
  assert.match(s, /const \{ groups, items \} = legendFromView\(theme\);/);
  assert.equal(s.split("legendGroupsToItems(groups)").length - 1, 1);
  assert.match(s, /items\.length \? firstLegendGroups\(items\) : \[\["Item", "#55606e"\]\]/);
});
test("#1225 fault-like types and the rest are separate groups", () => {
  const s = read("src/modules/viewer/ModellingPanes.jsx");
  assert.match(s, /\[true, tr\("Named as faults"\)\], \[false, tr\("Other structure types"\)\]/);
  assert.match(s, /<optgroup key=\{label\} label=\{label\}>/);
});
test("#1217 Escape closes the task pane only after anything armed", () => {
  const s = read("src/modules/ViewerModule.jsx");
  const start = s.indexOf('if (e.key !== "Escape" || !visibleRef.current) return;');
  const body = s.slice(start, s.indexOf('window.addEventListener("keydown", onKey);', start));
  for (const earlier of ["[role=dialog]", "setContextMenu(null)", "setSectionMode(false)", "stopInterpret()", "setMeasureMode(null)"]) assert.ok(body.indexOf(earlier) >= 0 && body.indexOf(earlier) < body.indexOf("setToolPane(null)"), earlier);
});
test("#1202 a large model asks first; #1298 strip log codes are 10 px with a halo", () => {
  assert.match(read("src/modules/GeophysicsModule.jsx"), /blocks > 500000 && !window\.confirm\(/);
  assert.match(read("src/components/StripLog.jsx"), /fontSize="10" textAnchor="middle" fill="#1a2028" stroke="#ffffff"/);
  assert.match(read("src/lib/striplogSvg.js"), /font-size="10" fill="#1a2028" stroke="#ffffff"/);
});
test("#1224 a new legend takes whole groups that fit, always the first; a page starts with no stock legend", async () => {
  const { firstLegendGroups } = await import("../src/lib/legendGroups.js");
  const g = (name, n) => [[name, null, { heading: true }], ...Array.from({ length: n }, (_, i) => [`${name}${i}`, "#000"])];
  assert.equal(firstLegendGroups([...g("a", 3), ...g("b", 3)]).length, 8);
  assert.deepEqual(firstLegendGroups([...g("a", 20), ...g("b", 8), ...g("c", 30)]).map((x) => x[0]).filter((x) => x.length === 1), ["a", "b"]);
  assert.deepEqual(firstLegendGroups([...g("a", 50), ...g("b", 3)]).map((x) => x[0]).filter((x) => x.length === 1), ["a"]);
  assert.ok(!/\["Lithology", "#c98a5a"\]/.test(read("src/lib/projectFields.js")));
});
