// TASKS.csv #1595 — a downhole log against a block model evaluated onto the holes: pairs, rank correlation, medians.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { logVsModel } from "../src/lib/downholeLogs.js";

const log = Array.from({ length: 40 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { MS: (i + 1) * 0.5 } })); // x10^-3 SI
const model = [{ hole_id: "H1", from: 0, to: 10, value: 0.001, numeric: true }, { hole_id: "H1", from: 10, to: 25, value: 0.004, numeric: true }, { hole_id: "H1", from: 25, to: 40, value: 0.009, numeric: true }]; // SI

test("each reading paired with the model cell at its midpoint; Spearman follows the ranks whatever the units", () => {
  const r = logVsModel(log, "MS", model);
  assert.equal(r.n, 40);
  assert.ok(r.r > 0.9, String(r.r));
  assert.equal(r.medianLog, 10.25);
  assert.equal(r.medianModel, 0.004);
});

test("another hole, no overlap, or too few pairs: nothing invented", () => {
  assert.equal(logVsModel(log, "MS", model.map((m) => ({ ...m, hole_id: "H2" }))).n, 0);
  assert.ok(Number.isNaN(logVsModel(log.slice(0, 2), "MS", model).r));
});

test("the pane offers the evaluated models; the Evaluate message points to it", () => {
  const p = fs.readFileSync("src/components/DownholeLogsPane.jsx", "utf8");
  assert.match(p, /customLayers\.filter\(\(l\) => \(l\.rows \|\| \[\]\)\.some\(\(r\) => r\.modelled && r\.numeric\)\)/);
  assert.match(fs.readFileSync("src/modules/GeophysicsModule.jsx", "utf8"), /or Downhole logs for a cross-plot against one\./);
});
