// TASKS.csv #2929 (WA iron review) — the Level plan opened at defaultRl and moved to the busiest RL in an effect (two commits of a 6,036-point
// plan); its RL-dependent layers were thousands of keyed siblings placed one by one on each RL change. Now: the busiest RL is the initial
// state, and one build's layers sit in a group keyed by the build, replaced whole.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("opens on the busiest RL from the first render; no effect moves it after", () => {
  assert.match(s, /try \{ b = busiestRl\(build\(r0, 12\.5\)\.holes\) \?\? r0; \} catch \{ \/\* r0 \*\/ \} setRl\(b\); setApplied\(\{ rl: b, half: 12\.5 \}\); setReady\(true\);/); // #3064 — after the first paint, the first render an empty plan
  assert.ok(!/openedAt/.test(s), "the post-mount move is gone");
});

test("the RL-dependent layers are one group keyed per build; the drawn outline and the furniture stay outside it", () => {
  assert.match(s, /const dataKey = useMemo\(\(\) => \(buildSeq\.current \+= 1\), \[data\]\);/);
  const open = s.indexOf("<g key={`plan${dataKey}`}>"), close = s.indexOf("{/* the outline being drawn */}");
  assert.ok(open > 0 && close > open);
  const inside = s.slice(open, close);
  for (const part of ["data.voxelSlices.map", "dw.ctx", "dw.ivPaths.map", "data.points.map", "dw.pierce.map", /* #2982 — merged paths */ "idLabels.placed.map"]) assert.ok(inside.includes(part), part);
  assert.ok(/<\/g>\s*$/.test(inside.trimEnd()), "the group closes before the outline");
});
