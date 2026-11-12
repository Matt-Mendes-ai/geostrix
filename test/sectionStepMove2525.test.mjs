// TASKS.csv #2525 (review #2486, WA lithium) — each step of a section (‹ › / ±100 m) left one more saved section and two more end labels in
// the 3D view. A section a step made, with nothing digitised on it, now moves with the next step.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2525 a stepped, empty section moves; one with contacts is kept and a new one made", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /if \(s\.stepped && !\(s\.contacts \|\| \[\]\)\.length\) \{ const next = \{ \.\.\.s, \.\.\.r\.create, corridor: s\.corridor, name: steppedSectionName\(s\.name, r\.offset\) \}; upsertSection\(next\); reopenSection\(next\); return; \}/);
  assert.match(v, /openDefinedSection\(\{ \.\.\.r\.create, corridor: s\.corridor \}, steppedSectionName\(s\.name, r\.offset\), \{ stepped: true, stepM: Math\.abs\(r\.offset\) \}\);/);
  assert.match(v, /contacts: \[\], \.\.\.\(extra \|\| \{\}\) \};/);
  assert.match(v, /s\.stepped && s\.stepM > 0 && by !== "buffer" \? stepSection\(s, sections, step, \{ fallback: s\.stepM, exact: true \}\)/, "it keeps its own step length");
});
