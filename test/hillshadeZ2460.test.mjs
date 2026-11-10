// TASKS.csv #2460 (review #2325, WA uranium) — an automatic vertical exaggeration for a hillshade of low relief; slope stretched to its range
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoZFactor, terrainDerivativeValues } from "../src/lib/hillshade.js";

// a 10 km plain rising 28 m with 3 m undulations every 500 m (the WA collar terrain's scale), 101 x 101 nodes
const plain = (() => {
  const n = 101, e = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) e[j * n + i] = 318 + 0.28 * i + 1.5 * Math.sin((i * 100) / 500 * 2 * Math.PI) * Math.cos((j * 100) / 700 * 2 * Math.PI);
  return { bbox: [0, 0, 10000, 10000], gridW: n, gridH: n, elevations: e };
})();

test("a plain: tens of times, putting its 98th-percentile slope near 30 degrees", () => {
  const z = autoZFactor(plain);
  assert.ok(z > 10 && z <= 200, String(z));
  const s = terrainDerivativeValues("slope", plain.elevations, 101, 101, 100, 100, { zFactor: z }).filter(Number.isFinite).sort((a, b) => a - b);
  const s98 = s[Math.floor(0.98 * (s.length - 1))];
  assert.ok(s98 > 25 && s98 < 35, String(s98));
});

test("rugged ground stays at 1x; nothing to read stays at 1x", () => {
  const n = 51, e = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) e[j * n + i] = 1000 + 40 * i; // 40 m per 50 m: 39 degrees
  assert.equal(autoZFactor({ bbox: [0, 0, 2500, 2500], gridW: n, gridH: n, elevations: e }), 1);
  assert.equal(autoZFactor({ bbox: [0, 0, 10, 10], gridW: 2, gridH: 2, elevations: new Float64Array([5, 5, 5, 5]) }), 1);
});

test("the hillshade takes it and says it; slope is stretched to its 2-98 % range", () => {
  const h = readFileSync(new URL("../src/lib/hillshade.js", import.meta.url), "utf8");
  assert.match(h, /const lo = Math\.max\(0, pctl\(shown, 0\.02\)\), hi = Math\.max\(lo \+ 0\.1, pctl\(shown, 0\.98\)\)/);
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const zf = shade \? autoZFactor\(terrain\) : 1/);
  assert.match(g, /Hillshade with a vertical exaggeration of \{z\}x/);
});
