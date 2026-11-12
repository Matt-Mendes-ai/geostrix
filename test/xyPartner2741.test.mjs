// TASKS.csv #2741 — the X-Y scatter's default Y is the element that follows the lead most closely in the data, not the fixed suite's next
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestPartner } from "../src/lib/preferredElement.js";

// 40 samples: Mo follows Cu (with noise), Fe is unrelated, As has only 5 values
const rows = Array.from({ length: 40 }, (_, i) => {
  const cu = 100 * 1.15 ** i;
  return { values: { Cu: cu, Mo: cu / 50 * (1 + 0.1 * Math.sin(i)), Fe: 2 + ((i * 7) % 5), ...(i < 5 ? { As: cu } : {}), Ag: i % 3 === 0 ? null : 0.5 + (i % 4) } };
});

test("the most correlated element wins, by |r| of the logs", () => {
  assert.equal(bestPartner(rows, "Cu", ["Cu", "Fe", "Ag", "Mo", "As"]), "Mo");
});

test("an element with fewer than ten shared samples is not chosen on its correlation", () => {
  assert.equal(bestPartner(rows, "Cu", ["As", "Fe"]), "Fe");
});

test("an inverse correlation counts too", () => {
  const inv = rows.map((r) => ({ values: { ...r.values, Ca: 1e6 / r.values.Cu } }));
  assert.equal(bestPartner(inv, "Cu", ["Fe", "Ca"]), "Ca");
});

test("no pairs at all: the element with the most values; nothing to choose: null", () => {
  const noLead = rows.map((r) => ({ values: { Fe: r.values.Fe, As: r.values.As } }));
  assert.equal(bestPartner(noLead, "Cu", ["As", "Fe"]), "Fe");
  assert.equal(bestPartner(rows, "Cu", ["Cu"]), null);
  assert.equal(bestPartner([], "Cu", ["Fe"]), null);
});

test("wired: Y from the samples shown, calculated elements left out", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const partner = bestPartner\(sourceRows, two\[0\], assayElements\.filter\(\(e\) => !e\.calculated\)\.map\(\(e\) => e\.symbol\)\);/);
});
