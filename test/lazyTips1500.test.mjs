// TASKS.csv #1500 — drillhole objects' tooltips made on first read, and the per-interval loop without throw-away vectors
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lazyTip } from "../src/lib/viewer/lazyTip.js";

test("lazyTip: built once on first read, assignable, the other fields kept as own properties", () => {
  let made = 0;
  const ud = lazyTip({ row: { a: 1 }, holeId: "H1", catValue: "VOLC" }, () => { made++; return "H1\nLithology: VOLC"; });
  assert.equal(made, 0);
  assert.deepEqual([ud.row, ud.holeId, ud.catValue], [{ a: 1 }, "H1", "VOLC"]);
  assert.equal(ud.tip, "H1\nLithology: VOLC"); assert.equal(ud.tip.split("\n")[0], "H1"); assert.equal(made, 1);
  assert.equal(ud?.tip, "H1\nLithology: VOLC"); assert.equal(made, 1); // optional-chaining readers (userData?.tip)
  ud.tip = "replaced"; assert.equal(ud.tip, "replaced"); assert.equal(made, 1);
  assert.equal(lazyTip({}, () => "x").tip, "x");
});

test("the build: intervals, point logs, custom layers and assay markers use lazyTip with their hole id; vectors only for a bent interval", () => {
  const s = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal((s.match(/mesh\.userData = lazyTip\(\{ row(: a)?, holeId: c\.hole_id/g) || []).length, 5);
  assert.ok(!/mesh\.userData = \{ row, tip: `\$\{c\.hole_id\}/.test(s), "no eager per-row drillhole tooltip left");
  assert.match(s, /mesh_\.quaternion\.setFromUnitVectors\(UP_Y, DIR_TMP\.set\(dx \/ len, dy \/ len, dz \/ len\)\);/);
  const bent = s.indexOf("const curve = new THREE.CatmullRomCurve3(vecs);"), vecs = s.lastIndexOf("const vecs = [new THREE.Vector3(p1.x", bent);
  assert.ok(vecs > 0 && bent - vecs < 300, "the point vectors are made in the bent-interval branch");
});
