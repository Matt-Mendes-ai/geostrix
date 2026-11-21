// TASKS.csv #3942 — a Mineralization layer's tubes widened by a per cent (Total sulphides or one mineral's): the choices, the linear capped factor,
// the style keys, the size legend, the scene's per-row radius, and the tube size choice (#3668 / #3876) keeping the factors (the shader's base
// radius). Made-up holes and numbers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { widthChoices, widthScale, widthLegendGroup, WIDTH_MIN, WIDTH_MAX, CODE_PREFIX } from "../src/lib/widthBy.js";
import { withTotalSulphides, TOTAL_SULPHIDES_FIELD } from "../src/lib/totalSulphides.js";
import { cleanLayerStyle } from "../src/lib/layerStyle.js";
import { tubeFactor, tubeVertex, setTubeBaseRadius, tubeUniformsFor } from "../src/lib/viewer/tubeShader.js";
import { categoryLegendGroups } from "../src/lib/legendGroups.js";

const R = (hole_id, from, to, value, extra) => ({ hole_id, from, to, value, extra });
const rows0 = [R("DH-23-001", 0, 2, "Py", 2), R("DH-23-001", 0, 2, "Cpy", 4), R("DH-23-001", 2, 4, "Py", 8), R("DH-23-002", 0, 3, "Mt", 5)];

test("#3942 the choices: Total sulphides once added, then each logged mineral's per cent (long form) or each mineral field (wide form)", () => {
  assert.deepEqual(widthChoices(rows0).map((c) => c.id), [CODE_PREFIX + "Py", CODE_PREFIX + "Cpy", CODE_PREFIX + "Mt"]);
  const withTot = withTotalSulphides(rows0, ["Py", "Cpy"]).rows;
  assert.equal(widthChoices(withTot)[0].id, TOTAL_SULPHIDES_FIELD);
  const wide = [{ hole_id: "DH-1", from: 0, to: 1, value: "CPY", extra: 6, MN_PY_pct: 2, MN_CPY_pct: 4 }];
  assert.deepEqual(widthChoices(wide).map((c) => c.id), ["MN_PY_pct", "MN_CPY_pct"]);
});

test("#3942 the factor: linear from the minimum at 0 to the maximum at the full-width value, capped; other minerals' rows at the minimum", () => {
  const s = widthScale(rows0, { widthBy: CODE_PREFIX + "Py", widthFull: 8 });
  assert.equal(s.w(rows0[0]), WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * 0.25);
  assert.equal(s.w(rows0[2]), WIDTH_MAX);
  assert.equal(s.w(R("DH-1", 0, 1, "Py", 80)), WIDTH_MAX); // capped
  assert.equal(s.w(rows0[1]), WIDTH_MIN); // Cpy's row: not the chosen mineral
  const auto = widthScale(rows0, { widthBy: CODE_PREFIX + "Py" });
  assert.ok(auto.auto && auto.full === 8);
  assert.equal(widthScale(rows0, {}), null);
  assert.equal(widthScale(rows0, { widthBy: CODE_PREFIX + "Qtz" }), null); // nothing logged of it
});

test("#3942 the style keeps Width by and the full-width value; the legend gets three sizes", () => {
  assert.deepEqual(cleanLayerStyle({ widthBy: TOTAL_SULPHIDES_FIELD, widthFull: 10 }, "point"), { widthBy: TOTAL_SULPHIDES_FIELD, widthFull: 10 });
  assert.equal(cleanLayerStyle({ widthBy: "", widthFull: 0 }, "point"), null);
  const s = widthScale(rows0, { widthBy: CODE_PREFIX + "Py", widthFull: 8 });
  const g = widthLegendGroup("mnlgy", "Mineralization", s);
  assert.equal(g.items.length, 3);
  assert.match(g.label, /width = Py %/);
  const h = g.items.map(([, , o]) => Number(/height="(\d+)"/.exec(o.svg.replace(/^<svg width="18" height="12"/, ""))?.[1]));
  assert.ok(h[0] > h[1] && h[1] > h[2], h.join(","));
  const groups = categoryLegendGroups({ keys: ["mnlgy"], layers: { mnlgy: rows0 }, layerVisible: { mnlgy: true }, styles: { mnlgy: { widthBy: CODE_PREFIX + "Py" } }, labelFor: (k, v) => v, colorFor: () => "#888888" });
  assert.deepEqual(groups.map((x) => x.key), ["mnlgy", "mnlgy_width"]);
});

test("#3942 the tube size choice keeps the factors: the floor and a fixed width size the base radius", () => {
  // a far view: the base radius draws 0.5 px; the floor (1.5 px) widens it x3, a tube at 2x the base keeps twice that width
  const at = (w, minPx, maxPx) => { const r = 0.5 * w; const k = tubeFactor(r, 1000, 2, 1000, minPx, maxPx, w); return r * k * 2 * 0.5 * 1000 / 1000; };
  assert.ok(Math.abs(at(2, 1.5, 1e9) / at(1, 1.5, 1e9) - 2) < 1e-9);
  assert.ok(Math.abs(at(1, 6, 6) - 6) < 1e-9 && Math.abs(at(2.5, 6, 6) - 15) < 1e-9); // Fixed 6 px: the base 6 px, 2.5x it 15 px
  assert.equal(tubeFactor(0.5, 1000, 2, 1000, 1.5, 1e9), 3); // no Width by: as before
  const v = tubeVertex("void main() {\n#include <project_vertex>\n}");
  assert.match(v, /uniform float uTubeBaseR;/);
  assert.match(v, /float gsW = uTubeBaseR > 0\.0/);
  setTubeBaseRadius("mnlgy", 2.8); assert.equal(tubeUniformsFor("mnlgy").uTubeBaseR.value, 2.8);
  setTubeBaseRadius("mnlgy", 0); assert.equal(tubeUniformsFor("mnlgy").uTubeBaseR.value, 0);
});

test("#3942 wiring: the scene sizes each interval, the Style dialog offers Width by for Mineralization", () => {
  const scene = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(scene, /const rr = ws \? radius \* ws\.w\(row\) : radius;/);
  assert.match(scene, /mesh_\.scale\.set\(rr, len, rr\)/);
  assert.match(scene, /setTubeBaseRadius\(groupKey, ws \? radius : 0\)/);
  const modal = fs.readFileSync(new URL("../src/components/LayerStyleModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /target\.key === "mnlgy" && <WidthByRow/);
});
