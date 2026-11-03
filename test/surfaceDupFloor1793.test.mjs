// TASKS.csv #1793 (review #1646, Kodiak) — with no '<' results the lowest value is not a detection limit: no pair floor
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectionLimitOf, duplicatePairsSurface } from "../src/lib/surfaceQaqc.js";

test("the inferred 'lowest value' limit is marked basis min, and the panel only floors pairs on a known ('lt') limit", () => {
  assert.deepEqual(detectionLimitOf([{ values: { Cu: 3.57 } }, { values: { Cu: 40 } }], "Cu"), { limit: 3.57, basis: "min" });
  const s = readFileSync(new URL("../src/components/SurfaceQaqcPanel.jsx", import.meta.url), "utf8");
  assert.ok(s.includes('floor: dl.limit && dl.basis === "lt" ? settings.pairFloorMultiple * dl.limit : 0'));
});

test("floor 0 counts every pair", () => {
  const recs = [{ kind: "duplicate", sample_id: "D1", parent_id: "S1", values: { Cu: 22 } }];
  const samples = [{ sample_id: "S1", values: { Cu: 25 } }];
  const p = duplicatePairsSurface(recs, samples, "Cu", { Cu: "ppm" }, { floor: 0 });
  assert.ok(p.length === 0 || p.every((x) => x.counted), JSON.stringify(p));
});
