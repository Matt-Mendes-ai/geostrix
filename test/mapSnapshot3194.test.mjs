// TASKS.csv #3194 (Matt: "we should be able to snapshot the map view to layout") — the Maps plan's view goes to the Layout page as a plan-map
// image carrying its centre and extent, so the sheet's coordinate grid, scale bar and plan scale are right for it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapSnapshotPayload } from "../src/lib/mapSnapshot.js";
import { utmGridReady, vpToWorld, metresPerPagePx } from "../src/lib/layoutGeometry.js";

const view = { cx: 450000, cy: 7500000, mPerPx: 125 }, size = { w: 800, h: 600 }; // 100 x 75 km on screen

test("the payload: the picture, its plan scale and the plan's centre and extent; a legend of what it draws", () => {
  const p = mapSnapshotPayload({ src: "data:image/png;base64,x", pxW: 1600, pxH: 1200, view, size, label: "Map view: Lapland",
    mapLayers: [{ id: 1, name: "Bedrock units", geomType: "polygon", visible: true, styleField: "ROCK_NAME", features: [{}], categories: [{ value: "Basalt", color: "#336633", visible: true }, { value: "Granite", color: "#cc6666", visible: true }] }],
    boundaries: [{ name: "Claim", color: "#0000ff", visible: true }], collarLegend: [{ label: "0 – 1", colour: "#ffffcc" }], collarTitle: "Au" });
  assert.deepEqual([p.naturalW, p.naturalH, p.worldWidthAtCaptureM, p.worldHeightAtTarget], [1600, 1200, 100000, 75000]);
  assert.deepEqual(p.targetWorld, { x: 450000, y: 7500000 });
  assert.deepEqual([p.planMap, p.mapsView, p.planView, p.trueScale, p.cameraAzimuthDeg], [true, true, true, true, 0]);
  const labels = p.legendItems.map((i) => i[0]);
  assert.ok(labels.includes("Bedrock units") && labels.includes("Basalt") && labels.includes("Granite") && labels.includes("Claim") && labels.includes("Au") && labels.includes("0 – 1"), labels.join(" | "));
  // plain collars and samples get a row each (coloured collars have their classes instead)
  const plain = mapSnapshotPayload({ src: "x", pxW: 10, pxH: 10, view, size, collars: 280, samples: 121 }).legendItems.map((i) => i[0]);
  assert.ok(plain.includes("Collars (280)") && plain.includes("Samples (121)"), plain.join(" | "));
  assert.ok(!labels.some((l) => /^Collars \(/.test(l)), "coloured collars: no plain row");
});

test("on the sheet: the coordinate grid's corners are the view's corners, its scale the view's, at any element size", () => {
  const p = mapSnapshotPayload({ src: "x", pxW: 1600, pxH: 1200, view, size });
  for (const w of [700, 350]) {
    const el = { type: "image", ...p, w, h: w / (1600 / 1200), utmGrid: true }; // LayoutModule: w x h at the picture's aspect
    assert.equal(utmGridReady(el), true);
    assert.ok(Math.abs(metresPerPagePx(el) - 75000 / el.h) < 1e-9);
    const [e0, n0] = vpToWorld(el, -el.w / 2, -el.h / 2), [e1, n1] = vpToWorld(el, el.w / 2, el.h / 2);
    assert.ok(Math.abs(e0 - 400000) < 1e-6 && Math.abs(n0 - 7537500) < 1e-6, `top-left ${e0}, ${n0}`);
    assert.ok(Math.abs(e1 - 500000) < 1e-6 && Math.abs(n1 - 7462500) < 1e-6, `bottom-right ${e1}, ${n1}`);
  }
});

test("wiring: Maps loads the payload on use; Layout keeps the fields, draws the grid on the image, offers the tick box and says what it is", () => {
  const m = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(m, /const \{ mapSnapshotPayload \} = await import\("\.\.\/lib\/mapSnapshot\.js"\);/);
  assert.doesNotMatch(m, /^import .*mapSnapshot/m);
  assert.match(m, /addLayoutImage\(\{ \.\.\.mapSnapshotPayload\(\{ src, pxW: cv\.width, pxH: cv\.height, view: v, size,/);
  // the plan's own grid is left off the picture and Layout's ticked instead when it was on
  assert.match(m, /if \(hadGrid\) \{\n      setShowGrid\(false\);\n      for \(let i = 0; i < 30 && gridDrawn\.current; i\+\+\)/);
  assert.match(m, /\}\), utmGrid: hadGrid \}\);/);
  assert.match(m, /gridDrawn\.current = showGrid;/);
  assert.match(m, /<button onClick=\{toLayout\}[^>]*>\{tr\("Snapshot to Layout"\)\}<\/button>/);
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /\.\.\.\(img\.planView && img\.targetWorld && img\.worldHeightAtTarget \? \{ mapsView: !!img\.mapsView, planView: true, trueScale: true, targetWorld: img\.targetWorld, worldHeightAtTarget: img\.worldHeightAtTarget, cameraAzimuthDeg: 0, utmGrid: !!img\.utmGrid \} : \{\}\)/);
  assert.match(l, /\{el\.utmGrid && utmGridReady\(el\) && <div style=\{\{ position: "absolute", inset: 0 \}\}><UtmGridOverlay el=\{el\} crs=\{ctx\?\.crs \|\| ""\} \/><\/div>\}/);
  assert.match(l, /\{sel\.planView && \(/);
  assert.match(l, /sel\.mapsView \? tr\("A view of the Maps tab, drawn as it was when sent/);
});
