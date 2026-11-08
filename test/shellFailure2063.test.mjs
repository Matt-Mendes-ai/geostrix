// TASKS.csv #2063 (review #2013, Woodjam) — an empty grade shell says how many composites passed the cutoff, how many cells were
// estimated and the highest, and points at Min holes when it is above 1; a smaller cell is not suggested when the budget chose it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the failure carries the facts and the advice that fits the run", () => {
  const at = r.indexOf("if (!mc.faces.length) {\n          let hi = -Infinity;");
  assert.ok(at > 0);
  const block = r.slice(at, r.indexOf("        }\n", at));
  assert.match(block, /\{above\} composite\(s\) are at or above the cutoff; \{e\} grid cell\(s\) were estimated, the highest at \{hi\} \{unit\}\./);
  // above-cutoff cells with nothing to close against (the live run: 36 cells, the highest 8,330 ppm, 'never crosses' was wrong)
  assert.match(block, /const isolated = hi >= numericCutoff && !numericCloseShell;/);
  assert.match(block, /isolated \? tr\("No \{symbol\} shell at \{numericCutoff\} \{unit\}: the grid has no surface to extract\."/);
  assert.match(block, /: mh > 1\n\s+\? tr\("With Min holes \{k\}/);
  assert.match(block, /cellRefit \? tr\("Try a lower cutoff or a larger search radius\."\)/);
  assert.match(r, /cs = fit; blocksNeeded = gridBlockCount\(bounds, cs\); cellRefit = true;/);
});
