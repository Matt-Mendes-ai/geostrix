// TASKS.csv #2562 — point-survey gridding: one survey choice for the pane, a cell size from the station spacing, a suffix on a repeated name
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suggestIdwCell, uniqueName } from "../src/lib/idw.js";

test("#2562 the default cell: a quarter to a half of the spacing, a round number", () => {
  assert.equal(suggestIdwCell(100), 25); // the review's gravity stations
  assert.equal(suggestIdwCell(25), 10); // the gravity line: 6.25 -> 10
  assert.equal(suggestIdwCell(50), 20); // radiometric lines: 12.5 -> 20
  assert.equal(suggestIdwCell(8), 2);
  assert.equal(suggestIdwCell(0), null);
  assert.equal(suggestIdwCell(undefined), null);
  for (const s of [3, 7, 33, 120, 480, 2000]) { const c = suggestIdwCell(s); assert.ok(c >= s / 4 - 1e-9 && c <= s / 2 + 1e-9, `${s} -> ${c}`); }
});

test("#2562 a repeated raster name gets a suffix", () => {
  assert.equal(uniqueName("A IDW 25 m", []), "A IDW 25 m");
  assert.equal(uniqueName("A IDW 25 m", ["A IDW 25 m"]), "A IDW 25 m (2)");
  assert.equal(uniqueName("A IDW 25 m", ["A IDW 25 m", "A IDW 25 m (2)"]), "A IDW 25 m (3)");
});

test("#2562 the pane's two survey selects move together, and the cell box defaults from the spacing", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /onChange=\{\(e\) => \{ setLegendSurvey\(e\.target\.value\); setIdwSurvey\(e\.target\.value\);/);
  assert.match(g, /onChange=\{\(e\) => \{ setIdwSurvey\(e\.target\.value\); setLegendSurvey\(e\.target\.value\);/);
  assert.match(g, /const idwAutoCell = suggestIdwCell\(idwSuggest\?\.spacing\) \|\| 25;/);
  assert.match(g, /const gName = uniqueName\(`\$\{label\}\$\{sliceTag\} \$\{tag\} \$\{idwCellSize\} m/); // #2846: the method's tag (IDW, min. curvature, spline)
});
