// TASKS.csv #808 — depth estimates from potential-field grids, checked against fields whose depth is known by
// construction (not against this code's own maths).
import test from "node:test";
import assert from "node:assert/strict";
import { tiltDepth, radialSpectrum, fitSpectrumDepths, matchedFilter, applyGridFilter } from "../src/lib/gridFilters.js";

test("#808 tilt-depth over a vertical contact recovers its depth", () => {
  // the RTP field of a 2D vertical contact (a step in magnetization) at depth z0 is A * atan(x / z0) up to sign:
  // its horizontal derivative peaks over the contact with half-width z0
  const nx = 512, ny = 64, dx = 10, z0 = 60, xc = nx * dx / 2;
  const values = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = 100 * Math.atan((i * dx - xc) / z0);
  const r = tiltDepth({ nx, ny, dx, dy: dx, values });
  // the contact is found on every row, at the contact (within a cell), within ~10 % of z0 - the grid's mean plane is
  // removed before the gradients (as for the tilt itself), which on a pure step reads about 9 % shallow here
  const onContact = [];
  for (let k = 0; k < r.values.length; k++) if (Number.isFinite(r.values[k]) && Math.abs((k % nx) * dx - xc) <= dx) onContact.push(r.values[k]);
  assert.ok(onContact.length >= ny, `${onContact.length} contact nodes`);
  onContact.sort((a, b) => a - b);
  const med = onContact[onContact.length >> 1];
  assert.ok(Math.abs(med - z0) / z0 < 0.12, `median depth on the contact ${med} vs ${z0}`);
});

// white noise continued upward by h has a power spectrum falling exactly as exp(-2 h k)
let seed = 808;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
const noise = (n) => Float64Array.from({ length: n }, rnd);

test("#808 power spectrum: one ensemble's depth from the slope", () => {
  const nx = 256, dx = 20, h = 150;
  const g = { nx, ny: nx, dx, dy: dx, values: noise(nx * nx) };
  const up = applyGridFilter(g, "upward", { height: h }).values;
  const fit = fitSpectrumDepths(radialSpectrum({ ...g, values: up }));
  assert.ok(Math.abs(fit.deep.h - h) / h < 0.1, `fitted ${fit.deep.h} vs ${h}`);
  assert.equal(fit.shallow, null, "one ensemble: one depth, no invented shallow segment");
});

test("#808 two ensembles: deep and shallow depths, and the matched filter splits them", () => {
  const nx = 256, dx = 20, hd = 400, hs = 40;
  const base = { nx, ny: nx, dx, dy: dx };
  const deep = applyGridFilter({ ...base, values: noise(nx * nx) }, "upward", { height: hd }).values.map((v) => v * 400);
  const shallow = applyGridFilter({ ...base, values: noise(nx * nx) }, "upward", { height: hs }).values;
  const both = deep.map((v, k) => v + shallow[k]);
  const fit = fitSpectrumDepths(radialSpectrum({ ...base, values: both }));
  assert.ok(fit.shallow, "two segments found");
  assert.ok(Math.abs(fit.deep.h - hd) / hd < 0.3, `deep ${fit.deep.h} vs ${hd}`);
  assert.ok(Math.abs(fit.shallow.h - hs) / hs < 0.5, `shallow ${fit.shallow.h} vs ${hs}`);
  const m = matchedFilter({ ...base, values: both }, fit);
  const corr = (a, b) => { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };
  assert.ok(corr(m.deep, deep) > 0.9, `deep component vs the deep field: r = ${corr(m.deep, deep).toFixed(3)}`);
  assert.ok(corr(m.shallow, shallow) > corr(m.shallow, deep), "the shallow component follows the shallow field");
});

test("#808 a spectrum that does not fall gives no depth; one segment cannot be separated", () => {
  assert.equal(fitSpectrumDepths({ k: Array.from({ length: 20 }, (_, i) => i + 1), lnP: Array.from({ length: 20 }, (_, i) => i) }), null);
  assert.throws(() => matchedFilter({ nx: 8, ny: 8, dx: 1, dy: 1, values: new Float64Array(64) }, { deep: { h: 1, c: 0 }, shallow: null }), /only one depth segment/);
});
