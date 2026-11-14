// TASKS.csv #3378 (#3195, Galore Creek review) — 'Unit at 50 m down each hole' left out the holes still in overburden at 50 m (the deepest
// cover, what a map at depth is for), the layer was named '50 m below the collars' though the depth is down the hole, and cover_m was the
// down-hole length on holes inclined 50 to 85 degrees. SYNTHETIC holes (no Galore data).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarSubcrop, subcropLayer } from "../src/lib/collarSubcrop.js";

// dip positive down, as stored. D1: 60 m of overburden (in cover at 50 m); I1: inclined 50 degrees, overburden to 62.56 m; V1 vertical.
const collars = [
  { hole_id: "D1", x: 0, y: 0, z: 1000, azimuth: 0, dip: 90, length: 200 },
  { hole_id: "I1", x: 500, y: 0, z: 1000, azimuth: 90, dip: 50, length: 200 },
  { hole_id: "V1", x: 1000, y: 0, z: 1000, azimuth: 0, dip: 90, length: 200 },
  { hole_id: "C1", x: 1500, y: 0, z: 1000, azimuth: 0, dip: 90, length: 40 },
];
const litho = [
  { hole_id: "D1", from: 0, to: 60, value: "OVB" }, { hole_id: "D1", from: 60, to: 200, value: "V3" },
  { hole_id: "I1", from: 0, to: 62.56, value: "OVB" }, { hole_id: "I1", from: 62.56, to: 200, value: "i9a" },
  { hole_id: "V1", from: 0, to: 12, value: "OVB" }, { hole_id: "V1", from: 12, to: 200, value: "B" },
  { hole_id: "C1", from: 0, to: 40, value: "OVB" }, // cover to the end of a 40 m log: does not reach 50 m
];

test("at a typed depth a hole still in cover gives a point of its cover code; one whose log stops short is counted", () => {
  const rep = {};
  const pts = collarSubcrop({ collars, survey: [], litho, atDepthM: 50, report: rep });
  assert.deepEqual(pts.map((p) => [p.hole_id, p.unit]), [["D1", "OVB"], ["I1", "OVB"], ["V1", "B"]]);
  assert.equal(rep.notAtDepth, 1, "C1's log ends at 40 m");
  // with no depth, a hole all in cover still gives no point (#2566's 'only cover')
  assert.deepEqual(collarSubcrop({ collars, survey: [], litho }).map((p) => p.hole_id), ["D1", "I1", "V1"]);
  const cOnly = collarSubcrop({ collars: [{ ...collars[3], length: 200 }], survey: [], litho: [{ hole_id: "C1", from: 0, to: 200, value: "OVB" }] });
  assert.deepEqual(cOnly, []);
});

test("cover_m is the vertical depth of the cover below the collar; cover_along_hole_m its length down the hole", () => {
  const pts = collarSubcrop({ collars, survey: [], litho });
  const i1 = pts.find((p) => p.hole_id === "I1"), v1 = pts.find((p) => p.hole_id === "V1");
  assert.ok(Math.abs(i1.cover - 62.56 * Math.sin((50 * Math.PI) / 180)) < 0.01, `vertical: ${i1.cover}`); // 47.9 m, not 62.56
  assert.equal(i1.coverAlong, 62.56);
  assert.equal(v1.cover, 12); assert.equal(v1.coverAlong, 12);
  const L = subcropLayer(pts, "S");
  assert.deepEqual(L.fields, ["unit", "hole_id", "from_m", "cover_m", "cover_along_hole_m"]);
  const a = L.features.find((f) => f.attributes.hole_id === "I1").attributes;
  assert.equal(a.cover_m, 47.92); assert.equal(a.cover_along_hole_m, 62.56);
});

test("the layer is named for a depth down the holes, and the pane says which cover is which", () => {
  const s = fs.readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.ok(s.includes('tr("Units {d} m down the holes", { d: depth })') && !s.includes("m below the collars"));
  assert.ok(s.includes("if (depth != null) lo.coverOnly = 0;"));
  assert.ok(s.includes("cover_along_hole_m is its length down the hole"));
});
