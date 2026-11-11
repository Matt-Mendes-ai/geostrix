// TASKS.csv #2615 — a viewport grid label stays inside the frame (the last easting was cut to '416,00'), and the collar table prints no
// azimuth for a vertical hole ('344*  -90*')
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("grid labels are placed inside the frame by their width", () => {
  assert.match(m, /x: Math\.min\(W - 2 - estW\(l\.label\), Math\.max\(2, lab\[0\] \+ 2\)\)/);
});

test("a vertical hole's azimuth cell is a dash", () => {
  assert.match(m, /Math\.abs\(Number\(c\.dip\)\) >= 89\.5 \? "—"/);
});
