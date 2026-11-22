// TASKS.csv #4008 — bars for numeric CUSTOM layers (a mineral database imported as one numeric layer per mineral): the Bars chooser lists them, each its own
// colour and scale (one shared scale where units match), the 3D view and the section window draw them as lanes, the section's interval count includes bars.
// Made-up per-mineral layers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { numericCustomChoices, barLayers, customBars, customBarColour, customStyleKey } from "../src/lib/customBars.js";
import { sectionBarSets, drawnIntervalCount } from "../src/lib/sectionBars.js";
import { cleanLayerStyle } from "../src/lib/layerStyle.js";
import { CATEGORICAL_SAFE_COLORS } from "../src/lib/layers.js";

const iv = (hole_id, from, to, value) => ({ hole_id, from, to, value });
const layers = [
  { id: "custom_1", name: "py", unit: "% visual", rows: [iv("DH-1", 0, 2, 2), iv("DH-1", 2, 4, 8), iv("DH-2", 0, 2, 4)] },
  { id: "custom_2", name: "cpy", unit: "% visual", rows: [iv("DH-1", 0, 2, 4), iv("DH-1", 2, 4, 16), iv("DH-9", 0, 2, 1)] },
  { id: "custom_3", name: "au", unit: "g/t", rows: [iv("DH-1", 0, 2, 0.5), iv("DH-1", 2, 4, 2)] },
  { id: "custom_4", name: "lith", unit: "", rows: [iv("DH-1", 0, 2, "Basalt"), iv("DH-1", 2, 4, "Andesite")] }, // text: not a bar
  { id: "custom_5", name: "points", unit: "", rows: [{ hole_id: "DH-1", depth: 3, value: 7 }] }, // a point layer: no interval to draw
];

test("the Bars chooser lists the numeric custom layers with interval rows (not text layers, not point layers)", () => {
  assert.deepEqual(numericCustomChoices(layers).map((c) => [c.id, c.label, c.unit]), [["custom_1", "py", "% visual"], ["custom_2", "cpy", "% visual"], ["custom_3", "au", "g/t"]]);
  assert.deepEqual(numericCustomChoices([]), []);
});

test("the layers drawn as bars: chosen (style bar), shown in 3D, in the layer list's order, at most six", () => {
  const styles = { [customStyleKey("custom_1")]: { bar: true }, [customStyleKey("custom_2")]: { bar: true }, [customStyleKey("custom_3")]: { bar: true } };
  assert.deepEqual(barLayers(layers, {}, styles).map((l) => l.id), ["custom_1", "custom_2", "custom_3"]);
  assert.deepEqual(barLayers(layers, { custom_2: false }, styles).map((l) => l.id), ["custom_1", "custom_3"], "a layer hidden in 3D draws no bar");
  assert.deepEqual(barLayers(layers, {}, {}).length, 0);
  assert.equal(barLayers(layers, {}, styles, 2).length, 2);
});

test("lanes: one each after the minerals; layers with the same unit share one scale (the pooled 98th percentile), another unit has its own", () => {
  const { bars, scale } = customBars(layers.slice(0, 3), { laneStart: 2 });
  assert.deepEqual(scale.map((s) => [s.id, s.lane, s.unit]), [["custom:custom_1", 2, "% visual"], ["custom:custom_2", 3, "% visual"], ["custom:custom_3", 4, "g/t"]]);
  assert.equal(scale[0].full, scale[1].full, "py and cpy share the % visual scale");
  assert.equal(scale[0].full, 16, "the pooled values 1, 2, 4, 4, 8, 16: the 98th percentile is the top one here");
  assert.equal(scale[2].full, 2, "gold has its own: 0.5, 2");
  const py = bars.filter((b) => b.lane === 2), cpy = bars.filter((b) => b.lane === 3), au = bars.filter((b) => b.lane === 4);
  assert.deepEqual(py.map((b) => b.f), [2 / 16, 8 / 16, 4 / 16]);
  assert.deepEqual(cpy.map((b) => b.f), [4 / 16, 1, 1 / 16]);
  assert.deepEqual(au.map((b) => b.f), [0.25, 1]);
  assert.equal(bars.every((b) => b.v > 0), true);
  // a layer of its own colour
  const styles = { [customStyleKey("custom_2")]: { bar: true, color: "#ff00aa" } };
  assert.equal(customBarColour(layers[1], 3, styles), "#ff00aa");
  assert.equal(customBarColour(layers[0], 5, styles), CATEGORICAL_SAFE_COLORS[5 % CATEGORICAL_SAFE_COLORS.length]);
  assert.deepEqual(customBars([layers[3], layers[4]]).bars, [], "text and point layers draw nothing");
});

