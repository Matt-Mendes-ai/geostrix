// TASKS.csv #4106 — a geoML grade shell is drawn only where a sample at or above its cut-off lies within two blocks (SHELL_REACH_BLOCKS). A smooth model carried a few
// rich holes' grade across the gaps between them, and the shell grew beside the holes instead of around their intercepts. Synthetic blocks and samples only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gradeShells, SHELL_REACH_BLOCKS } from "../src/lib/geomlBodies.js";

const CELL = 25, N = [24, 16, 8]; // 600 x 400 x 200 m of 25 m blocks, centres from 12.5
const blocks = (fn) => {
  const b = { cell: CELL, n: N, x: [], y: [], z: [], prediction: [] };
  for (let i = 0; i < N[0]; i++) for (let j = 0; j < N[1]; j++) for (let k = 0; k < N[2]; k++) {
    const x = CELL / 2 + i * CELL, y = CELL / 2 + j * CELL, z = -200 + CELL / 2 + k * CELL;
    b.x.push(x); b.y.push(y); b.z.push(z); b.prediction.push(fn(x, y, z));
  }
  b.p10 = b.prediction.map((v) => v * 0.6); b.p90 = b.prediction.map((v) => v * 1.5);
  return b;
};
const bump = (c, r, g) => (x, y, z) => g * Math.exp(-((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2) / (2 * r ** 2));
const drilled = bump([150, 200, -100], 45, 10), runaway = bump([450, 200, -100], 45, 10); // the same high twice; only the first has holes through it
const field = (x, y, z) => 0.2 + drilled(x, y, z) + runaway(x, y, z);
// vertical holes every 50 m over the west half only, 5 m samples: the second high lies 100 m and more from any hole
const samples = [];
for (let x = 50; x <= 250; x += 50) for (let y = 100; y <= 300; y += 50) for (let d = 2.5; d < 200; d += 5) samples.push({ x, y, z: -d, value: +(0.2 + drilled(x, y, -d)).toFixed(3) });

test("#4106 the mean shell keeps the body its samples are in and drops the high no sample that rich is near", () => {
  const b = blocks(field);
  const [s] = gradeShells(b, { cutoffs: [5], samples });
  assert.equal(s.kind, "mean"); assert.equal(s.reachBlocks, SHELL_REACH_BLOCKS);
  assert.ok(s.body.closed && s.body.bodies === 1, `one closed body, got ${s.body.bodies}`);
  let xmax = -Infinity; for (let i = 0; i < s.body.positions.length; i += 3) xmax = Math.max(xmax, s.body.positions[i]);
  assert.ok(xmax < 300, `the shell reaches x ${xmax.toFixed(0)}: the undrilled high was kept`);
  assert.ok(s.farLeftOut >= 20, `${s.farLeftOut} blocks of the undrilled high left out`);
  // without samples to check (or with reach 0) both highs are shells, as before
  assert.equal(gradeShells(b, { cutoffs: [5] })[0].body.bodies, 2);
  const [both] = gradeShells(b, { cutoffs: [5], samples, reachBlocks: 0 });
  assert.equal(both.body.bodies, 2);
  // the drilled body itself is untouched: half the volume of the two, not closed against the reach, the same samples inside
  assert.ok(Math.abs(s.body.volumeM3 - both.body.volumeM3 / 2) < 1, `${s.body.volumeM3} vs ${both.body.volumeM3 / 2}`);
  assert.equal(s.body.closingShare, 0);
  assert.deepEqual(s.inside, both.inside); assert.ok(s.inside.share > 0.75, JSON.stringify(s.inside));
  // a reach of one block would cut into the drilled body (its boundary partly the reach's): two is the least that leaves it whole
  assert.ok(gradeShells(b, { cutoffs: [5], samples, reachBlocks: 1 })[0].body.closingShare > 0.3);
});

test("#4106 the P10 / P90 shells keep every block, and a cut-off no sample reaches gives no mean shell", () => {
  const b = blocks(field);
  const all = gradeShells(b, { cutoffs: [5], samples, bands: true });
  assert.equal(all.find((s) => s.kind === "p90").body.bodies, 2, "P90: what the grade could be, the undrilled high included");
  assert.equal(all.find((s) => s.kind === "p90").farLeftOut, 0);
  const [none] = gradeShells(b, { cutoffs: [12], samples }); // the blocks reach 12 nowhere, no sample either
  assert.equal(none.body.positions.length, 0);
  const lowSamples = samples.map((s) => ({ ...s, value: 0.2 })); // blocks over 5 but no sample over 5: nothing to anchor a shell
  const [unanchored] = gradeShells(b, { cutoffs: [5], samples: lowSamples });
  assert.equal(unanchored.body.positions.length, 0); assert.ok(unanchored.farLeftOut > 40);
});

test("#4106 the panel says how many blocks the reach left out, in every language, and records the reach with the shell", () => {
  const p = fs.readFileSync(new URL("../src/components/PredictivePanel.jsx", import.meta.url), "utf8");
  const key = "{k} blocks over {cutoff}{unit} left out: no such sample within 2 blocks";
  assert.ok(p.includes(`tr("${key}"`));
  assert.match(p, /reachBlocks: s\.reachBlocks, farBlocksLeftOut: s\.farLeftOut/);
  assert.equal(SHELL_REACH_BLOCKS, 2, "the message says 2 blocks");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const t = JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))[key];
    assert.ok(t && ["{k}", "{cutoff}", "{unit}"].every((ph) => t.includes(ph)), l);
  }
});
