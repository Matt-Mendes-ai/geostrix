// TASKS.csv #3322 — Grid to raster on a 3D IP cloud: a proposed slice, a line spacing estimated with no line column, a cell never
// over the 4,000,000-cell limit, and a typed cell carries the blanking (at least 1.5 cells).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveyGridDefaults, proposeSlice, blankForCell, minCellFor, gridSizeAt, niceAtLeast, acrossLineSpacing, MAX_GRID_CELLS } from "../src/lib/surveyGridDefaults.js";

test("#3322 round values and the cell limit", () => {
  assert.equal(niceAtLeast(0.3), 0.5); assert.equal(niceAtLeast(86), 100); assert.equal(niceAtLeast(2.2), 2.5); assert.equal(niceAtLeast(5), 5);
  const ext = { xmin: 0, ymin: 0, xmax: 4322, ymax: 3705 }; // the review's 8,644 x 7,411 grid at 0.5 m
  const c = minCellFor(ext);
  const { nx, ny } = gridSizeAt(ext, c);
  assert.ok(nx * ny <= MAX_GRID_CELLS, `${c}: ${nx} x ${ny}`);
  const smaller = [1, 2].filter((v) => v < c).map((v) => gridSizeAt(ext, v)); // every smaller round cell breaks it
  for (const g of smaller) assert.ok(g.nx * g.ny > MAX_GRID_CELLS);
  assert.equal(c, 2.5);
});

test("#3322 stations on lines with no line column: the blanking and the cell come from the spacing between the lines", () => {
  const pts = [];
  for (let l = 0; l < 12; l++) for (let y = 0; y <= 1500; y += 2) pts.push({ x: 352000 + l * 200, y: 6334000 + y });
  const a = acrossLineSpacing(pts);
  assert.ok(Math.abs(a.along - 2) < 1e-6 && Math.abs(a.across - 200) < 1e-6, JSON.stringify(a));
  const d = surveyGridDefaults(pts);
  assert.equal(d.basis, "estimated line spacing"); assert.ok(d.linesEstimated);
  assert.ok(Math.abs(d.distance - 300) < 1e-6); assert.equal(d.cell, 50); // a quarter of 200
  // with the line column it is the old #538 answer
  const lab = surveyGridDefaults(pts.map((p) => ({ ...p, line: String(p.x) })));
  assert.equal(lab.basis, "line spacing"); assert.ok(Math.abs(lab.distance - 300) < 1e-6);
});

test("#3322 a regular grid and a random scatter keep the station-spacing defaults", () => {
  const grid = []; for (let x = 0; x <= 1000; x += 25) for (let y = 0; y <= 1000; y += 25) grid.push({ x, y });
  const g = surveyGridDefaults(grid);
  assert.equal(g.basis, "station spacing"); assert.equal(g.spacing, 25); assert.equal(g.distance, 50); assert.equal(g.cell, 10); assert.equal(g.capped, false);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sc = Array.from({ length: 3000 }, () => ({ x: rnd() * 5000, y: rnd() * 5000 }));
  assert.equal(surveyGridDefaults(sc).basis, "station spacing");
});

test("#3322 a cell the spacing would make too fine is raised to the limit", () => {
  // pairs of stations 0.4 m apart, the pairs scattered over 8 x 7 km: the spacing's cell (0.1 m) would be 80,000 x 70,000
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i < 400; i++) { const x = rnd() * 8000, y = rnd() * 7000; pts.push({ x, y }, { x: x + 0.4, y }); }
  const d = surveyGridDefaults(pts);
  assert.ok(d.capped); assert.ok(d.cell > d.spacingCell);
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const p of pts) { xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
  const { nx, ny } = gridSizeAt({ xmin, xmax, ymin, ymax }, d.cell);
  assert.ok(nx * ny <= MAX_GRID_CELLS);
});

test("#3322 a typed cell carries the blanking: at least 1.5 cells", () => {
  assert.equal(blankForCell(6, 50), 75); // the review: 50 m cell, 6 m blanking -> 382 of 5,082 cells
  assert.equal(blankForCell(300, 50), 300);
  assert.equal(blankForCell(null, 10), 15);
});

test("#3322 the proposed slice: the level with the most points, or the busiest round band", () => {
  const mesh = [];
  for (let x = 0; x < 250; x += 25) for (let y = 0; y < 250; y += 25) for (let z = -400; z <= 1200; z += z < 0 ? 50 : 25) {
    if (z > 1000 && x > 100) continue; // topography cuts the upper levels
    mesh.push({ x, y, z });
  }
  const p = proposeSlice(mesh);
  assert.equal(p.layered, true); assert.equal(p.gap, 25); assert.equal(p.n, 100);
  assert.ok(p.z <= 1000);
  assert.equal(mesh.filter((r) => r.z >= p.lo && r.z <= p.hi).length, 100); // one level only
  const neg = proposeSlice(mesh.filter((r) => r.z < 0)); // levels 50 m apart
  assert.equal(neg.gap, 50); assert.equal(neg.hi - neg.lo, 50);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cont = Array.from({ length: 5000 }, () => ({ x: rnd() * 1000, y: rnd() * 1000, z: -445 + 1723 * Math.sqrt(rnd()) }));
  const c = proposeSlice(cont);
  assert.equal(c.layered, false); assert.equal(c.thickness, 100); // 1,723 m / 20 -> 100
  assert.equal(c.hi - c.lo, 100); assert.equal(c.lo % 100, 0);
  assert.ok(c.lo >= 1000); // the density grows with elevation here
  assert.equal(proposeSlice(cont.slice(0, 10)), null);
});

test("#3322 the pane uses the proposals", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /const idwSliceProp = useMemo\(\(\) => \(idwShape\?\.is3D \? proposeSlice\(idwRows\) : null\)/);
  assert.match(g, /const idwZAuto = !!idwSliceProp && idwZ\.lo === "" && idwZ\.hi === "";/);
  assert.match(g, /surveyGridDefaults\(idwSlice\)/);
  assert.match(g, /const idwAutoBlank = idwSuggest \? blankForCell\(idwSuggest\.distance, idwCellSize\) : null;/);
  assert.match(g, /const blank = idwBlank === "" \? idwAutoBlank \?\? Infinity/);
  assert.match(g, /placeholder=\{idwSuggest \? String\(Math\.round\(idwAutoBlank\)\) : "none"\}/);
});

test("#3322 a wavy section (elevations to the centimetre, each repeated on a few lines) is a band, not levels 0.02 m apart", () => {
  const pts = [];
  for (let l = 0; l < 12; l++) for (let k = 0; k < 12; k++) for (let i = 0; i < 301; i++) pts.push({ x: l * 200, y: i * 10, z: Math.round((600 - k * 50 + 3 * Math.sin(i / 40)) * 100) / 100 });
  const p = proposeSlice(pts);
  assert.equal(p.layered, false); assert.equal(p.thickness, 50); // 562 m / 20 -> 50
});
