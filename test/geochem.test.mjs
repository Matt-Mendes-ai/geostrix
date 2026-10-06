// TASKS.csv #443 — regression tests for the #330 review's wrong-number fixes (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { computeBestIntercepts, avgGradeInRange, readAssayCell, convertUnit, mergeAssayRows } from "../src/lib/geochem.js";

const U = { Au: "ppm" };
const row = (f, t, v, extra = {}) => ({ hole_id: "H1", from: f, to: t, values: { Au: v }, ...extra });
const one = (rows, opts) => computeBestIntercepts(rows, "Au", "ppm", U, { cutoff: 0.5, ...opts });

test("#331 overlapping re-assay counts each metre once (mean of the overlap)", () => {
  const r = one([row(0, 4, 2), row(1, 2, 5)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].from, 0); assert.equal(r[0].to, 4);
  assert.ok(Math.abs(r[0].avgGrade - 2.375) < 1e-9);
  assert.equal(r[0].overlapM, 1);
});

test("#331 exact duplicate row is counted once", () => {
  const r = one([row(0, 1, 10), row(0, 1, 10), row(1, 2, 1)]);
  assert.ok(Math.abs(r[0].avgGrade - 5.5) < 1e-9);
  assert.equal(r.stats.duplicatesSkipped, 1);
});

test("#332 an intercept never averages below its cutoff", () => {
  const r = one([row(0, 1, 0.5), row(1, 3, 0), row(3, 4, 0.5), row(4, 6, 0), row(6, 7, 0.5)], { maxInternalDilution: 2 });
  for (const i of r) assert.ok(i.avgGrade >= 0.5 - 1e-9, `${i.from}-${i.to} @ ${i.avgGrade}`);
});

test("#333 a -9999 code is never averaged in as a grade", () => {
  const r = one([row(0, 1, 1), row(1, 2, -9999), row(2, 3, 1)]);
  assert.ok(r[0].avgGrade > 0);
  assert.equal(r.stats.negativeValues, 1);
  assert.equal(r[0].unsampledM, 1);
});

test("#402 a '<' value never passes the cutoff; '>' marks a minimum", () => {
  assert.equal(one([row(0, 1, 0.5, { qualifiers: { Au: "<" } })], { cutoff: 0.4 }).length, 0);
  assert.equal(one([row(0, 1, 100, { qualifiers: { Au: ">" } })])[0].overRange, true);
});

test("plain intercept with a gap: the gap is reported, not counted at zero (#502)", () => {
  const r = one([row(0, 1, 2), row(1, 2, 0.1), row(3, 4, 3), row(10, 11, 1)], { maxInternalDilution: 2 });
  assert.equal(r.length, 2);
  // #502: (2 + 0.1 + 3) / 3 assayed metres; was (2 + 0.1 + 0 + 3) / 4 = 1.275 with the gap at zero grade
  assert.ok(Math.abs(r[0].avgGrade - 1.7) < 1e-9);
  assert.equal(r[0].length, 4);
  assert.equal(r[0].unsampledM, 1);
});

test("#331 avgGradeInRange resolves overlaps and duplicates the same way", () => {
  assert.ok(Math.abs(avgGradeInRange([row(0, 4, 2), row(1, 2, 5)], "H1", 0, 4, "Au", "ppm", U) - 2.375) < 1e-9);
  assert.ok(Math.abs(avgGradeInRange([row(0, 1, 10), row(0, 1, 10), row(1, 2, 1)], "H1", 0, 2, "Au", "ppm", U) - 5.5) < 1e-9);
});

test("#333 readAssayCell: negative codes and sentinels", () => {
  assert.deepEqual(readAssayCell("-0.005"), { value: 0.0025, qualifier: "<", kind: "neg_bdl" });
  assert.equal(readAssayCell("-9999").value, null);
  assert.equal(readAssayCell("-0.005", "missing").value, null);
  assert.equal(readAssayCell("<0.01").value, 0.005);
  assert.equal(readAssayCell(">100").qualifier, ">");
});

