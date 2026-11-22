// TASKS.csv #3943 — bars along the trace for several minerals or several assay elements side by side: the choices, each bar's lane and length,
// the shared mineral scale and each element's own, the legend's bar scale, the style keys, the instanced mesh (screen-plane placement in its
// shader, one draw call, not picked), and the wiring (the panel, the Assays section, the hook, the markers giving way to the bars). Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mineralBars, assayBars, assayBarScale, mineralBarScale, barLegendGroup, mineralBarColour, MAX_BARS } from "../src/lib/traceBarsData.js";
import { mineralBarChoices } from "../src/lib/totalSulphides.js";
import { traceBarsMesh, BAR_PX } from "../src/lib/viewer/traceBars.js";
import { cleanLayerStyle } from "../src/lib/layerStyle.js";
import { withTotalSulphides, TOTAL_SULPHIDES_FIELD } from "../src/lib/totalSulphides.js";
import { categoryLegendGroups, assayLegendGroups } from "../src/lib/legendGroups.js";
import { CATEGORICAL_SAFE_COLORS } from "../src/lib/layers.js";

const R = (hole_id, from, to, value, extra) => ({ hole_id, from, to, value, extra });
const rows = [R("DH-23-001", 0, 2, "Py", 2), R("DH-23-001", 0, 2, "Cpy", 4), R("DH-23-001", 2, 4, "Py", 8), R("DH-23-001", 2, 4, "Mt", 20)];

test("#3943 mineral bars: one lane per chosen mineral, every mineral of an interval shown, one shared per-cent scale", () => {
  assert.deepEqual(mineralBarChoices(rows).map((c) => c.label), ["Py", "Cpy", "Mt"]);
  const { bars, scale } = mineralBars(rows, ["code:Py", "code:Cpy"]);
  assert.deepEqual(bars.map((b) => [b.from, b.lane, b.f]), [[0, 0, 0.25], [0, 1, 0.5], [2, 0, 1]]); // the 0-2 m interval: both its minerals
  assert.deepEqual(scale.map((s) => [s.label, s.full, s.unit]), [["Py", 8, "%"], ["Cpy", 8, "%"]]);
  assert.equal(mineralBars(rows, ["code:Py", "code:Cpy", "code:Mt", "a", "b", "c", "d"]).scale.length, MAX_BARS);
  const withTot = withTotalSulphides(rows, ["Py", "Cpy"]).rows;
  assert.equal(mineralBarChoices(withTot)[0].id, TOTAL_SULPHIDES_FIELD);
});

test("#3943 assay bars: each element its own scale (its 98th percentile), the shown filter, made-up grades", () => {
  const assays = [{ hole_id: "DH-1", from: 0, to: 1, values: { Cu: 0.5, Au: 2 } }, { hole_id: "DH-1", from: 1, to: 2, values: { Cu: 1, Au: 0.1 }, qc: true }, { hole_id: "DH-1", from: 2, to: 3, values: { Zn: 3 } }];
  const { bars, scale } = assayBars(assays, ["Cu", "Au"], { shown: (a) => !a.qc });
  assert.deepEqual(scale.map((s) => [s.id, s.full]), [["Cu", 1], ["Au", 2]]);
  assert.deepEqual(bars.map((b) => [b.from, b.lane, b.f]), [[0, 0, 0.5], [0, 1, 1]]);
  assert.equal(assayBarScale(assays, ["Cu"], { Cu: "%" })[0].unit, "%");
});

