// TASKS.csv #772 — depth of investigation per column (DOI index line) and the DOI column in the section export.
import test from "node:test";
import assert from "node:assert/strict";
import { columnReach, sectionTableRows, slimDcipResult } from "../src/lib/dcip.js";

// two columns of four 10 m cells, ground at 100 m
const cells = {
  s: [0, 0, 0, 0, 10, 10, 10, 10],
  z: [95, 85, 75, 65, 95, 85, 75, 65],
  ds: Array(8).fill(10), dz: Array(8).fill(10),
  resistivity: [100, 100, 100, 100, 10, 10, 10, 10],
  support: [1, 0.5, 0.05, 0.01, 1, 0.3, 0.2, 0.1],
  doi: [0.01, 0.05, 0.3, 0.9, 0.0, 0.1, 0.15, 0.4],
};

test("columnReach: bottom of the deepest passing cell per column, and the median depth", () => {
  const r = columnReach(cells, (i) => cells.doi[i] <= 0.2);
  assert.deepEqual(r.cols.map((o) => [o.s, o.zBottom, o.depth]), [[0, 80, 20], [10, 70, 30]]);
  assert.equal(r.median, 25);
  const none = columnReach(cells, () => false);
  assert.deepEqual(none.cols.map((o) => o.zBottom), [null, null]);
  assert.equal(none.median, 0);
});

test("the DOI index survives slimming and is exported per cell", () => {
  const slim = slimDcipResult({ cells, electrodes: [], phi_d: 1, target: 1, reachedTarget: true, iterations: 1, mesh: {}, versions: {}, doiMethod: { threshold: 0.2 } });
  assert.deepEqual(slim.cells.doi, cells.doi);
  assert.equal(slim.doiMethod.threshold, 0.2);
  const geom = { at: (s) => [s, 0] };
  const rows = sectionTableRows({ cells }, geom, 0.02);
  assert.equal(rows[2].doi_index, 0.3);
  const noDoi = sectionTableRows({ cells: { ...cells, doi: undefined } }, geom, 0.02);
  assert.equal("doi_index" in noDoi[0], false);
});
