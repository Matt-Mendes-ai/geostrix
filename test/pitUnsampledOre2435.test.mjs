// TASKS.csv #2435 — the pit counts the ore resting on blocks the estimate flagged above or below every sample informing them (#2417)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell } from "../src/lib/pitShell.js";

const econ = { unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45 };
// a 120 x 120 x 100 m body from the ground (RL 1000) down; its top `flagged` levels carry beyond = "above"
const body = (flagged, how = "above") => {
  const cells = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 10; k++) cells.push({ x: 500 + i * 10, y: 500 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: 1.5, ...(k < flagged ? { beyond: how } : {}) });
  return cells;
};

test("the share of the ore in blocks beyond the samples: none, a top slice, below too", () => {
  const ground = () => 1000;
  const none = runPitShell({ ...econ, cells: body(0) }, { groundAt: ground });
  assert.equal(none.oreBeyondSampleShare, 0);
  const top3 = runPitShell({ ...econ, cells: body(3) }, { groundAt: ground });
  // the pit takes the whole body but some deep corners: three of ten levels, a little more as the corners left are deep
  assert.ok(top3.oreBeyondSampleShare >= 0.3 - 1e-6 && top3.oreBeyondSampleShare < 0.32, String(top3.oreBeyondSampleShare));
  assert.equal(top3.oreT, none.oreT); // the flag changes nothing in the solve: only what the pane says
  assert.equal(top3.money, none.money);
  const below = runPitShell({ ...econ, cells: body(2, "below") }, { groundAt: ground });
  assert.ok(below.oreBeyondSampleShare > 0.19 && below.oreBeyondSampleShare < 0.22, String(below.oreBeyondSampleShare));
});

test("the flag rides to the pit and nested-pit workers, and the pane warns past a fifth of the ore", () => {
  for (const f of ["src/lib/pitShellClient.js", "src/lib/pitSeriesClient.js"]) assert.match(fs.readFileSync(f, "utf8"), /columns\.beyond\[i\] = c\.beyond === "above" \? 1 : c\.beyond === "below" \? 2 : 0/, f);
  for (const f of ["src/lib/pitShell.worker.js", "src/lib/pitSeries.worker.js"]) assert.match(fs.readFileSync(f, "utf8"), /beyond: c\.beyond\?\.\[i\] === 1 \? "above"/, f);
  const pane = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(pane, /unsampledOre = beyondP > 0\.2/);
  assert.match(pane, /line\(tr\("Strip ratio"\), [^\n]*, unsampledOre\)/);
  assert.match(pane, /line\(tr\("Undiscounted margin"\), [^\n]*, unsampledOre\)/);
  assert.match(pane, /oreBeyondSampleShare: \+\(r\.oreBeyondSampleShare \|\| 0\)\.toFixed\(3\)/);
});
