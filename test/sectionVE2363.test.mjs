// TASKS.csv #2363 (review #2325, WA uranium) — a new section opens at a vertical exaggeration from its own shape, and keeps the user's after
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultSectionVE, MAX_SECTION_VE } from "../src/lib/sectionVE.js";

test("length / (10 x height), rounded, between 1x and 20x", () => {
  assert.equal(defaultSectionVE(2600, 90), 3); // the review's palaeochannel section
  assert.equal(defaultSectionVE(10000, 50), 20);
  assert.equal(defaultSectionVE(100000, 50), MAX_SECTION_VE); // capped
  assert.equal(defaultSectionVE(800, 600), 1); // a deep section stays at true scale
  assert.equal(defaultSectionVE(1400, 100), 1);
  assert.equal(defaultSectionVE(0, 100), 1);
  assert.equal(defaultSectionVE(500, 0), 1);
  assert.equal(defaultSectionVE(NaN, 10), 1);
});

test("SectionWindow starts from null, takes the section's own value once, and the subtitle reads the VE drawn", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /const \[handed\] = useState\(\(\) => \{ const h = stepVE && Date\.now\(\) - stepVE\.at < 30000 \? stepVE : null; stepVE = null; return h; \}\);[^\n]*\n\s*const \[vExag, setVExag\] = useState\(\(\) => handed\?\.ve \?\? null\);/); // null unless a step carries the user's VE (#2933; #3054: the hand-over object)
  assert.match(s, /onAutoVE=\{\(v\) => setVExag\(\(cur\) => cur \?\? v\)\}/); // never over the user's value
  const fn = s.slice(s.indexOf("function SectionSVG("));
  const def = fn.indexOf("const vExag = vExagIn ?? autoVE ?? 1;");
  assert.ok(def > 0 && fn.indexOf("const subtitleLines") > def, "the subtitle is worked out after the VE");
  assert.ok(fn.indexOf("defaultSectionVE(len, maxZ - minZ)") < fn.indexOf("const zPad"), "from the unpadded height");
});
