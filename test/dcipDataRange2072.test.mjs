// TASKS.csv #2072 (review #2013, Woodjam) — a 2D DC/IP model checked against its own data range, and the observed voxel's colours
// taken from the cells the data see themselves.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { outsideDataRange } from "../src/lib/inversion.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("cells far outside the apparent-resistivity range are counted, among the shown cells only", () => {
  const data = [16, 40, 98, 132, 224];
  const model = [0.017, 0.018, 20, 100, 300, 1385, 8800];
  const shown = [true, true, true, true, true, true, false]; // the 8,800 ohm·m bottom cell is below the depth of investigation
  const r = outsideDataRange(model, data, shown);
  assert.deepEqual(r, { n: 6, below: 2, above: 1, lo: 0.017, hi: 1385, dataMin: 16, dataMax: 224, factor: 3 }); // 16/3 = 5.3 and 224*3 = 672
  assert.equal(outsideDataRange(model, data).above, 2, "without a mask every cell counts");
  assert.equal(outsideDataRange([20, 100], data).below + outsideDataRange([20, 100], data).above, 0);
  assert.equal(outsideDataRange(model, []), null);
  assert.equal(outsideDataRange(model, [0, -1, NaN]), null, "no usable apparent resistivity");
  assert.equal(outsideDataRange([], data), null);
});

test("the result panel warns under the verdict; the observed voxel's range comes from its own-support cells and records the check", () => {
  const p = read("src/components/DcipPanel.jsx");
  assert.match(p, /const rangeCheck = useMemo\(\(\) => \(c\.resistivity \? outsideDataRange\(c\.resistivity, last\.obs\?\.rho, env\.map\(\(v\) => v >= cutoff\)\) : null\)/);
  assert.match(p, /\{!imported && outside > 0 && <div role="alert"/);
  assert.match(p, /const own = cut > 0 && result\.cells\.support \? result\.cells\.support\.map\(\(v\) => v >= cut\) : null;/);
  assert.match(p, /cells\.filter\(\(_, i\) => \(own \|\| seen\)\[i\]\)/);
  assert.match(p, /outsideDataRange: `\$\{rangeCheck\.below \+ rangeCheck\.above\} of \$\{rangeCheck\.n\} cells within the depth of investigation/);
  assert.equal((p.match(/dataRho: (parsed\.rho|last\.obs\?\.rho)/g) || []).length, 2, "both ways of adding the voxel pass the data");
});
