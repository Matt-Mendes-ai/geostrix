// TASKS.csv #1860 — a picture raster (an RGB plan map georeferenced in the app, a scan) exported as an RGBA GeoTIFF in the project CRS
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromArrayBuffer } from "geotiff";
import { imageToGeoTIFF, pictureExportNote } from "../src/lib/gridExport.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#1860 the picture is written as 8-bit RGB + alpha on its box, and reads back the same", async () => {
  const width = 4, height = 3, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = i * 20; data[i * 4 + 1] = 255 - i * 10; data[i * 4 + 2] = 7; data[i * 4 + 3] = i === 5 ? 0 : 255; } // one keyed-out pixel
  const bbox = [684000, 5511000, 684400, 5511300]; // SYNTHETIC: 100 m pixels
  const im = await (await fromArrayBuffer(imageToGeoTIFF({ width, height, data, bbox, epsg: 26910 }))).getImage();
  assert.deepEqual([im.getWidth(), im.getHeight(), im.getSamplesPerPixel()], [4, 3, 4]);
  assert.deepEqual(im.getBoundingBox(), bbox);
  assert.equal(im.getGeoKeys().ProjectedCSTypeGeoKey, 26910);
  assert.equal(im.fileDirectory.getValue("PhotometricInterpretation"), 2);
  assert.equal(im.fileDirectory.getValue("ExtraSamples")[0], 2); // unassociated alpha
  const px = await im.readRasters({ interleave: true });
  assert.deepEqual(Array.from(px), Array.from(data));
  assert.throws(() => imageToGeoTIFF({ width: 2, height: 2, data: new Uint8Array(12), bbox, epsg: 26910 }), /12 bytes for a 2 x 2/);
  assert.match(pictureExportNote({ name: "Chg_100", bbox }, width, height, 26910), /a picture of 4 × 3 pixels .* 100 m per pixel, in EPSG:26910\. It holds colours only, no values\./);
});

test("#1860 the picture card has the export icon", () => {
  const m = read("modules/RasterModule.jsx");
  assert.match(m, /\{!r\.grid && r\.dataUrl && <Download [^>]*aria-label=\{tr\("Export the picture \\"\{name\}\\" as a GeoTIFF"/);
  // #2322 — the picture goes through imageToWorld (unchanged without a tie) and exportCrs (ensureExportCrs's answer, or a tied grid's CRS)
  assert.match(m, /const out = imageToWorld\(\{ \.\.\.px, bbox: r\.bbox \}, ex\.tie\);/);
  assert.match(m, /imageToGeoTIFF\(\{ \.\.\.out, epsg: epsgX \}\)/);
  assert.match(m, /const ex = await exportCrs\(project\); \/\* #1021; #2322/);
});
