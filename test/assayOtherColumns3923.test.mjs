// TASKS.csv #3923 (user feedback: "could not import assay columns such as gold equivalent, silver equivalent, total rare earths") — a numeric column that is not a chemical
// element (AuEq_gpt, TREO_ppm ...) was neither offered nor read; the one line that said so came after the import. Now the dialog offers it as an assay of its own, named and
// given its unit from its header as typed, kept AS SUPPLIED (never recalculated) and read everywhere as a normal numeric assay. SYNTHETIC CSV.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { otherNumericColumns, nameAndUnit, customAssayEntry, freeName, columnKind, mixedUnitsList } from "../src/lib/assayOtherColumns.js";
import { pickElementColumns, repeatColumns, gradeUnitLabel, convertUnit, computeBestIntercepts, compositeDownhole } from "../src/lib/geochem.js";
import { assayUsedColumns } from "../src/lib/assayExtraFields.js";
import { assayImportFindings } from "../src/lib/assayImportFindings.js";

const headers = ["hole_id", "from", "to", "Au_ppm", "Ag_ppm", "AuEq_gpt", "TREO_ppm", "Zone", "Azimuth", "Sample_No"];
const rows = Array.from({ length: 6 }, (_, i) => ({ hole_id: "DH-23-001", from: i * 2, to: i * 2 + 2, Au_ppm: 0.1 * i, Ag_ppm: 1 + i, AuEq_gpt: +(0.3 * i + 0.02).toFixed(2), TREO_ppm: 400 + 10 * i, Zone: "North", Azimuth: 90, Sample_No: 1000 + i }));
const src = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3923 today's reading: only the elements are picked; the equivalent and the total were left to a notice after the import", () => {
  const picked = pickElementColumns(headers, rows, null);
  assert.deepEqual(picked.map((e) => e.symbol), ["Au", "Ag"]);
  const used = assayUsedColumns({ hole_id: "hole_id", from: "from", to: "to" }, {}, picked);
  const f = assayImportFindings({ rows: [], elements: picked, headers, used: [...used], allRows: rows });
  assert.deepEqual(f.notImported, ["AuEq_gpt", "TREO_ppm", "Azimuth", "Sample_No"], "the numeric columns the import did not read");
});

test("#3923 names and units are read from the header as typed", () => {
  assert.deepEqual(nameAndUnit("AuEq_gpt"), { name: "AuEq", unit: "ppm", unitLabel: "g/t", assumed: false });
  assert.deepEqual(nameAndUnit("TREO_ppm"), { name: "TREO", unit: "ppm", unitLabel: null, assumed: false });
  assert.deepEqual(nameAndUnit("Cu Eq (%)"), { name: "Cu Eq", unit: "%", unitLabel: null, assumed: false });
  assert.deepEqual(nameAndUnit("Ag_Eq_g/t"), { name: "Ag_Eq", unit: "ppm", unitLabel: "g/t", assumed: false });
  assert.deepEqual(nameAndUnit("Total REE ppb"), { name: "Total REE", unit: "ppb", unitLabel: null, assumed: false });
  assert.equal(nameAndUnit("AgEq").assumed, true, "no unit in the name: ppm assumed and said");
  assert.equal(columnKind("AuEq_gpt"), "equivalent"); assert.equal(columnKind("Eq. Au g/t"), "equivalent"); assert.equal(columnKind("TREO_ppm"), "total"); assert.equal(columnKind("Total REE"), "total"); assert.equal(columnKind("Density"), "");
});

test("#3923 the columns offered: numeric, not read, not a geometry or id column; equivalents and totals first", () => {
  const used = assayUsedColumns({ hole_id: "hole_id", from: "from", to: "to" }, {}, pickElementColumns(headers, rows, null));
  const offered = otherNumericColumns(headers, rows, used);
  assert.deepEqual(offered.map((c) => c.header), ["AuEq_gpt", "TREO_ppm"], "Zone is text (kept as a field), Azimuth and Sample_No are not grades");
  assert.deepEqual(offered.map((c) => c.kind), ["equivalent", "total"]);
  assert.equal(otherNumericColumns(headers, rows, new Set([...used, "AuEq_gpt", "TREO_ppm"])).length, 0, "once added, a column is no longer on offer");
});

test("#3923 the entry: as supplied, a free name, its values counted; a name that exists gets '(supplied)'", () => {
  const [eq, treo] = otherNumericColumns(headers, rows, new Set(["hole_id", "from", "to", "Au_ppm", "Ag_ppm", "Zone"]));
  const e = customAssayEntry(eq, rows, ["Au", "Ag"]);
  assert.deepEqual([e.symbol, e.header, e.unit, e.unitLabel, e.custom, e.asSupplied, e.checked, e.n, e.kind], ["AuEq", "AuEq_gpt", "ppm", "g/t", true, true, true, 6, "equivalent"]);
  assert.equal(customAssayEntry(treo, rows, []).unitLabel, undefined);
  assert.equal(customAssayEntry(eq, rows, ["aueq"]).symbol, "AuEq (supplied)");
  assert.equal(freeName("AuEq", ["AuEq", "AuEq (supplied)"]), "AuEq (supplied 2)");
  assert.equal(customAssayEntry({ ...eq, header: "empty_col" }, [{ empty_col: "" }], []).checked, false, "a column with no value is left unticked");
});

test("#3923 an equivalent is a number as supplied: the value is read in its own unit, g/t is ppm, nothing is recalculated", () => {
  assert.equal(convertUnit(1.52, "ppm", "ppm"), 1.52);
  assert.equal(convertUnit(1.52, "g/t", "ppm"), 1.52, "g/t reads as ppm: the same number");
  assert.equal(gradeUnitLabel("AuEq", "ppm"), "g/t");
  assert.equal(gradeUnitLabel("Ag_Eq", "ppm"), "g/t");
  assert.equal(gradeUnitLabel("TREO", "ppm"), "ppm");
  assert.equal(gradeUnitLabel("CuEq", "%"), "%");
});