test("#334 convertUnit", () => {
  assert.equal(convertUnit(500, "ppb", "ppm"), 0.5);
  assert.equal(convertUnit(1.2, "%", "ppm"), 12000);
  assert.equal(convertUnit(null, "ppb", "ppm"), null);
});

test("#336 mergeAssayRows updates in place, keeps other elements, appends new intervals", () => {
  const a = [{ hole_id: "H", from: 0, to: 1, source: "assay", values: { Au: 1 }, qualifiers: { Au: "<" } }];
  const r = mergeAssayRows(a, [{ hole_id: "H", from: 0, to: 1, source: "assay", values: { Au: 2, Cu: 5 } }, { hole_id: "H", from: 1, to: 2, source: "assay", values: { Au: 3 } }]);
  assert.equal(r.merged, 1); assert.equal(r.added, 1);
  assert.deepEqual(r.rows[0].values, { Au: 2, Cu: 5 });
  assert.equal(r.rows[0].qualifiers, undefined);
});

import { isElementColumn, oxideOfHeader, fromOxideHeader, toOxide } from "../src/lib/geochem.js";
test("#403 whole-rock oxide headers are recognised and stored as element wt%", () => {
  assert.equal(isElementColumn("SiO2"), "Si");
  assert.equal(isElementColumn("Al2O3 (%)"), "Al");
  assert.equal(isElementColumn("Fe2O3T_pct"), "Fe");
  assert.equal(isElementColumn("TiO2"), "Ti");
  assert.equal(isElementColumn("TFe2O3"), "Fe");
  assert.equal(isElementColumn("LOI"), false);
  assert.equal(isElementColumn("Ti_ppm"), "Ti");
  assert.equal(oxideOfHeader("Ti_ppm"), null);
  assert.equal(oxideOfHeader("Si_pct"), null);
  // 65 % SiO2 must come back as 65 % SiO2 on a diagram (toOxide), not 139 %
  const si = fromOxideHeader(65, "SiO2");
  assert.ok(Math.abs(toOxide(si, "Si") - 65) < 1e-9);
  // Fe2O3 total -> Fe -> FeO total (diagrams use FeO): 10 % Fe2O3 = 8.998 % FeO
  assert.ok(Math.abs(toOxide(fromOxideHeader(10, "Fe2O3T"), "Fe") - 8.998) < 0.01);
  assert.equal(fromOxideHeader(5, "Cu_ppm"), 5);
});

import { correlate } from "../src/lib/correlation.js";
test("#405 Spearman and log correlation resist a single extreme sample", () => {
  // independent-ish noise plus one shared outlier (a multi-element standard left in)
  const xs = [1, 3, 2, 5, 4, 2, 3, 1, 4, 5, 1000], ys = [4, 1, 5, 2, 3, 3, 1, 5, 2, 4, 1000];
  const raw = correlate(xs, ys, "pearson").r, sp = correlate(xs, ys, "spearman").r;
  assert.ok(raw > 0.99, `raw ${raw}`);        // the outlier alone makes raw Pearson ~1
  assert.ok(Math.abs(sp) < 0.4, `spearman ${sp}`);
  // Spearman equals Pearson on ranks with ties averaged; monotone transform -> 1
  assert.ok(Math.abs(correlate([1, 2, 2, 3], [10, 20, 20, 1000], "spearman").r - 1) < 1e-12);
  // log mode drops non-positive values and reports n
  const lg = correlate([0, 1, 10, 100], [5, 1, 10, 100], "log");
  assert.equal(lg.n, 3); assert.ok(Math.abs(lg.r - 1) < 1e-12);
});

