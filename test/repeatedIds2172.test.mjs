// TASKS.csv #2172 (WA drillhole review) — repeated hole ids in a collar file: the first row kept, the others counted in the notice
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { firstPerHole } from "../src/lib/collarAttrs.js";

test("the first row of each hole id is kept", () => {
  const r = firstPerHole([{ hole_id: "A", x: 1 }, { hole_id: "B", x: 2 }, { hole_id: "A", x: 3 }, { hole_id: "A", x: 4 }, { hole_id: "C", x: 5 }]);
  assert.deepEqual(r.rows.map((q) => [q.hole_id, q.x]), [["A", 1], ["B", 2], ["C", 5]]);
  assert.equal(r.dropped, 2); assert.deepEqual(r.holes, ["A"]);
  assert.deepEqual(firstPerHole([]), { rows: [], dropped: 0, holes: [] });
});

test("the collar import uses it when no rank column decides (#600), and says it", () => {
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /const repeats = ranked\.rankColumn \? \{ dropped: 0, holes: \[\] \} : firstPerHole\(rows\);/);
  assert.match(u, /row\(s\) shared a hole id with an earlier row of the file; the first was kept/);
});
