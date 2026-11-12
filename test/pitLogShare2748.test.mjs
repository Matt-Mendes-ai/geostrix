// TASKS.csv #2748 (split from #2721) — the Pit shell result gives the share of its metal that came from a picked log's readings (the
// estimate's unsampled metres filled from a log, cell.fromLog), as it gives the near-unsampled share (#2596) and Grade-tonnage its column.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell } from "../src/lib/pitShell.js";

test("the pit's metal share from the log, the solve unchanged", () => {
  const econ = { unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45 };
  const body = (half) => {
    const cells = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 10; k++) cells.push({ x: 500 + i * 10, y: 500 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: 1.5, ...(half ? { fromLog: 0.5 } : {}) });
    return cells;
  };
  const ground = () => 1000;
  const none = runPitShell({ ...econ, cells: body(false) }, { groundAt: ground });
  assert.equal(none.oreFromLogMetalShare, 0);
  const half = runPitShell({ ...econ, cells: body(true) }, { groundAt: ground });
  assert.ok(Math.abs(half.oreFromLogMetalShare - 0.5) < 1e-6, String(half.oreFromLogMetalShare));
  assert.equal(half.oreT, none.oreT); assert.equal(half.money, none.money);
});

test("the column rides to the workers, and the pane says it when the estimate filled from a log", () => {
  for (const f of ["src/lib/pitShellClient.js", "src/lib/pitSeriesClient.js"]) assert.match(fs.readFileSync(f, "utf8"), /columns\.fromLog\[i\] = c\.fromLog > 0 \? c\.fromLog : 0;/, f);
  for (const f of ["src/lib/pitShell.worker.js", "src/lib/pitSeries.worker.js"]) assert.match(fs.readFileSync(f, "utf8"), /fromLog: c\.fromLog\?\.\[i\] \|\| 0 \/\* #2748 \*\//, f);
  const pane = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(pane, /const logFilled = Number\(model\.params\?\.unsampledLogFilledM\) > 0 \?/);
  assert.match(pane, /res\.logFilled && logP > 0 && <div style=\{logP > 0\.2 \? warn : note\}>/);
  assert.match(pane, /\.\.\.\(logFilled \? \{ oreFromLogMetalShare: \+\(r\.oreFromLogMetalShare \|\| 0\)\.toFixed\(3\) \} : \{\}\)/);
});
