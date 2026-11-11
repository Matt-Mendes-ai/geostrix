// TASKS.csv #2284 — the mine's drill levels from the collar RLs, offered to Stope outlines on an underground-drilled project
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { drillLevels } from "../src/lib/stopeGround.js";

test("the review's 14 RL clusters: levels found, a median spacing near 18 m, the lowest first", () => {
  const c = [];
  for (const [z, n] of [[83.9, 5], [108.4, 3], [111.9, 4], [116.1, 6], [133.6, 3], [144.4, 8], [162.4, 5], [175.9, 4], [192.4, 3], [198.7, 3], [228.7, 32], [248.6, 10], [270.6, 7], [351.3, 3]]) for (let i = 0; i < n; i++) c.push({ z: z + (i % 3) * 0.5 });
  const r = drillLevels(c);
  assert.ok(r.levels.length >= 12, String(r.levels.length));
  assert.ok(Math.abs(r.from - 84.3) < 0.5);
  assert.ok(r.spacing > 15 && r.spacing < 21, String(r.spacing));
  assert.equal(drillLevels([{ z: 100 }, { z: 150 }, { z: 200 }]), null); // too few
  assert.equal(drillLevels([1, 2, 3, 4, 5, 6, 7].map((z) => ({ z: 300 + z * 0.4 }))), null); // one level only
});

test("the pane offers it only when the collars look underground", () => {
  const p = fs.readFileSync("src/components/StopesPane.jsx", "utf8");
  assert.match(p, /const levels = useMemo\(\(\) => \(ground\.underground \? drillLevels\(collars\) : null\)/);
  assert.match(p, /zMin: String\(Math\.round\(levels\.from\)\), levelH: String\(Math\.round\(levels\.spacing\)\)/);
});
