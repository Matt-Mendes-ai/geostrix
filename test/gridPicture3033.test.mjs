// TASKS.csv #3033 (split from #2838) — a filtered raster's picture (2-98 % stretch, viridis colours, PNG, stored values) is made in the
// grid-filter worker too: the last ~0.3-1 s of a filter's freeze. The picture must be exactly what rasterFromGrid made.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gridPicture, PICTURE_RAMP } from "../src/lib/gridPicture.js";
import { VIRIDIS_ANCHORS } from "../src/lib/layers.js";
import { percentileSorted } from "../src/lib/arrayStats.js";
import { f32ToB64 } from "../src/lib/inversion.js";
import { rasterFromGridAsync } from "../src/lib/gridFilterClient.js";

let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const nx = 60, ny = 40;
const values = Float64Array.from({ length: nx * ny }, (_, i) => (i % 37 === 5 ? NaN : 100 * Math.sin(i / 50) + rnd() * 30));

// rasterFromGrid's picture as it was (master before #3033)
function oldPicture(vals) {
  const finite = [];
  for (const v of vals) if (Number.isFinite(v)) finite.push(v);
  finite.sort((a, b) => a - b);
  const lo = percentileSorted(finite, 0.02), hi = percentileSorted(finite, 0.98);
  const R = VIRIDIS_ANCHORS, n = R.length - 1;
  const col = (t) => { const seg = Math.min(n - 1, Math.max(0, Math.floor(t * n))), lt = t * n - seg, a = R[seg], b = R[seg + 1]; return [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * lt)); };
  const data = new Uint8ClampedArray(nx * ny * 4);
  for (let k = 0; k < nx * ny; k++) { const v = vals[k]; if (!Number.isFinite(v)) continue; const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5; const [r, g, b] = col(t); data.set([r, g, b, 255], k * 4); }
  return { lo, hi, valid: finite.length, data, b64: f32ToB64(Float32Array.from(vals)) };
}

test("the picture is the one rasterFromGrid made: the stretch, every pixel, the stored values", () => {
  const o = oldPicture(values), p = gridPicture(values, nx, ny);
  assert.equal(p.lo, o.lo); assert.equal(p.hi, o.hi); assert.equal(p.valid, o.valid);
  assert.deepEqual([...p.rgba], [...o.data]);
  assert.equal(p.valuesB64, o.b64);
  assert.deepEqual(PICTURE_RAMP, VIRIDIS_ANCHORS, "the copied ramp is layers.js's viridis");
  assert.equal(gridPicture(new Float64Array(4).fill(NaN), 2, 2).valid, 0);
});

test("rasterFromGridAsync: the worker makes the picture, the record is assembled here", async () => {
  // a stand-in worker that answers the "picture" op as gridFilter.worker.js does (the PNG step stubbed: no OffscreenCanvas in Node)
  const makeWorker = () => {
    const w = { terminate() {}, onmessage: null, onerror: null };
    w.postMessage = (msg) => {
      const pic = gridPicture(msg.values, msg.nx, msg.ny);
      setTimeout(() => w.onmessage({ data: { id: msg.id, res: { lo: pic.lo, hi: pic.hi, valid: pic.valid, valuesB64: pic.valuesB64, dataUrl: "data:image/png;base64,AA==" } } }), 0);
    };
    return w;
  };
  const r = await rasterFromGridAsync({ name: "Mag — RTP", values, nx, ny, x0: 1000, yTop: 5000, dx: 10, dy: 10, elevation: 400, extra: { units: "nT" } }, { makeWorker });
  const o = oldPicture(values);
  assert.equal(r.name, "Mag — RTP");
  assert.deepEqual(r.colourRange, [o.lo, o.hi]);
  assert.equal(r.grid.values, o.b64);
  assert.equal(r.grid.valid, o.valid);
  assert.deepEqual(r.bbox, [995, 5000 - 390 - 5, 1000 + 590 + 5, 5005]);
  assert.equal(r.dataUrl, "data:image/png;base64,AA==");
  assert.equal(r.units, "nT");
  assert.ok(Array.isArray(r.colourStops) && r.colourStops.length > 1);
});

test("wired: every grid made by a filter in Maps goes through the worker; the worker's picture op", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.equal((m.match(/rasterFromGridAsync\(\{/g) || []).length, 4, "the filter, worms, tilt-depth and the matched filter");
  assert.doesNotMatch(m, /[^.]rasterFromGrid\(\{/);
  const w = readFileSync(new URL("../src/lib/gridFilter.worker.js", import.meta.url), "utf8");
  assert.match(w, /if \(e\.data\?\.op === "picture"\)/);
  assert.match(w, /new OffscreenCanvas\(nx, ny\)/);
});

test("makeStretch (the Maps card's colours of a new grid) sorts a typed array: the same lo, hi and t for every mode", async () => {
  const { makeStretch } = await import("../src/lib/idw.js");
  const old = (vals, mode) => { // the comparator version, as it was
    const v = []; for (const x of vals) if (Number.isFinite(x)) v.push(x); v.sort((a, b) => a - b);
    const q = (p) => percentileSorted(v, p);
    if (mode === "linear") return [v[0], v[v.length - 1]];
    if (mode === "log") { const pos = v.filter((x) => x > 0); return [percentileSorted(pos, 0.02), percentileSorted(pos, 0.98)]; }
    if (mode === "equalise") return [v[0], v[v.length - 1]];
    return [q(0.02), q(0.98)];
  };
  const vals = Array.from(values).map((v, i) => (i % 11 === 0 ? -Math.abs(v) / 50 : v));
  for (const mode of ["p2-98", "linear", "log", "equalise"]) {
    const s = makeStretch(vals, mode), o = old(vals, mode);
    assert.deepEqual([s.lo, s.hi], o, mode);
    for (const x of [vals[3], vals[100], vals[777]]) assert.ok(Number.isFinite(s.t(x)), mode);
  }
});
