// TASKS.csv #3793 (Scottie Gold review) — Pit shell paid for the silver twice: the by-product's own block model was also ticked under 'Report these
// grades too' with a price (#3311): margin $42.79M -> $44.51M (+$1,723,179, the Ag revenue again), 'Contained Ag' printed twice, both pits one name.
// Synthetic numbers: Au 2000 $/oz at 90 %, Ag 25 $/oz at 80 %.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pitEconomics, cellRevenue } from "../src/lib/pitShell.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const au = { unit: "ppm", element: "Au", price: 2000, priceUnit: "oz", recovery: 90, processingCost: 30 };
const agBy = { unit: "ppm", element: "Ag", price: 25, priceUnit: "oz", recovery: 80 };

test("Ag priced as the by-product AND as a 'report too' grade: its revenue is counted once", () => {
  const once = pitEconomics({ ...au, by: agBy });
  const twice = pitEconomics({ ...au, by: agBy, alsoPrices: [agBy] });
  const cell = { value: 4.11, by: 3.83, also: [3.83] };
  assert.equal(cellRevenue(cell, twice), cellRevenue({ value: 4.11, by: 3.83 }, once), "the same revenue per tonne as with the by-product alone");
  assert.deepEqual(twice.alsoPriced, [null], "the duplicate is reported only");
  assert.deepEqual(twice.alsoDuplicate, ["Ag"]);
  // by hand: 3.83 g/t Ag x 0.8 x 25 $/oz / 31.1035 = $2.46 per tonne, once
  const agPerT = 3.83 * 0.8 * 25 / 31.1035;
  assert.ok(Math.abs(cellRevenue({ value: 0, by: 3.83 }, once) - agPerT) < 1e-4);
});

test("the main metal and one grade priced twice are refused too; two different metals are both paid", () => {
  const e = pitEconomics({ ...au, alsoPrices: [{ ...au }, agBy, { ...agBy }, { unit: "ppm", element: "Cu", price: 4, priceUnit: "lb", recovery: 85 }] });
  assert.deepEqual(e.alsoDuplicate, ["Au", "Ag"], "Au is the main metal; the second Ag is an earlier grade's");
  assert.deepEqual(e.alsoPriced.map(Boolean), [false, true, false, true]);
  assert.equal(pitEconomics({ ...au, alsoPrices: [agBy] }).alsoDuplicate, undefined, "one Ag price is fine");
});

test("wiring: the by-product's model is not listed under 'Report these grades too', one element one price, the name says every metal paid", () => {
  const p = read("../src/components/PitShellPane.jsx");
  assert.match(p, /const alsoListed = alsoCandidates\.filter\(\(m\) => m !== byModel\);/);
  assert.match(p, /const alsoChosen = alsoListed\.filter\(/);
  assert.match(p, /\{alsoListed\.map\(\(m\) => \{ const id = m\.id \?\? m\.name/);
  assert.match(p, /pricedEls = new Set\(\[element, byInputs\?\.element\]\.filter\(Boolean\)\)/);
  assert.match(p, /\+ alsoPriceText \/\* #3793 — every metal paid for \*\//);
  assert.match(p, /alsoDup\.has\(id\) && <span/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["{el} is already priced here (the main metal, the by-product or an earlier grade): reported only, no second price."], l);
});
