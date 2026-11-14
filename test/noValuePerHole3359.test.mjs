// TASKS.csv #3359 (#3037) — the per-row "no code/value" info line on interval layers is counted per hole too (a log with a blank value on every row gave
// one line per row). SYNTHETIC litho.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDataQC } from "../src/lib/dataQC.js";

const base = { project: { epsg: 26909 }, survey: [], boundaries: [], assays: [] };
const collar = (hole_id) => ({ hole_id, x: 0, y: 0, z: 1500, azimuth: 0, dip: -90, length: 300 });

test("blank values: one info line per hole with the count and the shallowest depth; a single one keeps its old line", () => {
  const litho = [];
  for (let k = 0; k < 4000; k++) litho.push({ hole_id: "A", from: 100 + k * 0.05, to: 100.05 + k * 0.05, value: "" });
  litho.push({ hole_id: "B", from: 12, to: 20, value: null }, { hole_id: "B", from: 20, to: 30, value: "SLT" });
  const out = runDataQC({ ...base, collars: [collar("A"), collar("B")], layers: { litho } }).issues;
  const z = out.filter((i) => /no code\/value/.test(i.message));
  assert.equal(z.length, 2, z.map((i) => i.message).join(" | "));
  const a = z.find((i) => i.holeId === "A"), b = z.find((i) => i.holeId === "B");
  assert.match(a.message, /^4,000 intervals in this hole have no code\/value, the shallowest at 100m\./);
  assert.equal(a.severity, "info");
  assert.equal(b.message, "Interval at 12–20m has no code/value.");
});
