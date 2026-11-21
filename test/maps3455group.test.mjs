// TASKS.csv #3459 / #3471 / #3458 — small Maps rows: the threshold hint, claims named as claims in A layer, the foldable Collars panel
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("a claim is listed as 'Claim:' in Maps > A layer", () => {
  assert.match(read("modules/CartographyModule.jsx"), /label: `\$\{b\.kind === "claim" \? "Claim" : "Boundary"\}: \$\{b\.name\}`/);
});
test("a first-over-threshold grid with the box empty says what to type, and editing it clears the old notice", () => {
  const h = read("components/HoleValueGridPanel.jsx");
  assert.match(h, /st === "firstOver" && threshold === "" && <div role="note"/);
  assert.match(h, /onChange=\{\(v\) => \{ setThreshold\(v == null \? "" : String\(v\)\); setMsg\(null\); \}\}/); // #3926: NumberInput
});
test("the Collars panel folds, and the callouts re-measure it", () => {
  const p = read("components/MapsPlanView.jsx");
  assert.match(p, /const \[chipOpen, setChipOpen\] = useState\(true\);/);
  assert.match(p, /\{chipOpen && <>/);
  assert.match(p, /chipOpen \/\* #3458: its size changes the callouts \*\//);
});
