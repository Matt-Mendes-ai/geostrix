// TASKS.csv #3191 (#3137, WA iron) — the plan's 6,036 pierce points and its slab dots were one <circle> each, the bulk of the ~0.4 s React spent
// committing a new plan. They are one stroked path per colour (an outline path under them), and hover finds the point by position.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dotsByColour, pointFinder } from "../src/lib/levelPlanDraw.js";

const X = (x) => x, Y = (y) => -y;

test("dots grouped by colour, one zero-length subpath each; a point with no position left out", () => {
  const items = [{ x: 1, y: 2, color: "#f00" }, { x: 3, y: 4, color: "#0f0" }, { x: 5, y: 6, color: "#f00" }, { x: NaN, y: 1, color: "#f00" }];
  assert.deepEqual(dotsByColour(items, X, Y), [["#f00", "M1.0,-2.0h0M5.0,-6.0h0"], ["#0f0", "M3.0,-4.0h0"]]);
});

test("the finder: the nearest point within reach, -1 beyond it; 6,000 points answer quickly", () => {
  const pts = Array.from({ length: 6000 }, (_, i) => ({ x: (i % 100) * 7, y: -Math.floor(i / 100) * 7 }));
  const find = pointFinder(pts, X, Y);
  assert.equal(find(7.5, 0.5), 1);
  assert.equal(find(3.5, 3.5, 2), -1);
  const t = performance.now();
  for (let i = 0; i < 500; i++) find(Math.random() * 700, Math.random() * 420);
  assert.ok(performance.now() - t < 200, "500 hover queries");
});

test("wiring: no circle per pierce point or dot; outline then colour paths; hover through the finders", () => {
  const s = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.ok(!/<circle key=\{`pc/.test(s) && !/<circle key=\{`p\$\{i\}`\}/.test(s));
  assert.match(s, /<path d=\{dw\.pcAll\} stroke="#1a2028" strokeWidth=\{10\.8\} strokeLinecap="round" fill="none" \/>/);
  assert.match(s, /dw\.pcFill\.map\(\(\[c, d\]\) => <path key=\{c\} d=\{d\} stroke=\{c\} strokeWidth=\{7\.6\}/);
  assert.match(s, /p = data\.points\[dw\.findPt\(q\.x, q\.y, 4\)\]/);
});
