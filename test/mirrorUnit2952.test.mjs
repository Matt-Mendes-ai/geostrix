// TASKS.csv #2952 / #2953 — a log layer's unit and valid range are set in Downhole logs on the store's copy; the 3D View's copy did not have
// them, and its next mirror write put the old unit back and dropped the range (found while checking #2953 live).
import test from "node:test";
import assert from "node:assert/strict";
import { mirrorCustomLayers } from "../src/lib/viewerDirty.js";

const rows = [{ hole_id: "A", from: 0, to: 1, value: 2.6 }];
test("for a layer the store has, its unit and valid range win over the 3D View's copy", () => {
  const local = [{ id: 1, name: "Density_Best", rows, unit: "g/cc", binM: 0.5, group: {} }];
  const edited = [{ id: 1, name: "Density_Best", rows, unit: "kg/m³", binM: 0.5, validRange: [1000, 5000] }];
  const next = mirrorCustomLayers(edited, local);
  assert.equal(next, edited, "nothing else changed: the same list (#1656: no false edit)");
  const cleared = [{ id: 1, name: "Density_Best", rows, binM: 0.5 }];
  assert.equal(mirrorCustomLayers(cleared, local)[0].unit, undefined, "a unit cleared in the store stays cleared");
});

test("a change on the 3D View's side still reaches the store, keeping the store's unit and range", () => {
  const edited = [{ id: 1, name: "Density_Best", rows, unit: "g/cc", validRange: [1, 5] }];
  const local = [{ id: 1, name: "Density_Best", rows, group: {} }, { id: 2, name: "Gamma_Best", rows, unit: "cps", group: {} }];
  const next = mirrorCustomLayers(edited, local);
  assert.notEqual(next, edited);
  assert.deepEqual(next, [{ id: 1, name: "Density_Best", rows, unit: "g/cc", validRange: [1, 5] }, { id: 2, name: "Gamma_Best", rows, unit: "cps" }], "a new layer takes the import's unit");
  assert.equal(next[0].validRange, edited[0].validRange);
});
