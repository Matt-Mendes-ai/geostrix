// TASKS.csv #3002 (review #2876, WA iron) — Pit design's busy button named the benches for 4-6 s of a 30-60 s run: the grid before bench 1 and
// the mesh and tonnes after the last were a bare 'Designing'; and a design with upper benches (#2730) named neither them nor their inter-ramp.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shellFloors, benchedPit } from "../src/lib/pitDesign.js";

test("#3002 the design reports its phases: the grid first, the benches, then the mesh", () => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1003);
  const shell = shellFloors(Float64Array.from(pos), () => 1003);
  const seen = [];
  benchedPit(shell, { groundAt: () => 1003, benchH: 10, berm: 5, batterDeg: 60, onPhase: (s) => seen.push(s), onBench: (k) => seen.push(`b${k}`) });
  assert.equal(seen[0], "grid");
  assert.ok(seen.includes("b1"));
  assert.equal(seen[seen.length - 1], "mesh");
  assert.ok(seen.indexOf("mesh") > seen.lastIndexOf("b1"));
});

test("#3002 the busy button names the phases; the design names its upper benches and gives their inter-ramp", () => {
  const p = fs.readFileSync(new URL("../src/components/PitDesignPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('busy && busy.stage === "grid" ? tr("Building the design grid: cancel")'));
  assert.ok(p.includes('busy.stage === "mesh" ? tr("Meshing the design and counting its tonnes: cancel")'));
  assert.ok(p.includes("(p) => setBusy(p && (p.k || p.stage) ? p : true)"));
  assert.ok(p.includes('upperIn ? tr(", above {rl} m {b} m berms at {a}°"'));
  assert.ok(p.includes('line(tr("Inter-ramp angle above {rl} m"'));
  const w = fs.readFileSync(new URL("../src/lib/pitDesign.worker.js", import.meta.url), "utf8");
  assert.ok(w.includes("onPhase: (stage) => self.postMessage({ phases: { stage } })"));
  // the upper inter-ramp formula: 10 m benches, 6 m berms at 65 deg -> 43.2 deg (the review's hand figure for the lower benches' same inputs)
  const m = /const upperInterRamp = \(inp\) => (.+);\r?\n/.exec(p); // CRLF checkouts too
  const f = new Function("inp", `return ${m[1]};`);
  assert.equal(f({ benchH: 10, upper: { batterDeg: 65, berm: 6 } }).toFixed(1), "43.2");
});