test("#3943 the legend's bar scale: a row per chosen item, its colour and what a full bar stands for", () => {
  const g = barLegendGroup("k", "Assay bars", [{ id: "Cu", label: "Cu", full: 1.25, unit: "%" }], () => "#123456");
  assert.deepEqual(g.items, [["Cu", "#123456", { kind: "line", value: "▮ = 1.25 %" }]]);
  const lg = categoryLegendGroups({ keys: ["mnlgy"], layers: { mnlgy: rows }, layerVisible: { mnlgy: true }, styles: { mnlgy: { bars: ["code:Py", "code:Cpy"] } }, labelFor: (k, v) => v, colorFor: (k, v) => (v === "Py" ? "#aaaa00" : "#cc6600") });
  const bars = lg.find((x) => x.key === "mnlgy_bars");
  assert.deepEqual(bars.items.map(([l, c]) => [l, c]), [["Py", "#aaaa00"], ["Cpy", "#cc6600"]]);
  const al = assayLegendGroups({ assays: [{ hole_id: "DH-1", from: 0, to: 1, values: { Cu: 2 } }], assayElements: [{ symbol: "Cu", unit: "%" }], assayVisible: true, assayDisplayElements: ["Cu"], bars: true });
  assert.equal(al.length, 1); assert.equal(al[0].key, "assay_bars"); assert.match(al[0].items[0][2].value, /▮ = 2 %/);
  assert.equal(mineralBarColour("Total sulphides (%)", 2, () => "#000000"), CATEGORICAL_SAFE_COLORS[2]);
  assert.deepEqual(mineralBarScale(rows, ["code:Py"]).map((s) => s.full), [8]);
});

test("#3943 the style keeps the chosen minerals (up to six) and the Assays' bars switch", () => {
  assert.deepEqual(cleanLayerStyle({ bars: ["code:Py", "code:Cpy"] }, "point"), { bars: ["code:Py", "code:Cpy"] });
  assert.equal(cleanLayerStyle({ bars: ["a", "b", "c", "d", "e", "f", "g"] }, "point").bars.length, 6);
  assert.deepEqual(cleanLayerStyle({ bars: true }, "point"), { bars: true });
  assert.equal(cleanLayerStyle({ bars: [] }, "point"), null);
});

test("#3943 the mesh: one instanced quad set, placed in the screen plane by its shader, not picked", () => {
  const look = { at: (md) => ({ x: 0, y: -md, z: 0 }) };
  const m = traceBarsMesh([{ hole_id: "DH-1", from: 0, to: 2, lane: 0, f: 0.5 }, { hole_id: "DH-1", from: 0, to: 2, lane: 1, f: 1 }, { hole_id: "NONE", from: 0, to: 1, lane: 0, f: 1 }], (h) => (h === "DH-1" ? look : null), () => "#336699");
  assert.equal(m.geometry.instanceCount, 2); // the bar on a hole with no trace is left out
  assert.deepEqual([...m.geometry.getAttribute("aBar").array.slice(0, 6)], [2, 0, 0.5, 2, 1, 1]);
  assert.equal(m.frustumCulled, false);
  assert.deepEqual(m.raycast(), undefined);
  assert.match(m.material.vertexShader, /cross\(d, vec3\(0\.0, 0\.0, 1\.0\)\)/); // perpendicular to the trace as seen
  assert.match(m.material.vertexShader, /aBar\.y \* \(uBarPx \+ uGapPx\)/); // lanes side by side
  assert.equal(m.material.uniforms.uBarPx.value, BAR_PX);
  assert.equal(traceBarsMesh([], () => look, () => "#000000"), null);
});

test("#3943 wiring: the Mineralization panel, the Assays section, the hook, the markers give way to the bars", () => {
  const parts = fs.readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(parts, /<MineralBarsChooser rows=\{rows\}/);
  assert.match(parts, /const MineralBarsChooser = React\.lazy\(/); // its own chunk (startup size)
  const hook = fs.readFileSync(new URL("../src/lib/viewer/useTraceBars.js", import.meta.url), "utf8");
  assert.match(hook, /import\("\.\/traceBars\.js"\)/); // the mesh loads with the first bar
  assert.doesNotMatch(hook, /^import .*traceBars\.js/m);
  const vm = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /<AssayBarsToggle style=\{layerStyles\.assay\}/);
  assert.match(vm, /useTraceBars\(\{ groupsRef: layerGroupsRef, tracesRef, tracesSeq,/);
  assert.match(vm, /!collars\.length \|\| layerStyles\.assay\?\.bars \/\* #3943 \*\/\) \{ clearGroup\(g\);/);
  assert.match(vm, /collars, assaySource, layerStyles\.assay\]/);
  assert.match(vm, /bars: !!layerStyles\.assay\?\.bars \/\* #3943 \*\//);
});
