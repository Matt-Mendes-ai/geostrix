// TASKS.csv #2740 — an element sent to another page lands on its paper; #2807 — Measure says when a point fell on the reference plane
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { clampGroupIntoPage, sendElementWithFurniture } from "../src/lib/layoutLinks.js";

test("#2740 the sent group moves together, as little as needed, onto the target page", () => {
  const page = { w: 794, h: 1123 }; // A4 portrait at 96 dpi
  const group = [{ id: "v", x: 900, y: 300, w: 400, h: 300 }, { id: "bar", x: 900, y: 610, w: 180, h: 30 }];
  const out = clampGroupIntoPage(group, page);
  assert.equal(out[0].x, 394); // right edge at 794
  assert.equal(out[1].x, 394); // the bar moved with it
  assert.equal(out[0].y, 300); // y fitted already
  // already inside: unchanged (same array)
  const inside = [{ id: "v", x: 10, y: 10, w: 100, h: 100 }];
  assert.equal(clampGroupIntoPage(inside, page), inside);
  // larger than the page: to the top-left corner
  assert.deepEqual(clampGroupIntoPage([{ id: "v", x: 50, y: 50, w: 2000, h: 100 }], page)[0], { id: "v", x: 0, y: 50, w: 2000, h: 100 });
  // through the send: the element on the destination is inside the page
  const r = sendElementWithFurniture([{ id: "img", type: "image", x: 1200, y: 900, w: 300, h: 300 }], [], "img", true, undefined, page);
  const sent = r.to.find((e) => e.type === "image");
  assert.ok(sent.x + sent.w <= page.w && sent.y + sent.h <= page.h, JSON.stringify(sent));
});

test("#2807 Measure names the points on the reference plane", () => {
  const src = fs.readFileSync(new URL("../src/components/MeasureResults.jsx", import.meta.url), "utf8");
  assert.match(src, /pts\.some\(\(p\) => p\?\.plane\) && <span/);
  assert.match(src, /fell on the reference plane \(nothing under the cursor\)/);
  // the point carries the flag from the raycast (#2526)
  assert.match(fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /plane: true \}; \/\/ plane: #2526/);
});

test("#2660 Cancel on the last file of a Maps drop goes back to Maps", () => {
  const p = fs.readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /dropOriginRef\.current = p\?\.origin \|\| null;/);
  assert.match(p, /const back = !importQueueRef\.current\.length \? dropOriginRef\.current : null;\s*processImportQueue\(\);\s*if \(back\) \{ dropOriginRef\.current = null; goToModule\(back\); \}/);
  assert.match(fs.readFileSync(new URL("../src/modules/MapsModule.jsx", import.meta.url), "utf8"), /requestModuleAction\("import-dropped-files", \{ files: \[\.\.\.files, \.\.\.toViewer\], notes, others, origin: "maps"/);
  assert.match(fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /onCancel=\{cancelImport \/\* #2660 \*\/\}/);
});
