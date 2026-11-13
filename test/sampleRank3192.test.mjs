// TASKS.csv #3192 (Matt, 2026-11-13: "rank it from the most useful to least") — the empty 3D View lists the samples by usefulness,
// with the mapping samples first on Surface Geology; every card is still on both lists.
import test from "node:test";
import assert from "node:assert/strict";
import { sampleCardsFor, SAMPLE_RANK, SURFACE_LEAD } from "../src/lib/sampleCards.js";

test("the 3D View lists the samples in SAMPLE_RANK's order, the most useful first", () => {
  const ids = sampleCardsFor("viewer").map((c) => c.id);
  assert.equal(ids[0], "wa_gold", "the filled button: the whole drill workflow, bundled");
  assert.deepEqual(ids, SAMPLE_RANK.filter((id) => ids.includes(id)), "in rank order");
  for (const id of ids) assert.ok(SAMPLE_RANK.includes(id), `${id} is ranked`);
  assert.ok(ids.indexOf("blake") === ids.length - 1 || ids.indexOf("blake") > ids.indexOf("wa_iron"), "gravity only comes late");
});

test("Surface Geology leads with the mapping samples, then the same rank; no card is dropped", () => {
  const v = sampleCardsFor("viewer").map((c) => c.id), s = sampleCardsFor("surface").map((c) => c.id);
  const lead = SURFACE_LEAD.filter((id) => v.includes(id));
  assert.deepEqual(s.slice(0, lead.length), lead);
  assert.deepEqual(s.slice(lead.length), v.filter((id) => !lead.includes(id)));
  assert.equal(new Set(s).size, v.length);
});
