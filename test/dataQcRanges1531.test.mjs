// TASKS.csv #1531 / #1532 — Data QC: implausible values flagged; multi-valued logs and drill pads no longer drown the real findings
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDataQC } from "../src/lib/dataQC.js";

const base = { project: { epsg: 26909 }, survey: [], boundaries: [], assays: [] };
const collar = (hole_id, x, y, azimuth, dip) => ({ hole_id, x, y, z: 1500, azimuth, dip, length: 300 });

test("#1531 RQD, recovery and SG outside their plausible ranges are warnings with hole and depth", () => {
  const collars = [collar("A", 0, 0, 70, -50)];
  const layers = {
    geotech: [{ hole_id: "A", from: 0, to: 3, value: 22.5 }, { hole_id: "A", from: 3, to: 6, value: 295 }],
    recovery: [{ hole_id: "A", from: 0, to: 1.5, value: 9200 }, { hole_id: "A", from: 1.5, to: 3, value: 104 }],
    sg: [{ hole_id: "A", from: 5, to: 6, value: -7.27 }],
  };
  const out = runDataQC({ ...base, collars, layers }).issues;
  const ranged = out.filter((i) => /plausible/.test(i.message));
  assert.equal(ranged.length, 3, ranged.map((i) => i.message).join(" | "));
  assert.ok(ranged.some((i) => i.category === "Recovery %" && /9200 at 0–1.5m/.test(i.message) && i.holeId === "A"));
  assert.ok(!out.some((i) => /plausible/.test(i.message) && /104/.test(i.message)), "a little over-recovery is not flagged");
});

test("#1532 the same run logged with several vein types is one info line, not one overlap each", () => {
  const collars = [collar("A", 0, 0, 70, -50)];
  const vein = [];
  for (let k = 0; k < 20; k++) for (const v of ["Vn3", "Vn4"]) vein.push({ hole_id: "A", from: k * 2, to: k * 2 + 1.5, value: v });
  vein.push({ hole_id: "A", from: 41, to: 45, value: "Vn1" }, { hole_id: "A", from: 44, to: 47, value: "Vn2" }); // a real overlap
  const out = runDataQC({ ...base, collars, layers: { vein } }).issues;
  const v = out.filter((i) => i.category === "Vein");
  assert.equal(v.filter((i) => /Overlapping/.test(i.message)).length, 1);
  assert.equal(v.filter((i) => /repeat another's exact from–to/.test(i.message)).length, 1);
});

test("#1532 a fan from one pad is a pad (info); identical collar and orientation is a possible duplicate (warning)", () => {
  const collars = [collar("F1", 100, 100, 70, -50), collar("F2", 100.2, 100.1, 116, -80), collar("F3", 100.1, 99.9, 90, -60),
    collar("M1", 500, 500, 0, -90), collar("M2", 500.1, 500, 0, -90)];
  const out = runDataQC({ ...base, collars, layers: {} }).issues.filter((i) => i.category === "Collars");
  assert.ok(out.some((i) => i.severity === "info" && /F1, F2, F3/.test(i.message) && /drill pad/.test(i.message)));
  assert.ok(out.some((i) => i.severity === "warning" && /M1, M2/.test(i.message) && /same azimuth and dip/.test(i.message)));
  assert.ok(!out.some((i) => i.severity === "warning" && /F1/.test(i.message)));
});
