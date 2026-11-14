// TASKS.csv #3205 (Matt's decision 2026-11-13) — a mineralization log in visual per cent per mineral (no code column): one numeric interval layer
// per mineral from one import, and an opt-in total of the columns ticked as sulphides. Synthetic table (the Galore Creek file stays out of the repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isPercentColumn, styleColumnFor, percentColumns, perMineralOffer, perMineralChoice, mineralRows, sumRows, mineralPlan, mineralLayerName, sumLayerName, UNIT } from "../src/lib/perMineralColumns.js";
import { guessTargetFor, guessMapping } from "../src/lib/layers.js";
import { codeColumnGuess } from "../src/lib/valueGuess.js";

const headers = ["HOLE_ID", "FROM", "TO", "MN_CPY_pct", "MN_CPY_style", "MN_BN_pct", "MN_PY_pct", "MN_MAG_pct", "MN_COMMENT"];
const rows = Array.from({ length: 40 }, (_, i) => ({ HOLE_ID: "SY-" + (i % 4), FROM: String(i * 2), TO: String(i * 2 + 2), MN_CPY_pct: i % 3 ? String(i / 10) : "", MN_CPY_style: ["diss", "vein", "blebs"][i % 3], MN_BN_pct: i % 5 ? "" : "0.5", MN_PY_pct: String(1 + (i % 4)), MN_MAG_pct: "", MN_COMMENT: "note " + i }));

test("per-cent column names and their style columns", () => {
  for (const h of ["MN_CPY_pct", "CPY_PCT", "Cpy%", "Cpy (%)", "pct_cpy", "CPY_VIS_PCT", "Py_percent"]) assert.ok(isPercentColumn(h), h);
  for (const h of ["MN_CPY_style", "FROM", "Cu_pct_x", "SAMPLE", "Total"]) assert.ok(!isPercentColumn(h), h);
  assert.equal(styleColumnFor("MN_CPY_pct", headers), "MN_CPY_style");
  assert.equal(styleColumnFor("MN_PY_pct", headers), null);
});

test("the file is guessed as Mineralization, and the box is offered with the blank column named", () => {
  const target = guessTargetFor(headers, "Mineralization.csv", rows), m0 = guessMapping(target, headers);
  assert.equal(target, "mnlgy");
  const guess = codeColumnGuess(target, headers, rows, m0); // #2889's guess takes the style column
  const mapping = guess ? { ...m0, value: guess.col } : m0;
  const offer = perMineralOffer(target, headers, rows, mapping);
  assert.ok(offer, "a mineral's own style column as the guessed Value still offers the box");
  assert.deepEqual(offer.map((c) => [c.col, c.n]), [["MN_CPY_pct", 26], ["MN_BN_pct", 8], ["MN_PY_pct", 40], ["MN_MAG_pct", 0]]);
  assert.equal(perMineralOffer(target, [...headers, "MIN_CODE"], rows, { ...mapping, value: "MIN_CODE" }), null, "a real code column: the Mineralization layer as before");
  assert.equal(perMineralOffer("litho", headers, rows, mapping), null);
  assert.equal(perMineralOffer("mnlgy", headers, rows, { ...mapping, from: "", to: "", depth: "FROM" }), null, "intervals only");
  const plan = mineralPlan(target, headers, rows, mapping, {});
  assert.deepEqual(plan.cols.map((c) => c.col), ["MN_CPY_pct", "MN_BN_pct", "MN_PY_pct"], "pre-ticked: the columns with values");
  assert.deepEqual(plan.blank, ["MN_MAG_pct"]);
  assert.deepEqual(plan.sum, [], "the total is opt-in");
});

test("each mineral's rows, the style riding along, and no 'blank code' for the intervals without it", () => {
  const m = { hole_id: "HOLE_ID", from: "FROM", to: "TO" };
  const cpy = mineralRows(rows, m, "MN_CPY_pct", "MN_CPY_style");
  assert.equal(cpy.rows.length, 26); assert.equal(cpy.none, 14); assert.equal(cpy.outside, 0);
  assert.deepEqual(cpy.rows[0], { hole_id: "SY-1", from: 2, to: 4, value: 0.1, MN_CPY_style: "vein" });
  const odd = mineralRows([{ HOLE_ID: "A", FROM: "0", TO: "1", X_pct: "120" }, { HOLE_ID: "A", FROM: "1", TO: "2", X_pct: "-1" }, { HOLE_ID: "A", FROM: "", TO: "3", X_pct: "1" }], m, "X_pct");
  assert.deepEqual([odd.rows.length, odd.outside], [0, 2], "outside 0-100 left out and counted; a blank From is no interval");
  assert.equal(mineralLayerName("Mineralization", "MN_CPY_pct"), "Mineralization: MN_CPY_pct", "the unit is the layer's, not in the name");
  assert.equal(UNIT, "% visual", "the legend brackets it: (% visual)");
});

test("the opt-in sulphide total: the ticked columns summed, named for what it sums", () => {
  const m = { hole_id: "HOLE_ID", from: "FROM", to: "TO" };
  const s = sumRows(rows, m, ["MN_CPY_pct", "MN_BN_pct", "MN_PY_pct"]);
  assert.equal(s.rows.length, 40);
  assert.equal(s.rows[0].value, 1 + 0.5, "row 0: Cpy blank (none logged), Bn 0.5, Py 1");
  assert.equal(s.rows[1].value, 0.1 + 2);
  assert.equal(sumLayerName("Min", ["MN_CPY_pct", "MN_PY_pct"]), "Min: total of MN_CPY_pct + MN_PY_pct");
  const over = sumRows([{ HOLE_ID: "A", FROM: "0", TO: "1", a_pct: "60", b_pct: "50" }, { HOLE_ID: "A", FROM: "1", TO: "2", a_pct: "", b_pct: "" }], m, ["a_pct", "b_pct"]);
  assert.deepEqual([over.rows.length, over.outside, over.none], [0, 1, 1], "a total over 100 is left out; an interval with none of them is not in the layer");
  const choice = perMineralChoice({ mineralCols: ["MN_PY_pct", "MN_MAG_pct"], mineralSum: ["MN_CPY_pct"] }, percentColumns(headers, rows, m));
  assert.deepEqual(choice, { cols: ["MN_PY_pct"], sum: ["MN_CPY_pct"] }, "a blank column cannot be ticked");
  assert.deepEqual(mineralPlan("mnlgy", headers, rows, m, { mineralCols: [], mineralSum: ["MN_CPY_pct"] }), null, "nothing ticked and a one-column total: the Value column import");
  assert.deepEqual(mineralPlan("mnlgy", headers, rows, m, { mineralCols: [], mineralSum: ["MN_CPY_pct", "MN_PY_pct"] }).sum, ["MN_CPY_pct", "MN_PY_pct"]);
});

test("wired into the dialog and the commit, loaded on demand", () => {
  const p = fs.readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /await import\("\.\.\/\.\.\/lib\/perMineralColumns\.js"\)/);
  assert.doesNotMatch(p, /^import .*perMineralColumns/m, "not a startup import");
  assert.match(p, /\} else if \(minPlan\) \{/);
  assert.match(p, /!\(minPlan && f\.key === "value"\)/);
  const d = fs.readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(d, /<MineralPercentBox modal=\{modal\} onChange=\{onChange\} \/>/);
  assert.match(d, /!\(minOn && f\.key === "value"\)/);
});
