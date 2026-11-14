// TASKS.csv #3408 (#2399) — the strip-log window's header shows the per-hole values joined onto the hole (collar.attrs). SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarAttrLine } from "../src/lib/collarTable.js";
test("the first values as one line, the rest counted, blanks left out", () => {
  const c = { attrs: { Probe: "GR-12", K_factor: "1.02", Empty: "", " Date ": "2024-03-01", A: "1", B: "2", C: "3", D: "4" } };
  const l = collarAttrLine(c, 3);
  assert.equal(l.text, "Probe: GR-12 · K_factor: 1.02 · Date: 2024-03-01 · +4"); assert.ok(l.all.split("\n").length === 7);
  assert.equal(collarAttrLine({}).text, ""); assert.equal(collarAttrLine(null).text, "");
});
test("wired in the header, on screen", () => {
  const s = fs.readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("useMemo(() => collarAttrLine(collar), [collar])") && s.includes("{attrLine.text && <div"));
});
