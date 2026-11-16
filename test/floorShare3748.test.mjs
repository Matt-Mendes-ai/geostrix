// TASKS.csv #3748 (Scottie Gold review) — one reading of the half-limit floor: the anomaly score's defaults, the correlation header and Calc. element's notice
// (synthetic rows). TASKS.csv #3745 — Compositing's 'Also composite' offers every element, not the first 16.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { floorOf, floorElements, floorInputs } from "../src/lib/floorShare.js";
import { defaultMcdElements } from "../src/lib/mcd.js";

// 300 samples: Au spread; Ag 84 % on 1 ppm (half of a 2 ppm limit); Cu spread; Pb spread
let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const rows = Array.from({ length: 300 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1, values: {
  Au: +(0.05 + r() * 5).toFixed(3), Ag: r() < 0.84 ? 1 : +(1.5 + r() * 40).toFixed(2), Cu: +(20 + r() * 900).toFixed(1), Pb: +(5 + r() * 300).toFixed(1) } }));
const els = ["Au", "Ag", "Cu", "Pb"].map((symbol) => ({ symbol, unit: "ppm" }));
const U = { Au: "ppm", Ag: "ppm", Cu: "ppm", Pb: "ppm" };

test("floorOf / floorElements: an element mostly on one repeated minimum is on the floor; spread ones are not", () => {
  const f = floorOf(rows, "Ag", "ppm", U);
  assert.ok(f && f.share > 0.8 && f.floor === 1 && f.dl === 2, JSON.stringify(f));
  assert.equal(floorOf(rows, "Au", "ppm", U), null);
  assert.deepEqual(floorElements(rows, ["Au", "Ag", "Cu", "Pb"], U).map((x) => x.symbol), ["Ag"]);
});

test("defaultMcdElements: an element over 25 % on the floor is left out; without the callback the old rule stands", () => {
  const share = (sym) => floorOf(rows, sym, "ppm", U)?.share || 0;
  assert.deepEqual(defaultMcdElements(rows, els, { floorShare: share }).sort(), ["Au", "Cu", "Pb"]);
  assert.ok(defaultMcdElements(rows, els).includes("Ag"), "the old rule: Ag has a value everywhere and no '<' flag");
});

test("floorInputs: a ratio of the floor element counts the rows that use the floor", () => {
  const fl = floorInputs(rows, "Ag / Au", ["Au", "Ag", "Cu", "Pb"], U);
  assert.equal(fl.of, 300);
  assert.deepEqual(fl.inputs.map((i) => i.symbol), ["Ag"]);
  assert.ok(fl.rows > 230 && fl.rows < 270, String(fl.rows));
  assert.equal(floorInputs(rows, "Cu / Pb", ["Au", "Ag", "Cu", "Pb"], U), null, "no floor input: no clause");
  assert.equal(floorInputs(rows, "Au + Cu", ["Au", "Ag"], U), null);
});

test("wiring: the panel, the correlation header and the calc notice read it; Compositing offers every element", () => {
  const rd = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  assert.match(rd("components/McdAnomalyPanel.jsx"), /defaultMcdElements\(pool, elements, \{ floorShare: \(s\) => floors\.get\(s\)\?\.share \|\| 0 \}\)/);
  assert.match(rd("components/CorrelationMatrix.jsx"), /const onFloor = useMemo\(\(\) => floorElements\(assays, symbols, elementUnits\)/);
  assert.match(rd("modules/GeochemModule.jsx"), /const fl = floorInputs\(assays, r\.element\.calculated\.expr/);
  const c = rd("components/CompositingModal.jsx");
  assert.doesNotMatch(c, /\.slice\(0, 16\)/);
  assert.match(c, /\(symbols\.length - 1 > 16 \? extraSyms\.filter\(\(s\) => s !== symbol && symbols\.includes\(s\)\) : symbols\.filter\(\(s\) => s !== symbol\)\)/);
  assert.match(c, /<select aria-label=\{tr\("Add an element"\)\}/);
});
