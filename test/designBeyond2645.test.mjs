// TASKS.csv #2645 — Pit design and Nested pits say the share of their ore beyond every sample informing it, as Pit shell does (#2435)
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
// ore (grade 2) in the bottom 25 m under barren model blocks; the upper of the two ore levels flagged "above" every sample
const cells = (flag) => {
  const out = [];
  for (let x = -65; x <= 65; x += 10) for (let y = -65; y <= 65; y += 10) for (let z = 945; z < 1000; z += 10) out.push({ x: 500000 + x, y: 5000000 + y, z, dx: 10, dy: 10, dz: 10, value: z < 970 ? 2 : 0, ...(flag && z === 965 ? { beyond: "above" } : {}) });
  return out;
};

test("benchedPit: the share of the design's ore in flagged blocks; 0 with no flag; the tonnes unchanged", () => {
  const opts = { groundAt: () => 1000, cutoff: 1, benchH: 10, berm: 5, batterDeg: 60, density: 2.7 };
  const plain = benchedPit(shell(), { ...opts, cells: cells(false) }), flagged = benchedPit(shell(), { ...opts, cells: cells(true) });
  assert.equal(plain.totals.oreBeyondSampleShare, 0);
  assert.ok(Math.abs(flagged.totals.oreT - plain.totals.oreT) < 1e-6);
  const p = flagged.totals.oreBeyondSampleShare;
  assert.ok(p > 0.3 && p < 0.7, String(p)); // one of the two ore levels inside the design (965 and 955; 945 is under the floor)
  assert.ok(!("beyondV" in flagged.benches[0]));
});

test("the series' runs carry the share, and the client / worker pass the flag", () => {
  const body = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 8; k++) body.push({ x: 500 + i * 10, y: 500 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: 1.5, ...(k < 4 ? { beyond: "above" } : {}) });
  const r = runPitSeries({ unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45, cells: body }, [0.6, 1], { groundAt: () => 1000 });
  const largest = [...r.runs].reverse().find((x) => x.oreT > 0);
  assert.ok(largest && largest.oreBeyondSampleShare > 0.3, JSON.stringify(largest && largest.oreBeyondSampleShare));
  assert.match(fs.readFileSync("src/lib/pitDesignClient.js", "utf8"), /columns\.beyond\[i\] = c\.beyond === "above" \? 1 : c\.beyond === "below" \? 2 : 0/);
  assert.match(fs.readFileSync("src/lib/pitDesign.worker.js", "utf8"), /\.\.\.\(c\.beyond\?\.\[i\] \? \{ beyond: c\.beyond\[i\] === 1 \? "above" : "below" \} : \{\}\)/);
  for (const f of ["NestedPitsPane", "PitDesignPane"]) {
    const p = fs.readFileSync(`src/components/${f}.jsx`, "utf8");
    assert.match(p, /model\?\.params\?\.beyondFlagged \|\| model\?\.cells\?\.some\(\(c\) => c\.beyond\)/, f);
    assert.match(p, /so the strip ratio rests on it\./, f);
  }
  assert.match(fs.readFileSync("src/components/NestedPitsPane.jsx", "utf8"), /tr\("Largest pit \(revenue factor \{rf\}\): \{text\}"/);
});