import { attachIncluding } from "../src/lib/geochem.js";
test("#402 'including' sub-intercepts at a higher cutoff sit inside their parent intercept", () => {
  // 20 m at 1 g/t with a 4 m core at 6 g/t (8-12 m)
  const assays = Array.from({ length: 20 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { Au: i >= 8 && i < 12 ? 6 : 1 } }));
  const units = { Au: "ppm" };
  const parents = computeBestIntercepts(assays, "Au", "ppm", units, { cutoff: 0.5, maxInternalDilution: 2 });
  const highs = computeBestIntercepts(assays, "Au", "ppm", units, { cutoff: 3, maxInternalDilution: 2 });
  const [p] = attachIncluding(parents, highs);
  assert.equal(p.length, 20);
  assert.equal(p.including.length, 1);
  assert.equal(p.including[0].from, 8); assert.equal(p.including[0].to, 12);
  assert.ok(Math.abs(p.including[0].avgGrade - 6) < 1e-9);
  assert.ok(Math.abs(p.avgGrade - 2) < 1e-9); // (16*1 + 4*6)/20
  // an intercept identical to its parent is not reported as "including" itself
  assert.equal(attachIncluding(parents, parents)[0].including, undefined);
});

import { metalEquivalent, pricePerGram } from "../src/lib/geochem.js";
test("#402 metal equivalent uses only entered prices and recoveries, with unit conversion", () => {
  const au = { symbol: "Au", unit: "ppm", price: 2000, recovery: 0.9 };
  const ag = { symbol: "Ag", unit: "ppm", price: 25, recovery: 0.8 };
  const cu = { symbol: "Cu", unit: "%", price: 4, recovery: 0.85 };
  // Ag: 80 g/t * 25/2000 * 0.8/0.9 = 0.8889 g/t AuEq
  assert.ok(Math.abs(metalEquivalent({ Au: 1, Ag: 80 }, [au, ag]) - (1 + 80 * (25 / 2000) * (0.8 / 0.9))) < 1e-9);
  // Cu 0.5 %: 5000 g/t * ($4/lb per gram) * 0.85 / ($2000/oz per gram * 0.9)
  const expect = 1 + (5000 * pricePerGram("Cu", 4) * 0.85) / (pricePerGram("Au", 2000) * 0.9);
  assert.ok(Math.abs(metalEquivalent({ Au: 1, Cu: 0.5 }, [au, cu]) - expect) < 1e-9);
  assert.ok(expect > 1.6 && expect < 1.7, `${expect}`); // 0.5% Cu at $4/lb, 85% rec. = $37.5/t = 0.65 g/t Au at $2000/oz, 90% rec.
  assert.equal(metalEquivalent({ Au: 1, Ag: 80 }, [au, { ...ag, price: NaN }]), null);
  assert.equal(metalEquivalent({ Au: 1 }, [au, ag]), null); // missing Ag grade -> no number
});

import { addCalculatedElement, CALC_PRESETS } from "../src/lib/calcElement.js";
test("#401 calculated element: presets, partial rows skipped, safe parser errors", () => {
  const els = ["K", "Mg", "Na", "Ca", "Zn", "Pb"].map((s) => ({ symbol: s, unit: s === "Zn" || s === "Pb" ? "ppm" : "%" }));
  const assays = [
    { hole_id: "H", from: 0, to: 1, values: { K: 2, Mg: 1, Na: 0.5, Ca: 0.5, Zn: 900, Pb: 100 } },
    { hole_id: "H", from: 1, to: 2, values: { K: 2, Mg: 1, Zn: 50 } }, // no Na/Ca/Pb
  ];
  const ai = CALC_PRESETS.find((p) => p.name === "AI");
  const r = addCalculatedElement(assays, els, "AI", ai.expr);
  const K2O = 2 * 1.2046, MgO = 1.6583, Na2O = 0.5 * 1.348, CaO = 0.5 * 1.3992;
  assert.ok(Math.abs(r.assays[0].values.AI - (100 * (K2O + MgO)) / (K2O + MgO + Na2O + CaO)) < 1e-9);
  assert.equal(r.assays[1].values.AI, undefined); // partial analysis: no value, not a made-up one
  assert.equal(r.computed, 1); assert.equal(r.skipped, 1);
  assert.equal(r.element.calculated.expr, ai.expr);
  const zn = addCalculatedElement(assays, els, "ZnRatio", "100*Zn/(Zn+Pb)");
  assert.equal(zn.assays[0].values.ZnRatio, 90);
  assert.throws(() => addCalculatedElement(assays, els, "Bad", "Zn + Foo"), /Unknown name "Foo"/);
  assert.throws(() => addCalculatedElement(assays, els, "Zn", "Zn"), /already exists/);
  assert.throws(() => addCalculatedElement(assays, els, "1x", "Zn"), /start with a letter/);
});

