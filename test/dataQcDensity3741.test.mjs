// TASKS.csv #3741 + #3732 (table cell) — Data QC says when the project has no density at all; the Data table keeps '<' on a below-detection cell (synthetic).
import test from "node:test";
import assert from "node:assert/strict";
import * as cov from "../src/lib/dataQcCoverage.js";
import { buildTable } from "../src/lib/dataTable.js";

test("#3741: assays and no density at all -> one info; with a density layer or no assays -> none", () => {
  const fn = Object.values(cov).find((f) => typeof f === "function" && /coverage/i.test(f.name)) || cov.dataQcCoverage || cov.coverageInfos;
  assert.ok(fn, Object.keys(cov).join());
  const collars = [{ hole_id: "A", x: 0, y: 0, z: 0, length: 50 }];
  const assays = [{ hole_id: "A", from: 0, to: 1, values: { Au: 1 } }];
  const run = (layers, a) => fn({ collars, assays: a, layers, survey: [], customLayers: [] });
  const msg = (r) => (Array.isArray(r) ? r : r?.infos || r?.items || []).map((x) => x.message).join("|");
  assert.match(msg(run({}, assays)), /No density \(specific gravity\) is in the project/);
  assert.doesNotMatch(msg(run({ sg: [{ hole_id: "A", from: 0, to: 1, value: 2.8 }] }, assays)), /No density \(specific gravity\) is in the project/);
  assert.doesNotMatch(msg(run({}, [])), /No density \(specific gravity\) is in the project/);
});

test("#3732: the Data table marks a cell flagged below detection and keeps the number a number", () => {
  const store = { assayElements: [{ symbol: "W", unit: "ppm" }, { symbol: "Au", unit: "ppm" }], assays: [
    { hole_id: "A", from: 0, to: 1, values: { W: 5, Au: 1 }, qualifiers: { W: "<" } }, { hole_id: "A", from: 1, to: 2, values: { W: 40, Au: 2 } }] };
  const t = buildTable("assays", store);
  assert.deepEqual([...t.lt.get(0)], [3]);
  assert.equal(t.lt.get(1), undefined);
  assert.equal(t.rows[0][3], 5);
  assert.equal(buildTable("assays", { ...store, assays: [store.assays[1]] }).lt, undefined);
});
