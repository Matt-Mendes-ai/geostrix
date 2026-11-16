// TASKS.csv #3683 — a trend's ratio boxes follow the trend when its ratios change from outside ('Set the plane from'), and leaving a box
// applies only what was typed (a click in and out wrote the old 3 : 2 : 1 back over a fitted 5.6 : 1.8 : 1).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("RatiosEditor: refreshed from the trend's ratios, applies on blur only when typed", () => {
  const s = readFileSync(new URL("../src/components/TrendsPanel.jsx", import.meta.url), "utf8");
  const ed = s.slice(s.indexOf("function RatiosEditor("), s.indexOf("function RatiosEditor(") + 3000);
  assert.match(ed, /const stored = `\$\{trend\.ratios\.max\}:\$\{trend\.ratios\.int\}:\$\{trend\.ratios\.min\}`;/);
  assert.match(ed, /useEffect\(\(\) => \{ typed\.current = false; setVals\(\{ \.\.\.trend\.ratios \}\); setMsg\(null\); \}, \[stored\]\);/);
  assert.match(ed, /onChange=\{\(e\) => \{ typed\.current = true;/);
  assert.match(ed, /onBlur=\{\(\) => \{ if \(typed\.current\) tryApply\(vals\); \}\}/);
  assert.match(ed, /setMsg\(null\); typed\.current = false;/, "applied: no longer typed");
});