test("#510 same-interval rows inside one file are kept (not merged); re-importing that file still replaces", () => {
  const file = [
    { hole_id: "H", from: 0, to: 2, source: "assay", values: { Au: 1, Cu: 10 } },
    { hole_id: "H", from: 0, to: 2, source: "assay", values: { Au: 3, Cu: 50 } }, // field duplicate
    { hole_id: "H", from: 2, to: 4, source: "assay", values: { Au: 0.5 } },
  ];
  const first = mergeAssayRows([], file);
  assert.equal(first.rows.length, 3);
  assert.equal(first.merged, 0);
  assert.equal(first.repeatedInFile, 1);
  assert.deepEqual(first.rows.slice(0, 2).map((r) => r.values), [{ Au: 1, Cu: 10 }, { Au: 3, Cu: 50 }]); // no hybrid row
  // the same file again (e.g. a corrected Cu): occurrence k updates occurrence k — no doubling
  const again = mergeAssayRows(first.rows, [{ ...file[0], values: { Cu: 11 } }, { ...file[1], values: { Cu: 52 } }, file[2]]);
  assert.equal(again.rows.length, 3);
  assert.equal(again.merged, 3);
  assert.deepEqual(again.rows.slice(0, 2).map((r) => r.values), [{ Au: 1, Cu: 11 }, { Au: 3, Cu: 52 }]);
  // a later file with a third copy of the interval appends it
  assert.equal(mergeAssayRows(again.rows, [file[0], file[1], file[0]]).rows.length, 4);
});

test("#502 one blank cell, one answer: intercept, 'also show' grade and the stamp's rule agree", async () => {
  const { blankDetectionLimit, isBlankAssayCell } = await import("../src/lib/geochem.js");
  const rows = [row(0, 1, 2), { hole_id: "H1", from: 1, to: 2, values: {} }, row(2, 3, 2)];
  const r = one(rows, { cutoff: 0.5 });
  assert.equal(r.length, 1);
  assert.equal(r[0].avgGrade, 2); // was 1.333 (blank counted at zero)
  assert.equal(r[0].unsampledM, 1);
  assert.equal(avgGradeInRange(rows, "H1", 0, 3, "Au", "ppm", U), 2);
  // bridging still uses the assayed metres: a blank between two 0.6 g/t samples at a 0.5 cutoff bridges
  assert.equal(one([row(0, 1, 0.6), { hole_id: "H1", from: 1, to: 2, values: {} }, row(2, 3, 0.6)], { cutoff: 0.5 }).length, 1);
  // detection limit for blanks read as below detection: the lab's most common '<x', else the lowest value
  assert.deepEqual(blankDetectionLimit(["<0.005", "<0.005", "<0.01", 0.2, "", null]), { limit: 0.005, basis: "lt" });
  assert.deepEqual(blankDetectionLimit([0.02, 0.3, "", null, "NA"]), { limit: 0.02, basis: "min" });
  assert.deepEqual(blankDetectionLimit(["", null]), { limit: null, basis: null });
  assert.equal(isBlankAssayCell("  "), true); assert.equal(isBlankAssayCell("NA"), false); assert.equal(isBlankAssayCell(0), false);
});

