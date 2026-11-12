// TASKS.csv #2730 — Pit design: upper benches above an RL with their own face angle and berm, as the shell's upper slope (#2439)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { benchedPit, shellFloors, designReaches, upperOk } from "../src/lib/pitDesign.js";

const shell = () => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1000);
  return shellFloors(Float64Array.from(pos), () => 1000);
};
const base = { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 70 };
const crestX = (d, rl) => { const s = d.strings.find((x) => x.kind === "crest" && x.rl === rl); return s ? Math.max(...s.lines.flat().map((p) => p[0] - 500000)) : NaN; };

test("above 980 the faces at 40° with 8 m berms: the upper crests step out, the benches below are unchanged", () => {
  const plain = benchedPit(shell(), base), up = benchedPit(shell(), { ...base, upper: { rl: 980, batterDeg: 40, berm: 8 } });
  assert.deepEqual(up.upperUsed, { rl: 980, batterDeg: 40, berm: 8 });
  assert.equal(plain.upperUsed, null);
  // below 980 the walls are where they were
  assert.ok(Math.abs(crestX(up, 970) - crestX(plain, 970)) < 2 * up.cell, `${crestX(up, 970)} vs ${crestX(plain, 970)}`);
  // the two upper benches (faces from 980 and 990) are wider: each face run 10 / tan 40 + 8 m instead of 10 / tan 70 + 5 m
  const extra = 2 * ((10 / Math.tan((40 * Math.PI) / 180) + 8) - (10 / Math.tan((70 * Math.PI) / 180) + 5));
  assert.ok(crestX(up, 1000) - crestX(plain, 1000) > extra - 3 * up.cell, `${crestX(up, 1000) - crestX(plain, 1000)} vs ~${extra.toFixed(1)}`);
  assert.ok(up.totals.rockT > plain.totals.rockT);
});

test("upperOk and the reach that pads the grid", () => {
  assert.ok(upperOk({ rl: 980, batterDeg: 40, berm: 0 }));
  assert.ok(!upperOk({ rl: 980, batterDeg: 95, berm: 5 }) && !upperOk({ rl: "x", batterDeg: 40, berm: 5 }) && !upperOk(null) && !upperOk({ rl: 980, batterDeg: 40, berm: -1 }));
  const a = designReaches({ benchH: 10, berm: 5, batterDeg: 70 }), b = designReaches({ benchH: 10, berm: 5, batterDeg: 70, upper: { rl: 980, batterDeg: 40, berm: 8 } });
  assert.ok(b.reachMax > a.reachMax);
});

test("the pane: three fields (all or none), passed to the run and the prediction", () => {
  const p = fs.readFileSync("src/components/PitDesignPane.jsx", "utf8");
  assert.match(p, /\.\.\.\(upperIn \? \{ upper: upperIn \} : \{\}\)/);
  assert.match(p, /ramp: rampIn, upper: upperIn \/\* #2730 \*\//);
  assert.match(p, /sectorBad \|\| rampBad \|\| upperBad;/);
});
