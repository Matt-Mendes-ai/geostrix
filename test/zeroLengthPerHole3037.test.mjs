// TASKS.csv #3037 (split from #2884) — a zero-length table gave one Data QC warning per row (2.5 M rows, a 10.5 s freeze): one line per hole
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDataQC } from "../src/lib/dataQC.js";

const base = { project: { epsg: 26909 }, survey: [], boundaries: [], assays: [] };
const collar = (hole_id) => ({ hole_id, x: 0, y: 0, z: 1500, azimuth: 0, dip: -90, length: 300 });

test("zero-length intervals: one warning per hole with the count and the shallowest depth; a single one keeps its old line", () => {
  const litho = [];
  for (let k = 0; k < 5000; k++) litho.push({ hole_id: "A", from: 100 - k * 0.01, to: 100 - k * 0.01, value: "SST" });
  litho.push({ hole_id: "B", from: 12, to: 12, value: "SLT" }, { hole_id: "B", from: 12, to: 20, value: "SLT" });
  const out = runDataQC({ ...base, collars: [collar("A"), collar("B")], layers: { litho } }).issues;
  const z = out.filter((i) => /zero-length/i.test(i.message));
  assert.equal(z.length, 2, z.map((i) => i.message).join(" | "));
  const a = z.find((i) => i.holeId === "A"), b = z.find((i) => i.holeId === "B");
  assert.match(a.message, /^5,000 zero-length intervals in this hole, the shallowest at 50\.01m/);
  assert.equal(a.severity, "warning");
  assert.equal(b.message, "Zero-length interval at 12m.");
});
