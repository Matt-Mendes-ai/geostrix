// TASKS.csv #2853 / #2863 (review GSC geophysics) — (2853) the Maps plan drew rasters in import order with no way to change it, and the cursor
// chip gave no value; (2863) a value grid could not be sun-shaded (hillshade was for the terrain only).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gridValueAt, topRasterValueAt } from "../src/lib/planRasterValue.js";
import { shadeRGBA } from "../src/lib/rasterColour.js";
import { f32ToB64 } from "../src/lib/inversion.js";
const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

const grid = (vals, name, extra = {}) => ({ id: name, name, visible: true, bbox: [-5, -15, 15, 5], grid: { nx: 2, ny: 2, x0: 0, yTop: 0, dx: 10, dy: 10, values: f32ToB64(Float32Array.from(vals)) }, ...extra });

test("#2853 the top visible grid's value under the cursor", () => {
  assert.equal(gridValueAt({ nx: 2, ny: 2, x0: 0, yTop: 0, dx: 10, dy: 10 }, [1, 2, 3, 4], 9, -9), 4);
  assert.equal(gridValueAt({ nx: 2, ny: 2, x0: 0, yTop: 0, dx: 10, dy: 10 }, [1, 2, 3, 4], 40, 0), null);
  const mag = grid([100, 200, 300, 400], "mag", { unit: "nT" }), tau = grid([46, NaN, 60, 70], "tau", { unit: "µs" });
  assert.deepEqual(topRasterValueAt([mag, tau], 0, 0), { name: "tau", value: 46, unit: "µs" }, "the last is on top");
  assert.deepEqual(topRasterValueAt([mag, tau], 10, 0), { name: "mag", value: 200, unit: "nT" }, "no data on top: the one under it");
  assert.equal(topRasterValueAt([mag, { ...tau, visible: false }], 0, 0).name, "mag", "a hidden one is skipped");
  assert.equal(topRasterValueAt([mag], 100, 100), null);
});

test("#2853 the cards move, and the plan chip and note say so", () => {
  const s = read("lib/store.jsx");
  assert.ok(s.includes("const moveRaster = useCallback((id, step) =>") && s.includes("moveRaster /* #2853 */"));
  const r = read("modules/RasterModule.jsx");
  assert.ok(r.includes("onClick={() => moveRaster(r.id, -1)}") && r.includes("onClick={() => moveRaster(r.id, 1)}"));
  assert.ok(r.includes("The Maps plan draws these in order, the last on top; the arrows on a card move it."));
  assert.ok(read("components/MapsPlanView.jsx").includes("${cursorValueText(rasters, cursor)}"));
});

test("#2863 shaded relief over the colours", () => {
  // a ramp rising to the east, lit from the west (270°): the east-facing... a west-facing slope faces the sun
  const nx = 6, ny = 6, values = Float32Array.from({ length: nx * ny }, (_, k) => (k % nx) * 10);
  const rgba = new Uint8ClampedArray(nx * ny * 4).fill(200);
  const fromW = shadeRGBA(rgba, values, nx, ny, { azimuthDeg: 270, altitudeDeg: 30, exaggeration: 1 });
  const fromE = shadeRGBA(rgba, values, nx, ny, { azimuthDeg: 90, altitudeDeg: 30, exaggeration: 1 });
  assert.ok(fromW[4 * 14] > fromE[4 * 14], "a slope rising east faces west: brighter lit from the west");
  assert.ok(fromW[4 * 14] <= 200 && fromE[4 * 14] >= 200 * 0.35 - 1);
  assert.equal(fromW[4 * 14 + 3], 200, "alpha kept");
  const flat = shadeRGBA(rgba, Float32Array.from({ length: 36 }, () => 5), nx, ny, { azimuthDeg: 315, altitudeDeg: 45 });
  assert.equal(flat, rgba, "a flat grid: unchanged");
  const c = read("components/RasterColourControls.jsx");
  assert.ok(c.includes('apply({ shade: e.target.checked ? { ...SHADE_DEFAULT } : null })'));
  assert.ok(read("lib/rasterColour.js").includes("const rgba = style?.shade ? shadeRGBA(rgba0, values, nx, ny, style.shade) : rgba0;"));
});
