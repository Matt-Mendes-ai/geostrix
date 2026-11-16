// TASKS.csv #3560 (A0) — the strip log dialog points to the Fence diagram for several holes side by side; Help says so.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
test("A0: the strip log's button opens the fence (closing the strip log); the Help entry names it", () => {
  assert.match(read("../src/components/StripLog.jsx"), /\{onOpenFence && <button type="button" onClick=\{onOpenFence\}/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /onOpenFence=\{\(\) => \{ setStripLogHoleId\(null\); setFenceOpen\(true\); \}\}/);
  assert.match(read("../src/help/pages/everyday.js"), /Several holes: Fence diagram button in the strip log/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["Several holes: Fence diagram"], l);
});
