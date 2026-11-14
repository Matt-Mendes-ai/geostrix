// TASKS.csv #3142 (the import half of #3033) — a big .grd / .gxf no longer freezes the window on import: its reading, colours and PNG go to
// rasterImport.worker.js (the readers moved to rasterRows.js, unchanged), and their 2-98 % stretch (and gridPicture's) finds its two percentiles
// by selection instead of sorting every value (percentileSelect.js, a lazy module: idw.js makeStretch and arrayStats.js are in the startup
// bundle, #3159, and are unchanged). The same numbers and the same raster either way.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { percentileSorted } from "../src/lib/arrayStats.js";
import { percentilesBySelection, stretchP298 } from "../src/lib/percentileSelect.js";
import { makeStretch } from "../src/lib/idw.js";
import { gridPicture } from "../src/lib/gridPicture.js";
import { gxfRows, grdRows, rowsPicture, GRID_MAX as GM2, makeValueGrid as MVG2, nodeGridAreaBbox as NG2 } from "../src/lib/rasterRows.js";

// a canvas stub that keeps the pixels (raster.js draws the picture of a .gxf / .grd on a canvas)
globalThis.document = globalThis.document || { createElement: () => {
  const c = { width: 0, height: 0, px: null, getContext: () => ({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (d) => { c.px = d.data; } }), toDataURL: () => `data:image/png;base64,${c.px ? c.px.length : 0}` };
  return c;
} };
const R = await import("../src/lib/raster.js");

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const sortRule = (vals, p) => percentileSorted(Float64Array.from(vals).sort(), p);

test("selection gives percentileSorted's value at each p: ties, -0 / +0, sorted and reversed input, tiny arrays", () => {
  const ps = [0, 0.02, 0.25, 0.5, 0.98, 1];
  const shapes = [
    (n) => Array.from({ length: n }, () => Math.round(rnd() * 6) - 3),
    (n) => Array.from({ length: n }, () => (rnd() < 0.3 ? -0 : rnd() < 0.5 ? 0 : rnd() - 0.5)),
    (n) => Array.from({ length: n }, (_, i) => i),
    (n) => Array.from({ length: n }, (_, i) => n - i),
    (n) => Array.from({ length: n }, (_, i) => (i < n / 2 ? i : n - i)), // organ pipe
    (n) => Array.from({ length: n }, () => 5),
  ];
  for (const shape of shapes) for (const n of [1, 2, 3, 7, 50, 999, 5000]) {
    const vals = shape(n), got = percentilesBySelection(Float64Array.from(vals), ps);
    ps.forEach((p, i) => assert.ok(Object.is(got[i], sortRule(vals, p)), `n ${n} p ${p}: ${got[i]} vs ${sortRule(vals, p)}`));
  }
  assert.deepEqual(percentilesBySelection(new Float64Array(0), [0.5]), [NaN]);
});

test("stretchP298 is makeStretch(values, \"p2-98\") (the sort) by selection: the same lo / hi / mode and the same t()", () => {
  for (let t = 0; t < 400; t++) {
    const n = Math.floor(rnd() * 800);
    const finite = Float64Array.from({ length: n }, () => { const r = rnd(); return r < 0.05 ? -0 : r < 0.1 ? 0 : Math.round(rnd() * 50) * (rnd() < 0.3 ? -1 : 1); });
    const want = makeStretch(finite, "p2-98"), got = stretchP298(Float64Array.from(finite));
    assert.ok(Object.is(got.lo, want.lo) && Object.is(got.hi, want.hi) && got.mode === want.mode, `n ${n}: ${got.lo}..${got.hi} vs ${want.lo}..${want.hi}`);
    for (const x of [-60, -1, 0, 3, 17, 60]) assert.equal(got.t(x), want.t(x));
  }
  // gridPicture's percentiles (the filter worker's picture) by the same rule
  const vals = Float64Array.from({ length: 3000 }, () => (rnd() < 0.1 ? NaN : rnd() * 100));
  const pic = gridPicture(vals, 60, 50);
  assert.equal(pic.lo, sortRule([...vals].filter(Number.isFinite), 0.02));
  assert.equal(pic.hi, sortRule([...vals].filter(Number.isFinite), 0.98));
});

const gxfText = (nx, ny, sense = 1) => {
  const lines = ["#POINTS", String(nx), "#ROWS", String(ny), "#PTSEPARATION", "25", "#XORIGIN", "430000", "#YORIGIN", "6280000", "#SENSE", String(sense), "#DUMMY", "-99999", "#GRID"];
  for (let r = 0; r < ny; r++) lines.push(Array.from({ length: nx }, (_, c) => ((r * 7 + c) % 23 === 0 ? "-99999" : (100 + r * 2.5 - c * 1.5).toFixed(2))).join(" "));
  return lines.join("\n");
};
const fileOf = (name, text) => ({ name, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer });

