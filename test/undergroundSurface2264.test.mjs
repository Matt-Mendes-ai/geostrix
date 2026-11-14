// TASKS.csv #2264 / #2265 (review #2174, WA gold) — on a project drilled from underground: surface samples with no elevation are not drawn
// 200 m down at the median collar, and 'Subcrop from collars' says its points are drill positions, not a subcrop map
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarsLookUnderground } from "../src/lib/pitShell.js";
import { roleForLithology } from "../src/lib/layers.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#2264 the flat elevation: the highest collar when the collars look underground", () => {
  const v = read("src/modules/viewer/useSurfacePlacement.js"); // moved out of ViewerModule: #2485
  assert.match(v, /const underground = useMemo\(\(\) => collars\.length > 1 && collarsLookUnderground\(collars, survey\)\.underground, \[collars, survey\]\);/); // #3368: shared with the collar ground
  assert.match(v, /surfaceFlatElevation\(collars, surfaceSamples, underground\)/);
  assert.match(read("src/lib/viewer/surfacePlacement.js"), /const top = collars\.length > 1 && underground \? Math\.max\(\.\.\.collars\.map\(\(c\) => c\.z\)\.filter\(Number\.isFinite\)\) : null;/);
  // 12 upholes among 20 collars: underground
  const collars = Array.from({ length: 20 }, (_, i) => ({ hole_id: `U${i}`, x: i * 5, y: 0, z: 100 + i * 10 }));
  const survey = collars.slice(0, 12).map((c) => ({ hole_id: c.hole_id, depth: 0, azimuth: 0, dip: -30 }));
  assert.equal(collarsLookUnderground(collars, survey).underground, true);
  assert.match(read("src/modules/GeochemModule.jsx"), /with no terrain the 3D view draws them flat/);
});

test("#2265 Subcrop from collars asks on an underground project and is named for what it is; Unknown is cover", () => {
  const s = read("src/components/SurfaceMappingPanel.jsx");
  assert.match(s, /if \(ug\.underground && !window\.confirm\(tr\("The collars look underground/);
  assert.match(s, /const base = (depth != null \? tr\("Units \{d\} m down the holes", \{ d: depth \}\) \/\* #3378[^*]*\*\/ : )?ug\.underground \? tr\("Units at the collars"\) : tr\("Subcrop from collars"\);/);
  assert.equal(roleForLithology("Unknown"), "no recovery");
});
