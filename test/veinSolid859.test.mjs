// TASKS.csv #859 — a vein solid stitched from its hangingwall and footwall (Matt: "vein solid from two surfaces"). The
// #855 review's pair: 300 x 200 m walls 20 m apart (true volume 1.20 Mm3), which Solid blocks over-filled +186 % at 45°,
// +238 % at 70° and coded as nothing at 90°.
import test from "node:test";
import assert from "node:assert/strict";
import { veinSolidFromSurfaces } from "../src/lib/veinSolid.js";
import { validateSolid, isValidSolid } from "../src/lib/meshValidate.js";

const rad = (d) => (d * Math.PI) / 180;
// a planar wall: strike along N (y), dipping east at `dip`, offset `off` metres along the pole, 300 m along strike x
// 200 m down dip, as a 10 x 10 grid of quads
function wall(dip, off, n = 10) {
  const pole = [Math.sin(rad(dip)), 0, Math.cos(rad(dip))], down = [Math.cos(rad(dip)), 0, -Math.sin(rad(dip))];
  const P = [], I = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const s = (i / n) * 300, d = (j / n) * 200;
    P.push(500000 + down[0] * d + pole[0] * off, 6000000 + s, 1000 + down[2] * d + pole[2] * off);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; I.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1); }
  return { positions: Float64Array.from(P), indices: Uint32Array.from(I) };
}

for (const dip of [20, 45, 70, 90]) {
  test(`#859 a ${dip}° vein, 20 m thick: a valid closed solid of about 1.2 Mm3, true thickness 20 m`, () => {
    const r = veinSolidFromSurfaces(wall(dip, 20), wall(dip, 0));
    assert.ok(isValidSolid(validateSolid(r.positions, r.indices)), "closed, consistently wound, not self-crossing");
    assert.ok(Math.abs(r.volume - 1.2e6) / 1.2e6 < 0.03, `volume ${(r.volume / 1e6).toFixed(3)} Mm3`);
    assert.ok(Math.abs(r.thickness.mean - 20) < 0.01 && Math.abs(r.thickness.min - 20) < 0.01);
    assert.ok(Math.abs(r.dip - dip) < 0.5, `dip ${r.dip.toFixed(1)}`);
    assert.equal(r.pinchedNodes, 0);
  });
}

test("#859 the walls given the other way round give the same solid; where the walls cross the solid ends, and those nodes are counted", () => {
  const a = veinSolidFromSurfaces(wall(60, 20), wall(60, 0)), b = veinSolidFromSurfaces(wall(60, 0), wall(60, 20));
  assert.ok(Math.abs(a.volume - b.volume) < 1);
  // a footwall that rises through the hangingwall over half its length: tilt it
  const fw = wall(60, 0);
  for (let k = 0; k < fw.positions.length; k += 3) { const s = fw.positions[k + 1] - 6000000; fw.positions[k] += Math.sin(rad(60)) * (s / 300) * 40; fw.positions[k + 2] += Math.cos(rad(60)) * (s / 300) * 40; }
  const r = veinSolidFromSurfaces(wall(60, 20), fw);
  assert.ok(r.pinchedNodes > 0, "nodes where the footwall is above the hangingwall");
  assert.ok(isValidSolid(validateSolid(r.positions, r.indices)));
  assert.ok(r.thickness.min > 0 && r.volume < a.volume, "only the part where the walls are apart");
});

test("#859 walls that do not overlap are refused", () => {
  const far = wall(70, 0);
  for (let k = 1; k < far.positions.length; k += 3) far.positions[k] += 5000;
  assert.throws(() => veinSolidFromSurfaces(wall(70, 20), far), /NO_OVERLAP/);
});
