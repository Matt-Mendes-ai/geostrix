// TASKS.csv #3599 (reopened, round 3) — the key draws and names the two grey trace styles (never assayed: dashed; assayed, nothing at the cut-off: solid),
// and a collar symbol keeps a printable radius unless the holes are under 1.5 px apart.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dp = readFileSync(new URL("../src/lib/drillPlan.js", import.meta.url), "utf8");
const el = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");

test("the two no-value key lines carry their trace style", () => {
  assert.match(dp, /label: `assayed, no \$\{key\} intercept at the cut-off`, \.\.\.dot\(NONE_COLOUR, 0\.6, true\), trace: "solid"/);
  assert.match(dp, /label: `no \$\{key\} assays`, \.\.\.dot\(NONE_COLOUR, 0\.8, true\), cross: true, trace: "dashed"/);
  assert.match(dp, /`no \$\{key\} result`, \.\.\.dot\(NONE_COLOUR, 0\.6, true\), trace: "solid"/);
});

test("the key draws the trace sample beside the ring, in the plan's own greys and dashes", () => {
  assert.match(el, /k\.trace && <line [^>]*stroke=\{k\.trace === "dashed" \? "#8a8f98" : "#5f6670"\}[^>]*strokeDasharray=\{k\.trace === "dashed" \? `\$\{3 \* line\} \$\{2 \* line\}` : undefined\}/);
  assert.match(el, /const traceInk = \(s\) => \(s\.cross \? "#8a8f98" : s\.hollow \? "#5f6670" : s\.colour\);/, "the same greys as the traces");
});

test("a collar symbol has a printable floor, off only where the holes are under 1.5 px apart", () => {
  assert.match(el, /cap: gap > 0 \? Math\.max\(0\.75, 0\.4 \* gap, gap >= 1\.5 \? 0\.5 \* MM : 0\) : Infinity/);
  const MM = 96 / 25.4, cap = (gap) => Math.max(0.75, 0.4 * gap, gap >= 1.5 ? 0.5 * MM : 0);
  assert.ok(cap(3.3) >= 0.5 * MM - 1e-9, "3 px apart: at least 0.5 mm radius");
  assert.equal(cap(0.9), 0.75, "under 1.5 px apart: #3017's rule");
  assert.ok(cap(40) >= 16, "well apart: the symbol's own size");
});
