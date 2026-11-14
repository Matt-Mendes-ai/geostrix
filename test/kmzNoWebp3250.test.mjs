// TASKS.csv #3250 (Matt, 2026-11-13, Google Earth: "files/raster_1.webp — Unsupported image type") — the project KMZ wrote a raster's stored
// WebP picture as is; Google Earth reads PNG / JPEG / GIF only. Every raster, colour-bar and section picture is redrawn as PNG first, and a
// WebP that could not be redrawn is left out rather than written.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kmzImageUrl } from "../src/lib/projectKmzExport.js";

const src = readFileSync(new URL("../src/lib/projectKmzExport.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("PNG and JPEG pass through; nothing else is touched outside a page", async () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(await kmzImageUrl(png), png);
  assert.equal(await kmzImageUrl("data:image/jpeg;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
  assert.equal(await kmzImageUrl(undefined), undefined);
});

test("the export converts raster, colour-bar and section pictures, and never writes a WebP", () => {
  assert.match(src, /const m = \/\^data:image\\\/\(png\|jpe\?g\);base64,\(\.\*\)\$\/i/, "dataUrlBytes refuses webp");
  assert.match(src, /r\?\.dataUrl, r\?\.legendImage\?\.dataUrl/);
  assert.match(src, /store\.sectionImages \|\| \[\]\)\.map\(\(im\) => im\?\.dataUrl\)/);
  assert.match(src, /const img = dataUrlBytes\(asKmz\(r\.dataUrl\)\);/);
  assert.match(src, /imageBytes: \(u\) => dataUrlBytes\(asKmz\(u\)\)/);
  assert.match(src, /cv\.toDataURL\("image\/png"\)/);
});
