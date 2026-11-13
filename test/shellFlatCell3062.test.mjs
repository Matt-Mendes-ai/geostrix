// TASKS.csv #3062 (split from #3010) — the Grade shell gets Estimation's Cell E x N, Cell height and Vertical reach (#2418), so a flat
// body (a seam, a palaeochannel, a laterite) needs no structural trend: with no trend the reach makes a flat search through the same
// volume-keeping warp a trend uses, and the grid's cell is the one typed, in real metres.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { flatSearchTrend } from "../src/lib/estimationShape.js";
import { trendBasis, trendScales } from "../src/lib/trend.js";
import { anisoWarpPoint, invScales } from "../src/lib/viewer/geomath.js";

test("a flat search's warp: the search reaches R across and the reach up and down; the typed cell comes back in real metres", () => {
  const t = flatSearchTrend(100, 10), s = trendScales(t), b = trendBasis(t), c = { x: 0, y: 0, z: 0 };
  // the run's formulas: searchInGrid = R x scales.major; cellOf(c) = { c x major, c x major, height x minor }
  const searchInGrid = 100 * s.major, cell = { dx: 25 * s.major, dy: 25 * s.major, dz: 2 * s.minor };
  const back = (q) => anisoWarpPoint(q, c, b, invScales(s)); // grid frame -> real
  const close = (a, e, m) => assert.ok(Math.abs(a - e) < 1e-6, `${m}: ${a} vs ${e}`);
  for (const [dir, want] of [[{ x: 1, y: 0, z: 0 }, 100], [{ x: 0, y: 1, z: 0 }, 100], [{ x: 0, y: 0, z: 1 }, 10]]) {
    const r = back({ x: dir.x * searchInGrid, y: dir.y * searchInGrid, z: dir.z * searchInGrid });
    close(Math.hypot(r.x, r.y, r.z), want, `reach along ${JSON.stringify(dir)}`);
  }
  const e = back({ x: cell.dx, y: 0, z: 0 }), n = back({ x: 0, y: cell.dy, z: 0 }), h = back({ x: 0, y: 0, z: cell.dz });
  close(Math.hypot(e.x, e.y, e.z), 25, "cell E"); close(Math.hypot(n.x, n.y, n.z), 25, "cell N"); close(Math.hypot(h.x, h.y, h.z), 2, "cell height");
  assert.ok(Math.abs(e.z) < 1e-9 && Math.abs(h.x) < 1e-9 && Math.abs(h.y) < 1e-9, "axis-aligned: a grid cell is a real box");
  assert.equal(flatSearchTrend(100, 100), null, "a reach not below the radius is a sphere");
  assert.equal(flatSearchTrend(0, 10), null, "no radius: no flat search");
});

test("wiring: the run's flat search, per-axis cell and budget; the pane's fields; ViewerModule's state", () => {
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const flatT = !shellTrend\.enabled \? flatSearchTrend\(numericSearchRadius, numericFlatReach, tr\("flat search"\)\) : null;/);
  assert.match(r, /const cellOf = \(c\) => \(anisotropy\.flat \? \{ dx: c \* gsScl\.major, dy: c \* gsScl\.major, dz: \(cz \?\? c\) \* gsScl\.minor \} : \{ dx: c, dy: c, dz: anisotropy\.enabled \? c : cz \?\? c \}\);/);
  assert.match(r, /bounds, cellSize: cellOf\(cs\), method: numericMethod,/);
  assert.match(r, /let blocksNeeded = blocksOf\(cs\);/);
  assert.ok(!/gridBlockCount\(bounds, cs\)|cellToFit\(bounds, /.test(r), "the budget counts per axis");
  assert.match(r, /cellM: \[cs, cs, cz \?\? cs\]/);
  const p = fs.readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /\{tr\("Cell height \(m\)"\)\}<input type="number" min="0\.25" step="any" value=\{gt \? "" : numericCellHeight\} disabled=\{!!gt\}/);
  assert.match(p, /\{tr\("Vertical reach \(m\)"\)\}<input type="number" min="0" step="any" value=\{gt \? "" : numericFlatReach\} disabled=\{!!gt\}/);
  assert.match(p, /numericCellHeight > 0 && !trendFor\("gradeShell"\) \? tr\("Cell E × N \(m\)"\) : tr\("Cell \(m\)"\)/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const \[numericCellHeight, setNumericCellHeight\] = useState\(""\), \[numericFlatReach, setNumericFlatReach\] = useState\(""\);/);
  assert.match(v, /numericCellHeight, setNumericCellHeight, numericFlatReach, setNumericFlatReach, \/\* #3062 \*\//);
});
