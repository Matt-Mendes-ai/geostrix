// TASKS.csv #2673 — a boundary part's name on hover and as an optional label; #2659 — a per-hole table said, and a Depth_of_* not the hole length
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { perHoleJoinOf } from "../src/lib/perHoleJoin.js";
import { guessMapping } from "../src/lib/layers.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("#2673 each boundary line carries its part's name; labels on request; hover within ~4 px", () => {
  const sb = read("../src/lib/viewer/sceneBuilders.js");
  assert.match(sb, /line\.userData = \{ boundaryTip: part && part !== b\.name \? `\$\{b\.name\} — \$\{part\}` : b\.name \};/);
  assert.match(sb, /if \(b\.partLabels && b\.partNames\?\.some\(Boolean\) && !isContours\)/);
  assert.match(sb, /labels\.userData = \{ contourLabels: true \}; \/\/ sprites: disposed and left out of the pick targets/);
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /raycasterRef\.current\.params\.Line\.threshold = Math\.max\(0\.5, 4 \* \(metresPerPixel\(camera, camState\.current\?\.radius, mount\.clientHeight\) \|\| 1\)\);/);
  assert.match(v, /else if \(hoverHits\[0\]\?\.object\.userData\?\.boundaryTip && hoverHits\[0\]\.object\.visible !== false && hoverHits\[0\]\.object\.parent\?\.visible !== false\)/);
  assert.match(read("../src/modules/GeophysicsModule.jsx"), /updateBoundary\(b\.id, \{ partLabels: e\.target\.checked \}\)/);
});

test("#2659 a table of existing collars at their own positions is a per-hole join", () => {
  const collars = [{ hole_id: "A1", x: 500000, y: 6000000 }, { hole_id: "A2", x: 500100, y: 6000000 }];
  const rows = [{ Hole_id: "A1", E: 500000.4, N: 6000000, Best: 1.2, Depth_of_best_m: 40 }, { Hole_id: "A2", E: 500100, N: 5999999.5, Best: 0.8, Depth_of_best_m: 12 }];
  const map = { hole_id: "Hole_id", x: "E", y: "N" };
  assert.deepEqual(perHoleJoinOf(rows, map, collars), { n: 2, columns: ["Best", "Depth_of_best_m"] });
  assert.equal(perHoleJoinOf([...rows, { Hole_id: "B9", E: 1, N: 2 }], map, collars), null); // a new hole: a collar import
  assert.equal(perHoleJoinOf([{ ...rows[0], E: 500050 }], map, collars), null); // moved: not the same collar
  assert.equal(perHoleJoinOf(rows, map, []), null);
  assert.match(read("../src/components/ImportMappingModal.jsx"), /\{perHole && \( \/\* TASKS\.csv #2659 \*\//);
});

test("#2659 a depth OF something is not the hole length; a hole's own depth still is", () => {
  assert.equal(guessMapping("collars", ["Hole_id", "MGA_E", "MGA_N", "RL", "Best_Li2O_pct", "Depth_of_best_m"]).length, "");
  assert.equal(guessMapping("collars", ["HOLEID", "X", "Y", "Z", "EOH", "Depth_to_basement"]).length, "EOH");
  assert.equal(guessMapping("collars", ["HOLE", "X", "Y", "Z", "Depth"]).length, "Depth");
  assert.equal(guessMapping("collars", ["HOLE", "X", "Y", "Z", "Top_Depth", "Max_Depth"]).length, "Max_Depth");
});
