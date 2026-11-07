// TASKS.csv #1375 (review #1352, Silvertip) — fan holes share a collar: their fence labels are stacked, not printed over each other.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stackCollarLabels } from "../src/lib/fence.js";

test("labels of near-identical collars take successive slots; distant ones stay at slot 0", () => {
  // the review's positions: PAD18 x2 at 408,212; PAD42 x4 at 501-504,186-191; PAD34 x3 at 710-711,222-224
  const pts = [
    { id: "PAD18-001", x: 408, y: 212 }, { id: "PAD18-002", x: 408, y: 212 },
    { id: "PAD42-001", x: 501, y: 186 }, { id: "PAD42-002", x: 503, y: 190 }, { id: "PAD42-002A", x: 504, y: 191 }, { id: "SDZ-004", x: 502, y: 188 },
    { id: "PAD34-001", x: 710, y: 222 }, { id: "PAD34-002", x: 711, y: 224 }, { id: "PAD34-003", x: 710, y: 223 },
    { id: "FAR", x: 900, y: 200 },
  ];
  const s = stackCollarLabels(pts);
  assert.deepEqual([s["PAD18-001"], s["PAD18-002"]], [0, 1]);
  assert.deepEqual(["PAD42-001", "PAD42-002", "PAD42-002A", "SDZ-004"].map((k) => s[k]), [0, 1, 2, 3]);
  assert.deepEqual(["PAD34-001", "PAD34-002", "PAD34-003"].map((k) => s[k]), [0, 1, 2]);
  assert.equal(s.FAR, 0);
  assert.equal(stackCollarLabels([{ id: "a", x: 0, y: 0 }, { id: "b", x: 60, y: 0 }]).b, 0, "40 px apart or more: no stacking");
});

test("wired: each label lifted by its slot", () => {
  const f = readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8");
  assert.ok(f.includes("const lift = 19 * (slots[h.hole_id] || 0);") && f.includes("y={view.yFor(h.pts[0].z) - 12 - lift}") && f.includes("y={view.yFor(h.pts[0].z) - 4 - lift}"));
});
