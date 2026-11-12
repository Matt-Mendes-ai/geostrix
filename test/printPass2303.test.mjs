// TASKS.csv #2303 — Layout's viewports captured at 200 dpi for the page, rendered again at 300 dpi for an export (a session-only print pass)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { captureLongPx } from "../src/lib/layoutGeometry.js";
import { printPassItems, pagesWithPrintSrcs, PAGE_DPI, PRINT_DPI } from "../src/lib/layoutPrintPass.js";

test("a 185 mm viewport: ~1,459 px on the page at 200 dpi, ~2,188 px at 300 for the print; 300 when no dpi is given", () => {
  const w = (185 / 25.4) * 96; // 699 page px
  assert.equal(captureLongPx(w, w * 0.6, 3000, PAGE_DPI), Math.round((w * 200) / 96));
  assert.ok(Math.abs(captureLongPx(w, w * 0.6, 3000, PAGE_DPI) - 1457) < 3);
  assert.ok(Math.abs(captureLongPx(w, w * 0.6, 3000, PRINT_DPI) - 2185) < 4);
  assert.equal(captureLongPx(w, w * 0.6, 3000), captureLongPx(w, w * 0.6, 3000, 300)); // the existing callers
  assert.equal(captureLongPx(w, w * 0.6, 3000, 0), captureLongPx(w, w * 0.6, 3000, 300));
});

test("one print item per captured viewport, with what it was made from", () => {
  const pages = [
    { id: "p1", elements: [
      { id: "v1", type: "viewport", src: "data:a", themeId: "t1", trueScale: true, capturedFixedScale: 5000, w: 600, h: 400, capW: 600, capH: 400, targetWorld: { x: 1, y: 2 }, viewState: { cam: 1 } },
      { id: "v2", type: "viewport", src: "data:b", themeId: null, trueScale: false, w: 300, h: 200, viewState: { cam: 2 } },
      { id: "v3", type: "viewport", src: null },
      { id: "t", type: "text" },
    ] },
    { id: "p2", elements: [{ id: "v4", type: "viewport", src: "data:c", fixedScale: 2000, trueScale: true, w: 500, h: 300 }] },
  ];
  const items = printPassItems(pages);
  assert.deepEqual(items.map((i) => i.elementId), ["v1", "v2", "v4"]);
  assert.deepEqual(items[0], { pageId: "p1", elementId: "v1", themeId: "t1", viewState: null, trueScale: true, fixedScale: 5000, elementW: 600, elementH: 400, centreWorld: { x: 1, y: 2 }, dpi: 300, printPass: true });
  assert.deepEqual([items[1].viewState, items[1].trueScale, items[1].fixedScale, items[1].centreWorld], [{ cam: 2 }, false, null, null]);
  assert.equal(items[2].fixedScale, 2000);
  // the print root's pages: a viewport with a print image takes it; the project's pages are untouched
  const printed = pagesWithPrintSrcs(pages, { v1: "data:print" });
  assert.equal(printed[0].elements[0].src, "data:print"); assert.equal(printed[0].elements[1].src, "data:b");
  assert.equal(pages[0].elements[0].src, "data:a");
  assert.equal(pagesWithPrintSrcs(pages, {}), pages);
});

test("the store keeps print images apart from the elements; the export waits for its pass; page captures ask 200 dpi", () => {
  const s = fs.readFileSync("src/lib/store.jsx", "utf8");
  assert.match(s, /const \[printSrcs, setPrintSrcs\] = useState\(\{\}\);/);
  assert.match(s, /if \(printPass\) \{\s*if \(!res\.error && res\.src\) setPrintSrcs\(\(m\) => \(\{ \.\.\.m, \[targetElementId\]: res\.src \}\)\);/);
  assert.match(s, /setViewportRenderRequest\(\{ requestId, themeId, trueScale, interactive, fixedScale, elementW, elementH, centreWorld, viewState, batch, dpi \}\);/);
  assert.match(s, /it\.trueScale \?\? true/);
  assert.ok(!/printSrcs/.test(s.slice(s.indexOf("function serializeProject"), s.indexOf("function serializeProject") + 4000)) || !s.includes("function serializeProject"));
  const l = fs.readFileSync("src/modules/LayoutModule.jsx", "utf8");
  assert.match(l, /const items = printPassItems\(toPrint\);/);
  assert.match(l, /if \(!viewportBatchDone\?\.printPass \|\| !pendingPrint\) return;/);
  assert.match(l, /pages=\{pagesWithPrintSrcs\(/);
  assert.match(l, /\{ dpi: PAGE_DPI, \.\.\.opts \}/);
  assert.match(fs.readFileSync("src/lib/atlas.js", "utf8"), /dpi: 200/);
  assert.match(fs.readFileSync("src/modules/ViewerModule.jsx", "utf8"), /captureLongPx\(req\.elementW, req\.elementH, CAPTURE_LONG_PX, req\.dpi \|\| undefined\)/);
});
