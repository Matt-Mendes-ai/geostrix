// TASKS.csv #2929 (WA iron review) — the Level plan opened at defaultRl and moved to the busiest RL in an effect (two commits of a 6,036-point
// plan); its RL-dependent layers were thousands of keyed siblings placed one by one on each RL change. Now: the busiest RL is the initial
// state, and one build's layers sit in a group keyed by the build, replaced whole.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("opens on the busiest RL from the first render; no effect moves it after", () => {
  assert.match(s, /const \[rl, setRl\] = useState\(\(\) => \{ const r0 = Math\.round\(defaultRl\); try \{ const b = busiestRl\(build\(r0, 12\.5\)\.holes\); return b \?\? r0; \} catch \{ return r0; \} \}\);/);
  assert.ok(!/openedAt/.test(s), "the post-mount move is gone");
});

test("the RL-dependent layers are one group keyed per build; the drawn outline and the furniture stay outside it", () => {
  assert.match(s, /const dataKey = useMemo\(\(\) => \(buildSeq\.current \+= 1\), \[data\]\);/);
  const open = s.indexOf("<g key={`plan${dataKey}`}>"), close = s.indexOf("{/* the outline being drawn */}");
  assert.ok(open > 0 && close > open);
  const inside = s.slice(open, close);
  for (const part of ["data.voxelSlices.map", "data.holes.map((h) => <path key={`c", "data.points.map", "h.pierce.map", "idLabels.placed.map"]) assert.ok(inside.includes(part), part);
  assert.ok(/<\/g>\s*$/.test(inside.trimEnd()), "the group closes before the outline");
});
