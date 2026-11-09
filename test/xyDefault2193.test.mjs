// TASKS.csv #2193 (review #2174) — the X–Y scatter's Y axis on a one-element project is a real choice, never a blank shown as 'Au'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("#2193 Y defaults to the second element, else a downhole log, else the element again; a blank shows a placeholder", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /xyKeyY = xyY \|\| \(assayElements\[1\] \? `el:\$\{assayElements\[1\]\.symbol\}` : xyChoices\[0\]\?\.key \|\| \(assayElements\[0\] \? `el:\$\{assayElements\[0\]\.symbol\}` : ""\)\)/);
  assert.match(g, /\{!value && <option value="">\{tr\("— choose —"\)\}<\/option>\}/);
  // xyChoices is defined before it is used for the default
  assert.ok(g.indexOf("const xyChoices = useMemo") < g.indexOf("const xyKeyX = xyX ||"));
});
