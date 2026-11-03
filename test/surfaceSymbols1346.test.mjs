// TASKS.csv #1346 — surface-sample symbols: the #849 regional size, capped per medium by its own spacing
import { test } from "node:test";
import assert from "node:assert/strict";
import { symbolRadiusByMedium } from "../src/lib/viewer/surfaceSymbols.js";

const grid = (x0, y0, step, n, medium) => { const out = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push({ x: x0 + i * step, y: y0 + j * step, medium }); return out; };

test("a 20 m soil grid with a few samples 45 km away is drawn at its own scale, not as 250 m balls", () => {
  const s = [...grid(0, 0, 20, 15, "soil"), { x: 0, y: -45000, medium: "rock chip" }, { x: 300, y: -45000, medium: "rock chip" }];
  const r = symbolRadiusByMedium(s);
  // #1403 — the 2 far rocks no longer set the extent: the soils are sized as if they were alone (1/250 of 280 m, floored at 1.8 m)
  assert.equal(r("soil"), 1.8);
  assert.ok(r("rock chip") <= 120 + 1e-9, String(r("rock chip")));
});

test("a sparse regional stream program keeps the #849 size (1/250 of its extent)", () => {
  const s = grid(0, 0, 3000, 10, "stream sediment"); // 27 km x 27 km, 3 km apart
  const r = symbolRadiusByMedium(s);
  assert.ok(Math.abs(r("stream sediment") - Math.hypot(27000, 27000) / 250) < 1e-6, String(r("stream sediment")));
});

test("never below 1.8 m, one sample, missing coordinates, an unknown medium", () => {
  assert.equal(symbolRadiusByMedium(grid(0, 0, 0.5, 5, "soil"))("soil"), 1.8);
  assert.equal(symbolRadiusByMedium([{ x: 5, y: 5, medium: "soil" }])("soil"), 1.8);
  assert.equal(symbolRadiusByMedium([])("soil"), 1.8);
  const r = symbolRadiusByMedium([...grid(0, 0, 100, 5, "soil"), { x: NaN, y: 1, medium: "soil" }]);
  assert.ok(Math.abs(r("soil") - Math.min(Math.hypot(400, 400) / 250, 40)) < 1e-6, "the extent cap (2.26 m) applies here, before the spacing cap (40 m)");
  assert.ok(r("other") >= 1.8);
});

test("the grid search finds the true nearest neighbour (against a plain search)", () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = Array.from({ length: 400 }, () => ({ x: rnd() * 5000, y: rnd() * 2000, medium: "soil" }));
  const d = s.map((a) => Math.min(...s.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))).sort((a, b) => a - b);
  const ext = (k) => Math.max(...s.map((p) => p[k])) - Math.min(...s.map((p) => p[k]));
  const want = Math.min(Math.hypot(ext("x"), ext("y")) / 250, 0.4 * d[d.length >> 1]);
  assert.ok(Math.abs(symbolRadiusByMedium(s)("soil") - want) < 1e-6);
  const far = [...s, { x: 0, y: 60000, medium: "rock chip" }]; // #1403 — one far sample is an outlier: it changes nothing
  assert.ok(Math.abs(symbolRadiusByMedium(far)("soil") - want) < 1e-6);
});
