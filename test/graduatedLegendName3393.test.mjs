// TASKS.csv #3393 (#3378) — a graduated map layer's legend heading names its field and unit; empty classes stay out. SYNTHETIC layer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLayerLegendGroups } from "../src/lib/legendGroups.js";
const layer = (o) => ({ id: 1, name: "Subcrop", visible: true, geomType: "point", features: [{ attributes: {} }], styleField: "cover_m", styleBreaks: [{ max: 5 }, { max: 10 }, { max: 20 }], categories: [{ value: 5, label: "0–5", color: "#aaa", count: 4 }, { value: 10, label: "5–10", color: "#bbb", count: 0 }, { value: 20, label: "10–20", color: "#ccc", count: 2 }], ...o });
test("the heading names the field, with m for a _m field; empty classes are dropped", () => {
  const [g] = mapLayerLegendGroups([layer({})]);
  assert.equal(g.label, "Subcrop — cover_m, m"); assert.deepEqual(g.items.map((i) => i[0]), ["0–5", "10–20"]); assert.equal(g.grade, true);
});
test("another field has no unit guessed; a categorical layer keeps its name", () => {
  assert.equal(mapLayerLegendGroups([layer({ styleField: "grade" })])[0].label, "Subcrop — grade");
  assert.equal(mapLayerLegendGroups([layer({ styleBreaks: null })])[0].label, "Subcrop");
});
