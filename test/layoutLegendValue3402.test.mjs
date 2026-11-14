// TASKS.csv #3402 (#3332) — the Layout sheet's legend shows a row's value (a mineral's range of values) after its label, as the 3D legend does, and the box is as wide as that. SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { legendBoxSize } from "../src/lib/legendFit.js";
test("a row with a value is wider than the same row without", () => {
  const plain = legendBoxSize([["CPY", "#d08a1c"]]).w;
  const ranged = legendBoxSize([["Chalcopyrite (CPY, long name)", "#d08a1c", { value: "0.54–14.9" }]]).w, noRange = legendBoxSize([["Chalcopyrite (CPY, long name)", "#d08a1c"]]).w;
  assert.ok(ranged > noRange, `${ranged} vs ${noRange}`); assert.ok(plain <= noRange);
});
test("wired in the Layout legend row", () => {
  const l = fs.readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.ok(l.includes('{opt?.value && <span style={{ fontSize: printPx(printPt.caption), color: "#55606e" }}>{opt.value}</span>}'));
});
