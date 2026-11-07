// TASKS.csv #1988 — low-latitude reductions (amplitude-corrected RTP, RTE) and worms, checked against fields computed in space
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyGridFilter, worms, wormHeights, amplitudeInclination, FILTERS } from "../src/lib/gridFilters.js";

// induced point dipole, total-field anomaly; x east, y north, z up; row 0 = north (as in core.test.mjs #373)
function dipoleTMI({ n = 128, d = 20, depth = 150, I, D }) {
  const r2d = Math.PI / 180, f = [Math.cos(I * r2d) * Math.sin(D * r2d), Math.cos(I * r2d) * Math.cos(D * r2d), -Math.sin(I * r2d)];
  const out = new Float64Array(n * n), c = (n / 2) * d;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = [i * d - c, (n - 1 - j) * d - c, depth], rr = Math.hypot(...r);
    const md = f[0] * r[0] + f[1] * r[1] + f[2] * r[2];
    const B = r.map((ri, k) => (3 * md * ri) / rr ** 5 - f[k] / rr ** 3);
    out[j * n + i] = 1e9 * (B[0] * f[0] + B[1] * f[1] + B[2] * f[2]);
  }
  return out;
}
const n = 128, grid = (values) => ({ nx: n, ny: n, dx: 20, dy: 20, values }), centre = (n / 2 - 1) * n + n / 2;
const compareCentral = (a, b) => { let s = 0, c = 0, lo = Infinity, hi = -Infinity; for (let j = n / 4; j < (3 * n) / 4; j++) for (let i = n / 4; i < (3 * n) / 4; i++) { const k = j * n + i; s += (a[k] - b[k]) ** 2; c++; lo = Math.min(lo, b[k]); hi = Math.max(hi, b[k]); } return Math.sqrt(s / c) / (hi - lo); };
const arg = (a, better) => { let p = null, at = -1; a.forEach((v, k) => { if (p === null || better(v, p)) { p = v; at = k; } }); return at; };
const range = (a) => Math.max(...a) - Math.min(...a);

test("RTE matches the field at the equator computed in space, at 5 to 15 degrees; its low sits on the source", () => {
  for (const I of [5, 10, 15]) {
    const rte = applyGridFilter(grid(dipoleTMI({ I, D: 20 })), "rte", { inclination: I, declination: 20 }).values;
    const eq = dipoleTMI({ I: 0, D: 20 });
    assert.ok(compareCentral(rte, eq) < 0.01, `I ${I}: ${compareCentral(rte, eq)}`);
    assert.equal(arg(rte, (v, p) => v < p), centre, "a magnetic body is a low at the equator");
  }
});

test("amplitude-corrected RTP: RTP exactly when Ia = I; bounded and on the source at a low inclination", () => {
  const t60 = dipoleTMI({ I: 60, D: 20 });
  const a = applyGridFilter(grid(t60), "rtp", { inclination: 60, declination: 20 }).values, b = applyGridFilter(grid(t60), "rtpa", { inclination: 60, declination: 20, amplitudeInclination: 60 }).values;
  let md = 0; for (let k = 0; k < a.length; k++) md = Math.max(md, Math.abs(a[k] - b[k]));
  assert.ok(md < 1e-9 * range(a), `Ia = I is RTP: ${md}`);
  const pole = dipoleTMI({ I: 90, D: 0 });
  const r = applyGridFilter(grid(dipoleTMI({ I: 5, D: 20 })), "rtpa", { inclination: 5, declination: 20 });
  assert.equal(r.amplitudeInclination, 20);
  assert.equal(arg(r.values, (v, p) => v > p), centre, "the peak over the source");
  assert.ok(compareCentral(r.values, pole) < 0.06, `${compareCentral(r.values, pole)}`);
  assert.ok(range(r.values) < range(pole), "amplitudes come out lower than a true RTP");
  assert.deepEqual([amplitudeInclination(10), amplitudeInclination(-10), amplitudeInclination(35), amplitudeInclination(10, 30), amplitudeInclination(10, 5), amplitudeInclination(10, "")], [20, -20, 35, 30, 10, 20]);
});

// gravity of a contact: a stack of thin semi-infinite sheets from 100 to 600 m deep whose edges dip at dipDeg toward +x
function contact(dipDeg) {
  const out = new Float64Array(n * n), c = (n / 2) * 20;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * 20 - c; let g = 0;
    for (let z = 100; z <= 600; z += 10) g += Math.PI / 2 + Math.atan((x - (z - 100) / Math.tan((dipDeg * Math.PI) / 180)) / z);
    out[j * n + i] = g;
  }
  return out;
}
const crestX = (values) => { const xs = []; values.forEach((v, k) => { const j = Math.floor(k / n); if (Number.isFinite(v) && j > n / 4 && j < (3 * n) / 4) xs.push((k % n) * 20 - (n / 2) * 20); }); xs.sort((a, b) => a - b); return xs[xs.length >> 1]; };

test("worms: a vertical contact's edge stays put with height, a 45-degree one walks down-dip", () => {
  assert.deepEqual(wormHeights(20, 640), [20, 40, 80, 160, 320, 640]);
  const v = contact(90), d = contact(45);
  const xv = [20, 160, 640].map((h) => crestX(worms(grid(v), { heights: [h] }).values));
  assert.deepEqual(xv, [0, 0, 0]);
  const xd = [20, 160, 640].map((h) => crestX(worms(grid(d), { heights: [h] }).values));
  assert.ok(xd[0] < xd[1] && xd[1] < xd[2], `down-dip with height: ${xd}`);
  const all = worms(grid(v));
  assert.deepEqual(all.levels.map((l) => l.h), [20, 40, 80, 160, 320, 640]);
  const k0 = (n / 2) * n + n / 2; // a node on the contact
  assert.equal(all.values[k0], 640, "a node keeps the greatest height it is an edge at");
  assert.ok(worms(grid(dipoleTMI({ I: 90, D: 0 })), { integrate: true }).count > 0, "an RTP grid integrated to pseudo-gravity");
  const holes = v.slice(); holes[5] = NaN;
  assert.ok(Number.isNaN(worms(grid(holes)).values[5]));
});

test("wired: the Raster tab offers the three and records what it used", () => {
  for (const k of ["rtpa", "rte", "worms"]) assert.ok(FILTERS[k]);
  const s = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  for (const k of ["rtpa", "rte", "worms"]) assert.ok(s.includes(`<option value="${k}">`), k);
  assert.match(s, /worms\(\{ nx: g\.nx, ny: g\.ny, dx: g\.dx, dy: g\.dy, values \}, \{ integrate: !!filt\.integrate \}\)/);
  assert.match(s, /if \(filt\.kind === "rtpa"\) params\.amplitudeInclination = out\.amplitudeInclination;/);
});