test("raster.js parseGXF / parseGRD are rasterRows.js's readers with the picture on a canvas; the moved helpers are re-exported", async () => {
  const text = gxfText(40, 30, -1);
  const a = await R.parseGXF(fileOf("t.gxf", text));
  const { record, rgba, outW, outH } = rowsPicture(gxfRows(text, "t.gxf"));
  assert.deepEqual({ ...a, dataUrl: undefined, pixels: undefined }, { ...record, dataUrl: undefined, pixels: undefined });
  assert.deepEqual([a.pixels.width, a.pixels.height], [outW, outH]);
  assert.deepEqual([...a.pixels.data], [...rgba]);
  assert.equal(R.GRID_MAX, GM2); assert.equal(R.makeValueGrid, MVG2); assert.equal(R.nodeGridAreaBbox, NG2);
  await assert.rejects(R.parseGXF(fileOf("bad.gxf", "nothing")), /no #GRID section/);
  assert.equal(typeof grdRows, "function");
});

test("off the UI thread: the worker's answer becomes the same raster; a worker that fails or cannot start reads the file here", async () => {
  const text = gxfText(64, 48), file = fileOf("w.gxf", text);
  const inline = await R.parseGXF(file);
  // a stand-in worker that runs what rasterImport.worker.js runs (rowsPicture; the PNG is the caller's), answering asynchronously
  const answering = () => {
    const w = { terminated: false, terminate() { this.terminated = true; }, postMessage(msg, transfer) {
      assert.ok(transfer.includes(msg.buf), "the file's bytes are transferred, not copied");
      assert.equal(msg.kind, "gxf"); assert.equal(msg.name, "w.gxf"); assert.ok(msg.lang && "code" in msg.lang);
      const { record, rgba, outW, outH } = rowsPicture(gxfRows(new TextDecoder().decode(msg.buf), msg.name));
      setTimeout(() => w.onmessage({ data: { id: msg.id, res: { record, dataUrl: "data:image/png;base64,worker", rgba, outW, outH } } }), 0);
    } };
    return w;
  };
  const off = await R.parseGridFileOffThread(file, "gxf", { makeWorker: answering });
  assert.equal(off.dataUrl, "data:image/png;base64,worker");
  assert.deepEqual({ ...off, dataUrl: 0, pixels: 0 }, { ...inline, dataUrl: 0, pixels: 0 });
  assert.deepEqual([...off.pixels.data], [...inline.pixels.data]);
  // failed (no OffscreenCanvas, a file it refuses) -> read here; a refused file then gives the reader's own message
  const failing = () => { const w = { terminate() {}, postMessage(msg) { setTimeout(() => w.onmessage({ data: { id: msg.id, failed: "no OffscreenCanvas" } }), 0); } }; return w; };
  const back = await R.parseGridFileOffThread(file, "gxf", { makeWorker: failing });
  assert.deepEqual({ ...back }, { ...inline });
  await assert.rejects(R.parseGridFileOffThread(fileOf("bad.gxf", "nothing"), "gxf", { makeWorker: failing }), /no #GRID section/);
  // no worker at all (Node has none): read here
  assert.deepEqual(await R.parseGridFileOffThread(file, "gxf", { makeWorker: () => { throw new Error("no Worker"); } }), inline);
});

test("the import routes .gxf / .grd through the worker; the worker runs the shared readers and an OffscreenCanvas", () => {
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /const parsed = isGxf \|\| isGrd \? await parseGridFileOffThread\(file, isGxf \? "gxf" : "grd"\)/);
  const w = readFileSync(new URL("../src/lib/rasterImport.worker.js", import.meta.url), "utf8");
  assert.match(w, /import \{ gxfRows, grdRows, rowsPicture \} from "\.\/rasterRows\.js";/);
  assert.match(w, /new OffscreenCanvas\(outW, outH\)/);
  assert.match(w, /self\.postMessage\(\{ id, failed: /);
  // the readers' module stays light enough for a worker: no DOM, no geotiff, no CRS registry
  const rr = readFileSync(new URL("../src/lib/rasterRows.js", import.meta.url), "utf8");
  assert.doesNotMatch(rr, /document\.|from "geotiff"|reproject\.js/);
  // nothing new in the startup bundle (#3159): makeStretch and arrayStats.js keep their code; the selection is reached only from lazy modules
  assert.doesNotMatch(readFileSync(new URL("../src/lib/idw.js", import.meta.url), "utf8"), /percentileSelect|percentilesBySelection/);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/arrayStats.js", import.meta.url), "utf8"), /percentilesBySelection/);
  assert.match(rr, /import \{ stretchP298 \} from "\.\/percentileSelect\.js";/);
});
