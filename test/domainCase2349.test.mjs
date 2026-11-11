// TASKS.csv #2349 — 'Strat unit' (33 spellings, 25 codes once the case is folded) was dropped from Grade stats / Compositing as over 30
// distinct values, and the built-in Lithology's extra fields (Strat, Oxidation) were never offered as domains.
import test from "node:test";
import assert from "node:assert/strict";
import { customDomainOptions } from "../src/lib/customDomains.js";

const rows = [];
let h = 0;
// 25 codes, each in two or three spellings -> over 30 spellings
const codes = Array.from({ length: 25 }, (_, i) => `D${String.fromCharCode(97 + i)}x`);
for (const c of codes) for (const sp of [c.toUpperCase(), c.toUpperCase(), c, c.slice(0, 2) + "X"]) rows.push({ hole_id: `H${h % 40}`, from: (h % 40) * 3 + Math.floor(h / 40) * 200, to: (h % 40) * 3 + Math.floor(h / 40) * 200 + 3, value: "x", unit: sp }), h++;

test("codes are counted with their case folded and spelled as most often", () => {
  const spellings = new Set(rows.map((r) => r.unit));
  assert.ok(spellings.size > 30, String(spellings.size));
  const opt = customDomainOptions([{ id: "s", name: "Strat unit", rows }]).find((o) => o.key === "custom:s:unit");
  assert.ok(opt, "offered");
  assert.equal(new Set(opt.rows.map((r) => r.value)).size, 25);
  assert.ok(opt.rows.every((r) => r.value === r.value.toUpperCase()), "the commonest spelling (upper case) names each code");
});

test("a built-in log's extra fields are offered; its value is not repeated", () => {
  const litho = [];
  for (let i = 0; i < 60; i++) litho.push({ hole_id: `H${i % 6}`, from: i, to: i + 1, value: i % 2 ? "SST" : "LIG", Strat: ["E1", "E2", "E3"][i % 3], Oxidation: i < 30 ? "OX" : "FR" });
  const opts = customDomainOptions([], { layers: { litho }, labelOf: () => "Lithology" });
  assert.deepEqual(opts.map((o) => o.label).sort(), ["Lithology · Oxidation", "Lithology · Strat"]);
  assert.equal(customDomainOptions([]).length, 0, "no builtin argument: as before");
});
