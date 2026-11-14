// TASKS.csv #3352 (Galore Creek review) — grid convergence was printed with the opposite of the usual sign: '+2.06' west of the central meridian,
// where the convention gives -2.06 (grid north 2.06 degrees west of true north)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trueNorthBearingInGridDeg } from "../src/lib/gridConvergence.js";

test("west of the central meridian true north is east of grid north (a positive bearing), so the usual convergence is negative", () => {
  const b = trueNorthBearingInGridDeg(350000, 6333000, 26909); // zone 9: central meridian 129 W; this is about 131.5 W
  assert.ok(b > 1.5 && b < 3, `${b}`);
  const east = trueNorthBearingInGridDeg(750000, 6333000, 26909); // east of it
  assert.ok(east < 0);
});

test("the pane prints the usual signed convergence with grid north as the subject, and the arrow says it is grid north", () => {
  const c = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(c, /tr\("· grid convergence here \{v\}\{convergence\}° \(grid north is \{v2\}° \{v3\} of true north\)", \{ v: -convergence >= 0 \? "\+" : "-"/);
  const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /title=\{tr\("Grid north: the plan is drawn on the project's grid/);
});
