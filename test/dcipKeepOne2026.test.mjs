// TASKS.csv #2026 — one DC / IP line file was read into the pane but not kept in the project, while several files at once were kept
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("a single file is kept like several (unplaced), once, and the notice says so", () => {
  const src = readFileSync(new URL("../src/components/DcipPanel.jsx", import.meta.url), "utf8");
  const i = src.indexOf("const onFile = async (f) => {"), body = src.slice(i, src.indexOf("const readLineFile", i));
  assert.match(body, /const newlyKept = !!\(p\?\.readings\.length && !\(dcipLines \|\| \[\]\)\.some\(\(l\) => l\.name === keptName\)\);/);
  assert.match(body, /if \(newlyKept\) \{ [^\n]*saveDcipLine\(\{ name: keptName, readings: p\.readings,/);
  assert.match(body, /tr\("Kept in the project as \\"\{name\}\\" \(place it on the map before inverting\)\."/);
});