test("#3923 a custom name can hold + . ( ) : the repeat-column and numbered-method matchers do not break on it", () => {
  const chosen = [{ symbol: "Cu+Eq (calc)", header: "CuEq_pct", unit: "%", checked: true }];
  assert.doesNotThrow(() => repeatColumns(["CuEq_pct", "Cu+Eq (calc)_2", "Cu+Eq (calc) dup"], chosen, []));
});

test("#3923 wiring: the dialog offers them, adds as supplied, says so in the import notice; the keys are translated", () => {
  const m = src("../src/components/AssayImportModal.jsx");
  assert.match(m, /otherNumericColumns\(modal\.headers \|\| \[\], modal\.allRows \|\| \[\], assayUsedColumns\(modal\.mapping, modal\.qc, modal\.elements\)\)/);
  assert.match(m, /addOthers\(others\.filter\(\(c\) => c\.kind\)\)/);
  assert.match(m, /e\.asSupplied && <span/);
  const g = src("../src/modules/GeochemModule.jsx");
  assert.match(g, /chosen\.some\(\(e\) => e\.asSupplied\) \? tr\("Kept as supplied, not recalculated: \{list\}\."/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["as supplied", "Kept as supplied, not recalculated: {list}.", "Add the equivalents and totals ({n})", "equivalent", "total"]) assert.ok(j[k], `${lang}: ${k}`);
  }
  const pt = JSON.parse(fs.readFileSync(new URL("../src/locales/pt.json", import.meta.url), "utf8"));
  assert.equal(pt["as supplied"], "como fornecido");
});

test("#3923 an as-supplied column is an ordinary numeric assay: intercepts and composites read it like any element, at its own unit", () => {
  const vals = [0.1, 0.2, 1.2, 2.5, 1.8, 0.3, 0.1, 0.05];
  const assays = vals.map((v, i) => ({ hole_id: "DH-23-001", from: i * 2, to: i * 2 + 2, values: { AuEq: v, TREO: 400 + i * 50 }, qualifiers: {} }));
  const units = { AuEq: "ppm", TREO: "ppm" };
  const bi = computeBestIntercepts(assays, "AuEq", "ppm", units, { cutoff: 1, minLength: 2 });
  assert.equal(bi.length, 1);
  assert.deepEqual([bi[0].from, bi[0].to, bi[0].length], [4, 10, 6]);
  assert.ok(Math.abs(bi[0].avgGrade - (1.2 + 2.5 + 1.8) / 3) < 1e-9, "length-weighted average of the supplied values");
  const comp = compositeDownhole(assays, "TREO", "ppm", units, { length: 4 });
  assert.deepEqual(comp.slice(0, 2).map((c) => c.avgGrade), [425, 525]);
});

test("#3923 a note when the project's assays are in more than one unit and a supplied column is among them", () => {
  const project = [{ symbol: "Cu", unit: "%" }, { symbol: "Au", unit: "ppm" }];
  const chosen = [{ symbol: "AuEq", unit: "ppm", unitLabel: "g/t", asSupplied: true, checked: true }, { symbol: "TREO", unit: "ppm", asSupplied: true, checked: true }];
  assert.equal(mixedUnitsList(project, chosen), "% (Cu), ppm (Au, AuEq, TREO)");
  assert.equal(mixedUnitsList([{ symbol: "Au", unit: "ppm" }], chosen), null, "one unit only: nothing to say");
  assert.equal(mixedUnitsList(project, [{ symbol: "Zn", unit: "%", checked: true }]), null, "nothing supplied: the note is about the supplied columns");
});

test("#3923 (Main) the unit is read from the name as typed: g/t spellings are g/t, per cent spellings %, ppb and ppm as they are", () => {
  const gt = ["AuEq_gpt", "AuEq gpt", "AuEq_g/t", "AuEq (g/t)", "AuEqgpt", "AuEq_g_t", "AuEq g/t"];
  for (const h of gt) { const r = nameAndUnit(h); assert.deepEqual([r.name, r.unit, r.unitLabel, r.assumed], ["AuEq", "ppm", "g/t", false], h); }
  const pc = ["TREO_pct", "TREO_%", "TREO (%)", "TREO_pc", "TREO pc", "TREO_percent", "TREO wt%", "TREO_wt_pct", "TREOpct"];
  for (const h of pc) { const r = nameAndUnit(h); assert.deepEqual([r.name, r.unit, r.unitLabel, r.assumed], ["TREO", "%", null, false], h); }
  for (const h of ["Sn_ppb", "Sn (ppb)", "Snppb"]) { const r = nameAndUnit(h); assert.deepEqual([r.unit, r.assumed], ["ppb", false], h); }
  for (const h of ["TREO_ppm", "TREO (ppm)", "TREOppm"]) { const r = nameAndUnit(h); assert.deepEqual([r.unit, r.unitLabel, r.assumed], ["ppm", null, false], h); }
  assert.equal(nameAndUnit("Spct").name, "S", "a unit glued to a name is a unit");
  const m = fs.readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /nu = custom \? nameAndUnit\(addHeader\) : null/, "the dialog's hand-add row reads a non-element name the same way");
  assert.match(m, /None is added for you: add the ones that are grades, such as AuEq or TREO/, "why the list is unticked");
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /import the file again and add it under \\"Other numeric columns in this file\\" in the import dialog/, "the post-import notice says where to add them");
});
