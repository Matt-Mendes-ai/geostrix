// TASKS.csv #797 — slope, aspect, curvature and multidirectional hillshade from the terrain grid
import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainDerivativeValues, hillshadeValues } from "../src/lib/hillshade.js";

const grid = (w, h, f) => { const a = new Float32Array(w * h); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) a[r * w + c] = f(c, r); return a; };
const mid = (a, w, h) => a[Math.floor(h / 2) * w + Math.floor(w / 2)];

test("#797 slope and aspect of a plane", () => {
  // rises 1 m per 10 m cell toward the east (row 0 = north): faces west, slope atan(0.1)
  const z = grid(21, 21, (c) => 100 + c);
  assert.ok(Math.abs(mid(terrainDerivativeValues("slope", z, 21, 21, 10, 10), 21, 21) - Math.atan(0.1) * 180 / Math.PI) < 1e-3);
  assert.ok(Math.abs(mid(terrainDerivativeValues("aspect", z, 21, 21, 10, 10), 21, 21) - 270) < 1e-3);
  // rises toward the north (row 0): faces south
  const zn = grid(21, 21, (c, r) => 100 - r);
  assert.ok(Math.abs(mid(terrainDerivativeValues("aspect", zn, 21, 21, 10, 10), 21, 21) - 180) < 1e-3);
  assert.ok(Number.isNaN(mid(terrainDerivativeValues("aspect", grid(9, 9, () => 5), 9, 9, 10, 10), 9, 9))); // flat
});

test("#797 curvature: a dome is convex (+), a bowl concave (-), a plane 0", () => {
  const dome = grid(21, 21, (c, r) => 500 - 0.01 * ((c - 10) ** 2 + (r - 10) ** 2) * 100);
  const bowl = grid(21, 21, (c, r) => 500 + 0.01 * ((c - 10) ** 2 + (r - 10) ** 2) * 100);
  assert.ok(mid(terrainDerivativeValues("curvature", dome, 21, 21, 10, 10), 21, 21) > 0);
  assert.ok(mid(terrainDerivativeValues("curvature", bowl, 21, 21, 10, 10), 21, 21) < 0);
  assert.ok(Math.abs(mid(terrainDerivativeValues("curvature", grid(21, 21, (c) => 100 + c), 21, 21, 10, 10), 21, 21)) < 1e-6);
});

test("#797 multidirectional hillshade lights slopes of every strike, unlike one sun", () => {
  // a slope facing north-west (toward the default 315 sun) and one facing north-east (across it)
  const nw = grid(21, 21, (c, r) => 100 + 2 * c + 2 * r), ne = grid(21, 21, (c, r) => 100 - 2 * c + 2 * r);
  const one = (z) => mid(hillshadeValues(z, 21, 21, 10, 10, { azimuthDeg: 315, altitudeDeg: 45 }), 21, 21);
  const multi = (z) => mid(terrainDerivativeValues("multi", z, 21, 21, 10, 10), 21, 21);
  const v = [multi(nw), multi(ne)];
  assert.ok(v.every((x) => x >= 0 && x <= 1), JSON.stringify(v));
  assert.ok(Math.abs(multi(nw) - multi(ne)) < Math.abs(one(nw) - one(ne)), `one sun ${one(nw).toFixed(2)} / ${one(ne).toFixed(2)}, multi ${v.map((x) => x.toFixed(2))}`);
});

test("#797 hillshade: a slope facing the sun is lit, whatever its compass direction (the N / S lighting was swapped)", () => {
  const g = (f) => grid(21, 21, f), m = (a) => mid(a, 21, 21);
  const facing = { 0: g((c, r) => 100 + 5 * r), 180: g((c, r) => 100 - 5 * r), 270: g((c) => 100 + 5 * c), 90: g((c) => 100 - 5 * c) }; // rows run south
  for (const az of [0, 90, 180, 270]) {
    const lit = m(hillshadeValues(facing[az], 21, 21, 10, 10, { azimuthDeg: az })), away = m(hillshadeValues(facing[(az + 180) % 360], 21, 21, 10, 10, { azimuthDeg: az }));
    assert.ok(lit > away + 0.3, `sun from ${az}: the slope facing it ${lit.toFixed(2)}, the one facing away ${away.toFixed(2)}`);
  }
});
