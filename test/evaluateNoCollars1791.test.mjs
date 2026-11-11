// TASKS.csv #1791 — Evaluate onto drillholes on a project with logs for 33 holes but no collars said 'No drillhole passes through
// "3dmesh_utm".', as if holes had been placed and missed the model
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("no collar coordinates: said before sampling; the old text stays for holes that miss the model", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  const i = src.indexOf("const evaluateOnHoles = (model) => {");
  const body = src.slice(i, i + 2500);
  const noCollars = body.indexOf("No drillholes can be placed: the project has no collar coordinates."), sample = body.indexOf("sampleModelOnHoles("), miss = body.indexOf("tr(\"No drillhole passes through");
  assert.ok(noCollars > 0 && noCollars < sample && sample < miss, `${noCollars} ${sample} ${miss}`);
  assert.match(body, /\(collars \|\| \[\]\)\.some\(\(c\) => Number\.isFinite\(c\?\.x\) && Number\.isFinite\(c\?\.y\) && Number\.isFinite\(c\?\.z\)\)/);
});
