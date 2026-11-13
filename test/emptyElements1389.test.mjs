// TASKS.csv #1389 — every Geochem element list offered B, Hg, Pd and Pt on Silvertip, blank in all 1,339 assay rows. A column with no value
// in any row is left unticked at import (tagged 'no values'), and the Silvertip sample loader leaves such elements out.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickElementColumns } from "../src/lib/geochem.js";
import { silvertipAssays } from "../src/lib/sampleSilvertip.js";
import { bcSkip, bcText } from "./helpers/bcSample.mjs"; // TASKS.csv #3134 — the BC samples are not in the repository: real-data checks run where one is found

test("pickElementColumns reports the values in each chosen column", () => {
  const rows = [{ Au_ppm: "0.5", Cu_ppm: "", B_pct: "" }, { Au_ppm: "1.2", Cu_ppm: "40", B_pct: "" }];
  const by = Object.fromEntries(pickElementColumns(["Au_ppm", "Cu_ppm", "B_pct"], rows).map((e) => [e.symbol, e.n]));
  assert.deepEqual(by, { Au: 2, Cu: 1, B: 0 });
});

test("the Silvertip loader leaves out an element with no value in any row (synthetic rows in its layout)", () => {
  const text = "hole_id,from,to,sample_id,Ag_ppm,B_ppm,Hg_ppm,Zn_pct,Pd_ppm,Pt_ppm\nH1,0,1,S1,2.5,,,1.2,,\nH1,1,2,S2,0.8,,,0.4,,\nH2,0,1,S3,,,,3.1,,\n";
  const { elements, rows } = silvertipAssays(text);
  const syms = elements.map((e) => e.symbol);
  assert.deepEqual(syms.sort(), ["Ag", "Zn"]);
  assert.ok(elements.every((e) => rows.some((r) => r.values[e.symbol] != null)));
});

test("the Silvertip assays (ARIS 42807) no longer list B, Hg, Pd or Pt", { skip: bcSkip("silvertip") }, () => {
  const text = bcText("silvertip", "assays.csv");
  const { elements, rows } = silvertipAssays(text);
  const syms = elements.map((e) => e.symbol);
  for (const s of ["B", "Hg", "Pd", "Pt"]) assert.ok(!syms.includes(s), s);
  assert.ok(syms.includes("Zn") && syms.includes("Ag"));
  assert.ok(elements.every((e) => rows.some((r) => r.values[e.symbol] != null)));
});

test("Geochem's import dialogs start an empty column unticked and tag it", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((g.match(/mainHeader: e\.header, checked: e\.n > 0( \}|, \.\.\.projectKeepsOxide\(e, projectUnits\) \})\)\)/g) || []).length, 3); // the two surface dialogs add the project's basis (#2957)
  for (const f of ["../src/components/AssayImportModal.jsx", "../src/components/SurfaceImportModal.jsx"]) {
    assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /\{e\.n === 0 && <span [^>]*>\{tr\("no values"\)\}<\/span>\}/, f);
  }
});
