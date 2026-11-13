// TASKS.csv #3263 (review #3195, Galore Creek) — Closed body built an intrusive met by inclined holes as stacks of flat 80 x 80 x 4 m plates:
// flat cells were chosen for any unit logged in thin runs over a wide area, without asking whether the runs line up along a flat layer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runsLieFlat } from "../src/lib/pileTops.js";

const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
// a seam: 1.8 m runs in 60 holes, on a 0.5° plane undulating ±3 m (WA uranium's lignite: 0.1°, 4.6 m off its plane)
const seam = Array.from({ length: 60 }, (_, i) => ({ x: (i % 10) * 200, y: Math.floor(i / 10) * 200 })).flatMap((h) => [0, 0.9, 1.8].map((d) => ({ x: h.x, y: h.y, z: 300 + 0.01 * h.x + (rnd() - 0.5) * 6 - d })));
// steep intrusive sheets met by holes inclined 60°: runs at 15-500 m down hole, wherever the sheets are crossed
const sheets = Array.from({ length: 14 }, (_, i) => ({ x: (i % 4) * 160, y: Math.floor(i / 4) * 160 })).flatMap((h) => [40, 130, 260, 410].map((md) => ({ x: h.x + md * 0.5 + rnd() * 30, y: h.y, z: 750 - md * 0.87 - rnd() * 60 })));

test("#3263 flat cells only when the runs lie along a near-flat layer", () => {
  const a = runsLieFlat(seam, 1.8, "stratigraphic");
  assert.equal(a.flat, true, JSON.stringify(a));
  const b = runsLieFlat(sheets, 8, "stratigraphic");
  assert.equal(b.flat, false, JSON.stringify(b));
  assert.ok(b.misfit > 50);
  assert.equal(runsLieFlat(seam, 1.8, "intrusion").flat, false, "an intrusion role keeps cubic cells");
  assert.equal(runsLieFlat([], 2).flat, false);
});

test("#3263 wiring: the seam cells wait for runsLieFlat, and a refusal is said", () => {
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(src, /const lieFlat = seam0 \? runsLieFlat\(inside, autoB\.medianRunM, codeInfo\(modellingCodes, String\(target\)\.slice\(6\), mcodeDefaultRole\)\.role\) : null;/);
  assert.match(src, /const seam = seam0 && lieFlat\.flat \? seam0 : null;/);
  assert.match(src, /but they do not line up along a flat layer between the holes/);
});
