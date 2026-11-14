// TASKS.csv #3316 (review Galore Creek; a regression of #2278) — Pit design's line said 'the 5.5 m faces are drawn', the run then said they
// were not: on rising ground the run counts benches from the highest ground over the shell's lattice, the line from the mesh's crest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { designDepth, predictDesignCell } from "../src/lib/pitDesign.js";

// a shell on a 10 m lattice: a 50 x 50 m floor at 960 under ground rising from 1,000 (west) to 1,060 (east); the mesh's crest follows the
// ground only where it was solved, 1,000 at the rim
const pos = [];
for (let y = -60; y <= 60; y += 10) for (let x = -60; x <= 60; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 25 && Math.abs(y) <= 25 ? 960 : 1000);
const rising = (x) => 1000 + ((x - 499940) / 120) * 60;

test("#3316 the design depth is from the highest ground over the shell to its floor, as the run counts benches", () => {
  const p = Float64Array.from(pos);
  assert.equal(designDepth(p, () => 1000), 40, "flat ground: the crest-to-floor range, as #2278");
  assert.equal(designDepth(p, rising), 100, "rising ground: 1,060 - 960");
  assert.equal(designDepth(p, null), 40, "no ground: the shell's own top");
  const a = predictDesignCell({ boxW: 120, boxH: 120, depth: 40, shellCell: 10, benchH: 10, berm: 5, batterDeg: 60, maxCells: 4000 });
  const b = predictDesignCell({ boxW: 120, boxH: 120, depth: 100, shellCell: 10, benchH: 10, berm: 5, batterDeg: 60, maxCells: 4000 });
  assert.ok(b.cell >= a.cell, "more benches pad more: the cell can only grow");
  const s = readFileSync(new URL("../src/components/PitDesignPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const dd = designDepth\(p, groundAt\);/);
  assert.match(s, /zRange: Math\.max\(z1 - z0, dd \|\| 0\)/);
});
