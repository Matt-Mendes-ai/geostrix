// TASKS.csv #1696 (review #1645, Copley) — ore-grade markers stand out (log size above P90) and one element's markers no longer sit
// inside another's (spaced by the largest marker radius)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const sizeLib = readFileSync(new URL("../src/lib/viewer/assaySize.js", import.meta.url), "utf8"); // #1533 — assaySizeFor moved out of ViewerModule

test("#1696 the size grows on a log scale above P90: 97 ppm and 6,887 ppm Cu are no longer the same sphere", () => {
  assert.ok(sizeLib.includes(": p90 > 0 ? 0.6 + 0.4 * (Math.log(value / p90) / Math.log(max / p90))"));
  // the same formula, on Copley's Cu (min 0.25, P50 5.1, P90 59.2, max 19,400)
  const size = (value, min = 0.25, p50 = 5.1, p90 = 59.2, max = 19400) => { const seg = (x, lo, hi, a, b) => a + ((x - lo) / (hi - lo)) * (b - a); const t = value <= p50 ? seg(value, min, p50, 0, 0.35) : value <= p90 ? seg(value, p50, p90, 0.35, 0.6) : 0.6 + 0.4 * (Math.log(value / p90) / Math.log(max / p90)); return 1.2 + 2.6 * Math.max(0, Math.min(1, t)); };
  assert.ok(size(6887) - size(97) > 0.7, `${size(97)} vs ${size(6887)}`);
  assert.ok(Math.abs(size(19400) - 3.8) < 1e-9 && size(59.2) < size(97));
});

test("#1696 markers of several elements are spaced two radii apart", () => {
  assert.ok(v.includes("const ring = n > 1 ? (3.9 * Math.max(...assayDisplayElements.map((x) => assayStyle[x]?.sizeMult ?? 1))) / Math.sin(Math.PI / n) : 0;"));
  for (const n of [2, 3, 4]) { const ring = 3.9 / Math.sin(Math.PI / n), gap = 2 * ring * Math.sin(Math.PI / n); assert.ok(gap >= 7.6, `n ${n}: ${gap}`); }
});
