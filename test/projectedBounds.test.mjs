// TASKS.csv #559 — reprojected extents from the edges, not the corners: a geographic tile across the central meridian
// keeps its southern strip in UTM.
import test from "node:test";
import assert from "node:assert/strict";
import { projectedBounds, getProj4DefSync, reprojectGrid, pointTransform } from "../src/lib/reproject.js";

const g = getProj4DefSync(4326), utm9 = getProj4DefSync(3156); // UTM 9N: central meridian -129

test("#559 every point of the tile's southern edge lies inside the output extent (1, 2 and 4 degrees across the CM)", () => {
  const T = pointTransform(4326, 3156);
  for (const [w, e] of [[-129.5, -128.5], [-130, -128], [-131, -127]]) {
    const [, tymin] = projectedBounds(g, utm9, w, 56, e, 57);
    let lowest = Infinity;
    for (let i = 0; i <= 400; i++) lowest = Math.min(lowest, T(w + (i / 400) * (e - w), 56)[1]);
    assert.ok(tymin <= lowest + 0.5, `${w}..${e}: extent ymin ${tymin.toFixed(1)} vs lowest edge point ${lowest.toFixed(1)}`);
    const cornersMin = Math.min(T(w, 56)[1], T(e, 56)[1]);
    assert.ok(cornersMin - tymin > 100, `${w}..${e}: corners alone would crop ${(cornersMin - tymin).toFixed(0)} m`);
  }
});

test("#559 reprojectGrid's output extent includes the bowed edge; a tile on one side of the CM is unchanged", () => {
  const r = reprojectGrid({ xmin: -129.5, ymin: 56, xmax: -128.5, ymax: 57, gridW: 2, gridH: 2, band: new Float32Array(4).fill(1) }, g, utm9, 2, 2);
  const T = pointTransform(4326, 3156);
  assert.ok(r.bbox[1] <= T(-129, 56)[1] + 0.5);
  const side = projectedBounds(g, utm9, -128.4, 56, -127.4, 57);
  const c = [[-128.4, 56], [-127.4, 56], [-127.4, 57], [-128.4, 57]].map(([x, y]) => T(x, y));
  assert.ok(Math.abs(side[1] - Math.min(...c.map((p) => p[1]))) < 5); // east of the CM the lowest point is a corner
});
