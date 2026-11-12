// TASKS.csv #2838 / #2850 (GSC geophysics review) — the FFT grid filters froze the window 1–2 s (422 x 332) to 5–7 s (945 x 501). They now run
// in a worker (gridFilter.worker.js) through gridFilterClient.js, with the same function, so the result is identical; with no worker the
// client runs it in place, as before. SYNTHETIC grids.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyGridFilter } from "../src/lib/gridFilters.js";
import { applyGridFilterAsync } from "../src/lib/gridFilterClient.js";

const synth = (nx = 48, ny = 40) => {
  const values = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = 100 * Math.exp(-((i - 20) ** 2 + (j - 18) ** 2) / 50) + 0.3 * i;
  values[5] = NaN; // a gap
  return { nx, ny, dx: 50, dy: 50, values };
};

// a stand-in Worker that runs the real worker module's handler (as the browser would, but in this thread)
async function fakeWorkerFactory() {
  const posted = [];
  globalThis.self = { postMessage: (m) => posted.push(m) };
  await import("../src/lib/gridFilter.worker.js?" + Math.random());
  const handler = globalThis.self.onmessage;
  const transfers = [];
  return () => {
    const w = { terminated: false, terminate() { this.terminated = true; } };
    w.postMessage = (msg, tr) => { transfers.push(tr); setTimeout(() => { posted.length = 0; handler({ data: msg }); w.onmessage({ data: posted[0] }); }, 0); };
    w.transfers = transfers;
    return w;
  };
}

test("no worker available (Node): the client runs the same function in place", async () => {
  const g = synth();
  const a = await applyGridFilterAsync(g, "vd1", {});
  const b = applyGridFilter(g, "vd1", {});
  assert.deepEqual(Array.from(a.values), Array.from(b.values));
});

test("through the worker: identical values, the warning and the amplitude inclination come back; the caller's grid is untouched", async () => {
  const make = await fakeWorkerFactory();
  const g = synth(), before = Float32Array.from(g.values);
  for (const [kind, opts] of [["vd1", {}], ["tilt", {}], ["as", {}], ["upward", { height: 200 }], ["rtp", { inclination: 12, declination: 5 }], ["rtpa", { inclination: 12, declination: 5 }]]) {
    const w = await applyGridFilterAsync(g, kind, opts, { makeWorker: make });
    const d = applyGridFilter(g, kind, opts);
    assert.deepEqual(Array.from(w.values), Array.from(d.values), kind);
    assert.equal(w.warning ?? null, d.warning ?? null, kind);
    assert.equal(w.amplitudeInclination ?? null, d.amplitudeInclination ?? null, kind);
  }
  assert.deepEqual(Array.from(g.values), Array.from(before)); // a copy was sent
});

test("a thrown message comes back as an error, not a hang", async () => {
  const make = await fakeWorkerFactory();
  await assert.rejects(applyGridFilterAsync(synth(), "rtp", {}, { makeWorker: make }), /inclination/);
});

test("wired: runFilter awaits the worker; the worker file is the one Vite bundles", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const \{ applyGridFilterAsync \} = await import\("\.\.\/lib\/gridFilterClient\.js"\);/);
  assert.match(m, /const out = await applyGridFilterAsync\(\{ nx: g\.nx, ny: g\.ny, dx: g\.dx, dy: g\.dy, values \}, filt\.kind,/);
  const c = readFileSync(new URL("../src/lib/gridFilterClient.js", import.meta.url), "utf8");
  assert.match(c, /new Worker\(new URL\("\.\/gridFilter\.worker\.js", import\.meta\.url\), \{ type: "module" \}\)/);
});
