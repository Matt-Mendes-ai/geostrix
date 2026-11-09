// TASKS.csv #2175 — lithology note roles decided on each code's first 400 noted rows: the same roles, a fraction of the time on a big log
import test from "node:test";
import assert from "node:assert/strict";
import { lithologyNoteRoles } from "../src/lib/layers.js";

test("a big log: roles unchanged, and the pass stays well under the old second", () => {
  const rows = [];
  for (let i = 0; i < 300000; i++) rows.push({ hole_id: `H${(i / 100) | 0}`, from: i, to: i + 1, value: ["DYK", "NCR", "AND"][i % 3], notes: ["mafic dyke", "lost core interval", "fine andesite"][i % 3] + ` ${i}` });
  const t = performance.now();
  const m = lithologyNoteRoles(rows);
  const ms = performance.now() - t;
  assert.equal(m.get("dyk"), "dyke"); assert.equal(m.get("ncr"), "no recovery"); assert.equal(m.has("and"), false);
  assert.ok(ms < 500, `${Math.round(ms)} ms`);
});

test("the majority still decides within the sample", () => {
  const rows = [...Array.from({ length: 300 }, () => ({ value: "X", notes: "fault gouge zone" })), ...Array.from({ length: 300 }, () => ({ value: "X", notes: "plain rock here" }))];
  assert.equal(lithologyNoteRoles(rows).get("x"), "fault", "300 of the first 400 say fault");
  const minority = [...Array.from({ length: 100 }, () => ({ value: "Y", notes: "fault gouge zone" })), ...Array.from({ length: 500 }, () => ({ value: "Y", notes: "plain rock here" }))];
  assert.equal(lithologyNoteRoles(minority).has("y"), false);
});

import { veinSourceUnits } from "../src/lib/layers.js";
test("the vein list's distinct codes are computed once per rows array (ViewerModule calls it on every render)", () => {
  const litho = Array.from({ length: 200000 }, (_, i) => ({ value: ["AND", "Dyke"][i % 2] }));
  const layers = { litho, vein: [] };
  assert.deepEqual(veinSourceUnits(layers), ["litho:Dyke"]);
  const t = performance.now(); for (let k = 0; k < 50; k++) veinSourceUnits(layers); const ms = performance.now() - t;
  assert.ok(ms < 20, `50 calls took ${Math.round(ms)} ms`);
  assert.deepEqual(veinSourceUnits({ litho: [...litho, { value: "VQZ dyke" }], vein: [] }).length, 2, "a new array is read again");
});
