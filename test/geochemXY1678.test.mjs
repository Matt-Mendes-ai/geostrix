// TASKS.csv #1678 — a SWIR wavelength (custom-layer field) or a mag-susc log could not be plotted against an element: the X-Y scatter
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { depthLookup, axisOf, xyDiagram } from "../src/lib/geochemXY.js";

test("a sample takes the value of the interval covering its mid-depth in the same hole", () => {
  const at = depthLookup([
    { hole_id: "A", from: 0, to: 10, values: { W: 2195 } }, { hole_id: "A", from: 10, to: 20, values: { W: 2210 } },
    { hole_id: "B", from: 0, to: 5, values: { W: 2200 } },
  ], "W");
  assert.equal(at({ hole_id: "A", from: 4, to: 6 }), 2195);
  assert.equal(at({ hole_id: "A", from: 11, to: 13 }), 2210);
  assert.equal(at({ hole_id: "A", from: 25, to: 26 }), null); // past the logged depth
  assert.equal(at({ hole_id: "C", from: 1, to: 2 }), null);
  assert.equal(at({ hole_id: "B", from: 2, to: 2 }), 2200); // a point sample
});

test("a custom-layer field axis and an element axis make a scatter fitted to the data", () => {
  const customLayers = [{ id: "s", name: "SWIR", rows: [
    { hole_id: "A", from: 0, to: 10, value: "Mu", ai_Wav_WtMica: 2195 }, { hole_id: "A", from: 10, to: 20, value: "Mu", ai_Wav_WtMica: 2210 },
    { hole_id: "A", from: 20, to: 30, value: "Mu", ai_Wav_WtMica: 2205 }] }];
  const x = axisOf({ key: "custom:s:ai_Wav_WtMica", label: "SWIR › ai_Wav_WtMica", symbol: "SWIR › ai_Wav_WtMica", unit: "as logged", field: "ai_Wav_WtMica", layerId: "s" }, { layers: {}, customLayers });
  const y = axisOf({ kind: "element", symbol: "Cu", unit: "ppm" });
  const samples = [5, 15, 25].map((d, i) => ({ hole_id: "A", from: d - 1, to: d + 1, values: { Cu: [20, 2000, 500][i] } }));
  const d = xyDiagram(x, y, samples, { Cu: "ppm" });
  assert.equal(d.xLabel, "SWIR › ai_Wav_WtMica");
  assert.equal(d.yLabel, "Cu (ppm)");
  assert.equal(d.logX, false); // 2195-2210: not anchored at 0, not log
  assert.ok(d.xRange[0] > 2180 && d.xRange[1] < 2230, String(d.xRange));
  assert.equal(d.logY, true); // 20-2000 ppm: two decades
  assert.deepEqual(d.project(samples[1], { Cu: "ppm" }), { x: 2210, y: 2000 });
});

test("the tab offers it and passes it to the plot", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /\{\[\.\.\.Object\.values\(ALL_DIAGRAMS\), XY_ENTRY(, TERNARY_ENTRY \/\* #3051 \*\/)?\]\.map\(/); // #3051: and the chosen-corner ternary
  assert.match(g, /const diagram = diagramId === "xy" \? xyDiag \|\| XY_ENTRY : (diagramId === "ternary" \? ternDiag \|\| TERNARY_ENTRY \/\* #3051 \*\/ : )?ALL_DIAGRAMS\[diagramId\];/); // #3051: the ternary between
  assert.match(g, /diagramOverride=\{diagramId === "xy" (\|\| diagramId === "ternary" \/\* #3051 \*\/ )?\? diagram : null\}/); // #3051: the ternary too
});

test("tick labels: decades as 1e+3, other large values as numbers", () => {
  const g = readFileSync(new URL("../src/components/GeochemPlot.jsx", import.meta.url), "utf8");
  const body = g.slice(g.indexOf("function fmtTick(t) {") + "function fmtTick(t) {".length, g.indexOf("\n}", g.indexOf("function fmtTick(t) {")));
  const fmtTick = new Function("t", body);
  assert.equal(fmtTick(1000), "1e+3");
  assert.equal(fmtTick(10000), "1e+4");
  assert.equal(fmtTick(2193.4166), "2193.4");
  assert.equal(fmtTick(2200), "2200");
  assert.equal(fmtTick(0), "0");
  assert.equal(fmtTick(16.666666666666668), "16.67");
  assert.equal(fmtTick(0.0005), "5e-4");
  assert.equal(fmtTick(2500000), "2.5e+6");
});
