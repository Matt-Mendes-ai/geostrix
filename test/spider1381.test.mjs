// TASKS.csv #1381 — over the line cap, a spider plot draws samples from every hole, not the file's last rows
import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadLines } from "../src/lib/geochemDiagrams.js";

test("1,331 rows from 9 holes, cap 250: every hole drawn, in proportion, never over the cap", () => {
  const lines = [];
  const sizes = [20, 40, 60, 90, 120, 150, 200, 300, 351];
  sizes.forEach((n, h) => { for (let i = 0; i < n; i++) lines.push({ sample: { hole_id: `H${h}` }, i }); });
  const { shown, groups } = spreadLines(lines, 250, (l) => l.sample.hole_id);
  assert.ok(shown.length <= 250 && shown.length > 230, String(shown.length));
  assert.equal(groups, 9);
  assert.equal(new Set(shown.map((l) => l.sample.hole_id)).size, 9);
  const big = shown.filter((l) => l.sample.hole_id === "H8").length;
  assert.ok(big > 50 && big < 75, String(big));
  assert.equal(spreadLines(lines.slice(0, 10), 250, (l) => l.sample.hole_id).shown.length, 10);
});
