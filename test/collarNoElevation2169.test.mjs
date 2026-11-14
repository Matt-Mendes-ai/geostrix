// TASKS.csv #2169 — collars with x / y and a blank elevation are kept at an assumed elevation (terrain, median, 0 m), flagged
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillMissingCollarZ, settleAssumedZ } from "../src/lib/collarElevation.js";
import { mergeCollar } from "../src/lib/layers.js";
import { runDataQC } from "../src/lib/dataQC.js";

const rows = [
  { hole_id: "A", x: 100, y: 100, z: 410 },
  { hole_id: "B", x: 200, y: 100, z: 430 },
  { hole_id: "C", x: 300, y: 100, z: NaN },
  { hole_id: "D", x: 900, y: 900, z: NaN },
];

test("terrain first, then the median of the other collars", () => {
  const groundAt = (x, y) => (x < 500 ? 400 + x / 100 : NaN);
  const out = fillMissingCollarZ(rows, { groundAt });
  assert.deepEqual(out.rows.map((r) => [r.hole_id, r.z, r.zAssumed]), [["A", 410, undefined], ["B", 430, undefined], ["C", 403, "terrain"], ["D", 420, "median"]]);
  assert.deepEqual(out.counts, { terrain: 1, median: 1, zero: 0, kept: 0 });
});

test("the project's collars count toward the median; with nothing at all, 0 m", () => {
  const out = fillMissingCollarZ([{ hole_id: "N", x: 1, y: 1, z: NaN }], { existing: [{ hole_id: "P", x: 0, y: 0, z: 1200 }] });
  assert.equal(out.rows[0].z, 1200); assert.equal(out.rows[0].zAssumed, "median");
  const none = fillMissingCollarZ([{ hole_id: "N", x: 1, y: 1, z: NaN }]);
  assert.equal(none.rows[0].z, 0); assert.equal(none.rows[0].zAssumed, "zero"); assert.equal(none.counts.zero, 1);
});

test("a hole already in the project keeps its elevation through the merge", () => {
  const existing = [{ hole_id: "C", x: 300, y: 100, z: 455 }];
  const out = fillMissingCollarZ(rows, { existing });
  const c = out.rows.find((r) => r.hole_id === "C");
  assert.ok(Number.isNaN(c.z) && !c.zAssumed); assert.equal(out.counts.kept, 1);
  assert.equal(mergeCollar(existing[0], c, true).z, 455);
});

test("a later file with the real RL clears the assumption", () => {
  const prev = { hole_id: "D", x: 900, y: 900, z: 420, zAssumed: "median" };
  const incoming = { hole_id: "D", x: 900, y: 900, z: 512 };
  const merged = settleAssumedZ(mergeCollar(prev, incoming, true), incoming);
  assert.equal(merged.z, 512); assert.equal(merged.zAssumed, undefined);
  // declined overwrite: the assumed value stays, and so does its flag
  const kept = settleAssumedZ(mergeCollar(prev, incoming, false), incoming);
  assert.equal(kept.z, 420); assert.equal(kept.zAssumed, "median");
});

test("Data QC flags an assumed elevation as a warning on the hole", () => {
  const collars = [{ hole_id: "D", x: 900, y: 900, z: 420, zAssumed: "median", azimuth: 0, dip: 90, length: 50 }];
  const res = runDataQC({ collars, survey: [], layers: {}, assays: [] });
  const issues = res.issues || res;
  const hit = issues.find((i) => i.holeId === "D" && /ASSUMED elevation/.test(i.message));
  assert.ok(hit, JSON.stringify(issues.slice(0, 4)));
  assert.equal(hit.severity, "warning");
  assert.match(hit.message, /median collar elevation \(420 m\)/);
});

test("the import keeps them and says so", () => {
  const src = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.ok(src.includes("rows = rows.filter((r) => r.hole_id && Number.isFinite(r.x) && Number.isFinite(r.y));"));
  assert.ok(src.includes("const zFill = fillMissingCollarZ(rows,"));
  assert.ok(src.includes('tr("{n} collar(s) had no elevation and were placed at an ASSUMED one ({how}), flagged in Data QC"'));
});
