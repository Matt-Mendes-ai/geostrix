// TASKS.csv #2286 — Pit design says which bench it is on; Nested pits already says which shell
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shellFloors, benchedPit } from "../src/lib/pitDesign.js";

test("benchedPit calls onBench once per bench tried, with an estimate of the count", () => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1000);
  const shell = shellFloors(Float64Array.from(pos), () => 1000);
  const seen = [];
  const d = benchedPit(shell, { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60, onBench: (k, n) => seen.push([k, n]) });
  assert.equal(d.benches.length, 6);
  assert.ok(seen.length >= 6 && seen[0][0] === 1 && seen.every(([, n]) => n === 6), JSON.stringify(seen));
});

test("the worker posts it and the pane shows it; the series already counts its shells", () => {
  assert.match(fs.readFileSync("src/lib/pitDesign.worker.js", "utf8"), /onBench: \(k, n\) =>/);
  assert.ok(fs.readFileSync("src/components/PitDesignPane.jsx", "utf8").includes('tr("Designing bench {k} of about {n}: cancel"'));
  assert.ok(fs.readFileSync("src/components/NestedPitsPane.jsx", "utf8").includes('tr("Solving shell {i} of {n}: cancel"'));
});
