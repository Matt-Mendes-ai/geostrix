// TASKS.csv #3088 — the project KMZ writes a picture raster's attached legend image (RasterPictureLegend's legendImage) as a ScreenOverlay,
// stacked with the other legends at its own pixel size; before, the drawn swatches were dropped for it and nothing replaced them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { imageSize } from "../src/lib/imageSize.js";
import { buildProjectKml } from "../src/lib/projectKmz.js";

// a PNG header (signature + IHDR) of w x h, and a JPEG with a comment segment then a SOF0
const png = (w, h) => { const b = new Uint8Array(33); b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
const jpeg = (w, h) => { const b = new Uint8Array(40); b.set([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x06, 1, 2, 3, 4, 0xff, 0xc0, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3]); return b; };

test("#3088 the size of a PNG or JPEG from its header; anything else is null", () => {
  assert.deepEqual(imageSize(png(512, 96)), { width: 512, height: 96 });
  assert.deepEqual(imageSize(jpeg(300, 45)), { width: 300, height: 45 });
  assert.equal(imageSize(new Uint8Array(40)), null);
  assert.equal(imageSize(null), null);
  assert.equal(imageSize(png(0, 5)), null);
});

const toLonLat = (x, y) => [-130 + (x - 500000) / 1e5, 56 + (y - 6200000) / 1e5];
const ctx = { projectName: "P", epsg: 32609, collars: [], layers: {}, rasters: [{ id: "r1", name: "Airborne mag (picture)", bbox: [500000, 6200000, 501000, 6201000], dataUrl: "data:image/png;base64,AA==", visible: true }], ui: {} };
const bar = { bytes: png(400, 60), ext: "png", width: 400, height: 60 };

test("#3088 a picture raster's attached legend image becomes a ScreenOverlay at its own size, hidden with its raster", () => {
  const { kml, files, counts } = buildProjectKml(ctx, { toLonLat, rasterImage: () => ({ bytes: new Uint8Array([1]), ext: "png", legend: null, legendImage: bar }) });
  assert.equal(counts.legends, 1);
  assert.match(kml, /<ScreenOverlay><name>Legend: Airborne mag \(picture\)<\/name>/);
  assert.match(kml, /<size x="400" y="60" xunits="pixels" yunits="pixels"\/>/);
  assert.ok(files.some((f) => f.name === "files/legend_0.png" && f.data === bar.bytes));
  const hidden = buildProjectKml({ ...ctx, rasters: [{ ...ctx.rasters[0], visible: false }] }, { toLonLat, rasterImage: () => ({ bytes: new Uint8Array([1]), ext: "png", legendImage: bar }) });
  assert.match(hidden.kml, /<ScreenOverlay><name>Legend: Airborne mag \(picture\)<\/name><visibility>0<\/visibility>/);
});

test("#3088 a JPEG bar keeps its extension; swatches win when the raster has both (the export drops them for a bar); no legend without bytes or size", () => {
  const jpg = { bytes: jpeg(300, 45), ext: "jpg", width: 300, height: 45 };
  assert.ok(buildProjectKml(ctx, { toLonLat, rasterImage: () => ({ bytes: new Uint8Array([1]), ext: "png", legendImage: jpg }) }).files.some((f) => f.name === "files/legend_0.jpg"));
  const both = buildProjectKml(ctx, { toLonLat, legendPng: () => ({ bytes: png(10, 10), width: 120, height: 60 }), rasterImage: () => ({ bytes: new Uint8Array([1]), ext: "png", legend: { label: "L", items: [["a", "#ff0000"]] }, legendImage: bar }) });
  assert.equal(both.counts.legends, 1);
  assert.equal(buildProjectKml(ctx, { toLonLat, rasterImage: () => ({ bytes: new Uint8Array([1]), ext: "png", legendImage: { ...bar, width: 0 } }) }).counts.legends, 0);
});

test("#3088 the export reads the bar's bytes and size (not webp: kmzImageUrl converted it)", () => {
  const s = readFileSync(new URL("../src/lib/projectKmzExport.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const lb = r\.legendImage\?\.dataUrl \? dataUrlBytes\(asKmz\(r\.legendImage\.dataUrl\)\) : null;/);
  assert.match(s, /legendImage: lb && size \? \{ \.\.\.lb, \.\.\.size \} : null/);
});
