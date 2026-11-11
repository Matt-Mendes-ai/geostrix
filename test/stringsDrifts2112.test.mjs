// TASKS.csv #2112 / #2114 — a closed string breaks at a vertex into one open string; the drift's start Z says where it comes from
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openRingAt } from "../src/lib/designStrings.js";

test("a 4-vertex ring opened at vertex 2 keeps all four edges", () => {
  const ring = [[0, 0, 0], [140, 0, 0], [140, 120, 0], [0, 120, 0]];
  assert.deepEqual(openRingAt(ring, 1), [[140, 0, 0], [140, 120, 0], [0, 120, 0], [0, 0, 0], [140, 0, 0]]);
  assert.deepEqual(openRingAt(ring, 0), [...ring, [0, 0, 0]]);
  assert.equal(openRingAt(ring, 4), null);
  assert.equal(openRingAt(ring.slice(0, 2), 0), null);
  const o = openRingAt(ring, 2); o[0][0] = 99; assert.equal(ring[2][0], 140); // copies
});

test("the panes", () => {
  const s = fs.readFileSync("src/components/DesignStringsPane.jsx", "utf8");
  assert.match(s, /if \(string\.closed\) \{ const ring = openRingAt\(string\.vertices, i0\);/);
  assert.match(s, /disabled=\{!\(string\.closed \? num0\(tool\.splitAt\) >= 1/);
  const d = fs.readFileSync("src/components/DesignLinesPane.jsx", "utf8");
  assert.match(d, /line\.start\?\.zAuto && Number\.isFinite\(line\.start\?\.z\) && !started && <div style=\{note\}>\{tr\("Z \{z\} is the median collar elevation/);
});
