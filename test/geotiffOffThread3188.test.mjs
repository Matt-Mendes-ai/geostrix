// TASKS.csv #3188 (split from #3142) — a GeoTIFF's import froze the window (a 5000 x 5000 single-band file: 2.5 s and 2.1 s of a 5.2 s import;
// 4.0 s and 3.3 s more when reprojected). parseGeoTIFF and the picture's reprojection run in geotiffImport.worker.js; here a fake worker runs
// the worker's own code (raster.js geotiffImportWork) in-process, with an OffscreenCanvas stand-in, and the results match the page's reading.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeGeoTiff } from "../src/lib/geotiffWrite.js";

// the canvas stand-ins: the page's (document) and the worker's (OffscreenCanvas)
const ctx2d = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData() {} });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx2d, toDataURL: (t) => `data:${t || "image/png"};base64,PAGE` }) };
class FakeOffscreen { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx2d(); } async convertToBlob({ type }) { return new Blob([new Uint8Array([1, 2, 3])], { type }); } }
globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
const { parseGeoTIFF, parseGeoTiffOffThread, reprojectPictureOffThread, geotiffImportWork } = await import("../src/lib/raster.js");
const { reprojectImageRGBA, getProj4Def } = await import("../src/lib/reproject.js");

// a worker that runs the real job in this process, as the browser would (structured clone of the message both ways), with no document
function fakeWorker({ fail = null } = {}) {
  const w = { terminate() {}, onmessage: null, onerror: null };
  w.postMessage = (msg) => {
    queueMicrotask(async () => {
      const d = structuredClone(msg);
      if (fail) { w.onmessage({ data: { id: d.id, failed: fail } }); return; }
      const doc = globalThis.document; delete globalThis.document; globalThis.OffscreenCanvas = FakeOffscreen;
      let out;
      try { const { res } = await geotiffImportWork(d); out = { id: d.id, res: structuredClone(res) }; } catch (err) { out = { id: d.id, error: String(err.message) }; }
      finally { globalThis.document = doc; delete globalThis.OffscreenCanvas; }
      w.onmessage({ data: out });
    });
  };
  return w;
}

const W = 60, H = 40;
const vals = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) vals[j * W + i] = i === 0 && j === 0 ? -99999 : 57000 + 3 * i - 2 * j + (i * j) % 7;
const tif = new File([new Uint8Array(writeGeoTiff(vals, { width: W, height: H, ModelPixelScale: [10, 10, 0], ModelTiepoint: [0, 0, 0, 350000, 6334000, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 26909, GDAL_NODATA: "-99999" }))], "SYNTH_mag.tif");

test("the worker's reading is the page's reading: the box, the CRS tag, the coloured pixels, the kept values and the stretch", async () => {
  const page = await parseGeoTIFF(tif, {});
  const off = await parseGeoTiffOffThread(tif, {}, { makeWorker: () => fakeWorker() });
  assert.deepEqual(off.bbox, page.bbox);
  assert.equal(off.epsgTag, page.epsgTag);
  assert.deepEqual([off.width, off.height, off.bandCount], [W, H, 1]);
  assert.deepEqual(Array.from(off.pixels.data), Array.from(page.pixels.data));
  assert.equal(off.pixels.data[3], 0); // the no-data corner stays transparent
  assert.deepEqual(Array.from(off.grid.values), Array.from(page.grid.values));
  assert.deepEqual(off.stretch, page.stretch);
  assert.match(off.dataUrl, /^data:image\/png;base64,/); // from convertToBlob in the worker
});

test("a file the reader refuses gives the reader's own message; a worker that cannot run falls back to the page", async () => {
  const notTiff = new File([new TextEncoder().encode("hole_id,x,y\nA,1,2\n")], "collars.csv");
  await assert.rejects(parseGeoTiffOffThread(notTiff, {}, { makeWorker: () => fakeWorker() }), /is not a TIFF, \.gxf or \.grd: a table goes to Geochem/);
  const fb = await parseGeoTiffOffThread(tif, {}, { makeWorker: () => fakeWorker({ fail: "no OffscreenCanvas" }) });
  assert.equal(fb.dataUrl, "data:image/png;base64,PAGE"); // read on the page
  const thrown = await parseGeoTiffOffThread(tif, {}, { makeWorker: () => { throw new Error("no Worker"); } });
  assert.equal(thrown.dataUrl, "data:image/png;base64,PAGE");
});

test("the picture's reprojection in the worker is reprojectImageRGBA's, with its picture", async () => {
  const page = await parseGeoTIFF(tif, {});
  const [x0, y0, x1, y1] = page.bbox;
  const img = { xmin: x0 - 600000 + 135000, ymin: y0, xmax: x1 - 600000 + 135000, ymax: y1, ...page.pixels }; // read as zone 10 numbers
  const from = await getProj4Def(32610), to = await getProj4Def(26909);
  const want = reprojectImageRGBA(img, from, to, img.width, img.height);
  const got = await reprojectPictureOffThread(img, from, to, false, { makeWorker: () => fakeWorker() });
  assert.deepEqual(got.bbox, want.bbox);
  assert.deepEqual([got.width, got.height], [want.width, want.height]);
  assert.deepEqual(Array.from(got.data), Array.from(want.data));
  assert.match(got.dataUrl, /^data:image\/png;base64,/);
  const fb = await reprojectPictureOffThread(img, from, to, false, { makeWorker: () => fakeWorker({ fail: "x" }) });
  assert.deepEqual(Array.from(fb.data), Array.from(want.data));
});

test("the import uses the worker for a GeoTIFF without a band function, and for the reprojection", () => {
  const src = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /bandFn \? await parseGeoTIFF\(file, \{ bandFn, samples, maxSide, worldFile \}\) : await parseGeoTiffOffThread\(file, \{ samples, maxSide, worldFile \}\)/);
  assert.match(src, /const rp = await reprojectPictureOffThread\(\{ xmin, ymin, xmax, ymax, width, height, data \}, fromDef, toDef, keepDetail\);/);
  const wk = readFileSync(new URL("../src/lib/geotiffImport.worker.js", import.meta.url), "utf8");
  assert.match(wk, /import \{ geotiffImportWork \} from "\.\/raster\.js";/);
});
