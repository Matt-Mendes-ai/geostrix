// TASKS.csv #2193 (review #2174) — the X–Y scatter's Y axis on a one-element project is a real choice, never a blank shown as 'Au'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("#2193 Y defaults to the second element, else a downhole log, else the element again; a blank shows a placeholder", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  // #2512: the second element is correlationDefaults' second pick after the lead (xyPair), not the file's second column
  assert.match(g, /xyKeyY = xyY \|\| \(xyPair\[1\] \? `el:\$\{xyPair\[1\]\}` : xyChoices\[0\]\?\.key \|\| \(xyPair\[0\] \? `el:\$\{xyPair\[0\]\}` : ""\)\)/);
  assert.match(g, /\{!value && <option value="">\{tr\("— choose —"\)\}<\/option>\}/);
  // xyChoices is defined before it is used for the default
  assert.ok(g.indexOf("const xyChoices = useMemo") < g.indexOf("const xyKeyX = xyX ||"));
});
