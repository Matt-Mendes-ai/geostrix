// TASKS.csv #1574 (review #1497, Lawyers) — the alteration halo can be built from a categorical custom layer (the Silicification
// log) and only from the intervals at or above a logged intensity; the dropdown says Code, not Assemblage
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericLayerFields } from "../src/lib/evidenceSources.js";

test("the numeric fields a custom log offers as an intensity floor", () => {
  const rows = [
    { hole_id: "A", from: 0, to: 2, value: "Pv", intensity: 2, description: "x" },
    { hole_id: "A", from: 2, to: 4, value: "Pchy", intensity: 1 },
    { hole_id: "B", from: 0, to: 3, value: "Pv", intensity: 3 },
    { hole_id: "B", from: 3, to: 5, value: "Vn", intensity: 1 },
  ];
  const fields = numericLayerFields(rows, { min: 3 }).filter((f) => f !== "from" && f !== "to");
  assert.ok(fields.includes("intensity"), fields.join());
  assert.ok(!fields.includes("value") && !fields.includes("description"), fields.join());
});

test("the run takes a source layer and an intensity floor; the pane offers the layer, the code and the floor", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const runAlterationModel = \(target, bodyOpts = \{\}, source = null\) => \{/);
  assert.match(r, /const customSrc = !isCode && source\?\.layer\?\.startsWith\("custom:"\) \? \(customLayers \|\| \[\]\)\.find\(\(c\) => String\(c\.id\) === source\.layer\.slice\(7\)\) \|\| null : null;/);
  assert.match(r, /String\(r\.value\) === String\(altValue\) && \(!minField \|\| Number\(r\[minField\.field\]\) >= minField\.min\)/);
  assert.match(r, /const altRows = \(\(customSrc \? customSrc\.rows : layers\[sourceKey\]\) \|\| \[\]\)/);
  assert.match(r, /\$\{sourceKey === "vein" \? "Vein set envelope" : sourceKey === "litho" \? "Envelope" : "Alteration halo"\}: \$\{customSrc \? `\$\{customSrc\.name\} ` : ""\}\$\{altValue\}\$\{minField \? ` \(\$\{minField\.field\} ≥ \$\{minField\.min\}\)` : ""\}/); // vein: #2050
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /<select aria-label=\{tr\("Code"\)\} value=\{alterationTarget\}/);
  assert.doesNotMatch(p, /aria-label=\{tr\("Assemblage"\)\}/);
  assert.match(p, /aria-label=\{tr\("Alteration layer"\)\}/);
  assert.match(p, /aria-label=\{tr\("Intensity field"\)\}/);
  assert.match(p, /runAlterationModel\(alterationTarget, \{\}, altSource\.layer === "alt" && !altSource\.field \? null : \{ layer: altSource\.layer, field: altSource\.field \|\| null, min: altSource\.field \? Number\(altSource\.min\) : null \}\)/);
  // a categorical custom layer: one whose values are not numbers
  assert.match(p, /customLayersAll\.filter\(\(c\) => \(c\.rows \|\| \[\]\)\.some\(\(r\) => r\.value != null && r\.value !== "" && !Number\.isFinite\(Number\(r\.value\)\)\)\)/);
});
