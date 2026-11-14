// TASKS.csv #2757 (from #2384) — the WA uranium LIG body was 14.1 Mm³, 7.6 Mm³ (54 %) of it more than one hole spacing (76 m) from any
// hole, and the result did not say so: #1740's 'far from the logs' distance is the larger of 50 m and the cell, and the plan cell was
// 180.7 m. The unit body (and halo) and the grade shell now report the share beyond one hole spacing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { farFromSamples } from "../src/lib/haloSupport.js";

// holes every 76 m on a 4 x 4 pattern; an envelope on a 180 m plan grid that reaches a node or so past the pattern
test("a coarse cell hides the volume beyond the drilling; one hole spacing shows it", () => {
  const spacing = 76, samples = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let z = 0; z <= 10; z += 2) samples.push({ x: 400 + i * spacing, y: 400 + j * spacing, z });
  const nx = 7, ny = 7, nz = 3, cell = 180;
  const values = new Float32Array(nx * ny * nz); // inside: the plan nodes at 360 / 540 / 720 m, round the pattern (400-628 m)
  for (let k = 0; k < nz; k++) for (let j = 2; j <= 4; j++) for (let i = 2; i <= 4; i++) values[i + nx * (j + ny * k)] = 1;
  const origin = { x: 0, y: 0, z: 0 }, spacingG = { dx: 180, dy: 180, dz: 5 };
  const old = farFromSamples(values, nx, ny, nz, origin, spacingG, 0.5, samples, Math.max(50, cell));
  const now = farFromSamples(values, nx, ny, nz, origin, spacingG, 0.5, samples, spacing);
  assert.equal(old.share, 0, "within one cell of a hole everywhere: #1740 sees nothing");
  assert.ok(now.share > old.share + 0.4, `one spacing ${now.share.toFixed(2)} vs the cell ${old.share.toFixed(2)}`);
  assert.ok(now.share > 0.5, "most of this envelope is beyond the drilling: " + now.share.toFixed(2));
});

test("the unit body and the grade shell report it", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const beyondSp = auto\.spacing > 0 \? farFromSamples\(altCap\.values, [^;]*, iso, pts, auto\.spacing,/);
  assert.match(r, /beyondDrilling: \{ share: \+beyondSp\.share\.toFixed\(3\), holeSpacingM: Math\.round\(auto\.spacing\) \}/);
  assert.match(r, /const sayBeyond = !!\(beyondSp && beyondSp\.inside && beyondSp\.share >= 0\.05\);/);
  assert.match(r, /\(beyondSp\.share >= 0\.5 \? errorNotice : notice\)\(tr\("\\"\{label\}\\": \{p\}% of its volume lies more than one hole spacing \(\{s\} m\) from any logged interval/);
  assert.match(r, /if \(farLogs\.inside && \(!sayBeyond \|\| farLogs\.dist < 0\.9 \* auto\.spacing\)\)/, "#1740's line kept when it measures a shorter distance");
  // TASKS.csv #3286 (2) — the spacing Estimation says (holeSpacingSummary), the halo rule's only as a fallback
  assert.match(r, /const gsSpacing = \(await import\("\.\.\/\.\.\/lib\/holeSpacing\.js"\)\)\.holeSpacingSummary\(gsCollars\)\?\.medianM \|\| autoHaloParams\(gsCollars, tracesRef\.current \|\| null\)\.spacing;/);
  assert.match(r, /farFromSamples\(gsCap\.values, grid\.nx, grid\.ny, grid\.nz, grid\.origin, grid\.cellSize, numericCutoff, points, gsSpacing,/);
  assert.match(r, /beyondDrilling: \{ share: \+gsBeyond\.share\.toFixed\(3\), holeSpacingM: Math\.round\(gsSpacing\) \}/);
});
