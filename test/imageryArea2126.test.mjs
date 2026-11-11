// TASKS.csv #2126 — the Satellite / Spectral index default area follows the traced holes (or the main group of collars), not a whole
// district collar list; the district stays an option, and the picker says when its pixels are far coarser than the imagery's
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { imageryAreaCollars, fetchAreaBox } from "../src/lib/dataExtent.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

// SYNTHETIC: 60 district collars over 50 x 55 km with no trace, 10 surveyed holes in three groups 3-5 km apart
const district = Array.from({ length: 60 }, (_, i) => ({ hole_id: `D${i}`, x: 600000 + (i % 8) * 7000, y: 5800000 + Math.floor(i / 8) * 7800, dip: "", azimuth: "" }));
const recent = [[640000, 5830000], [643000, 5832000], [638000, 5834000]].flatMap(([x, y], g) => Array.from({ length: g === 0 ? 4 : 3 }, (_, k) => ({ hole_id: `R${g}${k}`, x: x + k * 60, y: y + k * 40 })));
const survey = recent.map((c) => ({ hole_id: c.hole_id, depth: 0, dip: -60, azimuth: 90 }));

test("#2126 the traced holes seed the area when the rest is an untraced district list", () => {
  const a = imageryAreaCollars([...district, ...recent], survey);
  assert.equal(a.by, "traced");
  assert.equal(a.total, 70);
  assert.deepEqual(a.collars.map((c) => c.hole_id).sort(), recent.map((c) => c.hole_id).sort());
  const [x0, y0, x1, y1] = fetchAreaBox(a.collars);
  assert.ok(x1 - x0 < 10000 && y1 - y0 < 10000, `${x1 - x0} x ${y1 - y0}`); // the 2024 groups, not 50 km
  const [X0, , X1] = fetchAreaBox([...district, ...recent]);
  assert.ok(X1 - X0 > 50000);
});

test("#2126 without a trace to go by: the main group of collars; otherwise all of them", () => {
  const camp = Array.from({ length: 100 }, (_, i) => ({ hole_id: `C${i}`, x: 500000 + (i % 10) * 100, y: 6000000 + Math.floor(i / 10) * 100 })); // one far collar is 1 % (mainClusters drops a group under 2 %)
  const far = { hole_id: "FAR", x: 545000, y: 6000000 };
  const a = imageryAreaCollars([...camp, far], []);
  assert.equal(a.by, "cluster");
  assert.equal(a.collars.length, 100);
  assert.equal(imageryAreaCollars(camp, []).by, "all");
  // every hole traced (a dip on each collar): nothing to choose between
  assert.equal(imageryAreaCollars(camp.map((c) => ({ ...c, dip: -90 })), []).by, "all");
  // an empty dip cell is not a trace
  assert.equal(imageryAreaCollars([...camp.map((c) => ({ ...c, dip: "" })), { ...camp[0], hole_id: "T", dip: -55 }], []).by, "traced");
});

test("#2126 the picker and the Spectral areas", () => {
  const m = read("modules/RasterModule.jsx");
  assert.match(m, /fetchAreaBox\(imageryAreaCollars\(collars, survey\)\.collars, surfaceSamples\)/);
  assert.match(m, /jobs\.push\(\{ id: "all_collars", label: tr\("Every collar \(\{n\}\)"/);
  assert.match(m, /tr\("Around the traced holes \(\{n\} of \{total\}\)"/);
  assert.match(m, /p\.pixelM > 3 \* \(naip \? NAIP_FINEST_M : 10\)/);
});
