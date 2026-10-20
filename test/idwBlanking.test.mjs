// TASKS.csv #538 — gridding one survey with a blanking distance from the line spacing.
import test from "node:test";
import assert from "node:assert/strict";
import { idwGrid, suggestBlankingDistance } from "../src/lib/idw.js";

// 5 north-south lines 50 m apart, a station every 2 m
const lines = [];
for (let l = 0; l < 5; l++) for (let y = 0; y <= 400; y += 2) lines.push({ x: l * 50, y, value: l, line: `L${l}` });

test("#538 line data: the default comes from the spacing BETWEEN lines, not along them", () => {
  const s = suggestBlankingDistance(lines);
  assert.equal(s.basis, "line spacing");
  assert.ok(Math.abs(s.spacing - 50) < 1e-9); assert.ok(Math.abs(s.distance - 75) < 1e-9);
  const noLines = lines.map(({ line, ...p }) => p);
  const t = suggestBlankingDistance(noLines);
  assert.equal(t.basis, "station spacing"); assert.ok(Math.abs(t.spacing - 2) < 1e-9);
  assert.equal(suggestBlankingDistance(lines.slice(0, 2)), null);
});

test("#538 cells farther than the blanking distance from every point are NaN, the rest filled", () => {
  const box = { xmin: -200, ymin: 0, xmax: 400, ymax: 400, cellSize: 10 };
  const all = idwGrid(lines, box);
  const bl = idwGrid(lines, { ...box, maxDistance: 75 });
  const nan = (v) => v.reduce((c, x) => c + (Number.isFinite(x) ? 0 : 1), 0);
  assert.equal(nan(all.values), 0); // no blanking: the whole box is coloured, 200 m west of the first line too
  const col = (x) => Math.floor((x - box.xmin) / 10);
  const at = (g, x, y) => g.values[Math.floor((box.ymax - y) / 10) * g.gridW + col(x)];
  assert.ok(Number.isNaN(at(bl, -150, 200))); // 150 m from the nearest line
  assert.ok(Number.isNaN(at(bl, 350, 200)));
  assert.ok(Number.isFinite(at(bl, 25, 200))); // between two lines: kept
  assert.ok(Number.isFinite(at(bl, -45, 200))); // 45 m outside the first line: within 75 m
});
