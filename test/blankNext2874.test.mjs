// TASKS.csv #2874 (split from #2493) — a blank first code that takes the next code column's code (#2182) was still counted in the #1650
// notice as one of the 'more codes ... not drawn': that code is the one drawn now.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the code that takes a blank first code's place leaves the 'not drawn' count", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.ok(u.includes("codesKept += a.extra; codesRows++; extra = a.extra; }"));
  assert.ok(u.includes("blankTookNext++; if (extra) { codesKept--; if (extra === 1) codesRows--; }"));
});
