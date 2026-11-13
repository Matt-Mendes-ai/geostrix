// TASKS.csv #2982 (WA iron review) — the Level plan drew 189,332 SVG elements at 6,390 holes (a path and a <title> per interval, a <g>, circle
// and <title> per pierce point, a path and a circle per hole): the open blocked 5-6 s. The same lines are now a few paths (lib/levelPlanDraw.js)
// and the tooltips are made on hover.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { linePath, mergedPath, pathsByColour, dotsPath, segmentFinder } from "../src/lib/levelPlanDraw.js";

const X = (x) => 10 + x * 2, Y = (y) => 500 - y * 2; // a plan frame: 2 units per metre, N up

test("the merged paths draw the same polylines as the old per-line paths", () => {
  const oldPath = (line) => line.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const lines = [[[0, 0], [1, 1], [2, 1.5]], [[5, 5], [6, 4]], [], null];
  assert.equal(linePath(lines[0], X, Y), oldPath(lines[0]).replace(/ /g, ""));
  assert.equal(mergedPath(lines, X, Y), [oldPath(lines[0]), oldPath(lines[1])].map((d) => d.replace(/ /g, "")).join(" "));
  const items = [{ color: "#a", lines: [[[0, 0], [0, 2]]] }, { color: "#b", lines: [[[1, 0], [1, 2]]] }, { color: "#a", lines: [[[2, 0], [2, 2]], [[3, 0], [3, 1]]] }];
  assert.deepEqual(pathsByColour(items, X, Y), [["#a", "M10.0,500.0L10.0,496.0 M14.0,500.0L14.0,496.0 M16.0,500.0L16.0,498.0"], ["#b", "M12.0,500.0L12.0,496.0"]]);
  assert.equal(dotsPath([[0, 0], [NaN, 1], [5, 5]], X, Y), "M10.0,500.0h0M20.0,490.0h0");
});

test("the interval under the cursor: the nearest within reach, none beyond it", () => {
  const items = [{ hole_id: "A", lines: [[[0, 0], [0, 10]]] }, { hole_id: "B", lines: [[[3, 0], [3, 10]]] }, { hole_id: "C", lines: [[[0, 20], [20, 20]]] }];
  const find = segmentFinder(items, X, Y);
  assert.equal(find(X(0) + 1, Y(5)), 0);
  assert.equal(find(X(3) - 1, Y(5)), 1);
  assert.equal(find(X(1.4), Y(5)), 0, "nearer A (2.8 units) than B (3.2)");
  assert.equal(find(X(10), Y(5)), -1);
  assert.equal(find(X(10), Y(20) + 3), 2);
  assert.equal(find(X(0), Y(5), 0.5), 0);
  assert.equal(segmentFinder([], X, Y)(0, 0), -1);
});

test("the review's size: 75,000 interval lines merge into one path per colour fast, and a hover query is instant", () => {
  const colours = Array.from({ length: 40 }, (_, i) => `#${(i * 99991).toString(16).padStart(6, "0").slice(0, 6)}`), items = [];
  for (let h = 0; h < 6300; h++) for (let k = 0; k < 12; k++) items.push({ color: colours[(h + k) % 40], lines: [[[h % 80 * 250, Math.floor(h / 80) * 200 + k], [h % 80 * 250 + 0.3, Math.floor(h / 80) * 200 + k + 2]]] });
  const sx = (x) => x * 0.03, sy = (y) => 560 - y * 0.03;
  let t = performance.now();
  const paths = pathsByColour(items, sx, sy);
  const ms = performance.now() - t;
  assert.equal(paths.length, 40);
  assert.ok(ms < 2500, `${ms.toFixed(0)} ms (a pathological slowdown, not a budget: the live open is timed in the notes)`);
  const find = segmentFinder(items, sx, sy);
  find(0, 0); // builds the grid
  t = performance.now();
  for (let i = 0; i < 200; i++) find(Math.random() * 760, Math.random() * 560);
  assert.ok(performance.now() - t < 200, "200 hover queries");
});

test("wiring: the plan draws the merged paths, and its tooltips are made on hover", () => {
  const s = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /ivPaths: pathsByColour\(ivs, X, Y\), findIv: segmentFinder\(ivs, X, Y\)/);
  assert.match(s, /ctx: data\.holes\.map\(\(h\) => ctxCache\(h\.hole_id, h\.context, path\)\)\.join\(" "\)/);
  assert.match(s, /\{dw\.ivPaths\.map\(\(\[c, d\]\) => <path key=\{c\} d=\{d\}/);
  assert.match(s, /hoverTitle\(e\.target, `\$\{iv\.hole_id\} \$\{iv\.from\}–\$\{iv\.to\} m — \$\{iv\.label\}`\)/);
  assert.match(s, /data-pc=\{k\}/);
  assert.doesNotMatch(s, /<title>\{`\$\{iv\.hole_id\}/, "no <title> per interval");
  assert.doesNotMatch(s, /<title>\{\[tr\("\{hole_id\} pierces/, "no <title> per pierce point");
});

test("wiring: an RL step reuses the trace points, the layer primitives and their grouping until the 3D view re-renders", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const b = fs.readFileSync(new URL("../src/modules/viewer/levelPlanBuild.js", import.meta.url), "utf8"); // #3137 — the build moved here
  assert.match(b, /if \(!pc \|\| pc\.fn !== ctx\.layerPrimitivesFor \|\| pc\.traces !== ctx\.traces \|\| pc\.vh !== ctx\.visibleHoles\) \{/);
  assert.match(b, /const intervals = pc\.prims\.intervals\.filter\(\(iv\) => holeIds\.has\(iv\.hole_id\)\), points = pc\.prims\.points\.filter\(\(pt\) => holeIds\.has\(pt\.hole_id\)\);/);
  assert.match(b, /const \{ ivBy, ptBy, rdBy \} = pc, pointLogs = \[\];/); // rdBy: #1706
  assert.match(b, /let b = pc\.base\.get\(t\.hole_id\);/);
  assert.match(v, /onClose=\{\(\) => \{ planCacheRef\.current = null; setLevelPlanOpen\(false\); \}\}/, "the cache goes when the plan closes");
});
