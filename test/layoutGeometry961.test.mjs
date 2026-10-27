// TASKS.csv #961 / #946 — Layout's print-scale geometry, end to end: the capture's frustum (ViewerModule), the frame
// fields the store writes back, and the scale figures, grid and overview Layout reads from them.
import test from "node:test";
import assert from "node:assert/strict";
import { fixedScaleHalfHeight, capturedFrameFields, metresPerPagePx, groundFrameSize, viewportScaleText, pageScaleText, obliqueCapture, vpToWorld, worldToVp, overviewPolygon, snapToGuides, niceGridStep } from "../src/lib/layoutGeometry.js";
import { withLiveScaleBars } from "../src/lib/layoutLinks.js";

const MM_PER_PX = 25.4 / 96;
// a frame of w x h page px captured at 1:N, the way the store writes the result back
function capture(N, w, h, extra = {}) {
  const aspect = w / h;
  const halfH = fixedScaleHalfHeight(N, w, aspect); // ViewerModule's orthographic frustum
  const el = { id: "vp1", type: "viewport", x: 0, y: 0, w, h, src: "data:x", fixedScale: N, trueScale: true, ...extra };
  return { ...el, worldHeightAtTarget: 2 * halfH, ...capturedFrameFields(el, w, h, aspect, N), capturedFixedScale: N };
}

test("#961: 1:5,000 on a full A3 landscape frame shows 5,000 x its printed width and height of ground", () => {
  const w = 420 / MM_PER_PX, h = 297 / MM_PER_PX; // A3 landscape in page px
  const vp = capture(5000, w, h, { planView: true });
  const g = groundFrameSize(5000, vp);
  assert.ok(Math.abs(g.w - 2100) < 1e-6 && Math.abs(g.h - 1485) < 1e-6, `${g.w} x ${g.h} m`);
  assert.ok(Math.abs(metresPerPagePx(vp) * w - 2100) < 1e-6); // what the scale bar and the grid read
  assert.equal(viewportScaleText(vp), `1 : ${(5000).toLocaleString()}`);
  assert.equal(pageScaleText([vp]), `1 : ${(5000).toLocaleString()}`);
});

test("#961: a frame resized after its capture keeps the captured scale (capW / capH), not the new size", () => {
  const vp = { ...capture(10000, 400, 300, { planView: true }), w: 800, h: 450 };
  assert.ok(Math.abs(metresPerPagePx(vp) * 400 - 10000 * 400 * MM_PER_PX / 1000) < 1e-6);
  const bar = withLiveScaleBars([vp, { id: "s1", type: "scale", boundTo: "vp1", meters: 500 }])[1];
  assert.ok(Math.abs(bar.meters * bar.pxPerMeter * MM_PER_PX / 1000 * 10000 - bar.meters) < 1e-6); // the bar still measures 1:10,000
});

test("#961: an old request without a height takes the image's aspect, unrounded for a fixed scale (#398)", () => {
  assert.deepEqual(capturedFrameFields({ w: 700 }, 700, undefined, 1.5, 5000), { h: 700 / 1.5, capW: 700, capH: 700 / 1.5 });
  assert.deepEqual(capturedFrameFields({ w: 700 }, 700, undefined, 1.5, null), { h: 467, capW: 700, capH: 467 });
});

test("#961: a free perspective capture reads ~1:N; image px <-> world round-trips through a rotated plan view", () => {
  const free = { type: "viewport", src: "x", w: 384, h: 192, capW: 384, capH: 192, worldHeightAtTarget: 508, trueScale: false, planView: true };
  assert.equal(viewportScaleText(free), `~1 : ${(10000).toLocaleString()}`);
  const vp = { ...capture(2000, 400, 300, { planView: true }), targetWorld: { x: 500000, y: 6000000 }, cameraAzimuthDeg: 30 };
  const [E, N] = vpToWorld(vp, 120, -80);
  const [u, v] = worldToVp(vp, E, N);
  assert.ok(Math.abs(u - 120) < 1e-6 && Math.abs(v + 80) < 1e-6);
  // a view onto itself: its footprint is its own frame
  assert.deepEqual(overviewPolygon(vp, vp).map((p) => p.map((c) => c + 0)), [[0, 0], [400, 0], [400, 300], [0, 300]]);
  assert.equal(overviewPolygon({ ...vp, planView: false }, vp), null);
});

test("#946: an oblique capture's scale is labelled as the view plane's, on the panel, {scale} and its bound bar", () => {
  const vp = capture(5000, 400, 300, { planView: false });
  assert.ok(obliqueCapture(vp));
  assert.match(pageScaleText([vp]), /^1 : 5,?000 in the view plane \(oblique view\)$/);
  const bar = withLiveScaleBars([vp, { id: "s1", type: "scale", boundTo: "vp1", meters: 200 }])[1];
  assert.equal(bar.viewPlane, true);
  const plan = withLiveScaleBars([{ ...vp, planView: true }, { id: "s1", type: "scale", boundTo: "vp1", meters: 200 }])[1];
  assert.equal(plan.viewPlane, false);
  // a capture saved before #399 has no planView: unchanged
  const old = { ...vp };
  delete old.planView;
  assert.equal(obliqueCapture(old), false);
  assert.doesNotMatch(pageScaleText([old]), /view plane/);
});

test("#961: guide snapping and the grid step", () => {
  assert.deepEqual(snapToGuides([10, 50], [53, 100], 4), { delta: 3, at: 53 });
  assert.deepEqual(snapToGuides([10], [20], 4), { delta: 0, at: null });
  assert.equal(niceGridStep(2100), 500);
  assert.equal(niceGridStep(1100), 250);
});
