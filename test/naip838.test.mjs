import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chooseNaipItems, paintWindow } from "../src/lib/naipFetch.js";
import { planLatestFetch } from "../src/lib/imageryLevels.js";
import { reducedImportNote } from "../src/lib/raster.js";

const quad = (x0, y0, x1, y1, date, id) => ({ id, date, geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } });
test("#838 the newest image wins each part of the area; older ones only fill gaps", () => {
  const bbox = [0, 0, 2, 1];
  const r = chooseNaipItems([quad(0, 0, 1, 1, "2020-06-01", "oldLeft"), quad(0, 0, 1, 1, "2022-06-01", "newLeft"), quad(1, 0, 2, 1, "2021-06-01", "right"), quad(0, 0, 2, 1, "2012-06-01", "ancient")], bbox);
  assert.deepEqual(r.items.map((i) => i.id), ["right", "newLeft"], "oldest painted first; nothing unneeded is read");
  assert.equal(r.cover, 1);
  const part = chooseNaipItems([quad(0, 0, 1, 1, "2022-06-01", "half")], bbox);
  assert.equal(part.items.length, 1);
  assert.ok(part.cover > 0.45 && part.cover < 0.55);
  assert.deepEqual(chooseNaipItems([quad(5, 5, 6, 6, "2022-06-01", "far")], bbox).items, []);
});
test("#838 painting: north up, the right pixels, no data leaves what is below", () => {
  const grid = { box: [0, 0, 4, 2], width: 4, height: 2, cell: 1 };
  const rgba = new Uint8ClampedArray(4 * 8);
  rgba.set([9, 9, 9, 255], 4 * 5); // already painted: second row, second column
  const r = Uint8Array.from([10, 20, 30, 40, 0, 60, 70, 80]);
  const n = paintWindow(rgba, grid, { box: [0, 0, 4, 2], width: 4, height: 2, cell: 1, bands: [r, r, r], xmin: 0, xmax: 4, ymin: 0, ymax: 2 }, (x, y) => [x, y]);
  assert.equal(n, 7);
  assert.equal(rgba[0], 10, "top left of the image is top left of the grid");
  assert.equal(rgba[4 * 3], 40);
  assert.equal(rgba[4 * 4], 0, "no data: transparent");
  assert.equal(rgba[4 * 4 + 3], 0);
  assert.equal(rgba[4 * 7], 80);
});
test("#838 painting across a shifted CRS samples by position", () => {
  const grid = { box: [100, 0, 102, 1], width: 2, height: 1, cell: 1 };
  const rgba = new Uint8ClampedArray(4 * 2);
  const v = Uint8Array.from([5, 6]);
  paintWindow(rgba, grid, { box: [0, 0, 2, 1], width: 2, height: 1, cell: 1, bands: [v, v, v], xmin: 100, xmax: 102, ymin: 0, ymax: 1 }, (x, y) => [x - 100, y]);
  assert.deepEqual([rgba[0], rgba[4]], [5, 6]);
});
test("#838 the plan knows NAIP's pixels; Sentinel-2's stays 10 m", () => {
  const small = [-110, 40, -109.99, 40.01];
  assert.ok(planLatestFetch(small, "high").pixelM === 10);
  const n = planLatestFetch(small, "high", 0.6);
  assert.ok(n.pixelM < 1 && n.nativeLimited);
  assert.ok(n.gridW > 1000);
});
test("#838 the import says when it reduced an image, and how to keep more", () => {
  assert.equal(reducedImportNote(2000, 1000, false), "");
  assert.match(reducedImportNote(10000, 8000, false), /Keep full detail/);
  assert.equal(reducedImportNote(4000, 1000, true), "");
  assert.match(reducedImportNote(10000, 8000, true), /4096/);
});
test("#838 NAIP's storage host is allowed and named in every privacy page", () => {
  assert.match(readFileSync("electron/main.js", "utf8"), /"naipeuwest\.blob\.core\.windows\.net"/);
  for (const f of ["PRIVACY.md", "website/privacy.html", "website/es/privacy.html", "website/pt-br/privacy.html", "website/fr/privacy.html", "website/ar/privacy.html"]) assert.ok(readFileSync(f, "utf8").includes("naipeuwest.blob.core.windows.net"), f);
});
