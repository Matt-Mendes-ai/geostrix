// TASKS.csv #3274 (Galore Creek review) — a Cu-Au-Ag set's grade-tonnage table gave 'Mean Ag (g/t)' and 'Mean Au (g/t)' beside copper tonnes and
// no ounces of gold or silver. Each member's contained metal now sits beside its mean: its mean times the tonnes of the counted blocks that have it.
// (The copper-equivalent grade the row also asks for is the block calculator's, #3164 — Matt's decision of 2026-11-13.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { memberMeans, memberMetal, memberMetalColumns } from "../src/lib/setLimits.js";

const TROY_OZ_G = 31.1034768;
const cell = (x, value) => ({ x, y: 0, z: 5, dx: 10, dy: 10, dz: 10, value });
const cells = [cell(0, 1000), cell(10, 3000), cell(20, 5000)]; // Cu in ppm, 1,000 m3 each
const au = new Map([[cells[0], 1], [cells[1], 3]]); // Au g/t; the third block has no Au value
const mo = new Map([[cells[0], 0.02], [cells[1], 0.04], [cells[2], 0.06]]); // Mo in %
const join = { members: [0, 1], valueAt: (c, m) => (m === 0 ? au.get(c) : mo.get(c)) };

test("one density: each member's metal is its tonnes x grade over the counted blocks that have a value of it", () => {
  const [r0] = memberMeans(cells, join, { cutoffs: [0] });
  const a = memberMetal(r0.means[0], { rho: 2.5, unit: "ppm", element: "Au" });
  assert.deepEqual(a.map((c) => c.key), ["metal_kg", "metal_oz"]);
  assert.ok(Math.abs(a[0].value - (2500 * 1 + 2500 * 3) / 1000) < 1e-9); // 10 kg (the third block has no Au: not in it)
  assert.ok(Math.abs(a[1].value - (2500 * 1 + 2500 * 3) / TROY_OZ_G) < 1e-6);
  const m = memberMetal(r0.means[1], { rho: 2.5, unit: "%", element: "Mo" });
  assert.equal(m[0].key, "metal_t");
  assert.ok(Math.abs(m[0].value - 2500 * (0.02 + 0.04 + 0.06) / 100) < 1e-9); // t of Mo
  // no density: no metal
  assert.ok(memberMetal(r0.means[0], { rho: null, unit: "ppm", element: "Au" }).every((c) => c.value == null));
});

test("a density per block: the member's metal from each block's own tonnes", () => {
  const rho = new Map([[cells[0], 2], [cells[1], 3], [cells[2], 2.7]]);
  const [r0] = memberMeans(cells, join, { cutoffs: [0], densityOf: (c) => rho.get(c) });
  const a = memberMetal(r0.means[0], { perBlock: true, unit: "ppm", element: "Au" });
  assert.ok(Math.abs(a[0].value - (2000 * 1 + 3000 * 3) / 1000) < 1e-9);
  // a block without a density adds no tonnes, so no metal (as the table's rows, #3270)
  const part = new Map([[cells[0], 2]]);
  const [rp] = memberMeans(cells, join, { cutoffs: [0], densityOf: (c) => part.get(c) ?? null });
  assert.ok(Math.abs(memberMetal(rp.means[0], { perBlock: true, unit: "ppm", element: "Au" })[0].value - 2) < 1e-9);
  const [none] = memberMeans(cells, join, { cutoffs: [0], densityOf: () => null });
  assert.equal(memberMetal(none.means[0], { perBlock: true, unit: "ppm", element: "Au" })[0].value, null);
});

test("the CSV columns: <element>_kg / _oz / _t / _mlb", () => {
  const rows = memberMeans(cells, { members: [0, 1, 2], valueAt: (c, m) => (m === 0 ? au.get(c) : m === 1 ? mo.get(c) : 0.5) }, { cutoffs: [0, 2000] });
  const out = memberMetalColumns(rows, [{ element: "Au", unit: "ppm" }, { element: "Mo", unit: "%" }, { element: "Cu", unit: "%" }], { rho: 2.5 });
  assert.deepEqual(Object.keys(out[0]).sort(), ["Au_kg", "Au_oz", "Cu_mlb", "Cu_t", "Mo_t"].sort());
  assert.equal(out[0].Au_kg, 10);
  assert.ok(out[1].Au_kg < out[0].Au_kg); // the 2,000 ppm cutoff drops the first block
});

test("wiring: the members' metal columns in the table and the CSV, said in the header; keys", () => {
  const m = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const memberMetalOn = tonnesOn && !!means && members\.length > 0/);
  assert.match(m, /memberMetal\(x, \{ perBlock, rho, unit: m\.unit, element: m\.element \}\)/);
  assert.match(m, /const extraM = memberMetalOn \? memberMetalColumns\(means, members, \{ perBlock, rho \}\) : null;/);
  assert.match(m, /<element>_<t, mlb, kg or oz>: the member's contained metal/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["{el} (kg)", "{el} (troy oz)", "{el} contained in the counted blocks that have a value of it: its mean times their tonnes. No price, recovery or equivalent grade."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
