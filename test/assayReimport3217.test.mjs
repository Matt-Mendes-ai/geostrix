// TASKS.csv #3217 — a second assay import must open with the units and choices the project kept for the same headers, and a conversion that
// would put readings over 100 % is refused. Synthetic table (the Galore Creek files stay out of the repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedFromProject, projectImportChoices, importChoicesOf, conversionsOver100 } from "../src/lib/assayReimport.js";
import { pickElementColumns, convertUnit } from "../src/lib/geochem.js";

const headers = ["HOLE", "FROM", "TO", "Cu_ICP_pct", "Al_ICP_pct", "Au_FA_ppm", "Cu_AAS_ppm"];
const rows = Array.from({ length: 60 }, (_, i) => ({ HOLE: "SYN-1", FROM: String(i * 2), TO: String(i * 2 + 2), Cu_ICP_pct: String(40 + i * 120) /* ppm under a _pct name */, Al_ICP_pct: String(60000 + i * 100), Au_FA_ppm: String(0.1 + i / 100), Cu_AAS_ppm: String(40 + i * 119) }));

// what the first import stored: Cu and Al set to ppm by hand, Ag added by hand on a column the picker does not offer
const project = [
  { symbol: "Cu", header: "Cu_ICP_pct", unit: "ppm", unitChosen: true, lastImport: { overLimitCodes: false, negativeMode: "bdl", blankMode: "missing" } },
  { symbol: "Al", header: "Al_ICP_pct", unit: "ppm", unitChosen: true, lastImport: { overLimitCodes: false, negativeMode: "bdl", blankMode: "missing" } },
  { symbol: "Au", header: "Au_FA_ppm", unit: "ppm" },
  { symbol: "Ag", header: "Cu_AAS_ppm", unit: "ppm", unitChosen: true },
  { symbol: "Zn", header: "Zn_ppm", unit: "ppm", unitChosen: true }, // not in this file
];

test("the dialog opens with last time's units for headers the project holds", () => {
  const picked = pickElementColumns(headers.slice(3), rows).map((e) => ({ ...e, mainHeader: e.header, checked: e.n > 0 }));
  const cu0 = picked.find((e) => e.symbol === "Cu");
  assert.equal(cu0.unit, "%", "the picker alone reads the _pct name as per cent (the bug's start)");
  const { elements, seeded } = seedFromProject(picked, project, headers);
  const by = Object.fromEntries(elements.map((e) => [e.symbol, e]));
  assert.equal(by.Cu.header, "Cu_ICP_pct"); assert.equal(by.Cu.unit, "ppm"); assert.equal(by.Cu.unitChosen, true); assert.equal(by.Cu.asLastTime, true);
  assert.equal(by.Al.unit, "ppm");
  assert.equal(by.Au.asLastTime, undefined, "a unit nobody chose is left to the picker");
  assert.equal(by.Ag.header, "Cu_AAS_ppm"); assert.equal(by.Ag.checked, true, "a column added by hand is offered again");
  assert.equal(by.Zn, undefined, "a header the file does not have is not offered");
  assert.deepEqual(seeded.map((s) => s.symbol).sort(), ["Ag", "Al", "Cu"]);
  // nothing left to convert: the unit the dialog stores equals the project's
  const clashes = elements.filter((e) => e.checked && project.find((p) => p.symbol === e.symbol)?.unit !== e.unit);
  assert.deepEqual(clashes.map((e) => e.symbol), []);
});

test("the import choices the project kept come back when they agree", () => {
  assert.deepEqual(projectImportChoices(project, ["Cu", "Al", "Au"]), { overLimitCodes: false, negativeMode: "bdl", blankMode: "missing" });
  assert.deepEqual(projectImportChoices(project, ["Au"]), {}, "an element with no record gives no choice");
  const mixed = [...project, { symbol: "Mo", header: "Mo_ppm", unit: "ppm", lastImport: { overLimitCodes: true } }];
  assert.equal(projectImportChoices(mixed, ["Cu", "Mo"]).overLimitCodes, undefined, "a disagreement keeps the default");
  assert.deepEqual(importChoicesOf({}), { overLimitCodes: true, negativeMode: "bdl", blankMode: "missing" });
  assert.equal(importChoicesOf({ overLimitCodes: false }).overLimitCodes, false);
});

test("a conversion that would put readings over 100 % is found", () => {
  const bad = conversionsOver100(rows, [{ symbol: "Cu", header: "Cu_ICP_pct", unit: "%" }, { symbol: "Al", header: "Al_ICP_pct", unit: "%" }, { symbol: "Au", header: "Au_FA_ppm", unit: "ppm" }]);
  assert.deepEqual(bad.map((b) => b.symbol), ["Cu", "Al"]);
  assert.equal(bad[1].n, 60); assert.equal(bad[1].max, 65900);
  assert.ok(convertUnit(65900, "%", "ppm") > 1e6);
  assert.deepEqual(conversionsOver100(rows, [{ symbol: "Cu", header: "Cu_ICP_pct", unit: "ppm" }]), [], "read as ppm: nothing over 100 %");
  assert.deepEqual(conversionsOver100([{ X: "9999" }], [{ symbol: "Cu", header: "X", unit: "%" }]), [], "a 9999 is a code, not a reading");
  assert.deepEqual(conversionsOver100([{ X: "65" }], [{ symbol: "Cu", header: "X", unit: "%" }]), [], "65 % is a reading");
});

test("the Geochem import is wired to seed, remember and refuse", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /seedFromProject\(picked, assayElements, headers\)/);
  assert.equal((g.match(/projectImportChoices\(assayElements/g) || []).length, 2, "wide and long dialogs");
  assert.match(g, /conversionsOver100\(allRows, converted\)/);
  assert.match(g, /lastImport: last/);
  const m = fs.readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /As last time in this project/);
  assert.match(m, /conversionsOver100\(/);
});
