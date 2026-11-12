// TASKS.csv #1644 (review #1497) — an atlas's maps re-captured one page at a time, centred on each page's hole at the template's scale
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { atlasRecaptureItems, markHoleOnViewports } from "../src/lib/atlas.js";

const vp = { id: "vp1", type: "viewport", trueScale: true, planView: true, targetWorld: { x: 1200, y: 2200 }, w: 500, h: 360, capW: 500, capH: 360, worldHeightAtTarget: 2540, themeId: null, viewState: { camState: { theta: 0, phi: 0.01, radius: 900, target: { x: 0, y: 0, z: 0 } } } };

test("one capture per marked top-down map: centred on the hole, at the template's scale, the frame's size, the template's view", () => {
  const pages = [
    { name: "A", elements: markHoleOnViewports([vp, { id: "t", type: "text", text: "A" }], { hole_id: "A", x: 1000, y: 2000 }) },
    { name: "B", elements: markHoleOnViewports([{ ...vp, w: 300 }], { hole_id: "B", x: 1500, y: 2500 }) },
    { name: "C", elements: [{ ...vp, id: "vp3" }] }, // no hole marked (an oblique map, or no collar): left alone
  ];
  const items = atlasRecaptureItems(pages, ["p1", "p2", "p3"]);
  assert.equal(items.length, 2);
  // 2,540 m over 360 page px: 1 : 26,667
  assert.deepEqual(items[0], { dpi: 200 /* #2303 */, pageId: "p1", elementId: "vp1", themeId: null, viewState: vp.viewState, fixedScale: 26667, elementW: 500, elementH: 360, centreWorld: { x: 1000, y: 2000 } });
  assert.equal(items[1].elementW, 300, "a frame a strip log narrowed keeps its scale and shows less ground");
  assert.equal(items[1].fixedScale, 26667);
  // a fixed scale wins over the measured one; a themed map is re-rendered with its theme, not a saved view
  const [fixed] = atlasRecaptureItems([{ elements: markHoleOnViewports([{ ...vp, fixedScale: 25000, capturedFixedScale: 25000, themeId: "th1" }], { hole_id: "X", x: 1, y: 2 }) }], ["p9"]);
  assert.equal(fixed.fixedScale, 25000); assert.equal(fixed.themeId, "th1"); assert.equal(fixed.viewState, null);
});

test("wired: the store's batch writes each result to its page and stays on the 3D View; the 3D View applies the saved view and shows progress; the dialog offers it", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(s, /const applyEls = targetPageId \? \(fn\) => setLayoutPages\(\(pages\) => pages\.map\(\(p\) => \(p\.id === targetPageId \? \{ \.\.\.p, elements: fn\(p\.elements\) \} : p\)\)\) : setLayoutElements;/);
  assert.match(s, /if \(continueViewportBatch\(false\)\) return; \/\/ #1644 — the next atlas page/);
  assert.match(s, /if \(continueViewportBatch\(true\)\) return; \/\/ #1644/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /if \(theme\) applyTheme\(theme\); else if \(req\.viewState\) applyTheme\(req\.viewState\);/);
  assert.match(v, /onCancel: cancelViewportBatch/);
  const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(m, /if \(recapture\.length\) \{ requestViewportBatch\(recapture\); onClose\(\); return; \}/);
  assert.match(readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8"), /Centred the map on its hole on \{n\} of \{t\} atlas page\(s\)/);
});
