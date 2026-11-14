// TASKS.csv #3391 — Model from map on subcrop outlines: the order from the logged contacts, not the area
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { suggestPileOrder } from "../src/lib/pileOrder.js";
import { holeContacts } from "../src/lib/holeMapContacts.js";

const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
// three outlines side by side, B the largest, so 'by area' puts B first
const layer = { features: [
  { attributes: { u: "A" }, parts: [sq(0, 0, 100, 100)] },
  { attributes: { u: "B" }, parts: [sq(100, 0, 400, 100)] },
  { attributes: { u: "C" }, parts: [sq(400, 0, 500, 100)] },
] };
const rows = [];
for (const h of ["H1", "H2", "H3"]) rows.push({ hole_id: h, from: 0, to: 10, value: "C" }, { hole_id: h, from: 10, to: 20, value: "A" }, { hole_id: h, from: 20, to: 30, value: "B" });
rows.push({ hole_id: "H4", from: 0, to: 10, value: "B" }, { hole_id: "H4", from: 10, to: 20, value: "A" }); // one hole the other way for A/B

test("without logged contacts the outlines are ordered by area; with them by the logs", () => {
  const by = suggestPileOrder({ layer, field: "u", nearestHole: true });
  assert.equal(by.order[0], "B", "the reproduction: the biggest outline first");
  const cs = holeContacts(rows, { A: "A", B: "B", C: "C" }).contacts;
  const r = suggestPileOrder({ layer, field: "u", nearestHole: true, loggedContacts: cs });
  // C over A (3 holes), A over B (3 holes) against B over A (1): C, A, B youngest first
  assert.deepEqual(r.order, ["C", "A", "B"]);
  assert.equal(r.units.find((u) => u.unit === "A").evidence, "logged");
  const ab = r.pairs.find((p) => p.logged && p.a === "A" && p.b === "B");
  assert.deepEqual([ab.logged.aboveBelow, ab.logged.belowAbove, ab.younger], [3, 1, "A"]);
});
test("wiring in the panel", () => {
  const s = fs.readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /roleOf: logRoleOf, loggedContacts/);
});
test("#3384: each member of an estimated set gets its swaths", () => {
  const s = fs.readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(s, /checkNn: mNn \? mNn\.checkColumns : t\.cells, checkPoints: mp/);
  assert.match(s, /<EstimateCheck cells=\{m\.cells\} nnCells=\{m\.checkNn\} points=\{m\.checkPoints\}/);
});
