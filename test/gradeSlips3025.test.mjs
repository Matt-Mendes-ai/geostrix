// TASKS.csv #3025 (WA iron review) — small slips in the grade tools: (1) no advice to set a Vertical reach that is set; (6) the Grade
// shell's proposed cutoff said as the 90th percentile; (9) kriged vs kept blocks explained
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("(1) and (9) in the Estimation dialog", () => {
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /: Number\(flatReach\) > 0 \? tr\("\{pct\}% of the estimated metal \(\{k\} of \{n\} blocks\) lies below the deepest sample of every hole within \{r\} m: carried down past the drilling, within the \{h\} m Vertical reach\."/);
  assert.match(e, /result\.okCounts\.kriged > result\.blocksEstimated \? ` \$\{tr\("Kriged before \{n\} block\(s\) were removed/);
});

test("(6) the Grade shell's proposed cutoff", () => {
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(m, /setShellCutoffAuto\(\{ symbol: next, value: p90, n: v\.length, onOpen \}\)/); // onOpen: #3272
  assert.match(m, /shellCutoffAuto && shellCutoffAuto\.symbol === sym && numericCutoff === shellCutoffAuto\.value && /);
});
