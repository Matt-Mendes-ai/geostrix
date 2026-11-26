// TASKS.csv #4089 — Level surveys, Ties → Result → Write, on two MADE-UP surveys under one column (year): the 2023 survey re-sampled 30 sites of the 2019
// survey 3 m away and reads exactly 1.6 times higher. The tie fit finds x1.6, and the written column holds the 2019 values as they are and the 2023 values
// divided by 1.6. The same data was driven live in the real window (the dialog's steps, then Write): see the row's notes. SYNTHETIC: no project data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { surveysOf, fitLevelling, levellingPreview, writeLevelled, levelledSymbol, basisColumn } from "../src/lib/levelling.js";

const sites = Array.from({ length: 30 }, (_, i) => ({ x: 500000 + (i % 6) * 120, y: 6700000 + Math.floor(i / 6) * 120, zn: 40 + ((i * 37) % 90) }));
const samples = [];
sites.forEach((s, i) => {
  samples.push({ sample_id: `A${i}`, x: s.x, y: s.y, medium: "soil", values: { Zn: s.zn }, attrs: { year: "2019" } });
  samples.push({ sample_id: `B${i}`, x: s.x + 3, y: s.y + 2, medium: "soil", values: { Zn: s.zn * 1.6 }, attrs: { year: "2023" } });
});
const elements = [{ symbol: "Zn", unit: "ppm" }];
const opts = { symbol: "Zn", medium: "soil", column: "year", reference: "2019", survey: "2023", radiusM: 25 };

test("two surveys are told apart by the year column", () => {
  assert.deepEqual(surveysOf(samples, "year").map((s) => [s.key, s.count]).sort(), [["2019", 30], ["2023", 30]]);
});

test("the ties find the exact factor, and the preview brings the 2023 median to the 2019 one", () => {
  const fit = fitLevelling(samples, opts);
  assert.ok(fit.ties.ok);
  assert.equal(fit.ties.n, 30);
  assert.ok(Math.abs(fit.ties.factor - 1 / 1.6) < 1e-9, `factor ${fit.ties.factor}`);
  const pv = levellingPreview(samples, fit, "ties", opts);
  assert.ok(Math.abs(pv.after.median - pv.reference.median) < 1e-6 * pv.reference.median);
  assert.ok(pv.before.median > pv.reference.median * 1.5);
});

test("Write: Zn_lev holds the 2019 values as they are and the 2023 values divided by 1.6; Zn itself is unchanged; the basis says ties", () => {
  const fit = fitLevelling(samples, opts);
  const r = writeLevelled(samples, elements, fit, "ties", opts);
  assert.equal(r.written.levelled, 30); assert.equal(r.written.reference, 30);
  const sym = levelledSymbol("Zn");
  for (const s of r.samples) {
    const orig = samples.find((o) => o.sample_id === s.sample_id);
    assert.equal(s.values.Zn, orig.values.Zn, "the source value is untouched");
    const expected = s.attrs.year === "2023" ? orig.values.Zn / 1.6 : orig.values.Zn;
    assert.ok(Math.abs(s.values[sym] - expected) <= 1e-9 * expected, `${s.sample_id}`);
  }
  assert.ok(r.elements.some((e) => e.symbol === sym));
  const basis = r.samples.find((s) => s.sample_id === "B0").attrs[basisColumn("Zn")];
  assert.match(String(basis), /tie/i);
});
