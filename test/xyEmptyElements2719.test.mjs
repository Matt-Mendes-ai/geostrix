// TASKS.csv #2719 — the X / Y lists mark the elements with no value in the chosen sample source (lab / pXRF)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elementsWithoutValues } from "../src/lib/geochemXY.js";

test("an element measured only by the other source is found; one value is enough to count", () => {
  const lab = [{ values: { Au: 0.2, Cu: 120 } }, { values: { Au: 0.05, Cu: "", Rb: null } }, { values: {} }];
  assert.deepEqual([...elementsWithoutValues(lab, ["Au", "Cu", "Rb", "Zr"])].sort(), ["Rb", "Zr"]);
  assert.deepEqual([...elementsWithoutValues([], ["Au"])], ["Au"]);
  assert.deepEqual([...elementsWithoutValues(lab, [])], []);
});

test("wired: only on the X-Y scatter of a project with pXRF; greyed out unless it is the current choice", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /diagramId === "xy" && hasPxrf \? elementsWithoutValues\(sourceRows, assayElements\.map\(\(e\) => e\.symbol\)\) : new Set\(\)/);
  assert.match(g, /disabled=\{none && value !== `el:\$\{e\.symbol\}`\}>\{none \? tr\("\{name\} — no value in these samples", \{ name \}\) : name\}/);
});