test("#504 makeRangeAverager gives avgGradeInRange's numbers for many windows (overlaps, duplicates, gaps)", async () => {
  const { makeRangeAverager } = await import("../src/lib/geochem.js");
  const rows = [row(0, 4, 2), row(1, 2, 5), row(6, 7, 10), row(6, 7, 10), row(7, 8, 1), { hole_id: "H2", from: 0, to: 3, values: { Au: 4 } }, { hole_id: "H1", from: 9, to: 10, values: {} }];
  const avg = makeRangeAverager(rows, U);
  const windows = [["H1", 0, 4], ["H1", 0.5, 1.5], ["H1", 3, 7], ["H1", 4, 6], ["H1", 6, 8], ["H1", 8.5, 10], ["H1", -5, 50], ["H2", 1, 2], ["H3", 0, 1]];
  for (const [h, f, t] of windows) assert.equal(avg(h, f, t, "Au", "ppm"), avgGradeInRange(rows, h, f, t, "Au", "ppm", U), `${h} ${f}-${t}`);
  assert.equal(avg("H1", 4, 6, "Au", "ppm"), null); // a gap: no grade, not zero
});

test("#503 protolith-aware box plot: Harry basalt is mostly least altered, not 'epidote-albite'", async () => {
  const { readFileSync } = await import("node:fs");
  const Papa = (await import("papaparse")).default;
  const G = await import("../src/lib/geochem.js");
  const read = (f) => Papa.parse(readFileSync(new URL(`../sample_data/harry_property/${f}`, import.meta.url), "utf8"), { header: true, skipEmptyLines: true }).data;
  const rows = read("assay_wide.csv");
  const els = Object.keys(rows[0]).filter((h) => !["hole_id", "from", "to"].includes(h));
  const units = {}; els.forEach((h) => { const [s, u] = h.split("_"); units[s] = u === "pct" ? "%" : "ppm"; });
  const assays = rows.map((r) => { const values = {}; els.forEach((h) => { const c = G.readAssayCell(r[h]); if (c.value != null) values[h.split("_")[0]] = c.value; }); return { hole_id: r.hole_id, from: +r.from, to: +r.to, values }; });
  const lithoByHole = new Map();
  read("litho.csv").forEach((r) => { if (!lithoByHole.has(r.hole_id)) lithoByHole.set(r.hole_id, []); lithoByHole.get(r.hole_id).push({ hole_id: r.hole_id, from: +r.from, to: +r.to, value: r.lithology }); });
  const m = G.GEOCHEM_METHODS.alteration_boxplot;
  const count = (sel) => { const c = {}; assays.forEach((a) => { const prot = G.protolithForSample(a, { lithoByHole, map: { DACT: "dacite", VCL: "dacite" } }); if (!sel(a, prot)) return; const v = m.classify(a.values, units, a, { protolith: prot }); c[v] = (c[v] || 0) + 1; }); return c; };
  const bsl = count((a, p) => p === "basalt");
  const n = Object.values(bsl).reduce((x, y) => x + y, 0);
  console.log("Harry basalt (BSL):", bsl);
  assert.ok(n >= 100, `basalt samples ${n}`);
  assert.ok((bsl["LA-BAS"] || 0) / n > 0.6, `least altered share ${(bsl["LA-BAS"] || 0)}/${n}`);
  // unit rules
  assert.equal(G.classifyAlterationBox(40, 70, "basalt"), "LA-BAS");
  assert.equal(G.classifyAlterationBox(40, 70, "rhyolite"), "CARB"); // same point is right of the rhyolite box
  assert.equal(G.classifyAlterationBox(80, 90, "basalt"), "CHL");
  assert.equal(G.classifyAlterationBox(80, 30, "rhyolite"), "SER");
  assert.equal(G.classifyAlterationBox(10, 30, "rhyolite"), "ALB");
  assert.equal(G.classifyAlterationBox(10, 60, "rhyolite"), "EPI");
  assert.equal(G.classifyAlterationBox(40, 70, null), null); // no protolith, no box, no class
  const edited = { ...G.PROVISIONAL_ALTERATION_BOXES, basalt: { ai: [20, 55], ccpi: [75, 95] } };
  assert.equal(G.classifyAlterationBox(40, 70, "basalt", edited), "LOWCCPI"); // user-edited boxes are used
  assert.equal(G.guessProtolith("BSL"), "basalt"); assert.equal(G.guessProtolith("ANDS"), "andesite"); assert.equal(G.guessProtolith("SED"), null);
});

