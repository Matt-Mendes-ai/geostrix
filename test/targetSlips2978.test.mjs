// TASKS.csv #2978 (review #2876, WA iron) — small slips in the Targeting panes: (1) an untyped box asked for terrain; (2) combine advice with
// one card; (3) 'INF-01' beside 'STEP-1' and no hole type in the line / grid form; (4) the convergence sign not stated; (6) the Target
// editor assumed diamond holes and voxels; (7) a pick on a collar marker took the marker's surface, not the collar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holePattern } from "../src/lib/plannedPattern.js";
import { rigRows } from "../src/lib/rigExport.js";
import { pickOnView } from "../src/modules/viewer/pickGround.js";

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("(3) at least two digits in every pattern", () => {
  assert.deepEqual(holePattern({ x: 0, y: 0, bearingDeg: 0, spacing: 25, count: 5, prefix: "STEP-" }).holes.map((h) => h.name), ["STEP-01", "STEP-02", "STEP-03", "STEP-04", "STEP-05"]);
  assert.equal(holePattern({ x: 0, y: 0, bearingDeg: 0, spacing: 25, count: 10, prefix: "INF-" }).holes[9].name, "INF-10");
  assert.equal(holePattern({ x: 0, y: 0, bearingDeg: 0, spacing: 5, count: 120, prefix: "G" }).holes[0].name, "G001");
  const f = read("components/PlannedHolePattern.jsx");
  assert.ok(f.includes('...(p.type.trim() ? { type: p.type.trim() } : {})') && f.includes('label={tr("Hole type")}'));
});

test("(4) the rig sheet states its azimuth rule", () => {
  const [r] = rigRows([{ name: "P", x: 500000, y: 5000000, z: 100, azimuth: 45, dip: -60, length: 100 }], 32610, "2026-11-12", () => [{ x: 500000, y: 5000000, z: 100, md: 0 }]);
  assert.ok(Number.isFinite(r.convergence_deg));
  assert.match(r.azimuth_rule, /^true = grid - convergence_deg/);
  assert.equal(Object.keys(r).indexOf("azimuth_rule"), Object.keys(r).indexOf("convergence_deg") + 1);
  const [l] = rigRows([{ name: "P", x: 0, y: 0, z: 0, azimuth: 0, dip: -90, length: 10 }], null, "2026-11-12", () => [{ x: 0, y: 0, z: 0, md: 0 }]);
  assert.equal(l.azimuth_rule, "", "no CRS: no rule");
});

test("(7) a pick on a collar marker returns the collar", () => {
  const collar = { hole_id: "RHDMET_0156", x: 1000, y: 2000, z: 448 };
  const marker = { userData: { collarMarker: true, collar, tip: "RHDMET_0156\ncollar" }, material: { visible: true, opacity: 1 }, parent: null, visible: true };
  const hits = [{ object: marker, distance: 50, point: { x: 0, y: 2.6, z: 0 } }];
  const w = pickOnView(null, hits, () => ({ x: 1000, y: 2000, z: 450.6, on: "collar" }), null, { x: 1000, y: 2000, z: 448 });
  assert.deepEqual([w.x, w.y, w.z], [1000, 2000, 448]);
  // anything else: as before
  const other = { userData: {}, material: { visible: true, opacity: 1 }, parent: null, visible: true };
  assert.equal(pickOnView(null, [{ object: other, distance: 5, point: {} }], () => ({ x: 1, y: 2, z: 3, on: "x" }), null, { x: 0, y: 0, z: 0 }).z, 3);
});

test("(1)(2)(6) the panes", () => {
  const e = read("components/EvidenceOverlayPane.jsx");
  assert.ok(e.includes("setMsg(noGridText())") && e.includes(": noGridText()}") && e.includes("Type the box's West, South, East and North"));
  assert.ok(e.includes('layers.length === 1 ? tr("Only {v} cells have a value of {label} ({p}%)'));
  const t = read("components/PlannedHoleTargeting.jsx");
  assert.ok(!t.includes("Typical diamond holes") && !t.includes("a voxel anomaly centre"));
});
