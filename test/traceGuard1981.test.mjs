// TASKS.csv #1981 — the 3D View closed ("reading 'length'") on a project with a collar that has no desurveyed trace:
// the assay-marker build looked the trace up before checking it existed (#1500 moved the lookup above the guard)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { traceLookup } from "../src/lib/viewer/modelHelpers.js";

test("traceLookup accepts a missing trace", () => {
  for (const pts of [undefined, null, []]) {
    const look = traceLookup(pts);
    assert.equal(look.at(10), null);
    assert.deepEqual(look.between(0, 10), []);
  }
});

test("the assay-marker build checks for a trace before looking it up", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const i = v.indexOf("pts = rows && traceOf.get(c.hole_id);"); // #3117: per element, the rows first
  assert.ok(i > 0);
  const guard = v.indexOf("if (!pts?.length) return;", i), look = v.indexOf("looks.set(c.hole_id, traceLookup(pts));", i);
  assert.ok(guard > i && look > guard, "guard before lookup");
  assert.ok(!/look = traceLookup\(pts\); \/\/ look: #1500\n\s*if \(!pts\?\.length\) return;/.test(v));
});