test("#600/#542 element columns: the complete column wins, over-limit re-assays fill capped samples, units sanity-checked", async () => {
  const { pickElementColumns, parseAssayValue, convertUnit } = await import("../src/lib/geochem.js");
  // the shape of a real BC ARIS export: ore-grade column FIRST, then the capped ICP column, then descriptive ones
  const headers = ["Hole number", "From", "To", "Cu % Cu-OG62", "Cu", "Cu status", "Cu certificate", "Cu_plot_ %", "Au", "Au laboratory", "Cr", "Fe"];
  const rows = [
    { "Cu % Cu-OG62": "", Cu: "93.7", "Cu status": "Final", "Cu_plot_ %": "0.00937", Au: "0.005", Cr: "12", Fe: "3.1" },
    { "Cu % Cu-OG62": "1.95", Cu: "10000", "Cu status": "Final", "Cu_plot_ %": "1.95", Au: "0.4", Cr: "665", Fe: "5.2" },
    { "Cu % Cu-OG62": "", Cu: "387", "Cu status": "Final", "Cu_plot_ %": "0.0387", Au: "", Cr: "40", Fe: "2.2" },
    { "Cu % Cu-OG62": "1.015", Cu: "10000", "Cu status": "Final", "Cu_plot_ %": "1.015", Au: "0.9", Cr: "8", Fe: "4.0" },
  ];
  const els = Object.fromEntries(pickElementColumns(headers, rows).map((e) => [e.symbol, e]));
  assert.deepEqual(Object.keys(els).sort(), ["Au", "Cr", "Cu", "Fe"]); // no "Cu status" / "Au laboratory" / plot columns
  assert.equal(els.Cu.header, "Cu"); // 4 values, not the 2-value ore-grade column
  assert.equal(els.Cu.unit, "ppm");
  assert.deepEqual([els.Cu.overLimit.header, els.Cu.overLimit.unit, els.Cu.overLimit.limit], ["Cu % Cu-OG62", "%", 10000]);
  assert.equal(convertUnit(parseAssayValue(rows[1][els.Cu.overLimit.header]), "%", "ppm"), 19500); // the capped sample's real grade
  assert.equal(els.Cr.unit, "ppm"); // Cr defaults to %, but 665 can't be %
  assert.equal(els.Fe.unit, "%");
  assert.equal(els.Au.overLimit, null);
});

test("#531 PER feldspar diagram: albite and anorthite both on slope 1; muscovite 1 and K-feldspar 3 on the K diagram", async () => {
  const { DIAGRAMS } = await import("../src/lib/geochem.js");
  const u = { Al: "%", Ca: "%", Na: "%", K: "%" };
  // stoichiometric oxide wt% -> element wt% (Na2O/1.348, CaO/1.399, K2O/1.205, Al2O3/1.889)
  const el = (ox) => ({ values: { Al: ox.Al2O3 / 1.889, Ca: (ox.CaO || 0) / 1.399, Na: (ox.Na2O || 0) / 1.348, K: (ox.K2O || 0) / 1.205 } });
  const slope = (d, s) => { const p = DIAGRAMS[d].project(s, u); return p.y / p.x; };
  assert.ok(Math.abs(slope("per_al_cana", el({ Na2O: 11.82, Al2O3: 19.44 })) - 1) < 0.01, "albite");
  assert.ok(Math.abs(slope("per_al_cana", el({ CaO: 20.16, Al2O3: 36.65 })) - 1) < 0.01, "anorthite");
  assert.ok(Math.abs(slope("per_al_k", el({ K2O: 11.81, Al2O3: 38.40 })) - 1) < 0.01, "muscovite");
  assert.ok(Math.abs(slope("per_al_k", el({ K2O: 16.92, Al2O3: 18.32 })) - 3) < 0.03, "K-feldspar");
  assert.deepEqual(DIAGRAMS.per_al_cana.mineralLines.map((m) => m.slope), [1]);
});

