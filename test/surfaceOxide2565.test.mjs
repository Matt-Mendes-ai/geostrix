// TASKS.csv #2565 — surface samples: an oxide column (Li2O) was stored as the element with no word, and a '<0.005' cell was labelled and
// identified as 0.0023 (half the limit, a number in no file). The import names both now, and a below-detection value reads '<limit'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleLabelText } from "../src/lib/viewer/holeLabels.js";
import { sampleValueText, sampleIdentifyFields } from "../src/lib/viewer/sampleTip.js";

const soil = { sample_id: "SYNSO0336", medium: "soil", x: 0, y: 0, z: 0, values: { Li: 0.002358, Cs: 0.0344 }, bdl: ["Li"] };

test("a below-detection value is labelled and identified as '<limit'; a measured one as itself", () => {
  assert.equal(sampleLabelText(soil, "el:Li"), "<0.0047");
  assert.equal(sampleLabelText(soil, "el:Cs"), "0.034");
  assert.equal(sampleValueText(soil, "Li"), "<0.004716");
  assert.equal(sampleValueText(soil, "Cs"), "0.0344");
  const f = Object.fromEntries(sampleIdentifyFields(soil, null, { Li: "%", Cs: "%" }));
  assert.equal(f.Li, "<0.004716 %");
  assert.equal(f.Cs, "0.0344 %");
  assert.equal(sampleLabelText({ values: { Li: 1 } }, "el:Li"), "1.00", "no bdl list: as before");
});

test("the surface-sample notice names the oxide conversions and the below-detection cells", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /tr\("Oxide columns stored as the element, in element %: \{list\}\./);
  assert.match(g, /`\$\{e\.header\} → \$\{ox\.symbol\} \(÷\$\{ox\.factor\}\)`/);
  assert.match(g, /tr\("Below detection: \{list\} \(each stored at half its limit and flagged; a label shows it as '<limit'\)\."/);
});
