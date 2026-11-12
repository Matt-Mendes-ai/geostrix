// TASKS.csv #2278 (review #2174, WA gold) — Pit design's pre-run cell prediction pads as the run does: the ramp's width, the widest sector
// reach, the benches from crest to floor
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellFloors, benchedPit, predictDesignCell, designReaches } from "../src/lib/pitDesign.js";

// a 200 x 200 m shell floor 300 m under flat ground at 400 (lattice 10 m, 280 m across)
function deepShell() {
  const pos = [];
  for (let y = -140; y <= 140; y += 10) for (let x = -140; x <= 140; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 100 && Math.abs(y) <= 100 ? 100 : 400);
  return shellFloors(Float64Array.from(pos), () => 400);
}
const ramp = { azimuthDeg: 90, turn: "clockwise", gradientPct: 10, widthM: 25 };

test("designReaches: the ramp widens the widest reach; a flatter sector narrows the narrowest", () => {
  const base = designReaches({ benchH: 10, berm: 6, batterDeg: 65 });
  assert.ok(Math.abs(base.reach - (10 / Math.tan((65 * Math.PI) / 180) + 6)) < 1e-9);
  assert.equal(base.reachMax, base.reach);
  assert.ok(Math.abs(designReaches({ benchH: 10, berm: 6, batterDeg: 65, ramp }).reachMax - (base.reach + 25)) < 1e-9);
  assert.equal(designReaches({ benchH: 10, berm: 6, batterDeg: 65, ramp: { ...ramp, widthM: 0 } }).reachMax, base.reach); // a ramp with no width is no ramp
  const sec = designReaches({ benchH: 10, berm: 6, batterDeg: 65, sectors: { N: { berm: 2 } } });
  assert.ok(sec.reachMin < base.reach && sec.reachMax === base.reach);
});

test("with a ramp and a tight budget, the prediction coarsens as the run does (the reviewer's 'faces drawn' then none)", () => {
  const s = deepShell();
  const opts = { benchH: 10, berm: 6, batterDeg: 65, ramp, maxCells: 60000 };
  const run = benchedPit(s, { groundAt: () => 400, ...opts });
  const args = { boxW: 200, boxH: 200, depth: 300, /* the mined columns' box, as the run pads it */ shellCell: 10, benchH: 10, berm: 6, batterDeg: 65, maxCells: 60000 };
  const old = predictDesignCell(args); // as the pane asked before: no ramp
  const now = predictDesignCell({ ...args, ramp });
  assert.ok(run.coarsened && run.cell > old.cell + 1e-9, `run ${run.cell} vs the no-ramp prediction ${old.cell}`);
  assert.ok(Math.abs(now.cell - run.cell) < 1e-9, `prediction ${now.cell} = run ${run.cell}`);
  assert.equal(now.facesDrawn, run.faceRun >= run.cell);
});

test("the pane passes the ramp, the sectors and the shell's crest-to-floor height", () => {
  const p = readFileSync(new URL("../src/components/PitDesignPane.jsx", import.meta.url), "utf8");
  assert.match(p, /depth: Math\.max\(Number\(pit\.params\?\.maxDepthM\) \|\| 0, shellBox\?\.zRange \|\| 0\)/);
  assert.match(p, /sectors: sectorsIn, ramp: rampIn, (upper: upperIn \/\* #2730 \*\/, )?maxCells: MAX_DESIGN_CELLS/); // the upper benches too since #2730
});
