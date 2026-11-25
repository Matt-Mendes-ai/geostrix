// TASKS.csv #3965 (Matt: "when I resize the view it creates a white frame around the previous view") — a 3D view frame resized on a Layout
// page is captured again at its new size, keeping its scale and centre (a bigger frame shows more ground); until then the old picture is
// enlarged to cover the frame, never a white band. The export's print pass keeps the page's scale too. Made-up frames only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const M_PER_PAGE_PX = 0.0254 / 96;

test("a frame resized since its capture, and the cover scale (up only)", async () => {
  const { frameResized, coverScale } = await import("../src/lib/layoutGeometry.js");
  const v = { type: "viewport", src: "data:x", w: 600, h: 400, capW: 600, capH: 400 };
  assert.equal(frameResized(v), false);
  assert.equal(frameResized({ ...v, w: 600.4 }), false, "sub-pixel: the same frame");
  assert.equal(frameResized({ ...v, w: 900 }), true);
  assert.equal(frameResized({ ...v, h: 300 }), true);
  assert.equal(frameResized({ ...v, w: 900, src: null }), false, "nothing captured yet");
  assert.equal(frameResized({ ...v, w: 900, capW: undefined, capH: undefined }), false, "an old capture with no capW is fitted as before");
  assert.equal(frameResized({ ...v, type: "image", w: 900 }), false);
  assert.equal(coverScale(900, 400, 600, 400), 1.5, "wider: the width decides");
  assert.equal(coverScale(900, 800, 600, 400), 2, "taller still: the height decides");
  assert.equal(coverScale(300, 200, 600, 400), 1, "smaller: cropped at its scale, not shrunk");
  assert.equal(coverScale(300, 600, 600, 400), 1.5, "narrower but taller: covers the height");
  assert.equal(coverScale(300, 200, 0, 0), 1);
});

test("the capture a resized frame asks for: its new size, its scale, its centre, its own view", async () => {
  const { resizeRecaptureOpts, metresPerPagePx } = await import("../src/lib/layoutGeometry.js");
  // a perspective 'Current view' frame: 900 x 450 page px after a resize, captured at 600 x 300 showing 828 m of height
  const persp = { type: "viewport", src: "data:x", w: 900, h: 450, capW: 600, capH: 300, worldHeightAtTarget: 828, trueScale: false, targetWorld: { x: 500100, y: 6200200 }, viewState: { camera: { theta: 1 } }, themeId: null };
  const o = resizeRecaptureOpts(persp);
  assert.deepEqual(o, { fixedScale: 0, mPerPx: 828 / 300, elementW: 900, elementH: 450, centreWorld: { x: 500100, y: 6200200 }, viewState: { camera: { theta: 1 } } });
  // after the capture (capH = 450, worldHeightAtTarget = mPerPx x 450) the page's scale is unchanged
  assert.ok(Math.abs(metresPerPagePx({ ...persp, capH: 450, worldHeightAtTarget: o.mPerPx * 450 }) - metresPerPagePx(persp)) < 1e-12);
  // a fixed 1 : 5,000 true-scale frame keeps its 1 : N (no metres per px needed); a themed one is re-captured from its theme
  const fixed = { ...persp, trueScale: true, fixedScale: 5000, themeId: "t1" };
  assert.deepEqual(resizeRecaptureOpts(fixed), { fixedScale: 5000, elementW: 900, elementH: 450, centreWorld: { x: 500100, y: 6200200 } });
  // no centre recorded (an old capture): none asked
  assert.equal("centreWorld" in resizeRecaptureOpts({ ...persp, targetWorld: null }), false);
});

