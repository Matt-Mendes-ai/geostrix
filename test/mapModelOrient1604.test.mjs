// TASKS.csv #1604 — Model from map counts the orientations it will have and does not offer Build with none.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("counted as the run counts them; Build disabled with the reason at zero", () => {
  const s = fs.readFileSync("src/components/MapModelPanel.jsx", "utf8");
  assert.match(s, /const ok = \(m\) => \[m\.dip, m\.dipDir\]\.every\(Number\.isFinite\) && Number\.isFinite\(groundAt\(m\.x, m\.y\)\);/);
  assert.match(s, /disabled=\{busy \|\| !groundAt \|\| order\.length < 2 \|\| noOrient\}/);
  assert.match(s, /\{n\} fitted from the map traces on this terrain/);
  // the run's own check (modellingRuns) is the same: bedding + fitted planes on the terrain with a dip and a direction
  assert.match(fs.readFileSync("src/modules/viewer/modellingRuns.js", "utf8"), /\[\.\.\.\(p\.bedding \|\| \[\]\), \.\.\.\(p\.planes \|\| \[\]\)\]\.map\(\(m\) => \(\{ m, z: ground\(m\.x, m\.y\) \}\)\)\.filter\(\(\{ m, z \}\) => Number\.isFinite\(z\) && \[m\.dip, m\.dipDir\]\.every\(Number\.isFinite\)\)/);
});
