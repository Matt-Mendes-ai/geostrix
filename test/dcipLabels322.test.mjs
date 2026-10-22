// TASKS.csv #322 — the DC/IP section image's colour-scale labels: three significant figures, never exponent notation
import test from "node:test";
import assert from "node:assert/strict";
import { sig3 } from "../src/lib/dcipSectionImage.js";

test("#322 colour-scale labels without exponent notation", () => {
  assert.equal(sig3(1234), "1,230");
  assert.equal(sig3(98765), "98,800");
  assert.equal(sig3(12.345), "12.3");
  assert.equal(sig3(0.012345), "0.0123");
  assert.equal(sig3(5), "5");
  assert.equal(sig3(NaN), "");
});

test("#322 a saved line's section is compact: mesh to the millimetre, values to 5 significant digits", async () => {
  const { slimDcipResult } = await import("../src/lib/dcip.js");
  const N = 8190, r = (k, f = 0) => Array.from({ length: N }, (_, i) => k * Math.abs(Math.sin(i * 1.37 + f)) + Math.cos(i) / 7);
  const full = { s: r(400), z: r(-200, 1), ds: r(5, 2), dz: r(5, 3), resistivity: r(1000, 4).map((v) => v + 1), support: r(1, 5), chargeability: r(30, 6), doi: r(1, 7) };
  const res = { cells: full, electrodes: [], phi_d: 1, target: 1, mesh: {}, versions: {} };
  const slim = slimDcipResult(res).cells;
  const before = JSON.stringify(full).length, after = JSON.stringify(slim).length;
  assert.ok(after < 0.5 * before, `${before} -> ${after} characters`);
  for (let i = 0; i < N; i += 97) {
    assert.ok(Math.abs(slim.s[i] - full.s[i]) <= 0.0005);
    assert.ok(Math.abs(slim.resistivity[i] - full.resistivity[i]) / full.resistivity[i] < 1e-4);
  }
});
