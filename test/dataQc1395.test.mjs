// TASKS.csv #1395 — Data QC: a 0 % RQD or recovery is a value, a blank is not
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDataQC } from "../src/lib/dataQC.js";

test("0 is a measurement; blank, NaN and Unknown are reported as missing", () => {
  const collars = [{ hole_id: "H1", x: 0, y: 0, z: 100, length: 50 }];
  const rows = [0, 35, "", NaN, "Unknown", "LST"].map((value, i) => ({ hole_id: "H1", from: i * 5, to: i * 5 + 5, value }));
  const { issues } = runDataQC({ project: {}, collars, survey: [], layers: { geotech: rows }, boundaries: [], assays: [] });
  const missing = issues.filter((x) => /no code\/value/.test(x.message));
  assert.equal(missing.length, 3, JSON.stringify(missing.map((x) => x.message)));
  assert.ok(!missing.some((x) => /at 0–5m/.test(x.message)), "the 0 % interval is not missing");
});
