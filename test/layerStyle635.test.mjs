// TASKS.csv #635 — per-layer 3D styles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLayerStyle, cleanLayerStyle, describeLayerStyle, SHAPES, SIZE_MAX } from "../src/lib/layerStyle.js";

test("#635 no style = the layer's built-in look", () => {
  assert.deepEqual(resolveLayerStyle(undefined, "interval", { opacity: 0.4 }), { size: 1, opacity: 0.4, shape: "cylinder", color: null });
  assert.deepEqual(resolveLayerStyle({}, "point"), { size: 1, opacity: 1, shape: "sphere", color: null });
  assert.equal(resolveLayerStyle(null, "plane", { opacity: 0.55 }).shape, "disc");
});

test("#635 overrides are applied and kept in range", () => {
  const r = resolveLayerStyle({ size: 99, opacity: 0, shape: "cube", color: "#FF8800" }, "point");
  assert.deepEqual(r, { size: SIZE_MAX, opacity: 0.1, shape: "cube", color: "#ff8800" });
  assert.equal(resolveLayerStyle({ shape: "cube" }, "interval").shape, "cylinder", "a shape the kind doesn't have falls back");
  assert.equal(resolveLayerStyle({ color: "red" }, "point").color, null, "only #rrggbb");
  assert.ok(SHAPES.interval.length && SHAPES.point.length && SHAPES.plane.length);
});

test("#635 saved styles only carry changes", () => {
  assert.equal(cleanLayerStyle({ size: 1, shape: "sphere" }, "point"), null);
  assert.deepEqual(cleanLayerStyle({ size: 2, shape: "square", opacity: 0.6, color: "#00AAFF", junk: 1 }, "plane"), { size: 2, shape: "square", opacity: 0.6, color: "#00aaff" });
  assert.equal(describeLayerStyle({ size: 2, shape: "cube", opacity: 0.6, color: "#000000" }, "point"), "Cube · ×2 · 60% · one colour");
  assert.equal(describeLayerStyle({}, "point"), "");
});