test("the section: the custom lanes follow the minerals' on this section's holes, clipped to the buffer, each its colour and unit, with key rows", () => {
  const holeIds = new Set(["DH-1", "DH-2"]), styles = { [customStyleKey("custom_1")]: { bar: true }, [customStyleKey("custom_3")]: { bar: true, color: "#112233" } };
  const mn = { rows: [{ hole_id: "DH-1", from: 0, to: 2, value: "Py", extra: 2 }], chosen: ["code:Py"], on: true, codeColour: () => "#aaaa00" };
  const s = sectionBarSets({ holeIds, mnlgy: mn, custom: { layers: barLayers(layers, {}, styles), styles } });
  assert.deepEqual(s.mineralBars.lanes.map((l) => [l.label, l.unit]), [["Py", "%"], ["py", "% visual"], ["au", "g/t"]]);
  assert.equal(s.mineralBars.lanes[2].colour, "#112233");
  assert.deepEqual([...new Set(s.mineralBars.bars.map((b) => b.lane))].sort(), [0, 1, 2]);
  assert.ok(s.mineralBars.bars.filter((b) => b.lane >= 1).every((b) => holeIds.has(b.hole_id)));
  assert.deepEqual(s.keyRows.map((r) => r[0]), ["Mineralization bars: Py ▮ = 2 %", "Custom layer bars: py ▮ = 8 % visual", "Custom layer bars: au ▮ = 2 g/t"]);
  // custom layers alone (no Mineralization layer): the lanes start at 0
  const only = sectionBarSets({ holeIds, custom: { layers: barLayers(layers, {}, styles), styles } });
  assert.deepEqual(only.mineralBars.lanes.map((l) => l.label), ["py", "au"]);
  assert.deepEqual([...new Set(only.mineralBars.bars.map((b) => b.lane))].sort(), [0, 1]);
  // clipped to the corridor's runs
  const clip = (h, f, t) => (h === "DH-1" ? [[Math.max(f, 0), Math.min(t, 2)]].filter(([a, b]) => b > a) : []);
  const c = sectionBarSets({ holeIds, clip, custom: { layers: barLayers(layers, {}, styles), styles } });
  assert.ok(c.mineralBars.bars.every((b) => b.hole_id === "DH-1" && b.to <= 2));
  // nothing chosen: no lanes
  assert.equal(sectionBarSets({ holeIds, custom: { layers: [], styles: {} } }).mineralBars, null);
});

test("the section counts the intervals that carry custom bars too", () => {
  const styles = { [customStyleKey("custom_1")]: { bar: true } };
  const s = sectionBarSets({ holeIds: new Set(["DH-1", "DH-2"]), custom: { layers: barLayers(layers, {}, styles), styles } });
  assert.equal(drawnIntervalCount([], s.mineralBars), 3);
});

test("the choice is the layer's style (bar), kept by cleanLayerStyle; the chooser, the Style dialog, the 3D hook and the payload are wired", () => {
  assert.deepEqual(cleanLayerStyle({ bar: true }, "interval"), { bar: true });
  assert.equal(cleanLayerStyle({ bar: false }, "interval"), null);
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("../src/components/TraceBarsChooser.jsx"), /numericCustomChoices\(custom\?\.layers\)/);
  assert.match(read("../src/modules/viewer/ViewerParts.jsx"), /<MineralBarsChooser rows=\{rows\} style=\{style\} onStyle=\{onStyle\} custom=\{customBars\}/);
  assert.match(read("../src/components/LayerStyleModal.jsx"), /target\.bars && <CustomBarRow/);
  assert.match(read("../src/lib/viewer/useTraceBars.js"), /cb\.customBars\(lay, \{ laneStart:/);
  assert.match(read("../src/modules/viewer/sectionPayload.js"), /custom: \{ layers: barLayers\(customLayers, customVisible, layerStyles\), styles: layerStyles \}/);
  const vm = read("../src/modules/ViewerModule.jsx");
  assert.match(vm, /custom: \{ layers: customLayers, visible: customVisible, styles: layerStyles \} \}\); \/\/ TASKS\.csv #3943 \/ #4008/);
  assert.match(vm, /customLayers, customVisible,/);
  assert.match(vm, /customBars=\{key === "mnlgy"/);
});
