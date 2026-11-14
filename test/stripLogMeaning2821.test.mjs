// TASKS.csv #2821 (split from #2816) — the strip log shows a logged code's meaning from the project's code dictionary beside the code: in
// the interval's hover, the lithology pattern list and the figure's key (the 3D view's Identify and tooltip have it since #2816).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { codeMeaning } from "../src/lib/viewer/codeMeaning.js";

const s = fs.readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");

test("the rule the strip log uses: the project's own meaning, nothing when the entry repeats the code or the name shown already says it", () => {
  const dict = { litho: { smp: { code: "SMP", desc: "Siltstone, micaceous, pyritic" }, bif: { code: "BIF", desc: "BIF" } } };
  assert.equal(codeMeaning(dict, "litho", "smp"), "Siltstone, micaceous, pyritic", "case-folded");
  assert.equal(codeMeaning(dict, "litho", "BIF"), null);
  assert.equal(codeMeaning(dict, "litho", "SMP", "SMP (Siltstone, micaceous, pyritic)"), null);
  assert.equal(codeMeaning(dict, "alt", "SMP"), null, "per layer: the alteration log has its own codes");
});

test("wiring: the dictionary from the store, the meaning in each interval's hover, the pattern list and the figure key", () => {
  assert.match(s, /import \{ codeMeaning \} from "\.\.\/lib\/viewer\/codeMeaning\.js";/);
  assert.match(s, /const \{ customLayers: allCustom = \[\], codeDictionary \} = useStore\(\);/);
  assert.match(s, /const meaningOf = \(t, v, shown = ""\) => \(codeDictionary \? codeMeaning\(codeDictionary, t\.key, v, shown\) : null\);/);
  assert.match(s, /return \(lanes > 1 \|\| m \|\| d\) \? <title>\{`\$\{r\.value\}\$\{name\}\$\{m \? ` — \$\{m\}` : ""\}/, "the hover of an interval"); // d: the interval's description, #3308
  assert.match(s, /meaningOf\(\{ key: "litho" \}, v, lithoName\(v\)\)/, "beside the code in the pattern list");
  assert.match(s, /items: seen\.map\(\(v\) => \(\{ label: withMeaning\(v\),/, "the figure's key");
});
