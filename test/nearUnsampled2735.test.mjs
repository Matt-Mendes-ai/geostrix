// TASKS.csv #2735 — Pit design and Nested pits say the share of their ore in blocks whose nearest drilling was never sampled, as Pit shell does (#2596)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { benchedPit, shellFloors } from "../src/lib/pitDesign.js";
import { runPitSeries } from "../src/lib/pitShell.js";

const shell = () => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1000);
  return shellFloors(Float64Array.from(pos), () => 1000);
};
const cells = (flag) => {
  const out = [];
  for (let x = -65; x <= 65; x += 10) for (let y = -65; y <= 65; y += 10) for (let z = 945; z < 1000; z += 10) out.push({ x: 500000 + x, y: 5000000 + y, z, dx: 10, dy: 10, dz: 10, value: z < 970 ? 2 : 0, ...(flag && z === 965 ? { nearUnsampled: true } : {}) });
  return out;
};

test("benchedPit: the share of the design's ore in flagged blocks; 0 without the flag; the tonnes unchanged", () => {
  const opts = { groundAt: () => 1000, cutoff: 1, benchH: 10, berm: 5, batterDeg: 60, density: 2.7 };
  const plain = benchedPit(shell(), { ...opts, cells: cells(false) }), flagged = benchedPit(shell(), { ...opts, cells: cells(true) });
  assert.equal(plain.totals.oreNearUnsampledShare, 0);
  assert.ok(Math.abs(flagged.totals.oreT - plain.totals.oreT) < 1e-6);
  const p = flagged.totals.oreNearUnsampledShare;
  assert.ok(p > 0.3 && p < 0.7, String(p));
  assert.ok(!("nearUnsV" in flagged.benches[0]));
});

test("the series' runs carry it; the client / worker pass the flag; both panes print the Pit shell's own sentences", () => {
  const body = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 8; k++) body.push({ x: 500 + i * 10, y: 500 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: 1.5, ...(k < 4 ? { nearUnsampled: true } : {}) });
  const r = runPitSeries({ unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45, cells: body }, [0.6, 1], { groundAt: () => 1000 });
  const largest = [...r.runs].reverse().find((x) => x.oreT > 0);
  assert.ok(largest.oreNearUnsampledShare > 0.3, String(largest.oreNearUnsampledShare));
  assert.match(fs.readFileSync("src/lib/pitDesignClient.js", "utf8"), /if \(c\.nearUnsampled\) columns\.nearUnsampled\[i\] = 1;/);
  assert.match(fs.readFileSync("src/lib/pitDesign.worker.js", "utf8"), /\.\.\.\(c\.nearUnsampled\?\.\[i\] \? \{ nearUnsampled: true \} : \{\}\)/);
  const shellPane = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  const key = /tr\("(\{p\} % of the ore is in blocks whose nearest drilling was never sampled[^"]*)"/.exec(shellPane)[1];
  for (const f of ["PitDesignPane", "NestedPitsPane"]) {
    const s = fs.readFileSync(`src/components/${f}.jsx`, "utf8");
    assert.ok(s.includes(`tr("${key}"`), f); // the same key: no new translation
    assert.match(s, /model\?\.params\?\.nearUnsampledFlagged \|\| model\?\.cells\?\.some\(\(c\) => c\.nearUnsampled\)/, f);
  }
});
