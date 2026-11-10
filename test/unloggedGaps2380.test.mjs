// TASKS.csv #2380 (review #2325, WA uranium) — rock logged in Lithology with no alteration row: counted as unaltered when asked, and said
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rockWithoutRows } from "../src/lib/unloggedGaps.js";

test("the parts of the Lithology intervals no alteration row covers, per hole", () => {
  const litho = [{ hole_id: "A", from: 0, to: 10 }, { hole_id: "A", from: 10, to: 20 }, { hole_id: "B", from: 0, to: 5 }];
  const alt = [{ hole_id: "A", from: 2, to: 4 }, { hole_id: "A", from: 9, to: 12 }]; // B has no alteration log at all
  const r = rockWithoutRows(litho, alt);
  assert.deepEqual(r.rows, [{ hole_id: "A", from: 0, to: 2 }, { hole_id: "A", from: 4, to: 9 }, { hole_id: "A", from: 12, to: 20 }]);
  assert.equal(r.metres, 15);
  assert.equal(r.holes, 1);
});

test("the halo takes them as zeros only when asked, and says the metres either way", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /if \(bodyOpts\.unloggedZero\) gaps\.rows\.forEach/);
  assert.match(m, /has no alteration row and counted as unknown, not unaltered/);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /runAlterationModel\(alterationTarget, \{ unloggedZero: altSource\.layer === "alt" && !!altSource\.unloggedZero \}/);
});
