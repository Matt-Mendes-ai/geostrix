// TASKS.csv #1597 (review #1497, Lawyers) — surface-sample symbols keep a readable on-screen size
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metresPerPixel, minSymbolRadiusM, needsSymbolRebuild } from "../src/lib/viewer/symbolScale.js";

test("#1597 metres per pixel: a perspective frustum at the target, an orthographic frame; a 6 px symbol's radius", () => {
  const mpp = metresPerPixel({ isPerspectiveCamera: true, fov: 50 }, 2000, 800); // a 2 km view: 2 * 2000 * tan(25°) / 800
  assert.ok(Math.abs(mpp - 2.3315) < 0.001, String(mpp));
  assert.ok(Math.abs(minSymbolRadiusM(mpp) - 3 * mpp) < 1e-12, "6 px across = 3 px radius");
  assert.ok(minSymbolRadiusM(mpp) > 4.08, "the 4.1 m rock chips of Lawyers are raised at the 2 km scale");
  assert.ok(minSymbolRadiusM(metresPerPixel({ isPerspectiveCamera: true, fov: 50 }, 100, 800)) < 1, "zoomed to 100 m they keep their own size");
  assert.ok(Math.abs(metresPerPixel({ top: 500, bottom: -500, zoom: 2 }, 0, 1000) - 0.5) < 1e-12);
  assert.ok(Number.isNaN(metresPerPixel({}, 100, 800)) && Number.isNaN(metresPerPixel({ fov: 50 }, 100, 0)));
  assert.equal(minSymbolRadiusM(NaN), 0);
});

test("#1597 the symbols are rebuilt only when the zoom moved a factor of two from the build", () => {
  assert.equal(needsSymbolRebuild(2, 2.5), false);
  assert.equal(needsSymbolRebuild(2, 4), true);
  assert.equal(needsSymbolRebuild(4, 1.9), true);
  assert.equal(needsSymbolRebuild(NaN, 2), false); assert.equal(needsSymbolRebuild(2, 0), false);
});

test("#1597 the 3D view sizes the symbols with the minimum, rebuilds them from the render loop, and the Surface Geology tab lists what is on the map", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("Math.max(radiusOf(row.medium), minR) * st.size"));
  assert.ok(v.includes("needsSymbolRebuild(surfaceSymbolMppRef.current, mpp)) { zr.at = Infinity; buildSurfaceSamplesRef.current(); }"));
  assert.ok(v.includes('{tr("On the map")}'));
});