test("#532 compositing counts each metre once: a conflicting re-assay no longer doubles coverage", async () => {
  const { compositeDownhole } = await import("../src/lib/geochem.js");
  const u = { Au: "ppm" };
  const rows = [{ hole_id: "A", from: 0, to: 1, values: { Au: 10 } }, { hole_id: "A", from: 0, to: 1, values: { Au: 6 } }, { hole_id: "A", from: 1.5, to: 2, values: { Au: 1 } }];
  // 0-2 m: 0-1 conflicted (mean 8), 1-1.5 no core, 1.5-2 @1 -> covered 1.5 of 2 m
  let c = compositeDownhole(rows.slice(0, 2).concat([{ hole_id: "A", from: 1.99, to: 2, values: { Au: 0 } }]), "Au", "ppm", u, { length: 2, minCoverage: 0.75 });
  assert.equal(c.length, 0, JSON.stringify(c)); // only ~1 of 2 m sampled -> dropped at 0.75 (was coverage 1.0 and kept)
  c = compositeDownhole(rows, "Au", "ppm", u, { length: 2, minCoverage: 0.5 });
  assert.equal(c.length, 1);
  assert.ok(Math.abs(c[0].coverage - 0.75) < 1e-9, String(c[0].coverage));
  assert.ok(Math.abs(c[0].avgGrade - (8 * 1 + 1 * 0.5) / 1.5) < 1e-9, String(c[0].avgGrade));
  assert.equal(c[0].conflictLength, 1);
});

test("#530 a corrected (re-split) assay file replaces the hole; a partial top-up on the same intervals does not ask", async () => {
  const { holesWithChangedIntervals, dropHoleAssays, mergeAssayRows } = await import("../src/lib/geochem.js");
  const prev = [{ hole_id: "A", from: 10, to: 12, source: "assay", values: { Au: 5 } }, { hole_id: "A", from: 12, to: 14, source: "assay", values: { Au: 0.1 } },
    { hole_id: "A", from: 10, to: 12, source: "assay", sample_type: "duplicate", sample_id: "D1", values: { Au: 5.1 } }];
  const corrected = [{ hole_id: "A", from: 10, to: 11.5, source: "assay", values: { Au: 5 } }, { hole_id: "A", from: 11.5, to: 12, source: "assay", values: { Au: 0.1 } }];
  const ch = holesWithChangedIntervals(prev, corrected);
  assert.deepEqual(ch.map((h) => [h.hole_id, h.example]), [["A", "10–12 m"]]);
  const rows = mergeAssayRows(dropHoleAssays(prev, ch), corrected).rows;
  assert.deepEqual(rows.filter((r) => !r.sample_type).map((r) => `${r.from}-${r.to}`), ["10-11.5", "11.5-12"]);
  assert.equal(rows.filter((r) => r.sample_type === "duplicate").length, 1); // QC kept
  // partial batch on identical boundaries (a Cu top-up of one sample): not a change
  assert.deepEqual(holesWithChangedIntervals(prev, [{ hole_id: "A", from: 12, to: 14, source: "assay", values: { Cu: 50 } }]), []);
  // new hole: nothing to compare
  assert.deepEqual(holesWithChangedIntervals(prev, [{ hole_id: "B", from: 0, to: 1, source: "assay", values: { Au: 1 } }]), []);
});
