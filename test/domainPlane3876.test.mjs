// TASKS.csv #3876 (#3674's open point) — a domain update searches the new holes' indicator along the domain's own plane (lib/viewer/domainUpdate.js
// domainPlaneSearch), not a sphere: a synthetic steep slab is found as one, a blob keeps the sphere, and the run passes the plane to the estimate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { domainPlaneSearch } from "../src/lib/viewer/domainUpdate.js";

// the vertices of a box's surface, a x b x c m, turned to dip `dip`° towards the east (the c axis is the slab's pole), seeded points on each face
function slabVertices(a, b, c, dip, n = 4000) {
  let k = 9; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647;
  const d = (dip * Math.PI) / 180, out = [];
  for (let i = 0; i < n; i++) {
    let u = (rnd() - 0.5) * a, v = (rnd() - 0.5) * b, w = (rnd() - 0.5) * c;
    const f = Math.floor(rnd() * 6); // a face: one coordinate on its bound
    if (f === 0) u = -a / 2; else if (f === 1) u = a / 2; else if (f === 2) v = -b / 2; else if (f === 3) v = b / 2; else if (f === 4) w = -c / 2; else w = c / 2;
    // u: down the dip (east and down), v: along strike (north), w: the pole
    const x = u * Math.cos(d) + w * Math.sin(d), z = -u * Math.sin(d) + w * Math.cos(d);
    out.push(5000 + x, 6000 + v, 300 + z);
  }
  return Float64Array.from(out);
}

test("a steep slab domain gives its own plane; the search keeps the sphere's volume", () => {
  const p = domainPlaneSearch(slabVertices(300, 400, 20, 70), 60);
  assert.ok(p, "a plane");
  assert.ok(Math.abs(p.trend.dip - 70) < 5, String(p.trend.dip));
  assert.ok(Math.abs(p.trend.dipAzimuth - 90) < 8 || Math.abs(p.trend.dipAzimuth - 270) < 8, String(p.trend.dipAzimuth));
  const [A, B, C] = p.axesM;
  assert.ok(A > 60 && C < 60, p.axesM.join(" x "));
  assert.ok(Math.abs(A * B * C - 60 ** 3) / 60 ** 3 < 0.05); // the volume of the 60 m sphere
});

test("a blob, or too few vertices, keeps the sphere", () => {
  assert.equal(domainPlaneSearch(slabVertices(100, 100, 100, 0), 60), null);
  assert.equal(domainPlaneSearch(Float64Array.from([0, 0, 0, 1, 1, 1]), 60), null);
  assert.equal(domainPlaneSearch(slabVertices(300, 400, 20, 70), 0), null);
});

test("the update run searches the indicator along the plane and says so", () => {
  const run = readFileSync(new URL("../src/modules/viewer/domainUpdateRun.js", import.meta.url), "utf8");
  assert.match(run, /const plane = domainPlaneSearch\(P, 2 \* S\);/);
  assert.match(run, /searchRadius: plane \? plane\.majorM : 2 \* S,/);
  assert.match(run, /\.\.\.\(plane \? \{ trend: \{ basis: plane\.basis, scales: plane\.scales \} \} : \{\}\)/);
  assert.match(run, /indicatorSearch: plane \?/);
  assert.match(run, /The new holes' grade was spread along \\"\{name\}\\"'s own plane/);
});
