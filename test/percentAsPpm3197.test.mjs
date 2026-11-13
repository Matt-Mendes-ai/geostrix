// TASKS.csv #3197 (#3195, Galore Creek) — ppm values in columns named _pct (Al median 76,600 %, Cu to 64,700 %) were stored as % with no word in the
// dialog. A per-cent column whose median is over 100 is flagged there and ppm is offered; nothing converts until the user chooses; real per-cent
// columns (Fe, S) are never flagged. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { percentColumnsReadingPpm } from "../src/lib/percentAsPpm.js";
import { pickElementColumns } from "../src/lib/geochem.js";

// 200 samples: Al_pct and Cu_pct hold ppm, Fe_pct and S_pct real per cent (one Fe typo at 140 %), SiO2_pct an oxide
const rows = Array.from({ length: 200 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, Al_pct: String(60000 + (i % 40) * 800), Cu_pct: String(i % 5 ? 300 + i * 50 : "-999"), Fe_pct: String(i === 7 ? 140 : 4 + (i % 9)), S_pct: String(0.5 + (i % 6) / 2), SiO2_pct: String(55 + (i % 7)) }));
const headers = ["hole_id", "from", "to", "Al_pct", "Cu_pct", "Fe_pct", "S_pct", "SiO2_pct"];

test("per-cent columns whose median is over 100 are flagged; Fe and S (real %, one typo over 100) are not", () => {
  const els = pickElementColumns(headers, rows).map((e) => ({ ...e, checked: true }));
  assert.deepEqual(els.filter((e) => ["Al", "Cu", "Fe", "S"].includes(e.symbol)).map((e) => `${e.symbol}:${e.unit}`).sort(), ["Al:%", "Cu:%", "Fe:%", "S:%"], "the header's unit is read as written: nothing converts on its own");
  const flagged = percentColumnsReadingPpm(rows, els);
  assert.deepEqual(flagged.map((f) => f.header), ["Al_pct", "Cu_pct"]);
  const al = flagged.find((f) => f.symbol === "Al");
  assert.ok(al.median > 70000 && al.max === 91200, JSON.stringify(al));
});

test("once the user picks a unit, or for an oxide or LOI, nothing is flagged", () => {
  const els = pickElementColumns(headers, rows).map((e) => ({ ...e, checked: true }));
  assert.deepEqual(percentColumnsReadingPpm(rows, els.map((e) => (e.symbol === "Al" ? { ...e, unit: "ppm", unitChosen: true } : e))).map((f) => f.symbol), ["Cu"]);
  assert.deepEqual(percentColumnsReadingPpm(rows, els.map((e) => (e.symbol === "Cu" ? { ...e, unitChosen: true } : e))).map((f) => f.symbol), ["Al"], "kept in % by the user's own choice: not flagged again");
  assert.deepEqual(percentColumnsReadingPpm([{ SiO2_pct: "5500" }, { SiO2_pct: "5600" }, { SiO2_pct: "5700" }], [{ symbol: "Si", header: "SiO2_pct", unit: "%" }]), [], "oxides have their own check (#2490)");
  assert.deepEqual(percentColumnsReadingPpm([], els), []);
});

test("the assay dialog shows it beside the unit menus and offers ppm for them all", () => {
  const s = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(s, /percentColumnsReadingPpm\(modal\.allRows \|\| \[\], modal\.elements\.filter\(\(e\) => e\.checked\)\)/);
  assert.match(s, /onClick=\{\(\) => setUnits\(pctAsPpm\.map\(\(o\) => o\.symbol\), "ppm"\)\}/);
});