test("the 3D View's capture keeps the metres per px: the perspective field of view and the orthographic height", async () => {
  const { worldHeightAtTargetM, fovForWorldHeight } = await import("../src/lib/figureScale.js");
  const r = 1000, fov0 = 45, h0 = worldHeightAtTargetM(fov0, r), mpp = h0 / 300;
  const fov1 = fovForWorldHeight(mpp * 450, r);
  assert.ok(fov1 > fov0, "a taller frame: a wider field of view");
  assert.ok(Math.abs(worldHeightAtTargetM(fov1, r) - mpp * 450) < 1e-9, "round trip");
  assert.ok(Math.abs(fovForWorldHeight(h0, r) - fov0) < 1e-9);
  assert.equal(fovForWorldHeight(1e9, 1), 160, "capped");
  assert.equal(fovForWorldHeight(0, r), null);
  const v = rd("modules/ViewerModule.jsx");
  assert.match(v, /if \(!req\.trueScale && frameAspect && \(outW !== mountW \|\| outH !== mountH \|\| req\.mPerPx > 0\)\) \{/);
  assert.match(v, /if \(req\.mPerPx > 0\) pc\.fov = fovForWorldHeight\(req\.mPerPx \* outH, cs\.radius\) \|\| pc\.fov;/);
  assert.match(v, /else if \(req\.mPerPx > 0 && frameAspect\) halfH = \(req\.mPerPx \* outH\) \/ 2;/);
  assert.match(v, /worldHeightAtTargetM\(renderCamera\.fov, cs\.radius\)/, "the scale reported is the clone's, not the live camera's");
  const s = rd("lib/store.jsx");
  assert.match(s, /const mPerPx = Number\(opts\.mPerPx\) > 0 \? Number\(opts\.mPerPx\) : null;/);
  assert.match(s, /mPerPx: it\.mPerPx, pageId: it\.pageId,/, "the export's batch items carry it");
});

test("the export's print pass keeps the page's scale; a fixed scale stays the 1 : N", async () => {
  const { printPassItems } = await import("../src/lib/layoutPrintPass.js");
  const pages = [{ id: "p1", elements: [
    { id: "a", type: "viewport", src: "data:a", w: 900, h: 450, capW: 900, capH: 450, worldHeightAtTarget: 1242, trueScale: false, viewState: { c: 1 } },
    { id: "b", type: "viewport", src: "data:b", w: 600, h: 400, capW: 600, capH: 400, worldHeightAtTarget: 400 * 5000 * M_PER_PAGE_PX, trueScale: true, fixedScale: 5000, capturedFixedScale: 5000 },
  ] }];
  const [a, b] = printPassItems(pages);
  assert.equal(a.mPerPx, 1242 / 450);
  assert.equal(a.elementW, 900);
  assert.equal("mPerPx" in b, false);
  assert.equal(b.fixedScale, 5000);
});

test("Layout: the handles and typed W / H ask for the capture once the size settles; the old picture covers the frame meanwhile", () => {
  const l = rd("modules/LayoutModule.jsx");
  assert.match(l, /const onUp = \(\) => \{ const d = dragState\.current; dragState\.current = null; setGuides\(\[\]\); if \(d\?\.resize\) askRecapture\(d\.id, 120\); \};/);
  assert.match(l, /if \(sel\.type === "viewport" && \("w" in patch \|\| "h" in patch\)\) askRecapture\(sel\.id, 700\);/);
  // not while a drag goes on or another capture is out; only a frame that really changed size; from what it was captured with
  assert.match(l, /if \(dragState\.current \|\| now\.current\.pending \|\| !frameResized\(el\) \|\| el\.refreshing\) return;\n\s*startViewportRender\(el\.themeId \|\| null, el\.id, el\.trueScale, resizeRecaptureOpts\(el\)\);/);
  assert.match(l, /return \(\) => clearTimeout\(t\);\n\s*\}, \[recaptureAsk\]\);/, "a newer size replaces the pending ask");
  // the render: picture, grid and overview box scaled together, the hole mark with them; no white band
  assert.match(l, /cover = coverScale\(W, H, imgW, imgH\);/);
  assert.match(l, /\.\.\.\(cover > 1 \? \{ transform: `scale\(\$\{cover\}\)`, transformOrigin: "center center" \} : \{\}\)/);
  const layer = l.slice(l.indexOf('<div data-cap-layer=""'), l.indexOf("{el.markHole && (() =>"));
  assert.match(layer, /<img src=\{el\.src\}/);
  assert.match(layer, /<UtmGridOverlay /);
  assert.match(layer, /overviewPolygon\(el,/);
  assert.match(l, /worldToVp\(el, el\.markHole\.x, el\.markHole\.y\)\.map\(\(d\) => d \* cover\)/);
  assert.doesNotMatch(l, /the frame shows white where no\s*\/\/\s*ground was captured/);
});

test("the note under a resized frame says what it shows, in every language", () => {
  const key = "The frame was resized: refresh to capture it at this size.";
  assert.ok(rd("modules/LayoutModule.jsx").includes(`tr("${key}")`));
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(rd(`locales/${lang}.json`));
    assert.ok(d[key], lang);
    assert.equal(Object.keys(d).some((k) => k.startsWith("The frame was resized since its capture: the image keeps its scale")), false, lang + ": the old wording is gone");
  }
});
