// TASKS.csv #2490 (review #2486, WA lithium) — an oxide column in per cent keeps '%' even with one impossible value over 100 (flagged instead),
// the unit box beside an oxide column takes effect, and the 'another unit' / 'Converted' messages name the unit actually applied
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickElementColumns, importStoreUnit, oxidesOver100, convertUnit } from "../src/lib/geochem.js";

const headers = ["hole_id", "from", "to", "Fe2O3", "SiO2", "Li2O", "Cu"];
const rows = [
  { hole_id: "RC621", from: "8", to: "9", Fe2O3: "110.917", SiO2: "65.791", Li2O: "1.2", Cu: "120" },
  { hole_id: "RC621", from: "9", to: "10", Fe2O3: "12.5", SiO2: "100.657", Li2O: "0.4", Cu: "80" },
  { hole_id: "RC622", from: "0", to: "1", Fe2O3: "8.1", SiO2: "71.2", Li2O: "0.1", Cu: "40" },
];

test("oxide columns with a value over 100 stay in per cent; a plain element with no unit in its header still goes to ppm", () => {
  const els = pickElementColumns(headers, rows);
  const u = Object.fromEntries(els.map((e) => [e.symbol, e.unit]));
  assert.equal(u.Fe, "%");
  assert.equal(u.Si, "%");
  assert.equal(u.Cu, "ppm");
  const over = oxidesOver100(rows, els, { hole_id: "hole_id", from: "from", to: "to" });
  assert.deepEqual(over.map((o) => [o.header, o.n, o.example.hole, o.example.value]), [["Fe2O3", 1, "RC621", 110.917], ["SiO2", 1, "RC621", 100.657]]);
});

test("the dialog's unit for an oxide column takes effect (ppm Li2O read as ppm, stored in its basis)", () => {
  const e = { symbol: "Li", header: "Li2O", unit: "ppm", unitChosen: true };
  assert.equal(importStoreUnit(e), "ppm Li2O"); // kept as the oxide (#2487), in the unit picked
  assert.equal(importStoreUnit({ ...e, keepOxide: false }), "ppm"); // stored as the element
  assert.equal(importStoreUnit({ symbol: "Li", header: "Li2O", unit: "ppm" }), "% Li2O"); // not picked: the header's (%)
  assert.ok(Math.abs(convertUnit(5000, "ppm Li2O", "% Li2O") - 0.5) < 1e-12);
});

test("the commit reads an oxide column in the picked unit, and both clash messages name the stored unit", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /oxideBasisUnit\(oxideColumnUnit\(e, header\), ox\.oxide\)/);
  assert.match(g, /`\$\{e\.symbol\} \$\{importStoreUnit\(e\)\} → \$\{existingUnit\[e\.symbol\]\}`/);
  const d = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(d, /existingUnits\[e\.symbol\] !== importStoreUnit\(e\)/);
  assert.match(d, /unit: importStoreUnit\(e\), projectUnit/);
  assert.match(d, /has \{n\} value\(s\) over 100 % \(impossible as wt%\)/);
});
