// TASKS.csv #1622 — surface samples gridded: one element and medium, log10 for trace elements, blanked, back in the unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gridSamples, samplePoints, logByDefault, suggestSampleGrid } from "../src/lib/sampleGrid.js";

// a 25 m soil grid of 21 x 21 with a lognormal-ish Au, one hot sample, and a few rocks elsewhere
const soils = [];
for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) soils.push({ x: 600000 + i * 25, y: 6350000 + j * 25, medium: "soil", values: { Au: i === 10 && j === 10 ? 1.2 : 0.002 * (1 + ((i * 7 + j * 3) % 5)) } });
const rocks = [{ x: 601000, y: 6351000, medium: "rock chip", values: { Au: 5 } }, { x: 601010, y: 6351000, medium: "rock chip", values: { Au: 0 } }];
const samples = [...soils, ...rocks];

test("log by default for ppm / ppb, not for %", () => {
  assert.equal(logByDefault("ppm"), true); assert.equal(logByDefault("ppb"), true); assert.equal(logByDefault("%"), false);
});

test("medium filter and log points; zero values cannot be logged and are counted", () => {
  assert.equal(samplePoints(samples, "Au", { medium: "soil" }).points.length, 441);
  const all = samplePoints(samples, "Au", { log: true });
  assert.equal(all.nonPositive, 1); assert.equal(all.points.length, 442);
  assert.ok(Math.abs(all.points[0].value - Math.log10(soils[0].values.Au)) < 1e-12);
});

test("spacing suggestion: 25 m samples -> a small cell and a blanking distance of a few spacings", () => {
  const s = suggestSampleGrid(samplePoints(soils, "Au").points);
  assert.ok(Math.abs(s.spacingM - 25) < 1e-6);
  assert.ok(s.cellM >= 10 && s.cellM <= 25, String(s.cellM));
  assert.ok(s.blankM >= 25 && s.blankM <= 100, String(s.blankM));
});

test("the grid is back in ppm; log IDW keeps the hot sample from flooding its neighbours", () => {
  const lin = gridSamples(soils, "Au", { cellM: 12.5, log: false });
  const lg = gridSamples(soils, "Au", { cellM: 12.5, log: true });
  assert.equal(lg.grid.nx, lin.grid.nx);
  const vals = Array.from(lg.grid.values).filter(Number.isFinite);
  assert.ok(Math.max(...vals) <= 1.2 + 1e-6 && Math.min(...vals) > 0, "in ppm, inside the data range");
  // a node between samples, 12.5 m from the hot one: the linear IDW is pulled far up by one value, the log one much less
  const at = (g, x, y) => g.grid.values[Math.round((g.grid.yTop - y) / g.grid.dy) * g.grid.nx + Math.round((x - g.grid.x0) / g.grid.dx)];
  const x = 600000 + 10 * 25 + 12.5, y = 6350000 + 10 * 25;
  assert.ok(Math.abs(at(lg, 600250, 6350250) - 1.2) < 1e-6, "a node on the sample keeps its value");
  assert.ok(at(lg, x, y) < at(lin, x, y), `${at(lg, x, y)} vs ${at(lin, x, y)}`);
});

test("blanking: cells far from every sample have no value", () => {
  const g = gridSamples(samples, "Au", { cellM: 25, blankM: 60 });
  const mid = g.grid.values[Math.round((g.grid.yTop - 6350700) / 25) * g.grid.nx + Math.round((600800 - g.grid.x0) / 25)];
  assert.ok(!Number.isFinite(mid), "between the soils and the far rocks");
  assert.ok(g.valid < g.grid.nx * g.grid.ny);
  assert.equal(gridSamples([soils[0], soils[1]], "Au", {}).error, "few");
});

test("wired: Geochem has the panel; a geochemistry raster gets no magnetic filters", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /<SampleGridPanel setNotices=\{setNotices\} \/>/);
  const p = readFileSync(new URL("../src/components/SampleGridPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /stretch: log \? "log" : "p2-98"/);
  assert.match(p, /geochem: \{ symbol: el\.symbol, unit: el\.unit, log/);
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(r, /r\.grid && !r\.geochem [^\n]*<SlidersHorizontal/);
  assert.match(r, /filterFor === r\.id && r\.grid && !r\.geochem && \(/);
});

test("contours of the grid: a ring round the hot sample, stopping at blank nodes; percentile levels", async () => {
  const { gridContours, suggestedContourLevels, gridNodes } = await import("../src/lib/sampleGrid.js");
  const g = gridSamples(soils, "Au", { cellM: 25, log: true, blankM: 60 });
  const levels = suggestedContourLevels(g.grid.values);
  assert.ok(levels.length >= 2 && levels.every((v, i) => !i || v > levels[i - 1]), JSON.stringify(levels));
  const nodes = gridNodes(g.grid, g.grid.values);
  assert.ok(Math.abs(nodes.bbox[0] - g.grid.x0) < 1e-9 && Math.abs(nodes.bbox[3] - g.grid.yTop) < 1e-9);
  const ring = gridContours(g.grid, g.grid.values, [0.1]);
  assert.equal(ring.length, 1);
  const pts = ring[0].polylines.flat();
  const cx = 600000 + 250, cy = 6350000 + 250;
  assert.ok(pts.every((p) => Math.hypot(p.x - cx, p.y - cy) < 60), "the 0.1 ppm line circles the 1.2 ppm sample");
  assert.equal(gridContours(g.grid, g.grid.values, [50]).length, 0, "a level above the data crosses nothing");
});

test("wired: a geochemistry raster card has contour controls; lines become one draped boundary", () => {
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(r, /r\.grid && (r\.geochem && )?<GridContourControls raster=\{r\}/); // #2398: every gridded raster
  const c = readFileSync(new URL("../src/components/GridContourControls.jsx", import.meta.url), "utf8");
  assert.match(c, /drapeMode: terrain \? "terrain" : "flat", elevation: raster\.elevation/);
});
