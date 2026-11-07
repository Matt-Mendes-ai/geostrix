// TASKS.csv #1622 — natural-neighbour gridding (discrete Sibson) beside IDW and minimum curvature, and the grid, its samples, its
// contours and its parameters in one figure (the Maps plan view)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { naturalNeighbourGrid } from "../src/lib/naturalNeighbour.js";
import { gridSamples, figureSamples, colourFromStops } from "../src/lib/sampleGrid.js";

let seed = 1622; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

test("a plane through scattered samples comes back, closer as the cells shrink (Sibson reproduces planes)", () => {
  const pts = Array.from({ length: 400 }, () => { const x = rnd() * 2000, y = rnd() * 2000; return { x, y, v: 3 + 0.002 * x - 0.001 * y }; });
  const err = (cell) => {
    const nx = Math.round(2000 / cell), r = naturalNeighbourGrid(pts, { xmin: 0, ymax: 2000, cell, nx, ny: nx });
    let s = 0, n = 0;
    for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * cell, y = 2000 - (j + 0.5) * cell;
      if (x < 300 || x > 1700 || y < 300 || y > 1700) continue;
      s += Math.abs(r.values[i + nx * j] - (3 + 0.002 * x - 0.001 * y)); n++;
    }
    return s / n;
  };
  const e50 = err(50), e10 = err(10);
  assert.ok(e50 < 0.06 && e10 < 0.006 && e10 < e50 / 5, `mean error ${e50.toFixed(4)} at 50 m, ${e10.toFixed(4)} at 10 m (the plane spans 6)`);
});

test("a lone high: no overshoot, no bullseye beyond its neighbours, its own value at its node", () => {
  const pts = [];
  for (let x = 0; x <= 1000; x += 100) for (let y = 0; y <= 1000; y += 100) pts.push({ x, y, v: x === 500 && y === 500 ? 10 : 1 });
  const r = naturalNeighbourGrid(pts, { xmin: -50, ymax: 1050, cell: 25, nx: 44, ny: 44 });
  const at = (x, y) => r.values[Math.round((x + 50) / 25 - 0.5) + 44 * Math.round((1050 - y) / 25 - 0.5)];
  const vals = Array.from(r.values).filter(Number.isFinite);
  assert.equal(Math.min(...vals), 1); assert.equal(Math.max(...vals), 10);
  assert.equal(at(500, 500), 10);
  assert.equal(at(600, 500), 1, "the neighbouring sample keeps its own value");
  assert.ok(at(550, 500) > 1 && at(550, 500) < 10);
  assert.deepEqual(naturalNeighbourGrid([{ x: 0, y: 0, v: 1 }, { x: 1000, y: 0, v: 2 }, { x: 0, y: 1000, v: 3 }], { xmin: -500, ymax: 1500, cell: 1, nx: 2000, ny: 2000 }).error, "work", "a cell far finer than the spacing is refused");
});

test("gridSamples natural neighbour: the same blanking as IDW, a sample's node keeps it, back in the unit", () => {
  const soils = [];
  for (let x = 0; x <= 900; x += 100) for (let y = 0; y <= 900; y += 100) soils.push({ x: 500000 + x, y: 6000000 + y, medium: "soil", values: { Au: x === 400 && y === 400 ? 1.2 : 0.005 } });
  const idw = gridSamples(soils, "Au", { log: true, cellM: 50, method: "idw" });
  const nn = gridSamples(soils, "Au", { log: true, cellM: 50, method: "natneigh" });
  assert.equal(nn.method, "natneigh");
  assert.equal(nn.valid, idw.valid);
  const g = nn.grid, i = Math.round((500400 - g.x0) / g.dx), j = Math.round((g.yTop - 6000400) / g.dy);
  assert.ok(Math.abs(g.values[i + g.nx * j] - 1.2) < 1e-6, "1.2 ppm at its node");
  assert.ok(Math.abs(g.values[i + 2 + g.nx * j] - 0.005) < 1e-9, "the next sample, 100 m away, keeps 0.005");
  // three samples 2 km apart on 1.5 m cells: 1.8 M cells (under the 4 M cap), each node ~400 cells from its sample
  const far = [[0, 0], [2000, 0], [0, 2000]].map(([x, y], k) => ({ x: 500000 + x, y: 6000000 + y, values: { Au: 0.01 * (k + 1) } }));
  assert.equal(gridSamples(far, "Au", { log: true, cellM: 1.5, method: "natneigh", blankM: 5000 }).error, "natneighWork");
});

test("the figure: the grid's samples (its element and medium) coloured on its legend stops, log-spaced or not", () => {
  const samples = [{ x: 1, y: 1, medium: "soil", values: { Au: 0.1 } }, { x: 2, y: 2, medium: "rock", values: { Au: 5 } }, { x: 3, y: 3, medium: "soil", values: { Cu: 9 } }, { x: 4, y: 4, medium: "soil", values: { Au: 0 } }];
  assert.deepEqual(figureSamples(samples, { symbol: "Au", medium: "soil" }), [{ x: 1, y: 1, v: 0.1 }, { x: 4, y: 4, v: 0 }]);
  assert.equal(figureSamples(samples, { symbol: "Au", medium: null }).length, 3);
  const stops = [{ value: 0.001, color: "#000000" }, { value: 0.01, color: "#808080" }, { value: 0.1, color: "#ffffff" }];
  assert.equal(colourFromStops(stops, 0.01, true), "#808080");
  assert.equal(colourFromStops(stops, Math.sqrt(0.001 * 0.01), true), "#404040", "half-way in log terms on a log scale");
  assert.equal(colourFromStops(stops, 5, true), "#ffffff"); assert.equal(colourFromStops(stops, 0, true), "#000000", "clamped to the ends");
  assert.equal(colourFromStops([{ value: 0, color: "#000000" }, { value: 10, color: "#ffffff" }], 5), "#808080");
});

test("wired: the method in the panel, the figure and its legend in the plan view, contours tied to their grid", () => {
  const p = readFileSync(new URL("../src/components/SampleGridPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /<option value="natneigh">\{tr\("Natural neighbour"\)\}<\/option>/);
  assert.match(p, /"Surface sample gridding \(natural neighbour, discrete Sibson\)"/);
  const m = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(m, /\{figure && <FigureLegend f=\{figure\} chip=\{chip\} \/>\}/);
  assert.match(m, /const c = colourFromStops\(figure\.r\.colourStops, q\.v, figure\.log\);/);
  assert.match(readFileSync(new URL("../src/components/GridContourControls.jsx", import.meta.url), "utf8"), /sourceRaster: raster\.id/);
});
