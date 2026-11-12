// TASKS.csv #2705 (#2457 (9) and (10), review #2325) — Simple mode shows the planned holes' KML / GPX on a project with a real CRS; a
// section's pierce labels are fewer (each surface's first and last crossing) and shorter (no run parameters, a middle ellipsis).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shortSurfaceName, pierceLabelIndices } from "../src/lib/sectionLabels.js";

test("(10) the surface name loses its run parameters and, when long, its middle", () => {
  assert.equal(shortSurfaceName("Cu 0.3 shell"), "Cu 0.3 shell");
  assert.equal(shortSurfaceName("U estimate (idw2, 4m, r120m) 200–424 shell"), "U estimate 200–424 shell");
  const s = shortSurfaceName("Not covered by drilling (> 50 m): U estimate (idw2, 4m, r120m) 200–424 shell");
  assert.ok(s.length <= 40, s);
  assert.ok(s.endsWith("200–424 shell") && s.startsWith("Not covered by drilling") && s.includes("…"), s);
  assert.equal(shortSurfaceName("(only parameters)"), "(only parameters)", "never empty");
});

test("(10) only each surface's first and last crossing is labelled", () => {
  const p = [{ name: "A" }, { name: "B" }, { name: "A" }, { name: "B" }, { name: "A" }, { name: "B" }, { name: "A" }, { name: "B" }];
  assert.deepEqual([...pierceLabelIndices(p)].sort((a, b) => a - b), [0, 1, 6, 7]); // 8 crossings of 2 solids: 4 labels
  assert.deepEqual([...pierceLabelIndices([{ name: "A" }])], [0]);
  assert.equal(pierceLabelIndices(null).size, 0);
});

test("wiring: the section labels the chosen crossings with the short name; KML / GPX are Simple-mode buttons with a real CRS", () => {
  const sw = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(sw, /if \(labelled\.has\(k\)\) floatLabels\.push\(\{ key: `pp\$\{i\}_\$\{k\}`, text: tr\("\{md\} m · \{surface\}", \{ md: q\.md\.toFixed\(1\), surface: shortSurfaceName\(q\.name\) \}\)/);
  assert.match(sw, /<title>\{tr\("\{hole\} crosses \{surface\} at \{md\} m downhole", \{ hole: ph\.name, surface: q\.name/, "the marker's tooltip keeps the full name");
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /<RibbonButton advanced=\{project\?\.crsSet === false\} \/\* #2705[^*]*\*\/ icon=\{Globe\} label="KML"/);
  assert.match(v, /<RibbonButton advanced=\{project\?\.crsSet === false\} icon=\{MapPin\} label="GPX"/);
});
