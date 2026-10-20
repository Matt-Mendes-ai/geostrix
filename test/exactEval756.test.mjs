// TASKS.csv #756 — the model check and the modelled-unit layer read the unit GemPy evaluated exactly, when present
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAgainstLogs, modelledIntervals, unitOfSample } from "../src/lib/modelCheck.js";

// a 1 x 1 x 2 block: lower cell "A", upper cell above tops
const block = { extent: [0, 10, 0, 10, 0, 20], resolution: [1, 1, 2], ids: [2, 1], labels: [null, "A"] };

test("an exact unit wins over the block cell, including null (above tops)", () => {
  assert.equal(unitOfSample(block, { x: 5, y: 5, z: 5 }), "A");
  assert.equal(unitOfSample(block, { x: 5, y: 5, z: 5, modelled: null }), null);
  assert.equal(unitOfSample(block, { x: 5, y: 5, z: 15, modelled: "A" }), "A");
  assert.equal(unitOfSample(block, { x: 5, y: 5, z: 50 }), undefined);
});

test("the check uses the exact units", () => {
  const samples = [{ hole_id: "H", x: 5, y: 5, z: 9.9, metres: 2, logged: "A", modelled: null }, { hole_id: "H", x: 5, y: 5, z: 10.1, metres: 3, logged: "A", modelled: "A" }];
  const c = checkAgainstLogs(block, samples);
  assert.equal(c.total, 5); assert.equal(c.matched, 3);
  const rows = modelledIntervals(block, [{ hole_id: "H", from: 0, to: 2, x: 5, y: 5, z: 15, logged: "A", modelled: "A" }]);
  assert.equal(rows[0].value, "A");
});
