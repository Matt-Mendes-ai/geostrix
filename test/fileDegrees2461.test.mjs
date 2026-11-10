// TASKS.csv #2461 (review #2325, WA uranium) — MGA eastings / northings declared as longitude / latitude: bad rows, said before Save
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reprojectTableRows, degreesOutOfRange } from "../src/lib/fileReproject.js";

const rows = [
  { hole_id: "NNA5025", MGA_East: "570679.9965", MGA_North: "6687859.997" },
  { hole_id: "NNA5026", MGA_East: "570680", MGA_North: "6687660" },
  { hole_id: "X", MGA_East: "", MGA_North: "" },
];

test("the pane's check: every usable row is outside +-180 / +-90", () => {
  assert.deepEqual(degreesOutOfRange(rows, "MGA_East", "MGA_North"), { checked: 2, outside: 2, example: [570679.9965, 6687859.997] });
  assert.deepEqual(degreesOutOfRange([{ x: "123.7", y: "-29.9" }], "x", "y"), { checked: 1, outside: 0, example: null });
});

test("reprojectTableRows leaves such rows blank and counts them under a geographic From", () => {
  const T = (x, y) => [x * 2, y * 2]; // any transform: it must not be reached for those rows
  const r = reprojectTableRows(rows, { xCol: "MGA_East", yCol: "MGA_North", xName: "e2", yName: "n2", T, geographic: false, fromGeographic: true });
  assert.equal(r.bad, 3);
  assert.equal(r.rows[0].e2, "");
  const ok = reprojectTableRows(rows, { xCol: "MGA_East", yCol: "MGA_North", xName: "e2", yName: "n2", T, geographic: false }); // From projected: as before
  assert.equal(ok.bad, 1);
  assert.equal(ok.rows[0].e2, 1141359.993);
});

test("the pane wires it: the warning, Save held", () => {
  const s = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8");
  assert.match(s, /fromGeographic: isGeographicCrs\(fileFrom\)/);
  assert.match(s, /fromDegrees\.outside > fromDegrees\.checked \/ 2/);
});
