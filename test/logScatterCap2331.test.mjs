// TASKS.csv #2331 (review #2325, WA uranium) — the Downhole logs scatter draws at most a few thousand points, extremes kept
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strideSample, SCATTER_MAX } from "../src/lib/downholeLogs.js";

test("a small set is drawn whole; a large one is strided with its extremes", () => {
  const small = [[1, 2], [3, 4]];
  assert.deepEqual(strideSample(small), { points: small, step: 1 });
  const big = Array.from({ length: 172983 }, (_, i) => [i % 1000, (i * 7) % 997]);
  big[123457] = [5e6, 1]; // an outlier off the stride
  const s = strideSample(big);
  assert.equal(s.step, Math.ceil(172983 / SCATTER_MAX));
  assert.ok(s.points.length <= SCATTER_MAX + 4);
  assert.ok(s.points.some(([x]) => x === 5e6));
  assert.equal(SCATTER_MAX, 3000);
});

test("the pane draws the sample and says so", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /drawn: strideSample\(p\)/); // #2948 — kept in a memo with the points
  assert.match(p, /\{drawn\.points\.map\(\(\[x, y\], i\) => <circle/);
  assert.doesNotMatch(p, /\{pts\.map\(\(\[x, y\], i\) => <circle/);
  assert.match(p, /pairs drawn \(every \{s\}th, and the extremes\); the statistics use all of them\./);
});
