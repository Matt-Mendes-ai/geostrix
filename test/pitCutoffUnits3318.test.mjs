// TASKS.csv #3318 (review Galore Creek, Mine Design) — a typed cut-off printed the break-even with the cut-off's own per cent ('The break-even
// at these inputs is 1290 ppm Cu (0.2 % Cu)'), and the Pit shell's cut-off box took ppm only where Stope outlines offers ppm Cu | % Cu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { oxideSuffix, cutoffUnits } from "../src/lib/pitShell.js";

test("#3318 each number has its own per cent; % Cu is converted to the model's ppm", () => {
  assert.equal(oxideSuffix(1290, "ppm", "Cu"), " (0.129 % Cu)");
  assert.equal(oxideSuffix(2000, "ppm", "Cu"), " (0.2 % Cu)");
  const u = cutoffUnits("ppm", "Cu");
  assert.deepEqual(u.map((x) => x.key), ["", "%"]);
  assert.equal(u.find((x) => x.key === "%").toModel(0.2), 2000);
  const s = readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /The break-even at these inputs is \{b\} \{unitB\}\."/);
  assert.match(s, /unitB: `\$\{unitWithElement\(unit, element\)\}\$\{oxideSuffix\(eco\.breakEven, unit, element\)\}`/);
  assert.match(s, /const typedCut = Number\(f\.typedCutoff\) > 0 \? \(cutUnit && !isProduct \? cutUnit\.toModel\(Number\(f\.typedCutoff\)\) : Number\(f\.typedCutoff\)\) : null;/);
  assert.match(s, /<select value=\{cutUnit\.key\} onChange=\{set\("cutIn"\)\}/);
});
